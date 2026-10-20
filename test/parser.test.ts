import { test } from "node:test";
import { Parser } from "../src/parser.ts";
import assert from "node:assert/strict";

test("Parser processes HTML correctly", () => {
  const parser = new Parser("<p>a<i>b</i>c</p>");
  parser.process();
  assert.equal(parser.result, "abc");
});

test("Parser processes empty HTML correctly", () => {
  const parser = new Parser("");
  parser.process();
  assert.equal(parser.result, "");
});

test("Parser parses &amp; correctly", () => {
  const parser = new Parser("&amp;");
  parser.process();
  assert.equal(parser.result, "&");
});

test("Parser parses empty brackets correctly", () => {
  const parser = new Parser("<><>and<>");
  parser.process();
  assert.equal(parser.result, "and");
});
