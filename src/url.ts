// Chapter 1: Downloading Web Pages
// https://browser.engineering/http.html

import * as net from "node:net";
import * as tls from "node:tls";

// Python's str.split(sep, 1): split on the first occurrence only.
// JS's "a:b:c".split(":", 2) gives ["a", "b"] and drops the rest, so we can't use it.
function split1(s: string, sep: string): [string, string] {
  const i = s.indexOf(sep);
  if (i === -1) throw new Error(`expected ${JSON.stringify(sep)} in ${JSON.stringify(s)}`);
  return [s.slice(0, i), s.slice(i + sep.length)];
}

// Python's socket.makefile() gives a blocking file you can read() to EOF.
// Node sockets are event-based instead, so we collect "data" chunks as raw
// bytes and resolve once the server closes the connection ("end"). Decoding
// only after concatenating matters: a chunk boundary can fall in the middle
// of a multi-byte UTF-8 character.
function readAll(s: net.Socket): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    s.on("data", (chunk: Buffer) => chunks.push(chunk));
    s.on("end", () => resolve(Buffer.concat(chunks)));
    s.on("error", reject);
  });
}

// Note: this shadows Node's built-in global URL inside any module that imports it.
export class URL {
  scheme: string;
  host: string;
  port: number;
  path: string;

  constructor(url: string) {
    let rest: string;
    [this.scheme, rest] = split1(url, "://");
    if (this.scheme !== "http" && this.scheme !== "https") {
      throw new Error(`unsupported scheme: ${this.scheme}`);
    }

    if (!rest.includes("/")) rest = rest + "/";
    [this.host, rest] = split1(rest, "/");
    this.path = "/" + rest;

    if (this.scheme === "http") {
      this.port = 80;
    } else {
      this.port = 443;
    }

    if (this.host.includes(":")) {
      let port: string;
      [this.host, port] = split1(this.host, ":");
      this.port = Number.parseInt(port, 10);
    }
  }

  // async because socket I/O in Node can't block; callers must await it.
  async request(): Promise<string> {
    // tls.connect plays the role of ssl's ctx.wrap_socket(s, server_hostname=host).
    // `servername` sets SNI, which servers hosting many sites need.
    const s: net.Socket =
      this.scheme === "https"
        ? tls.connect({ host: this.host, port: this.port, servername: this.host })
        : net.connect({ host: this.host, port: this.port });

    // Attach listeners before writing so no data or error event can be missed.
    const received = readAll(s);

    let request = `GET ${this.path} HTTP/1.0\r\n`;
    request += `Host: ${this.host}\r\n`;
    request += "\r\n";
    s.write(request, "utf8"); // Node buffers this until the connection is up

    const response = (await received).toString("utf8");

    // Python reads line by line with readline(); here we have the whole
    // response already, so we split the head from the body ourselves.
    const [head, body] = split1(response, "\r\n\r\n");
    const [statusline = "", ...headerLines] = head.split("\r\n");

    // Like the book, we parse these but don't use them yet.
    const [version, rest] = split1(statusline, " ");
    const [status, explanation] = rest.includes(" ") ? split1(rest, " ") : [rest, ""];

    const responseHeaders = new Map<string, string>();
    for (const line of headerLines) {
      const [header, value] = split1(line, ":");
      // Python's casefold() ≈ toLowerCase() for ASCII header names.
      responseHeaders.set(header.toLowerCase(), value.trim());
    }

    if (responseHeaders.has("transfer-encoding")) throw new Error("transfer-encoding not supported");
    if (responseHeaders.has("content-encoding")) throw new Error("content-encoding not supported");

    s.destroy();
    return body;
  }
}

// Chapter 1's show(): print the page text with the tags stripped out.
// (Chapter 2 turns this into lex() in browser.ts, which returns the text instead.)
export function show(body: string): void {
  let inTag = false;
  let out = "";
  for (const c of body) { // for...of iterates by code point, like Python's str
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
