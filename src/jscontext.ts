import vm from "node:vm";
import { CSSParser } from "./css-parser.ts";
import { Parser } from "./parser.ts";
import type { Tab } from "./tab.ts";
import { Element } from "./tokens.ts";
import { treeToList } from "./utils.ts";

// What page scripts see in place of the browser's own Element: a DOM-shaped
// API over an element they can't reach. The book uses numeric handles because
// DukPy can't pass Python objects to JS; node:vm can, so the wrapper holds the
// Element directly, in a #private field page scripts can't read or change.
class Node {
  #element: Element;
  // Event type -> listeners. Kept on the wrapper (the book's LISTENERS table,
  // keyed by handle) since each element always gets the same wrapper.
  #listeners = new Map<string, Function[]>();
  // For DOM changes, which need the browser's parser and a re-render.
  #js: JSContext;

  constructor(element: Element, js: JSContext) {
    this.#element = element;
    this.#js = js;
  }

  set innerHTML(html: unknown) {
    this.#js.setInnerHTML(this.#element, String(html));
  }

  getAttribute(name: string): string | null {
    return this.#element.attributes[name] ?? null;
  }

  addEventListener(type: string, listener: Function): void {
    const list = this.#listeners.get(type) ?? [];
    list.push(listener);
    this.#listeners.set(type, list);
  }

  // Runs this node's listeners for `type`, with `this` set to the node.
  dispatchEvent(type: string): void {
    for (const listener of this.#listeners.get(type) ?? []) {
      // Like real browsers, a crashing listener is reported and the rest
      // still run. Listeners aren't called via runInContext, so without
      // this the error would reach the browser (and no timeout applies).
      try {
        listener.call(this);
      } catch (e) {
        console.log("Event listener for", type, "crashed", e);
      }
    }
  }
}

// The book's DukPy interpreter. Unlike DukPy, node:vm lets page scripts call
// functions on the context object directly, so web APIs are defined right
// here instead of in a runtime.js on top of call_python.
export class JSContext {
  private ctx: vm.Context;
  // One wrapper per element (the book's node_to_handle), so the same element
  // always gives the same Node and `===` works. Weak, so an element removed
  // from the page can be garbage-collected along with its wrapper.
  private wrappers = new WeakMap<Element, Node>();

  constructor(private tab: Tab) {
    this.ctx = vm.createContext({
      console: { log: (x: unknown) => console.log(x) },
      document: {
        querySelectorAll: (selectorText: string) => {
          const selector = new CSSParser(selectorText).selector();
          const listOfNodes = this.tab.rootElement ? treeToList(this.tab.rootElement, []) : [];
          return listOfNodes
            .filter((node) => node instanceof Element && selector.matches(node))
            .map((node) => this.wrap(node as Element));
        },
      },
    });
  }

  private wrap(element: Element): Node {
    let node = this.wrappers.get(element);
    if (!node) {
      node = new Node(element, this);
      this.wrappers.set(element, node);
    }
    return node;
  }

  // Replaces element's children with `html`, parsed, and redraws the page.
  setInnerHTML(element: Element, html: string): void {
    // The parser only handles whole documents, so wrap the fragment in one
    // (the book's hack; real browsers have a separate fragment algorithm).
    const doc = new Parser("<html><body>" + html + "</body></html>").parse();
    const body = doc?.children.find((child) => child instanceof Element && child.name === "body");
    element.children = body?.children ?? [];
    // They still point at the throwaway <body>.
    for (const child of element.children) {
      child.parent = element;
    }
    this.tab.render();
  }

  // Called by the browser when an event happens on `element`.
  dispatchEvent(type: string, element: Element): void {
    // No wrapper means the page never got hold of this element, so it can't
    // have added listeners to it (the book's handle -1).
    this.wrappers.get(element)?.dispatchEvent(type);
  }

  run(script: string, code: string): unknown {
    try {
      return vm.runInContext(code, this.ctx, { filename: script, timeout: 1000 });
    } catch (e) {
      console.log("Script", script, "crashed", e);
    }
  }
}
