import type { Token } from "./tokens.ts";
import type { Rule } from "./types.ts";

export function treeToList(node: Token, list: Token[]): Token[] {
  list.push(node);
  for (const child of node.children) {
    treeToList(child, list);
  }
  return list;
}

export function cascadePriority(rule: Rule) {
  return rule.selector.priority;
}
