import assert from "node:assert/strict";
import { test } from "node:test";
import { CSSParser, style } from "../src/css-parser.ts";
import { Element } from "../src/tokens.ts";

test("CSS rule parsing skips invalid selectors and keeps later rules", () => {
  const rules = new CSSParser(
    "p { color: red; } .unsupported { color: blue; } div { color: green }  ",
  ).parse();
  assert.deepEqual(
    rules.map((rule) => rule.body),
    [{ color: "red" }, { color: "green" }],
  );
  assert.ok(rules[0]!.selector.matches(new Element("p")));
  assert.ok(rules[1]!.selector.matches(new Element("div")));
});

test("CSS declaration recovery leaves the closing brace for the rule parser", () => {
  const rules = new CSSParser("p { color: red; broken } div { color: blue; }").parse();
  assert.deepEqual(
    rules.map((rule) => rule.body),
    [{ color: "red" }, { color: "blue" }],
  );
});

test("CSS rule recovery stops at EOF and handles empty stylesheets", () => {
  assert.deepEqual(new CSSParser("  ").parse(), []);
  assert.deepEqual(new CSSParser(".unsupported { color: red;").parse(), []);
  assert.deepEqual(new CSSParser("p { color: red;").parse(), []);
});

test("CSS body parses declarations with whitespace and repeated properties", () => {
  assert.deepEqual(new CSSParser("  color: red; font-size: 16px; color: blue;  ").body(), {
    color: "blue",
    "font-size": "16px",
  });
  assert.deepEqual(new CSSParser("color: red").body(), { color: "red" });
  assert.deepEqual(new CSSParser(" \n ").body(), {});
});

test("CSS body skips malformed and unsupported declarations", () => {
  assert.deepEqual(
    new CSSParser(
      "broken; : red; color: ; width: calc(100px); color: blue; font-size: 16px; unfinished",
    ).body(),
    { color: "blue", "font-size": "16px" },
  );
  assert.deepEqual(new CSSParser("color: red; color: rgb(1,2,3)").body(), {
    color: "red",
  });
});

test("CSS recovery stops before the delimiter or at end of input", () => {
  const parser = new CSSParser("invalid; color: red;");
  assert.equal(parser.ignoreUntil([";"]), ";");
  parser.literal(";");
  assert.deepEqual(parser.body(), { color: "red" });
  assert.equal(new CSSParser("invalid").ignoreUntil([";"]), null);
});

test("CSS words require at least one supported character", () => {
  assert.throws(() => new CSSParser(":").word(), /Expected word/);
  assert.throws(() => new CSSParser("color:").pair(), /Expected word/);
});

test("percentage font sizes resolve to px before being inherited", () => {
  const code = new Element("code");
  const h1 = new Element("h1", {}, null, [code]);
  const root = new Element("html", {}, null, [h1]);
  h1.parent = root;
  code.parent = h1;
  style(root, [
    { selector: new CSSParser("h1").selector(), body: { "font-size": "150%" } },
  ]);
  assert.equal(h1.style["font-size"], "24px");
  assert.equal(code.style["font-size"], "24px");
});

test("percentage font size on the root is relative to the default font size", () => {
  const root = new Element("html", { style: "font-size: 50%" });
  style(root, []);
  assert.equal(root.style["font-size"], "8px");
});
