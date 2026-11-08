import { test } from "node:test";
import { inspect } from "node:util";
import { Parser } from "../src/parser.ts";
import { Text, Element, type Token } from "../src/tokens.ts";
import assert from "node:assert/strict";

function parse(body: string): Element {
  const root = new Parser(body).parse();
  assert.ok(root instanceof Element);
  assert.equal(root.parent, null);
  function checkParents(node: Token) {
    for (const child of node.children) {
      assert.equal(child.parent, node);
      checkParents(child);
    }
  }
  checkParents(root);
  return root;
}

// Compare structure separately from the circular parent references.
function tree(node: Token): unknown {
  return node instanceof Text
    ? node.text
    : [node.name, node.attributes, node.children.map(tree)];
}

function bodyOf(source: string): Element {
  const body = parse(source).children.find(
    (node): node is Element => node instanceof Element && node.name === "body",
  );
  assert.ok(body);
  return body;
}

test("Parser builds a nested HTML tree with implicit containers", () => {
  assert.deepEqual(tree(parse("<p>a<i>b</i>c</p>")), [
    "html", {}, [
      ["head", {}, []],
      ["body", {}, [["p", {}, ["a", ["i", {}, ["b"]], "c"]]]],
    ],
  ]);
});

test("Parser clears closing root tags before processing trailing input", () => {
  for (const suffix of ["", "\n", "\n<p>after</p>"]) {
    const root = parse(`<html><head></head><body>hello</body></html>${suffix}`);
    const text: string[] = [];
    function collect(node: Token): void {
      if (node instanceof Text) text.push(node.text);
      else node.children.forEach(collect);
    }
    collect(root);
    assert.deepEqual(text, suffix.includes("after") ? ["hello", "after"] : ["hello"]);
  }
});

test("Parser processes empty HTML with an implicit document", () => {
  assert.deepEqual(tree(parse("")), [
    "html", {}, [["head", {}, []], ["body", {}, []]],
  ]);
});

test("Parser preserves trailing text and decodes entities", () => {
  assert.deepEqual(tree(bodyOf("&amp;")), ["body", {}, ["&"]]);
  assert.deepEqual(tree(bodyOf("<p>Hello")), ["body", {}, [["p", {}, ["Hello"]]]]);
  assert.deepEqual(tree(bodyOf("<p>first</p>last")), [
    "body", {}, [["p", {}, ["first"]], "last"],
  ]);
  assert.deepEqual(tree(bodyOf("<p>&lt;b&gt;</p>")), [
    "body", {}, [["p", {}, ["<b>"]]],
  ]);
});

test("Parser ignores empty tags and unfinished tag text", () => {
  assert.deepEqual(tree(bodyOf("<><>and<>")), ["body", {}, ["and"]]);
  assert.deepEqual(tree(bodyOf("hello<unfinished")), ["body", {}, ["hello"]]);
});

test("Parser assigns parents to explicit elements and void elements", () => {
  const root = parse('<html><head><title>Title</title></head><body><p id="intro">Hello<br>world</p></body></html>');
  assert.equal(root.name, "html");
  const body = root.children[1] as Element;
  assert.deepEqual(tree(body), [
    "body", {}, [["p", { id: "intro" }, ["Hello", ["br", {}, []], "world"]]],
  ]);
});

test("Parser preserves quoted attribute values and ignores the closing slash", () => {
  const root = parse('<meta name="viewport" content="width=device-width, initial-scale=1.0" />');
  const head = root.children[0] as Element;
  const meta = head.children[0] as Element;
  assert.deepEqual(meta.attributes, {
    name: "viewport",
    content: "width=device-width, initial-scale=1.0",
  });
});

test("Parser handles boolean, empty, single-quoted, and unquoted attributes", () => {
  const body = bodyOf(`<input disabled value="" title = 'say "hello"' data-token=a=b />`);
  assert.deepEqual((body.children[0] as Element).attributes, {
    disabled: null,
    value: "",
    title: 'say "hello"',
    "data-token": "a=b",
  });
});

test("Nodes have concise string and debug representations", () => {
  const text = new Text('hello "world"');
  const element = new Element("p", { id: "intro", hidden: null });
  assert.equal(String(text), '"hello \\"world\\""');
  assert.equal(String(element), '<p id="intro" hidden>');
  assert.equal(inspect(text), String(text));
  assert.equal(inspect(element), String(element));
});
