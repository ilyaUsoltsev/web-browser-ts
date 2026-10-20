export class Parser {
  counter: number;
  body: string;
  maxCounter: number;
  result: string;
  isInTag: boolean;

  constructor(body: string) {
    this.body = body;
    this.counter = 0;
    this.maxCounter = body.length;
    this.result = "";
    this.isInTag = false;
  }

  process(): void {
    while (this.counter < this.maxCounter) {
      if (this.checkInTag()) {
        this.counter++;
        continue;
      }

      if (this.body[this.counter] === "&") {
        if (this.checkFor("&lt;")) {
          this.result += "<";
          this.counter += 4; // Skip over '&lt;'
          continue;
        } else if (this.checkFor("&gt;")) {
          this.result += ">";
          this.counter += 4; // Skip over '&gt;'
          continue;
        } else if (this.checkFor("&amp;")) {
          this.result += "&";
          this.counter += 5; // Skip over '&amp;'
          continue;
        }
      }

      this.consume();
    }
  }

  checkInTag(): boolean {
    if (this.body[this.counter] === "<") {
      this.isInTag = true;
      return true;
    } else if (this.isInTag && this.body[this.counter] === ">") {
      this.isInTag = false;
      return true;
    }
    return this.isInTag;
  }

  proceed(): void {
    this.counter++;
  }

  consume(): void {
    this.result += this.body[this.counter];
    this.counter++;
  }

  checkFor(substring: string): boolean {
    return (
      this.body.slice(this.counter, this.counter + substring.length) ===
      substring
    );
  }

  peek(): string | undefined {
    if (this.counter + 1 < this.maxCounter) {
      return this.body[this.counter + 1];
    }
    return undefined;
  }
}
