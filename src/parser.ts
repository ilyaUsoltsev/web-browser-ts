import { HEAD_TAGS, SELF_CLOSING_TAGS } from "./constants.ts";
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
    // Look like we don't need to add the remaining text as a separate node here
    // if (this.currentElement.trim()) {
    //   this.addText(this.currentElement.trim());
    // }
    console.log(this.unfinished, "unfinished");
    return this.finish();
  }

  finish() {
    if (this.unfinished.length === 0) {
      this.missingTags();
    }
    // Children are attached to their parent when opened in addTag,
    // so the root already holds the whole tree.
    const root = this.unfinished[0];
    this.unfinished = [];
    return root;
  }

  addText(text: string): void {
    this.missingTags();
    const parent = this.unfinished[this.unfinished.length - 1];
    const node = new Text(text);
    if (!parent) {
      throw new Error("Cannot add text outside of an element");
    }
    parent.children.push(node);
    this.currentElement = "";
  }

  addTag(name: string): void {
    if (name.startsWith("!")) {
      this.currentElement = "";
      return;
    }

    // Add html/head/body if the document skipped them
    this.missingTags(name.split(/\s+/)[0]);

    if (name.startsWith("/")) {
      if (this.unfinished.length === 1) {
        // Do not pop the last element if it's the only one left
        // We'd need it in finish method to return the root.
        return;
      }
      this.unfinished.pop();
    } else {
      const { tag, attributes } = this.getAttributes(name);
      if (SELF_CLOSING_TAGS.includes(tag)) {
        const element = new Element(tag, attributes);
        const parent = this.unfinished[this.unfinished.length - 1];
        if (parent) {
          parent.children.push(element);
        }
        this.currentElement = "";
        return;
      }
      const element = new Element(tag, attributes);
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
    // console.log(`${indent}</${node.name}>`);
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

  private getAttributes(text: string) {
    const parts = text.split(/\s+/);
    const attributes: Element["attributes"] = {};
    for (let i = 1; i < parts.length; i++) {
      const keyValue = parts[i]?.split("=");
      const key = keyValue?.[0];
      const value = keyValue?.[1];
      if (key && !value) {
        attributes[key] = null;
      }
      if (key && value) {
        attributes[key] = value.replace(/['"]/g, "");
      }
    }
    return { tag: parts[0] ?? "", attributes };
  }

  private missingTags(tag: string = ""): void {
    while (true) {
      const openTags = this.unfinished.map((el) => el.name);
      const hasHead = !!this.unfinished[0]?.children.some(
        (child) => child instanceof Element && child.name === "head",
      );
      if (openTags.length === 0 && tag !== "html") {
        this.addTag("html");
      } else if (
        openTags.length === 1 &&
        openTags[0] === "html" &&
        !hasHead &&
        tag !== "head"
      ) {
        // Always create a head first, even if it stays empty
        this.addTag("head");
      } else if (
        openTags.length === 1 &&
        openTags[0] === "html" &&
        hasHead &&
        !["body", "/html"].includes(tag)
      ) {
        this.addTag("body");
      } else if (
        openTags.length === 2 &&
        openTags[0] === "html" &&
        openTags[1] === "head" &&
        !["/head", ...HEAD_TAGS].includes(tag)
      ) {
        // A non-head tag (or text) means the head is over
        this.addTag("/head");
      } else {
        break;
      }
    }
  }
}
