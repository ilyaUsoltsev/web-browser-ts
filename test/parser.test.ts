import { test } from "node:test";
import { Parser } from "../src/parser.ts";
import { Text, Tag } from "../src/tokens.ts";
import assert from "node:assert/strict";

function parse(body: string) {
  const parser = new Parser(body);
  parser.process();
  return parser.getTokens();
}

test("Parser processes HTML correctly", () => {
  assert.deepEqual(parse("<p>a<i>b</i>c</p>"), [
    new Tag("p"),
    new Text("a"),
    new Tag("i"),
    new Text("b"),
    new Tag("/i"),
    new Text("c"),
    new Tag("/p"),
  ]);
});

test("Parser processes empty HTML correctly", () => {
  assert.deepEqual(parse(""), []);
});

test("Parser parses &amp; correctly", () => {
  assert.deepEqual(parse("&amp;"), [new Text("&")]);
});

test("Parser parses &lt; and &gt; correctly", () => {
  assert.deepEqual(parse("<p>&lt;b&gt;</p>"), [
    new Tag("p"),
    new Text("<b>"),
    new Tag("/p"),
  ]);
});

test("Parser parses empty brackets correctly", () => {
  assert.deepEqual(parse("<><>and<>"), [new Text("and")]);
});
