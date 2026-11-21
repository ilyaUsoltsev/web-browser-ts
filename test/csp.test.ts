import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { Tab } from "../src/tab.ts";
import { parseUrl } from "../src/url.ts";

test("CSP blocks resources, fetch, and redirect escapes and survives cached page loads", async () => {
  let foreignRequests = 0;
  const foreign = http.createServer((_req, res) => {
    foreignRequests++;
    res.end("throw Error('should never execute')");
  });
  await new Promise<void>(resolve => foreign.listen(0, "127.0.0.1", resolve));
  const foreignOrigin = `http://127.0.0.1:${(foreign.address() as AddressInfo).port}`;
  let origin = "";
  let pageRequests = 0;
  const local = http.createServer((req, res) => {
    if (req.url === "/page") {
      pageRequests++;
      res.setHeader("Content-Security-Policy", `default-src ${origin}`);
      res.end(`<p>Page</p><script src=/ok.js></script><script src=${foreignOrigin}/evil.js></script>` +
        `<script src=/redirect></script><link rel=stylesheet href=/ok.css>` +
        `<link rel=stylesheet href=${foreignOrigin}/evil.css>`);
    } else if (req.url === "/deny") {
      res.setHeader("Content-Security-Policy", "default-src");
      res.end("<p>Denied</p>");
    } else if (req.url === "/ok.js") {
      res.end("var scriptLoaded = true;");
    } else if (req.url === "/ok.css") {
      res.end("p { color: red; }");
    } else if (req.url === "/redirect") {
      res.writeHead(302, { Location: foreignOrigin + "/evil.js" });
      res.end();
    } else {
      res.end("<p>Unrestricted</p>");
    }
  });
  await new Promise<void>(resolve => local.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(local.address() as AddressInfo).port}`;
  try {
    const tab = new Tab();
    for (let i = 0; i < 2; i++) {
      await tab.load(parseUrl(origin + "/page"));
      assert.equal(tab.js!.run("check", "typeof scriptLoaded"), "undefined");
      assert.ok(tab.rules.some(rule => rule.body.color === "red"));
      tab.taskRunner.run();
      assert.equal(tab.js!.run("check", "scriptLoaded"), true);
      assert.equal(tab.taskRunner.hasTasks, false);
      assert.equal(foreignRequests, 0);
      await assert.rejects(tab.js!.run("fetch-redirect", `fetch("/redirect")`) as Promise<unknown>, /CSP/);
    }
    assert.equal(pageRequests, 1, "cached pages retain their CSP headers");
    await tab.load(parseUrl(origin + "/deny"));
    assert.deepEqual(tab.allowedOrigins, []);
    await assert.rejects(tab.js!.run("fetch-denied", `fetch("/private")`) as Promise<unknown>, /CSP/);
    await tab.load(parseUrl(origin + "/plain"));
    assert.equal(tab.allowedOrigins, null);
    assert.equal(await tab.js!.run("fetch-allowed", `fetch("/data").then(r => r.text())`), "<p>Unrestricted</p>");
  } finally {
    await Promise.all([local, foreign].map(server => new Promise<void>((resolve, reject) =>
      server.close(error => error ? reject(error) : resolve()))));
  }
});
