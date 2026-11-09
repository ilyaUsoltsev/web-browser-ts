import { Element, type Token } from "./tokens.ts";
import { TagSelector, DescendantSelector, type Selector } from "./selectors.ts";
import type { Rule } from "./types.ts";

export function style(node: Token, rules: Rule[]): void {
  if (node instanceof Element) {
    for (const rule of rules) {
      if (!rule.selector.matches(node)) {
        continue;
      } else {
        Object.assign(node.style, rule.body);
      }
    }
    node.style = Object.assign(node.style, new CSSParser(node.attributes["style"] ?? "").body());
  }
  for (const child of node.children) {
    style(child, rules);
  }
}

export class CSSParser {
  constructor(
    private text: string,
    private position: number = 0,
  ) {}

  whitespace() {
    while (this.position < this.text.length && /\s/.test(this.text[this.position]!)) {
      this.position++;
    }
  }

  word() {
    let start = this.position;
    while (this.position < this.text.length && /[a-zA-Z0-9_-]/.test(this.text[this.position]!)) {
      this.position++;
    }
    if (this.position === start) {
      throw new Error(`Expected word at position ${this.position}`);
    }
    return this.text.slice(start, this.position);
  }

  literal(literal: string) {
    const valid = this.position < this.text.length && this.text[this.position] === literal;
    if (!valid) {
      throw new Error(`Expected literal "${literal}" at position ${this.position}`);
    }
    this.position++;
  }

  pair() {
    const property = this.word();
    this.whitespace();
    this.literal(":");
    this.whitespace();
    const value = this.word();
    return { property, value };
  }

  ignoreUntil(chars: readonly string[]): string | null {
    while (this.position < this.text.length) {
      const char = this.text[this.position]!;
      if (chars.includes(char)) {
        return char;
      }
      this.position++;
    }
    return null;
  }

  selector() {
    let out: Selector = new TagSelector(this.word());
    this.whitespace();
    while (this.position < this.text.length && this.text[this.position] !== "{") {
      const tag = this.word();
      const descendant = new TagSelector(tag);
      out = new DescendantSelector(out, descendant);
      this.whitespace();
    }
    return out;
  }

  parse() {
    const rules: Rule[] = [];
    this.whitespace();
    while (this.position < this.text.length) {
      try {
        const selector = this.selector();
        this.whitespace();
        this.literal("{");
        this.whitespace();
        const body = this.body();
        this.literal("}");
        rules.push({ selector, body });
        this.whitespace();
      } catch {
        // An invalid selector or rule header invalidates the entire rule.
        if (this.ignoreUntil(["}"]) !== "}") {
          break;
        }
        this.literal("}");
        this.whitespace();
      }
    }
    return rules;
  }

  body(): Record<string, string> {
    const pairs: Record<string, string> = {};
    this.whitespace();
    while (this.position < this.text.length && this.text[this.position] !== "}") {
      try {
        const { property, value } = this.pair();
        this.whitespace();
        if (this.position < this.text.length && this.text[this.position] !== "}") {
          this.literal(";");
        }
        pairs[property] = value;
        this.whitespace();
      } catch {
        // Unsupported or malformed declarations are skipped independently.
        if (this.ignoreUntil([";", "}"]) !== ";") {
          break;
        }
        this.literal(";");
        this.whitespace();
      }
    }
    return pairs;
  }
}
