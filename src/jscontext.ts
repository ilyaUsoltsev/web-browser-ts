import vm from "node:vm";
import { CSSParser } from "./css-parser.ts";
import type { Tab } from "./tab.ts";
import { treeToList } from "./utils.ts";

// The book's DukPy interpreter. Unlike DukPy, node:vm lets page scripts call
// functions on the context object directly, so web APIs are defined right
// here instead of in a runtime.js on top of call_python.
export class JSContext {
  private ctx: vm.Context;

  constructor(private tab: Tab) {
    this.ctx = vm.createContext({
      console: { log: (x: unknown) => console.log(x) },
      querySelectorAll: (selectorText: string) => {
        const selector = new CSSParser(selectorText).selector();
        const listOfNodes = this.tab.rootElement ? treeToList(this.tab.rootElement, []) : [];
        return listOfNodes.filter((node) => selector.matches(node));
      },
    });
  }

  run(script: string, code: string): unknown {
    try {
      return vm.runInContext(code, this.ctx, { filename: script, timeout: 1000 });
    } catch (e) {
      console.log("Script", script, "crashed", e);
    }
  }
}
