import { test } from "node:test";
import { Parser } from "../src/parser.ts";
import { Text, Element } from "../src/tokens.ts";
import assert from "node:assert/strict";

function parse(body: string) {
  const parser = new Parser(body);
  return parser.parse();
}

test("Parser processes HTML correctly", () => {
  assert.deepEqual(parse("<p>a<i>b</i>c</p>"), [
    new Element("p"),
    new Text("a"),
    new Element("i"),
    new Text("b"),
    new Element("/i"),
    new Text("c"),
    new Element("/p"),
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
    new Element("p"),
    new Text("<b>"),
    new Element("/p"),
  ]);
});

test("Parser parses empty brackets correctly", () => {
  assert.deepEqual(parse("<><>and<>"), [new Text("and")]);
});
