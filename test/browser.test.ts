import { test } from "node:test";
import assert from "node:assert/strict";
import { BlockLayout, DocumentLayout, paintTree } from "../src/layout.ts";
import { DrawRect, DrawText } from "../src/draw.ts";
import { getFont } from "../src/fonts.ts";
import { Text, Element } from "../src/tokens.ts";
import { DEFAULT_STYLE_SHEET, style } from "../src/css-parser.ts";
import { cascadePriority } from "../src/utils.ts";
import {
  DEFAULT_FONT_SIZE,
  HSTEP,
  LINE_HEIGHT_MULTIPLIER,
  VSTEP,
  WIDTH,
} from "../src/constants.ts";
import type { DrawCommand } from "../src/types.ts";

const el = (name: string, ...children: (Text | Element)[]) => {
  const element = new Element(name, {}, null, children);
  for (const child of children) {
    child.parent = element;
  }
  return element;
};

function render(root: Element, width = WIDTH) {
  style(
    root,
    [...DEFAULT_STYLE_SHEET].sort((a, b) => cascadePriority(a) - cascadePriority(b)),
  );
  const document = new DocumentLayout(root);
  document.layout(width);
  const displayList: DrawCommand[] = [];
  paintTree(document, displayList);
  return { document, displayList };
}

const texts = (displayList: DrawCommand[]) =>
  displayList.filter((cmd): cmd is DrawText => cmd instanceof DrawText);

test("getFont caches fonts", () => {
  assert.equal(getFont(14, "bold", "italic"), getFont(14, "bold", "italic"));
  assert.notEqual(getFont(14, "bold", "normal"), getFont(14, "normal", "normal"));
});

test("head remains in HTML but contributes no layout or visible text", () => {
  const head = el("head", el("title", new Text("Document")), el("style", new Text("hidden")));
  const root = el("html", head, el("body", new Text("Hello")));
  const { document, displayList } = render(root);
  assert.equal(root.children[0], head);
  assert.deepEqual(
    document.children[0]!.children.map((child) => child.node),
    [root.children[1]],
  );
  assert.deepEqual(
    texts(displayList).map((cmd) => cmd.text),
    ["Hello"],
  );
  assert.equal(document.height, render(el("body", new Text("Hello"))).document.height);
  assert.deepEqual(texts(render(el("html", head)).displayList), []);
});

test("places words left to right on one line", () => {
  const { displayList } = render(el("body", new Text("ab cd")));
  const font = getFont(DEFAULT_FONT_SIZE, "normal", "normal");
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
  const document = new DocumentLayout(el("body", el("p", new Text("a")), el("p", new Text("b"))));
  document.layout();
  const body = document.children[0]!;
  assert.equal(body.layoutMode(), "block");
  assert.equal(body.children.length, 2);
  for (const p of body.children as BlockLayout[]) {
    assert.equal(p.layoutMode(), "inline");
  }
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

test("pre gets the default stylesheet's background", () => {
  const { displayList } = render(el("body", el("pre", new Text("code"))));
  assert.ok(displayList[0] instanceof DrawRect);
  assert.equal((displayList[0] as DrawRect).color, "lightgray");
});

test("styles are computed for the root and inline descendants before layout", () => {
  const span = new Element("span", { style: "background-color: blue" }, null, [new Text("hello")]);
  const root = new Element("body", { style: "background-color: red" }, null, [span]);
  const { document, displayList } = render(root);
  assert.equal(span.style["background-color"], "blue");
  assert.ok(displayList[0] instanceof DrawRect);
  const rect = displayList[0] as DrawRect;
  assert.equal(rect.color, "red");
  assert.equal(rect.bottom, document.y + document.height);
  assert.ok(displayList[1] instanceof DrawText);
});

test("explicit pre backgrounds override the default, including transparent", () => {
  for (const color of ["red", "transparent"]) {
    const pre = new Element("pre", { style: `background-color: ${color}` }, null, [
      new Text("code"),
    ]);
    const rects = render(el("body", pre)).displayList.filter((cmd) => cmd instanceof DrawRect);
    assert.deepEqual(
      rects.map((rect) => rect.color),
      color === "transparent" ? [] : [color],
    );
  }
});

test("wraps at the window width", () => {
  const { document, displayList } = render(el("body", new Text("word ".repeat(200))));
  const ys = new Set(texts(displayList).map((cmd) => cmd.top));
  assert.ok(ys.size > 1);
  for (const cmd of texts(displayList)) {
    assert.ok(cmd.left < WIDTH - HSTEP);
  }
  assert.ok(document.y + document.height > Math.max(...ys));
});

test("wraps earlier in a narrower window", () => {
  const root = el("body", new Text("word ".repeat(200)));
  const wide = render(root, WIDTH).document.height;
  const narrow = render(root, WIDTH / 2).document.height;
  assert.ok(narrow > wide);
});

test("h1 text is 2x the default size and centered, inherited by its text", () => {
  const { displayList } = render(el("body", el("h1", new Text("Hi"))));
  const [hi] = texts(displayList);
  const font = getFont(DEFAULT_FONT_SIZE * 2, "normal", "normal");
  assert.equal(hi!.font, font);
  assert.equal(hi!.left, HSTEP + (WIDTH - 2 * HSTEP - font.measure("Hi")) / 2);
});

test("<right> aligns its line to the right edge", () => {
  const { displayList } = render(el("body", el("right", new Text("end")), el("p", new Text("x"))));
  const [end] = texts(displayList);
  const font = getFont(DEFAULT_FONT_SIZE, "normal", "normal");
  assert.equal(end!.left, WIDTH - HSTEP - font.measure("end"));
});

test("small shrinks its text via the stylesheet", () => {
  const { displayList } = render(el("body", el("small", new Text("tiny"))));
  assert.equal(texts(displayList)[0]!.font, getFont(DEFAULT_FONT_SIZE * 0.9, "normal", "normal"));
});
