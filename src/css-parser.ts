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

  body(): Record<string, string> {
    const pairs: Record<string, string> = {};
    this.whitespace();
    while (this.position < this.text.length) {
      try {
        const { property, value } = this.pair();
        this.whitespace();
        if (this.position < this.text.length) {
          this.literal(";");
        }
        pairs[property] = value;
        this.whitespace();
      } catch {
        // Unsupported or malformed declarations are skipped independently.
        if (this.ignoreUntil([";"]) !== ";") {
          break;
        }
        this.literal(";");
        this.whitespace();
      }
    }
    return pairs;
  }
}
