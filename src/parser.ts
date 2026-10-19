export class Parser {
  counter: number;
  body: string;
  maxCounter: number;
  result: string;
  inTag: boolean;

  constructor(body: string) {
    this.body = body;
    this.counter = 0;
    this.maxCounter = body.length;
    this.result = '';
    this.inTag = false;
  }

  process(): void {
    mainLoop: while (this.counter < this.maxCounter) {
      if (this.checkInTag()) {
        this.counter++;
        continue;
      }

      if (this.body[this.counter] === '&') {
        if (this.checkFor('&lt;')) {
          this.result += '<';
          this.counter += 4; // Skip over '&lt;'
          continue;
        } else if (this.checkFor('&gt;')) {
          this.result += '>';
          this.counter += 4; // Skip over '&gt;'
          continue;
        } else if (this.checkFor('&amp;')) {
          this.result += '&';
          this.counter += 5; // Skip over '&amp;'
          continue;
        }
      }

      this.consume();
    }
  }

  checkInTag(): boolean {
    if (this.body[this.counter] === '<') {
      this.inTag = true;
    } else if (this.inTag && this.body[this.counter] === '>') {
      this.counter++;
      this.inTag = false;
    }
    return this.inTag;
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
