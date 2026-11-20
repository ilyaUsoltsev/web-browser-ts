import { test } from "node:test";
import assert from "node:assert/strict";
import { BlockLayout, DocumentLayout, paintTree, paintVisualEffects } from "../src/layout.ts";
import { Blend, DrawRect, DrawRRect, DrawText, Opacity } from "../src/draw.ts";
import { Canvas } from "skia-canvas";
import { Rect } from "../src/rect.ts";
import { getFont } from "../src/fonts.ts";
import { Text, Element } from "../src/tokens.ts";
import { DEFAULT_STYLE_SHEET, style } from "../src/css-parser.ts";
import { cascadePriority, treeToList } from "../src/utils.ts";
import {
  DEFAULT_FONT_SIZE,
  HSTEP,
  LINE_HEIGHT_MULTIPLIER,
  VSTEP,
  WIDTH,
} from "../src/constants.ts";
import type { DrawCommand } from "../src/types.ts";

// The display list is a tree (effects wrap their subtree): flatten it to
// just the drawing commands, in paint order.
const drawingCommands = (tree: DrawCommand[]) =>
  tree.flatMap((cmd) => treeToList(cmd, [])).filter((cmd) => !(cmd instanceof Opacity));

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
  const tree: DrawCommand[] = [];
  paintTree(document, tree);
  return { document, tree, displayList: drawingCommands(tree) };
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

test("opacity wraps an element's whole painted subtree in one Opacity command", () => {
  const faded = el("div", el("b", new Text("hi")));
  faded.attributes["style"] = "opacity: 0.5";
  const { tree } = render(el("body", faded));
  const layers = tree
    .flatMap((cmd) => treeToList(cmd, []))
    .filter((cmd): cmd is Opacity => cmd instanceof Opacity && cmd.opacity < 1);
  assert.equal(layers.length, 1);
  // The nested <b>'s text is inside the layer, so it fades with its parent.
  const inside = drawingCommands(layers[0]!.children);
  assert.deepEqual(
    texts(inside).map((cmd) => cmd.text),
    ["hi"],
  );
  assert.ok(!layers[0]!.rect.isEmpty());
});

test("mix-blend-mode wraps opacity around the complete element subtree", () => {
  const child = el("div", new Text("Child"));
  child.attributes.style = "background-color: blue; mix-blend-mode: difference; opacity: 0.5";
  const { tree } = render(el("body", child));
  const blend = tree.flatMap(cmd => treeToList(cmd, []))
    .find((cmd): cmd is Blend => cmd instanceof Blend && cmd.blendMode === "difference");
  assert.ok(blend);
  assert.ok(blend.children[0] instanceof Opacity);
  assert.equal(blend.children[0].opacity, 0.5);
  assert.equal(texts(drawingCommands(blend.children))[0]!.text, "Child");
});

test("blend modes composite pixels against the backdrop after applying opacity", () => {
  for (const [mode, opacity, expected] of [
    ["difference", 1, [255, 165, 255]],
    ["multiply", 1, [0, 0, 0]],
    ["difference", 0.5, [255, 165, 128]],
    ["normal", 1, [0, 0, 255]],
    ["unsupported", 1, [0, 0, 255]],
  ] as const) {
    const canvas = new Canvas(20, 20);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "orange";
    ctx.fillRect(0, 0, 20, 20);
    new Blend(mode, [new Opacity(opacity, [new DrawRect(new Rect(2, 2, 18, 18), "blue")])]).execute(ctx);
    const pixel = ctx.getImageData(10, 10, 1, 1).data;
    expected.forEach((channel, i) => assert.ok(Math.abs(pixel[i]! - channel) <= 1, `${mode}: ${pixel}`));
    assert.equal(pixel[3], 255);
    assert.equal(ctx.globalAlpha, 1);
    assert.equal(ctx.globalCompositeOperation, "source-over");
  }
});

test("border-radius paints blocks and controls without changing their text layout", () => {
  const input = el("input");
  input.attributes.style = "background-color: blue; border-radius: 8px";
  const block = el("div", new Text("Rounded"), input);
  block.attributes.style = "background-color: orange; border-radius: 10px; opacity: 0.5";
  const { displayList } = render(el("body", block));
  const rounded = displayList.filter((cmd): cmd is DrawRRect => cmd instanceof DrawRRect);
  assert.equal(rounded.length, 2);
  assert.equal(rounded[0]!.radius, 10);
  assert.equal(rounded[1]!.radius, 8);
  assert.equal(rounded[1]!.color, "blue");
  assert.ok(texts(displayList).some(cmd => cmd.text === "Rounded"));
});

test("rounded rectangle pixels have transparent corners and radii scale to fit", () => {
  for (const radius of [10, 1000]) {
    const canvas = new Canvas(20, 20);
    const ctx = canvas.getContext("2d");
    const rect = new Rect(0, 0, 20, 20);
    new DrawRRect(rect, "red", radius).execute(ctx);
    assert.equal(ctx.getImageData(0, 0, 1, 1).data[3], 0, String(radius));
    assert.equal(ctx.getImageData(10, 10, 1, 1).data[3], 255, String(radius));
    assert.equal(ctx.getImageData(10, 1, 1, 1).data[0], 255, String(radius));
  }
});

test("overflow clip masks the subtree without erasing the backdrop, including at full opacity", () => {
  for (const opacity of [1, 0.5]) {
    const canvas = new Canvas(60, 60);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "orange";
    ctx.fillRect(0, 0, 60, 60);
    const node = el("div");
    node.style = { overflow: "clip", "border-radius": "10px", opacity: String(opacity) };
    const commands = paintVisualEffects(node,
      [new DrawRect(new Rect(0, 0, 60, 60), "blue")], new Rect(10, 10, 50, 50));
    for (const command of commands) {
      command.execute(ctx);
    }
    const pixel = (x: number, y: number) => [...ctx.getImageData(x, y, 1, 1).data];
    assert.deepEqual(pixel(2, 2), [255, 165, 0, 255], "overflow leaves backdrop intact");
    assert.deepEqual(pixel(10, 10), [255, 165, 0, 255], "rounded corner reveals backdrop");
    const center = pixel(30, 30);
    // Intermediate surfaces can introduce an extra byte of rounding.
    assert.ok(Math.abs(center[0]! - 255 * (1 - opacity)) <= 2);
    assert.ok(Math.abs(center[2]! - 255 * opacity) <= 1);
    assert.equal(center[3], 255);
  }
});

test("overflow clip with zero radius clips to a rectangle; visible overflow stays visible", () => {
  for (const overflow of ["clip", "visible"]) {
    const ctx = new Canvas(40, 40).getContext("2d");
    const node = el("div");
    node.style = { overflow };
    for (const command of paintVisualEffects(node,
      [new DrawRect(new Rect(0, 0, 40, 40), "blue")], new Rect(10, 10, 30, 30))) {
      command.execute(ctx);
    }
    assert.equal(ctx.getImageData(1, 1, 1, 1).data[3], overflow === "clip" ? 0 : 255);
    assert.equal(ctx.getImageData(10, 10, 1, 1).data[3], 255);
  }
});
