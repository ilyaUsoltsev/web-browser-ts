import { Text, Element } from "./tokens.ts";
import type { Token } from "./tokens.ts";

export class Parser {
  counter: number;
  body: string;
  maxCounter: number;
  private result: Token[];
  currentElement: string;
  isInTag: boolean;
  unfinished: Element[];

  constructor(body: string) {
    this.body = body;
    this.counter = 0;
    this.maxCounter = body.length;
    this.result = [];
    this.isInTag = false;
    this.currentElement = "";
    this.unfinished = [];
  }

  parse(): Element | undefined {
    while (this.counter < this.maxCounter) {
      if (this.body[this.counter] === "<") {
        if (this.currentElement.trim()) {
          this.addText(this.currentElement.trim());
        }
        this.isInTag = true;
        this.proceed();
        continue;
      } else if (this.isInTag && this.body[this.counter] === ">") {
        if (this.currentElement) {
          this.addTag(this.currentElement.trim());
        }
        this.isInTag = false;
        this.proceed();
        continue;
      }

      if (this.body[this.counter] === "&") {
        if (this.checkFor("&lt;")) {
          this.currentElement += "<";
          this.counter += 4; // Skip over '&lt;'
          continue;
        } else if (this.checkFor("&gt;")) {
          this.currentElement += ">";
          this.counter += 4; // Skip over '&gt;'
          continue;
        } else if (this.checkFor("&amp;")) {
          this.currentElement += "&";
          this.counter += 5; // Skip over '&amp;'
          continue;
        }
      }

      this.consume();
    }
    if (this.currentElement.trim()) {
      this.addText(this.currentElement.trim());
    }
    console.log(this.unfinished, "unfinished");
    return this.finish();
  }

  finish() {
    while (this.unfinished.length > 1) {
      const node = this.unfinished.pop();
      if (node) {
        if (this.unfinished.length > 0) {
          const parent = this.unfinished[this.unfinished.length - 1];
          if (parent) {
            parent.children.push(node);
          }
        }
      }
    }
    return this.unfinished.pop();
  }

  addText(text: string): void {
    const parent = this.unfinished[this.unfinished.length - 1];
    const node = new Text(text);
    if (!parent) {
      throw new Error("Cannot add text outside of an element");
    }
    parent.children.push(node);
    this.currentElement = "";
  }

  addTag(name: string): void {
    if (name.startsWith("/")) {
      if (this.unfinished.length === 1) {
        // Do not pop the last element if it's the only one left
        // We'd need it in finish method to return the root.
        return;
      }
      this.unfinished.pop();
    } else {
      const element = new Element(name);
      const parent = this.unfinished[this.unfinished.length - 1];
      if (parent) {
        parent.children.push(element);
      }
      this.unfinished.push(element);
    }
    this.currentElement = "";
  }

  printTree(node: Element, indent: string = ""): void {
    console.log(`${indent}<${node.name}>`);
    for (const child of node.children) {
      if (child instanceof Element) {
        this.printTree(child, indent + "  ");
      } else if (child instanceof Text) {
        console.log(indent + "  " + child.text);
      }
    }
    console.log(`${indent}</${node.name}>`);
  }

  private proceed(): void {
    this.counter++;
  }

  private consume(): void {
    this.currentElement += this.body[this.counter];
    this.counter++;
  }

  private checkFor(substring: string): boolean {
    return (
      this.body.slice(this.counter, this.counter + substring.length) ===
      substring
    );
  }

  private peek(): string | undefined {
    if (this.counter + 1 < this.maxCounter) {
      return this.body[this.counter + 1];
    }
    return undefined;
  }
}
