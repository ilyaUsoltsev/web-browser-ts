import { inspect } from "node:util";

export class Text {
  text: string;
  children: Token[] = [];
  parent: Token | null = null;
  constructor(text: string, parent: Token | null = null, children: Token[] = []) {
    this.text = text;
    this.children = children;
    this.parent = parent;
  }

  toString(): string {
    return JSON.stringify(this.text);
  }

  [inspect.custom](): string {
    return this.toString();
  }
}

export class Element {
  name: string;
  attributes: Record<string, null | string> = {};
  children: Token[] = [];
  parent: Token | null = null;
  style: Record<string, string> = {};
  constructor(
    name: string,
    attributes: Record<string, null | string> = {},
    parent: Token | null = null,
    children: Token[] = [],
  ) {
    this.name = name;
    this.attributes = attributes;
    this.parent = parent;
    this.children = children;
  }

  toString(): string {
    const attributes = Object.entries(this.attributes).map(([name, value]) =>
      value === null ? name : `${name}=${JSON.stringify(value)}`,
    );
    return `<${[this.name, ...attributes].join(" ")}>`;
  }

  [inspect.custom](): string {
    return this.toString();
  }
}

export type Token = Text | Element;
