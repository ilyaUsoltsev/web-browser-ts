import vm from "node:vm";

// The book's DukPy interpreter. Unlike DukPy, node:vm lets page scripts call
// functions on the context object directly, so web APIs are defined right
// here instead of in a runtime.js on top of call_python.
export class JSContext {
  private ctx: vm.Context;

  constructor() {
    this.ctx = vm.createContext({
      console: { log: (x: unknown) => console.log(x) },
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
