import assert from "node:assert/strict";
import { test } from "node:test";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { Tab } from "../src/tab.ts";
import { JSContext } from "../src/jscontext.ts";
import { parseUrl } from "../src/url.ts";
import { COOKIE_JAR } from "../src/cookie-jar.ts";

test("fetch is asynchronous, resolves URLs, and shares cookies for GET and POST", async () => {
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", () => {
      res.setHeader("Set-Cookie", "token=updated; HttpOnly");
      res.end(JSON.stringify({ method: req.method, path: req.url, body, cookie: req.headers.cookie }));
    });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const tab = new Tab();
    tab.url = parseUrl(`http://127.0.0.1:${(server.address() as AddressInfo).port}/folder/page`);
    const js = new JSContext(tab);
    COOKIE_JAR.set("127.0.0.1", "token=initial");
    const pending = js.run("fetch-test", `
      var finished = false;
      var pending = fetch("../echo", { method: "POST", body: "guest=hello" })
        .then(response => response.text()).then(text => { finished = true; return text; });
      pending;
    `);
    assert.equal(js.run("fetch-pending", "finished"), false);
    assert.deepEqual(JSON.parse(await pending as string), {
      method: "POST", path: "/echo", body: "guest=hello", cookie: "token=initial",
    });
    assert.equal(COOKIE_JAR.get("127.0.0.1"), "token=updated");
    const get = await js.run("fetch-get", `fetch("echo").then(r => r.json())`) as { method: string; path: string };
    assert.equal(get.method, "GET");
    assert.equal(get.path, "/folder/echo");
    const post = await js.run("fetch-empty-post", `fetch("/empty", { method: "POST" }).then(r => r.json())`) as { method: string };
    assert.equal(post.method, "POST");
    await assert.rejects(js.run("fetch-body", `fetch("/", { body: "invalid" })`) as Promise<unknown>, /cannot have a body/);
    await assert.rejects(js.run("fetch-scheme", `fetch("file:///private")`) as Promise<unknown>, /only supports HTTP/);
    const used = await js.run("fetch-read-twice", `
      fetch("/read").then(async r => {
        await r.text();
        try { await r.text(); } catch (e) { return r.bodyUsed; }
      });
    `);
    assert.equal(used, true);
    tab.url.resolve = () => { throw new Error("network failure"); };
    await assert.rejects(js.run("fetch-error", `fetch("/error")`) as Promise<unknown>, /network failure/);
  } finally {
    COOKIE_JAR.clear();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
