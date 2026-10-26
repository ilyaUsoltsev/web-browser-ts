import { test } from "node:test";
import assert from "node:assert/strict";
import { LayoutClass } from "../src/layout.ts";
import { Text, Element } from "../src/tokens.ts";
import {
  DEFAULT_FONT,
  HSTEP,
  LINE_HEIGHT_MULTIPLIER,
  LINE_HEIGHT_PADDING,
  VSTEP,
  WIDTH,
} from "../src/constants.ts";

const body = (...children: (Text | Element)[]) =>
  new Element("body", {}, null, children);

// baseline of the first line: one line height below the top
function firstLineY(layout: LayoutClass, words: string[]): number {
  const height = Math.max(
    VSTEP,
    ...words.map((word) => layout.measureText(word).heigth),
  );
  return height * LINE_HEIGHT_MULTIPLIER + LINE_HEIGHT_PADDING;
}

test("LayoutClass places words left to right on one line", () => {
  const layout = new LayoutClass();
  const { displayList } = layout.calculate(body(new Text("ab cd")), WIDTH);
  const y = firstLineY(layout, ["ab", "cd"]);
  const font = layout.getFont(DEFAULT_FONT);
  assert.deepEqual(displayList, [
    { x: HSTEP, y, word: "ab", font, align: "left" },
    {
      x: HSTEP + layout.measureText("ab").width + layout.spaceWidth,
      y,
      word: "cd",
      font,
      align: "left",
    },
  ]);
});

test("LayoutClass ignores tags", () => {
  const layout = new LayoutClass();
  const { displayList } = layout.calculate(
    body(new Element("p", {}, null, [new Text("a")])),
    WIDTH,
  );
  assert.deepEqual(displayList, [
    {
      x: HSTEP,
      y: firstLineY(layout, ["a"]),
      word: "a",
      font: layout.getFont(DEFAULT_FONT),
      align: "left",
    },
  ]);
});

test("LayoutClass wraps at the window width", () => {
  const layout = new LayoutClass();
  const { displayList, totalHeight } = layout.calculate(
    body(new Text("word ".repeat(200))),
    WIDTH,
  );
  const ys = new Set(displayList.map((item) => item.y));
  assert.ok(ys.size > 1);
  for (const { x } of displayList) assert.ok(x < WIDTH - HSTEP);
  assert.ok(totalHeight > Math.max(...ys));
});

test("LayoutClass wraps earlier in a narrower window", () => {
  const layout = new LayoutClass();
  const tokens = body(new Text("word ".repeat(200)));
  const wide = layout.calculate(tokens, WIDTH).totalHeight;
  const narrow = layout.calculate(tokens, WIDTH / 2).totalHeight;
  assert.ok(narrow > wide);
});
