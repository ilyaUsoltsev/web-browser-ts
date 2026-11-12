import vm from "node:vm";
import { CSSParser } from "./css-parser.ts";
import type { Tab } from "./tab.ts";
import { Element } from "./tokens.ts";
import { treeToList } from "./utils.ts";

// What page scripts see in place of the browser's own Element: a DOM-shaped
// API over an element they can't reach. The book uses numeric handles because
// DukPy can't pass Python objects to JS; node:vm can, so the wrapper holds the
// Element directly, in a #private field page scripts can't read or change.
class Node {
  #element: Element;

  constructor(element: Element) {
    this.#element = element;
  }

  getAttribute(name: string): string | null {
    return this.#element.attributes[name] ?? null;
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
      node = new Node(element);
      this.wrappers.set(element, node);
    }
    return node;
  }

  run(script: string, code: string): unknown {
    try {
      return vm.runInContext(code, this.ctx, { filename: script, timeout: 1000 });
    } catch (e) {
      console.log("Script", script, "crashed", e);
    }
  }
}
