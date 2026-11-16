import assert from "node:assert/strict";
import { test } from "node:test";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { Tab } from "../src/tab.ts";
import { JSContext } from "../src/jscontext.ts";
import { parseUrl } from "../src/url.ts";
import { COOKIE_JAR, parseCookie } from "../src/cookie-jar.ts";

test("fetch rejects different origins and cross-origin redirects before sending requests", async () => {
  let foreignRequests = 0;
  const foreign = http.createServer((_req, res) => {
    foreignRequests++;
    res.end("private data");
  });
  await new Promise<void>((resolve) => foreign.listen(0, "127.0.0.1", resolve));
  const foreignUrl = `http://127.0.0.1:${(foreign.address() as AddressInfo).port}/private`;
  const local = http.createServer((req, res) => {
    if (req.url === "/redirect") {
      res.writeHead(302, { Location: foreignUrl });
    } else if (req.url === "/relative") {
      res.writeHead(302, { Location: "/ok" });
    }
    res.end("allowed");
  });
  await new Promise<void>((resolve) => local.listen(0, "127.0.0.1", resolve));
  try {
    const tab = new Tab();
    const base = `http://127.0.0.1:${(local.address() as AddressInfo).port}`;
    tab.url = parseUrl(base + "/page");
    const js = new JSContext(tab);
    const blocked = [
      foreignUrl,
      base.replace("http:", "https:") + "/private",
      base.replace("127.0.0.1", "localhost") + "/private",
      base + "/redirect",
    ];
    for (const url of blocked) {
      await assert.rejects(
        js.run("blocked-fetch", `fetch(${JSON.stringify(url)})`) as Promise<unknown>,
        /Cross-origin fetch request not allowed/,
      );
    }
    assert.equal(foreignRequests, 0);
    assert.equal(
      await js.run("allowed-redirect", `fetch("/relative").then(r => r.text())`),
      "allowed",
    );
    // Navigation still follows cross-origin redirects.
    assert.equal(await parseUrl(base + "/redirect").request(), "private data");
    assert.equal(foreignRequests, 1);
    // A cached response from navigation cannot bypass the fetch policy.
    await assert.rejects(
      js.run("cached-cross-origin", `fetch(${JSON.stringify(foreignUrl)})`) as Promise<unknown>,
      /Cross-origin fetch request not allowed/,
    );
  } finally {
    await Promise.all(
      [local, foreign].map(
        (server) =>
          new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
          ),
      ),
    );
  }
});

test("fetch is asynchronous, resolves URLs, and shares cookies for GET and POST", async () => {
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      res.setHeader("Set-Cookie", "token=updated; HttpOnly");
      res.end(
        JSON.stringify({ method: req.method, path: req.url, body, cookie: req.headers.cookie }),
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const tab = new Tab();
    tab.url = parseUrl(`http://127.0.0.1:${(server.address() as AddressInfo).port}/folder/page`);
    const js = new JSContext(tab);
    COOKIE_JAR.set("127.0.0.1", parseCookie("token=initial"));
    const pending = js.run(
      "fetch-test",
      `
      var finished = false;
      var pending = fetch("../echo", { method: "POST", body: "guest=hello" })
        .then(response => response.text()).then(text => { finished = true; return text; });
      pending;
    `,
    );
    assert.equal(js.run("fetch-pending", "finished"), false);
    assert.deepEqual(JSON.parse((await pending) as string), {
      method: "POST",
      path: "/echo",
      body: "guest=hello",
      cookie: "token=initial",
    });
    assert.equal(COOKIE_JAR.get("127.0.0.1")?.value, "token=updated");
    const get = (await js.run("fetch-get", `fetch("echo").then(r => r.json())`)) as {
      method: string;
      path: string;
    };
    assert.equal(get.method, "GET");
    assert.equal(get.path, "/folder/echo");
    const post = (await js.run(
      "fetch-empty-post",
      `fetch("/empty", { method: "POST" }).then(r => r.json())`,
    )) as { method: string };
    assert.equal(post.method, "POST");
    await assert.rejects(
      js.run("fetch-body", `fetch("/", { body: "invalid" })`) as Promise<unknown>,
      /cannot have a body/,
    );
    await assert.rejects(
      js.run("fetch-scheme", `fetch("file:///private")`) as Promise<unknown>,
      /only supports HTTP/,
    );
    const used = await js.run(
      "fetch-read-twice",
      `
      fetch("/read").then(async r => {
        await r.text();
        try { await r.text(); } catch (e) { return r.bodyUsed; }
      });
    `,
    );
    assert.equal(used, true);
    tab.url.resolve = () => {
      throw new Error("network failure");
    };
    await assert.rejects(
      js.run("fetch-error", `fetch("/error")`) as Promise<unknown>,
      /network failure/,
    );
  } finally {
    COOKIE_JAR.clear();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
