import type { Token } from "./tokens.ts";
import type { Rule } from "./types.ts";

interface treeNode {
  children: treeNode[];
}

export function treeToList<T extends treeNode>(node: T, list: T[]): T[] {
  list.push(node);
  for (const child of node.children) {
    treeToList(child, list);
  }
  return list;
}

export function cascadePriority(rule: Rule) {
  return rule.selector.priority;
}
