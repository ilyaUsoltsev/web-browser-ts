import { test } from "node:test";
import assert from "node:assert/strict";
import { LayoutClass } from "../src/layout.ts";
import { Text, Tag } from "../src/tokens.ts";
import { HSTEP, VSTEP, WIDTH } from "../src/constants.ts";

test("LayoutClass places words left to right on one line", () => {
  const layout = new LayoutClass();
  const { displayList } = layout.calculate([new Text("ab cd")]);
  assert.deepEqual(displayList, [
    { x: HSTEP, y: VSTEP, word: "ab" },
    {
      x: HSTEP + layout.measureText("ab") + layout.spaceWidth,
      y: VSTEP,
      word: "cd",
    },
  ]);
});

test("LayoutClass ignores tags", () => {
  const layout = new LayoutClass();
  const { displayList } = layout.calculate([
    new Tag("p"),
    new Text("a"),
    new Tag("/p"),
  ]);
  assert.deepEqual(displayList, [{ x: HSTEP, y: VSTEP, word: "a" }]);
});

test("LayoutClass wraps at the window width", () => {
  const layout = new LayoutClass();
  const { displayList, totalHeight } = layout.calculate([
    new Text("word ".repeat(200)),
  ]);
  const ys = new Set(displayList.map((item) => item.y));
  assert.ok(ys.size > 1);
  for (const { x } of displayList) assert.ok(x < WIDTH - HSTEP);
  assert.ok(totalHeight > Math.max(...ys));
});

test("LayoutClass wraps earlier in a narrower window", () => {
  const layout = new LayoutClass();
  const tokens = [new Text("word ".repeat(200))];
  const wide = layout.calculate(tokens, WIDTH).totalHeight;
  const narrow = layout.calculate(tokens, WIDTH / 2).totalHeight;
  assert.ok(narrow > wide);
});
