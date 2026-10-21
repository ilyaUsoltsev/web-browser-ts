export class Text {
  text: string;
  constructor(text: string) {
    this.text = text;
  }
}

export class Tag {
  name: string;
  constructor(name: string) {
    this.name = name;
  }
}

export type Token = Text | Tag;
