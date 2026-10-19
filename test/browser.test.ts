import { test } from "node:test";
import assert from "node:assert/strict";
import { lex, layout, HSTEP, VSTEP, WIDTH } from "../src/browser.ts";

test("lex() strips tags", () => {
  assert.equal(lex("<p>a<i>b</i>c</p>"), "abc");
});

test("layout() places characters on a fixed grid", () => {
  const list = layout("ab");
  assert.deepEqual(list, [
    { x: HSTEP, y: VSTEP, c: "a" },
    { x: 2 * HSTEP, y: VSTEP, c: "b" },
  ]);
});

test("layout() wraps at the window width", () => {
  const perLine = Math.ceil((WIDTH - 2 * HSTEP) / HSTEP);
  const list = layout("x".repeat(perLine + 1));
  assert.equal(list[perLine - 1]!.y, VSTEP);
  assert.deepEqual(list[perLine], { x: HSTEP, y: 2 * VSTEP, c: "x" });
  for (const { x } of list) assert.ok(x < WIDTH - HSTEP);
});
