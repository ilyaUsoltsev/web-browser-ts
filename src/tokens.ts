export class Text {
  text: string;
  children: Token[] = [];
  parent: Token | null = null;
  constructor(
    text: string,
    parent: Token | null = null,
    children: Token[] = [],
  ) {
    this.text = text;
    this.children = children;
    this.parent = parent;
  }
}

export class Element {
  name: string;
  children: Token[] = [];
  parent: Token | null = null;
  constructor(
    name: string,
    parent: Token | null = null,
    children: Token[] = [],
  ) {
    this.name = name;
    this.parent = parent;
    this.children = children;
  }
}

export type Token = Text | Element;
