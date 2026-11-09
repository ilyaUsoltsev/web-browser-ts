import assert from "node:assert/strict";
import { test } from "node:test";
import { Canvas, type Window } from "skia-canvas";
import { Browser } from "../src/browser.ts";
import { Tab } from "../src/tab.ts";
import { parseUrl } from "../src/url.ts";
import { DrawText } from "../src/draw.ts";
import { treeToList } from "../src/utils.ts";
import { Text } from "../src/tokens.ts";
import type { LayoutObject } from "../src/layout.ts";

function page(html: string) {
  const url = parseUrl("file:///test/page.html");
  url.request = async () => html;
  return url;
}

test("tabs load and scroll independently without owning a window", async () => {
  const first = new Tab(400, 150);
  const second = new Tab(400, 150);
  await first.load(page(`<p>${"word ".repeat(200)}</p>`));
  await second.load(page("<p>second</p>"));
  first.scrolldown();
  assert.ok(first.scroll > 0);
  assert.equal(second.scroll, 0);
  first.scrolldown(100000);
  assert.equal(first.scroll, first.totalHeight - first.height);
  first.scrollup(100000);
  assert.equal(first.scroll, 0);
  assert.notEqual(first.document, second.document);
  assert.notEqual(first.displayList, second.displayList);
  assert.equal(second.displayList.filter((cmd) => cmd instanceof DrawText)[0]!.text, "second");
});

test("tab clicks use page coordinates and navigate relative links", async () => {
  const tab = new Tab();
  const url = page('<p><a href="next.html">next</a></p>');
  let destination = "";
  url.resolve = (href) => {
    destination = href;
    return page("<p>destination</p>");
  };
  await tab.load(url);
  const text = treeToList<LayoutObject>(tab.document, []).find((obj) => obj.node instanceof Text)!;
  tab.scroll = 5;
  await tab.click(text.x + 1, text.y + 1 - tab.scroll);
  assert.equal(destination, "next.html");
  assert.equal(tab.scroll, 0);
});

test("browser activates new tabs and draws only the active page", async () => {
  const browser = new Browser();
  const canvas = new Canvas(400, 150);
  // A canvas-backed window substitute keeps this test free of native GUI windows.
  browser.window = { width: 400, height: 150, ctx: canvas.getContext("2d") } as Window;
  await browser.newTab(page("<p>first</p>"));
  const first = browser.activeTab!;
  await browser.newTab(page("<p>second</p>"));
  const second = browser.activeTab!;
  assert.deepEqual(browser.tabs, [first, second]);
  assert.equal(second.width, 400);
  let firstDraws = 0;
  let secondDraws = 0;
  first.draw = () => {
    firstDraws++;
  };
  second.draw = () => {
    secondDraws++;
  };
  browser.draw();
  assert.equal(firstDraws, 0);
  assert.equal(secondDraws, 1);
  browser.activeTab = first;
  browser.draw();
  assert.equal(firstDraws, 1);
  assert.equal(secondDraws, 1);
});
