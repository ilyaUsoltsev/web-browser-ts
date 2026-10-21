import type { Layout, DisplayItem, TokenFont } from "./types.ts";
import { WIDTH, HSTEP, VSTEP, DEFAULT_FONT } from "./constants.ts";
import { type Token, Text, Tag } from "./tokens.ts";
import { Canvas, CanvasRenderingContext2D } from "skia-canvas";

export class LayoutClass {
  displayList: DisplayItem[] = [];
  totalHeight: number = 0;
  spaceWidth: number;
  measureCtx: CanvasRenderingContext2D;

  constructor() {
    this.measureCtx = new Canvas(1, 1).getContext("2d");
    this.spaceWidth = this.measureText(" ");
  }

  measureText(text: string): number {
    return this.measureCtx.measureText(text).width;
  }

  getFont(tokenFont: TokenFont): string {
    let result = "";
    result += `${tokenFont.bold ? "bold" : "normal"} `;
    result += `${tokenFont.italic ? "italic " : ""}`;
    result += `${tokenFont.size}px sans-serif`;
    return result;
  }

  calculate(tokens: Token[], windowWidth: number = WIDTH): Layout {
    let cursorX = HSTEP;
    let cursorY = VSTEP;
    this.displayList = [];
    let currentFont = DEFAULT_FONT;
    for (const token of tokens) {
      if (token instanceof Text) {
        for (const word of token.text.split(/\s+/)) {
          const wordWidth = this.measureText(word);
          if (cursorX >= windowWidth - HSTEP) {
            cursorY += VSTEP;
            cursorX = HSTEP;
          }
          this.displayList.push({
            x: cursorX,
            y: cursorY,
            word,
            font: this.getFont(currentFont),
          });
          cursorX += wordWidth + this.spaceWidth;
        }
      } else if (token instanceof Tag) {
        if (token.name === "b") {
          currentFont = { ...currentFont, bold: true };
        } else if (token.name === "i") {
          currentFont = { ...currentFont, italic: true, size: 36 };
        } else if (token.name === "/b" || token.name === "/i") {
          currentFont = DEFAULT_FONT;
        }
        this.measureCtx.font = this.getFont(currentFont);
        this.spaceWidth = this.measureText(" ");
      }
    }

    this.totalHeight = cursorY + VSTEP;
    return { displayList: this.displayList, totalHeight: this.totalHeight };
  }
}
