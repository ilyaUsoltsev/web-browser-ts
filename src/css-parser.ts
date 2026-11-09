import { Element, type Token } from "./tokens.ts";
import { TagSelector, DescendantSelector, type Selector } from "./selectors.ts";
import type { Rule } from "./types.ts";
import { INHERITED_PROPERTIES } from "./constants.ts";
import { URL as NodeURL } from "node:url";
import fs from "node:fs";

export function style(node: Token, rules: Rule[]): void {
  // Every node (Text included) inherits text-related properties from its parent.
  Object.entries(INHERITED_PROPERTIES).forEach(([property, defaultValue]) => {
    node.style[property] = node.parent?.style[property] ?? defaultValue;
  });
  // Only Elements can match selectors or carry a style="" attribute.
  if (node instanceof Element) {
    for (const rule of rules) {
      if (!rule.selector.matches(node)) {
        continue;
      } else {
        Object.assign(node.style, rule.body);
      }
    }
    node.style = Object.assign(node.style, new CSSParser(node.attributes["style"] ?? "").body());

    // Resolve percentage font sizes to px (the "computed style") so children
    // inherit an absolute size rather than compounding the percentage.
    const fontSize = node.style["font-size"];
    if (fontSize?.endsWith("%")) {
      const parentFontSize =
        node.parent instanceof Element
          ? node.parent.style["font-size"]!
          : INHERITED_PROPERTIES["font-size"];
      const nodePct = parseFloat(fontSize.slice(0, -1)) / 100;
      const parentPx = parseFloat(parentFontSize.slice(0, -2));
      node.style["font-size"] = `${nodePct * parentPx}px`;
    }
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

  // Skips whitespace and /* comments */, which CSS treats the same way.
  whitespace() {
    while (this.position < this.text.length) {
      if (/\s/.test(this.text[this.position]!)) {
        this.position++;
      } else if (this.text.startsWith("/*", this.position)) {
        const end = this.text.indexOf("*/", this.position + 2);
        this.position = end === -1 ? this.text.length : end + 2;
      } else {
        break;
      }
    }
  }

  word() {
    let start = this.position;
    while (this.position < this.text.length && /[a-zA-Z0-9_%-]/.test(this.text[this.position]!)) {
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

const browserCssPath = new NodeURL("../browser.css", import.meta.url);

/** Rules from the browser's built-in stylesheet (browser.css). */
export const DEFAULT_STYLE_SHEET: readonly Rule[] = new CSSParser(
  fs.readFileSync(browserCssPath, "utf-8"),
).parse();
