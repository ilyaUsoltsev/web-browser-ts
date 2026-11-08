import { Element, type Token } from "./tokens.ts";

export type Selector = TagSelector | DescendantSelector;

export class TagSelector {
  constructor(public tagName: string) {}

  matches(node: Token) {
    return node instanceof Element && node.name === this.tagName;
  }
}

export class DescendantSelector {
  constructor(
    public ancestor: Selector,
    public descendant: Selector,
  ) {}

  matches(node: Token) {
    if (!this.descendant.matches(node)) {
      return false;
    }
    while (node.parent) {
      if (this.ancestor.matches(node.parent)) {
        return true;
      }
      node = node.parent;
    }
    return false;
  }
}
