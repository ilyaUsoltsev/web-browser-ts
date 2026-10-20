import { test } from "node:test";
import assert from "node:assert/strict";
import * as net from "node:net";
import type { AddressInfo } from "node:net";
import { parseUrl, show } from "../src/url.ts";

test("parses an http URL with default port", () => {
  const url = parseUrl("http://example.org/index.html");
  assert.equal(url.scheme, "http");
  assert.equal(url.host, "example.org");
  assert.equal(url.port, 80);
  assert.equal(url.path, "/index.html");
});

test("parses an https URL with default port", () => {
  const url = parseUrl("https://example.org");
  assert.equal(url.scheme, "https");
  assert.equal(url.port, 443);
  assert.equal(url.path, "/");
});

test("parses a custom port", () => {
  const url = parseUrl("http://localhost:8000/a/b?c=d");
  assert.equal(url.host, "localhost");
  assert.equal(url.port, 8000);
  assert.equal(url.path, "/a/b?c=d");
});

test("rejects unsupported schemes", () => {
  assert.throws(() => parseUrl("ftp://example.org/"));
});

// A one-shot local server: records the request, replies with `chunks` (written
// separately so we exercise chunk boundaries), then closes the connection.
async function serve(
  chunks: Buffer[],
): Promise<{ port: number; requestText: Promise<string> }> {
  let gotRequest!: (s: string) => void;
  const requestText = new Promise<string>((r) => (gotRequest = r));
  const server = net.createServer((sock) => {
    sock.once("data", async (data) => {
      gotRequest(data.toString("utf8"));
      for (const chunk of chunks) {
        sock.write(chunk);
        await new Promise((r) => setTimeout(r, 10));
      }
      sock.end();
      server.close();
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return { port: (server.address() as AddressInfo).port, requestText };
}

test("request() sends HTTP/1.1 with Connection, User-Agent and Host, and returns the body", async () => {
  const { port, requestText } = await serve([
    Buffer.from("HTTP/1.0 200 OK\r\nContent-Type: text/html\r\n\r\n<p>Hi</p>"),
  ]);
  const body = await parseUrl(`http://127.0.0.1:${port}/page`).request();
  assert.equal(body, "<p>Hi</p>");
  assert.equal(
    await requestText,
    "GET /page HTTP/1.1\r\nConnection: close\r\nUser-Agent: web-browser-ts/1.0\r\nHost: 127.0.0.1\r\n\r\n",
  );
});

test("request() decodes UTF-8 split across chunk boundaries", async () => {
  const full = Buffer.from("HTTP/1.0 200 OK\r\n\r\nhé€😀", "utf8");
  // Cut inside the 4-byte emoji.
  const cut = full.length - 2;
  const { port } = await serve([full.subarray(0, cut), full.subarray(cut)]);
  const body = await parseUrl(`http://127.0.0.1:${port}/`).request();
  assert.equal(body, "hé€😀");
});

test("show() prints text with tags removed", (t) => {
  const written: string[] = [];
  t.mock.method(
    process.stdout,
    "write",
    (s: string) => (written.push(s), true),
  );
  show("<html><body><p>Hello, <b>world</b>!</p></body></html>");
  t.mock.restoreAll();
  assert.equal(written.join(""), "Hello, world!");
});
