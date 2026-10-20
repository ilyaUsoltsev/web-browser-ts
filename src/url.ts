import * as net from "node:net";
import * as tls from "node:tls";

function split1(s: string, sep: string): [string, string] {
  const i = s.indexOf(sep);
  if (i === -1)
    throw new Error(`expected ${JSON.stringify(sep)} in ${JSON.stringify(s)}`);
  return [s.slice(0, i), s.slice(i + sep.length)];
}

function readAll(s: net.Socket): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    s.on("data", (chunk: Buffer) => chunks.push(chunk));
    s.on("end", () => resolve(Buffer.concat(chunks)));
    s.on("error", reject);
  });
}

interface SchemeStrategy {
  readonly name: string;
  readonly defaultPort: number;
  // Returns the part of the url after the scheme prefix, or undefined if
  // this strategy doesn't own that prefix.
  match(url: string): string | undefined;
  request(url: URL): Promise<string>;
}

function matchSchemePrefix(url: string, scheme: string): string | undefined {
  const prefix = `${scheme}://`;
  return url.startsWith(prefix) ? url.slice(prefix.length) : undefined;
}

class Socket {
  private static socketInstanceMap: Map<string, Socket> = new Map();
  private socket: net.Socket;

  static get(secure: boolean, host: string, port: number): Socket {
    if (this.socketInstanceMap.has(host)) {
      return this.socketInstanceMap.get(host)!;
    }
    const instance = new Socket(secure, host, port);
    this.socketInstanceMap.set(host, instance);
    return instance;
  }

  private constructor(secure: boolean, host: string, port: number) {
    this.socket = secure
      ? tls.connect({ host, port, servername: host })
      : new net.Socket();
    if (!secure) {
      this.socket.connect({ host, port });
    }
  }

  write(data: string, encoding: BufferEncoding = "utf8") {
    this.socket.write(data, encoding);
  }

  destroy(host: string) {
    console.log(`Destroying socket for host: ${host}`);
    this.socket.destroy();
    Socket.socketInstanceMap.delete(host);
  }

  readAll(): Promise<Buffer> {
    return readAll(this.socket);
  }
}

// tls.connect plays the role of ssl's ctx.wrap_socket(s, server_hostname=host).
// `servername` sets SNI, which servers hosting many sites need.
async function networkRequest(
  url: URL,
  secure: boolean,
): ReturnType<SchemeStrategy["request"]> {
  const socket = Socket.get(secure, url.host, url.port);

  // Attach listeners before writing so no data or error event can be missed.
  const received = socket.readAll();

  let request = `GET ${url.path} HTTP/1.1\r\n`;
  request += `Connection: close\r\n`;
  request += `User-Agent: web-browser-ts/1.0\r\n`;
  request += `Host: ${url.host}\r\n`;
  request += "\r\n";
  socket.write(request, "utf8"); // Node buffers this until the connection is up

  const response = (await received).toString("utf8");

  // Python reads line by line with readline(); here we have the whole
  // response already, so we split the head from the body ourselves.
  const [head, body] = split1(response, "\r\n\r\n");
  const [statusline = "", ...headerLines] = head.split("\r\n");

  // Like the book, we parse these but don't use them yet.
  const [version, rest] = split1(statusline, " ");
  const [status, explanation] = rest.includes(" ")
    ? split1(rest, " ")
    : [rest, ""];

  const responseHeaders = new Map<string, string>();
  for (const line of headerLines) {
    const [header, value] = split1(line, ":");
    // Python's casefold() ≈ toLowerCase() for ASCII header names.
    responseHeaders.set(header.toLowerCase(), value.trim());
  }

  // if (responseHeaders.has("transfer-encoding")) {
  //   // Retry with HTTP/1.0?
  //   throw new Error("transfer-encoding not supported");
  // }

  // if (responseHeaders.has("content-encoding")) {
  //   throw new Error("content-encoding not supported");
  // }

  if (responseHeaders.has("location")) {
    const location = responseHeaders.get("location")!;
    socket.destroy(url.host);
    return networkRequest(parseUrl(location), url.scheme === "https");
  }
  socket.destroy(url.host);
  return body;
}

// Registry of known strategies, consulted only by parseUrl() below — URL
// itself never looks a strategy up, it just holds whichever one it's given.
const SCHEMES: SchemeStrategy[] = [
  {
    name: "data",
    defaultPort: 0,
    match: (url) =>
      url.startsWith("data:") ? url.slice("data:".length) : undefined,
    request: (url) => {
      return Promise.resolve(url.path.split(",")[1] ?? "<p>No data</p>");
    },
  },
  {
    name: "http",
    defaultPort: 80,
    match: (url) => matchSchemePrefix(url, "http"),
    request: (url) => networkRequest(url, false),
  },
  {
    name: "https",
    defaultPort: 443,
    match: (url) => matchSchemePrefix(url, "https"),
    request: (url) => networkRequest(url, true),
  },
  {
    name: "file",
    defaultPort: 0, // file URLs don't use a network port
    match: (url) => matchSchemePrefix(url, "file"),
    request: (url) => url.openFile(),
  },
];

// Note: this shadows Node's built-in global URL inside any module that imports it.
// The Context in the Strategy pattern: it just holds a strategy and defers
// to it, it never chooses one — that's parseUrl()'s job.
export class URL {
  host: string;
  port: number;
  path: string;
  readonly skipParsing: boolean;

  constructor(
    private readonly strategy: SchemeStrategy,
    host: string,
    port: number,
    path: string,
    skipParsing: boolean,
  ) {
    this.host = host;
    this.port = port;
    this.path = path;
    this.skipParsing = skipParsing;
  }

  get scheme(): string {
    return this.strategy.name;
  }

  async openFile(): Promise<string> {
    const fs = await import("fs/promises");
    return await fs.readFile(this.path, "utf8");
  }

  // async because socket I/O in Node can't block; callers must await it.
  async request(): Promise<string> {
    return this.strategy.request(this);
  }
}

// Factory: the only place that knows how to go from a raw string to a
// strategy. Everything scheme-specific happens here or inside a strategy;
// URL above stays generic.
export function parseUrl(url: string): URL {
  let rest: string | undefined;
  let skipParsing = false;
  if (url.startsWith("view-source:")) {
    url = url.slice("view-source:".length);
    skipParsing = true;
  }

  const strategy = SCHEMES.find((s) => (rest = s.match(url)) !== undefined);
  if (!strategy || rest === undefined) {
    const [scheme] = split1(url, "://");
    throw new Error(`unsupported scheme: ${scheme}`);
  }

  if (!rest.includes("/")) rest = rest + "/";
  let host: string;
  [host, rest] = split1(rest, "/");
  const path = "/" + rest;

  let port = strategy.defaultPort;
  if (host.includes(":")) {
    let portStr: string;
    [host, portStr] = split1(host, ":");
    port = Number.parseInt(portStr, 10);
  }

  return new URL(strategy, host, port, path, skipParsing);
}

// Chapter 1's show(): print the page text with the tags stripped out.
// (Chapter 2 turns this into lex() in browser.ts, which returns the text instead.)
export function show(body: string): void {
  let inTag = false;
  let out = "";
  for (const c of body) {
    if (c === "<") {
      inTag = true;
    } else if (c === ">") {
      inTag = false;
    } else if (!inTag) {
      out += c;
    }
  }
  // Python's print(c, end="") writes char by char; one write is equivalent.
  process.stdout.write(out);
}

export async function load(url: URL): Promise<void> {
  const body = await url.request();
  show(body);
}
