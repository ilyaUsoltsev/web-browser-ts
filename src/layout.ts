import type { Layout, DisplayItem, TokenFont } from "./types.ts";
import {
  HSTEP,
  VSTEP,
  DEFAULT_FONT,
  LINE_HEIGHT_PADDING,
  LINE_HEIGHT_MULTIPLIER,
} from "./constants.ts";
import { type Token, Text, Element } from "./tokens.ts";
import { Canvas, CanvasRenderingContext2D } from "skia-canvas";

export class LayoutClass {
  displayList: DisplayItem[] = [];
  totalHeight: number = 0;
  spaceWidth: number;
  measureCtx: CanvasRenderingContext2D;
  currentFont: TokenFont = DEFAULT_FONT;
  windowWidth: number = 0;
  cursorX: number = HSTEP;
  cursorY: number = VSTEP;
  currentLineNumber: number = 0;
  currentWordHeight: number = VSTEP;
  lineHeights: number[] = [];
  lines: { displayList: DisplayItem[]; lineWidth: number }[] = [];

  constructor() {
    this.measureCtx = new Canvas(1, 1).getContext("2d");
    this.measureCtx.font = this.getFont(DEFAULT_FONT);
    this.spaceWidth = this.measureText(" ").width;
  }

  measureText(text: string): { width: number; heigth: number } {
    const metrics = this.measureCtx.measureText(text);

    // We might need to cache it, but don't forget to include font!
    // Otherwise we'd measure the same text with different fonts incorrectly.
    const result = {
      width: metrics.width,
      // font metrics, not glyph ink: every word in the same font gets the same height
      heigth: Math.round(
        metrics.fontBoundingBoxAscent + metrics.fontBoundingBoxDescent,
      ),
    };
    return result;
  }

  getFont(tokenFont: TokenFont): string {
    let result = "";
    result += `${tokenFont.bold ? "bold" : "normal"} `;
    result += `${tokenFont.italic ? "italic " : ""}`;
    result += `${tokenFont.size}px sans-serif`;
    return result;
  }

  calculate(tree: Token, windowWidth: number): Layout {
    this.windowWidth = windowWidth;
    this.cursorX = HSTEP;
    this.cursorY = VSTEP;
    this.currentLineNumber = 0;
    this.currentWordHeight = VSTEP;
    this.lineHeights = [];
    this.lines = [];
    this.setFont(DEFAULT_FONT);

    this.recurse(tree);
    // setting the line height for the last line
    this.lineHeights[this.currentLineNumber] = this.lineHeight();

    this.lines.forEach(({ displayList: line, lineWidth }, i) => {
      const lineHeightSum = this.lineHeights
        .slice(0, i + 1)
        .reduce((a, b) => a + b, 0);
      for (const item of line) {
        item.y = lineHeightSum;
        if (item.align === "center") {
          item.x = item.x + (windowWidth - HSTEP - lineWidth) / 2;
        } else if (item.align === "right") {
          item.x = item.x + (windowWidth - HSTEP - lineWidth);
        }
      }
    });

    this.totalHeight = this.cursorY + VSTEP; // Add bottom padding in form of VSTEP
    this.displayList = this.lines.flatMap((line) => line.displayList);
    return { displayList: this.displayList, totalHeight: this.totalHeight };
  }

  recurse(tree: Token) {
    if (tree instanceof Text) {
      for (const word of tree.text.split(/\s+/)) {
        if (word) {
          this.word(word);
        }
      }
    } else {
      this.openTag(tree);
      for (const child of tree.children) {
        this.recurse(child);
      }
      this.closeTag(tree);
    }
  }

  word(word: string) {
    const { width: wordWidth, heigth: wordHeight } = this.measureText(word);

    if (this.cursorX + wordWidth >= this.windowWidth - HSTEP) {
      this.newLine();
    }
    // after the wrap check, so a wrapped word only affects its own line
    this.currentWordHeight = Math.max(this.currentWordHeight, wordHeight);

    this.currentLine().displayList.push({
      x: this.cursorX,
      y: this.cursorY,
      word,
      font: this.getFont(this.currentFont),
      align: this.currentFont.align,
    });
    this.cursorX += wordWidth + this.spaceWidth;
  }

  newLine() {
    this.lineHeights[this.currentLineNumber] = this.lineHeight();
    this.cursorY += this.lineHeights[this.currentLineNumber]!;
    this.currentLine().lineWidth = this.cursorX - HSTEP;
    this.cursorX = HSTEP;
    this.currentLineNumber++;
    this.currentWordHeight = VSTEP;
  }

  openTag(token: Element) {
    if (token.name === "b") {
      this.setFont({ ...this.currentFont, bold: true });
    } else if (token.name === "i") {
      this.setFont({ ...this.currentFont, italic: true, size: 34 });
    } else if (token.name === "small") {
      this.setFont({ ...this.currentFont, size: 10 });
    } else if (token.name === "big") {
      this.setFont({ ...this.currentFont, size: 18 });
    } else if (token.name === "br") {
      this.newLine();
    } else if (token.name === "h1") {
      this.newLine();
      this.setFont({ ...this.currentFont, size: 48, align: "center" });
    } else if (token.name === "right") {
      this.newLine();
      this.setFont({ ...this.currentFont, align: "right" });
    }
  }

  closeTag(token: Element) {
    if (token.name === "b") {
      this.setFont({ ...this.currentFont, bold: false });
    } else if (token.name === "i") {
      this.setFont({
        ...this.currentFont,
        italic: false,
        size: DEFAULT_FONT.size,
      });
    } else if (token.name === "small" || token.name === "big") {
      this.setFont({ ...this.currentFont, size: DEFAULT_FONT.size });
    } else if (token.name === "h1" || token.name === "right") {
      this.setFont(DEFAULT_FONT);
      this.newLine();
    }
  }

  private setFont(font: TokenFont) {
    this.currentFont = font;
    this.measureCtx.font = this.getFont(font);
    this.spaceWidth = this.measureText(" ").width;
  }

  private lineHeight(): number {
    return (
      this.currentWordHeight * LINE_HEIGHT_MULTIPLIER + LINE_HEIGHT_PADDING
    );
  }

  private currentLine() {
    if (!this.lines[this.currentLineNumber]) {
      this.lines[this.currentLineNumber] = { displayList: [], lineWidth: 0 };
    }
    return this.lines[this.currentLineNumber]!;
  }
}
