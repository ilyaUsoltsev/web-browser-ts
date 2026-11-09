import assert from "node:assert/strict";
import { test } from "node:test";
import { Canvas, type Window } from "skia-canvas";
import { Browser } from "../src/browser.ts";
import { Tab } from "../src/tab.ts";
import { parseUrl } from "../src/url.ts";
import { DrawText } from "../src/draw.ts";
import { Rect } from "../src/rect.ts";
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
  assert.equal(second.height, 150 - browser.chrome.bottom);
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

test("chrome switches tabs, opens the default page, and offsets content clicks", async () => {
  const browser = new Browser();
  const canvas = new Canvas(400, 150);
  browser.window = { width: 400, height: 150, ctx: canvas.getContext("2d") } as Window;
  await browser.newTab(page("<p>first</p>"));
  const first = browser.activeTab!;
  first.scroll = 12;
  await browser.newTab(page("<p>second</p>"));
  const bounds = browser.chrome.tabRect(0);
  await browser.click(bounds.left + 1, bounds.top + 1);
  assert.equal(browser.activeTab, first);
  assert.equal(first.scroll, 12);
  let coordinates: number[] = [];
  first.click = async (x, y) => {
    coordinates = [x, y];
  };
  await browser.click(80, browser.chrome.bottom + 20);
  assert.deepEqual(coordinates, [80, 20]);
  let destination = "";
  browser.newTab = async (url) => {
    destination = `${url.scheme}://${url.host}${url.path}`;
  };
  const plus = browser.chrome.newtabRect;
  await browser.click(plus.left + 1, plus.top + 1);
  assert.equal(destination, "https://browser.engineering/");
});

test("rectangles exclude their right and bottom edges", () => {
  const rect = new Rect(10, 20, 30, 40);
  assert.ok(rect.containsPoint(10, 20));
  assert.ok(!rect.containsPoint(30, 20));
  assert.ok(!rect.containsPoint(10, 40));
});

test("tab drawing offsets page commands and culls outside its viewport", () => {
  const tab = new Tab(400, 100);
  tab.totalHeight = 300;
  tab.scroll = 20;
  const canvas = new Canvas(400, 150);
  const scrolls: number[] = [];
  tab.displayList = [
    {
      rect: new Rect(0, 30, 10, 40),
      top: 30,
      bottom: 40,
      execute: (scroll) => {
        scrolls.push(scroll);
      },
    },
    {
      rect: new Rect(0, 130, 10, 140),
      top: 130,
      bottom: 140,
      execute: () => {
        assert.fail("culled command executed");
      },
    },
  ];
  tab.draw(canvas.getContext("2d"), 35);
  assert.deepEqual(scrolls, [-15]);
  assert.equal(tab.scrollbarHeight, 100 / 3);
});
