import { test } from "node:test";
import assert from "node:assert/strict";
import { BlockLayout, DocumentLayout, paintTree } from "../src/layout.ts";
import { DrawRect, DrawText } from "../src/draw.ts";
import { getFont } from "../src/fonts.ts";
import { Text, Element } from "../src/tokens.ts";
import {
  DEFAULT_FONT_SIZE,
  HSTEP,
  LINE_HEIGHT_MULTIPLIER,
  VSTEP,
  WIDTH,
} from "../src/constants.ts";
import type { DrawCommand } from "../src/types.ts";

const el = (name: string, ...children: (Text | Element)[]) =>
  new Element(name, {}, null, children);

function render(root: Element, width = WIDTH) {
  const document = new DocumentLayout(root);
  document.layout(width);
  const displayList: DrawCommand[] = [];
  paintTree(document, displayList);
  return { document, displayList };
}

const texts = (displayList: DrawCommand[]) =>
  displayList.filter((cmd): cmd is DrawText => cmd instanceof DrawText);

test("getFont caches fonts", () => {
  assert.equal(
    getFont(14, "bold", "italic"),
    getFont(14, "bold", "italic"),
  );
  assert.notEqual(getFont(14, "bold", "roman"), getFont(14, "normal", "roman"));
});

test("places words left to right on one line", () => {
  const { displayList } = render(el("body", new Text("ab cd")));
  const font = getFont(DEFAULT_FONT_SIZE, "normal", "roman");
  const y = VSTEP + LINE_HEIGHT_MULTIPLIER * font.ascent - font.ascent;
  const [ab, cd] = texts(displayList);
  assert.equal(texts(displayList).length, 2);
  assert.deepEqual([ab!.left, ab!.top, ab!.text], [HSTEP, y, "ab"]);
  assert.deepEqual(
    [cd!.left, cd!.top, cd!.text],
    [HSTEP + font.measure("ab") + font.measure(" "), y, "cd"],
  );
});

test("layoutMode is block when a child is a block element", () => {
  const document = new DocumentLayout(
    el("body", el("p", new Text("a")), el("p", new Text("b"))),
  );
  document.layout();
  const body = document.children[0]!;
  assert.equal(body.layoutMode(), "block");
  assert.equal(body.children.length, 2);
  for (const p of body.children) assert.equal(p.layoutMode(), "inline");
});

test("block children stack vertically", () => {
  const { document, displayList } = render(
    el("body", el("p", new Text("a")), el("p", new Text("b"))),
  );
  const [p1, p2] = document.children[0]!.children as BlockLayout[];
  assert.equal(p2!.y, p1!.y + p1!.height);
  assert.equal(document.height, p1!.height + p2!.height);
  const [a, b] = texts(displayList);
  assert.ok(b!.top > a!.top);
});

test("pre gets a gray background", () => {
  const { displayList } = render(el("body", el("pre", new Text("code"))));
  assert.ok(displayList[0] instanceof DrawRect);
  assert.equal((displayList[0] as DrawRect).color, "gray");
});

test("wraps at the window width", () => {
  const { document, displayList } = render(
    el("body", new Text("word ".repeat(200))),
  );
  const ys = new Set(texts(displayList).map((cmd) => cmd.top));
  assert.ok(ys.size > 1);
  for (const cmd of texts(displayList)) assert.ok(cmd.left < WIDTH - HSTEP);
  assert.ok(document.y + document.height > Math.max(...ys));
});

test("wraps earlier in a narrower window", () => {
  const root = el("body", new Text("word ".repeat(200)));
  const wide = render(root, WIDTH).document.height;
  const narrow = render(root, WIDTH / 2).document.height;
  assert.ok(narrow > wide);
});
