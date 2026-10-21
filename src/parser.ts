import { Text, Tag } from "./tokens.ts";
import type { Token } from "./tokens.ts";

export class Parser {
  counter: number;
  body: string;
  maxCounter: number;
  private result: Token[];
  currentElement: string;
  isInTag: boolean;

  constructor(body: string) {
    this.body = body;
    this.counter = 0;
    this.maxCounter = body.length;
    this.result = [];
    this.isInTag = false;
    this.currentElement = "";
  }

  process(): void {
    while (this.counter < this.maxCounter) {
      if (this.body[this.counter] === "<") {
        if (this.currentElement) {
          this.result.push(new Text(this.currentElement.trim()));
          this.currentElement = "";
        }
        this.isInTag = true;
        this.proceed();
      } else if (this.isInTag && this.body[this.counter] === ">") {
        if (this.currentElement) {
          this.result.push(new Tag(this.currentElement.trim()));
          this.currentElement = "";
        }
        this.isInTag = false;
        this.proceed();
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
  }

  getTokens(): (Tag | Text)[] {
    return this.result.filter((item) =>
      item instanceof Text ? item.text !== "" : true,
    );
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
