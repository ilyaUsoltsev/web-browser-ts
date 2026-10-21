import type { Layout, DisplayItem, TokenFont } from "./types.ts";
import {
  HSTEP,
  VSTEP,
  DEFAULT_FONT,
  LINE_HEIGHT_PADDING,
  LINE_HEIGHT_MULTIPLIER,
} from "./constants.ts";
import { type Token, Text, Tag } from "./tokens.ts";
import { Canvas, CanvasRenderingContext2D } from "skia-canvas";

export class LayoutClass {
  displayList: DisplayItem[] = [];
  totalHeight: number = 0;
  spaceWidth: number;
  measureCtx: CanvasRenderingContext2D;

  constructor() {
    this.measureCtx = new Canvas(1, 1).getContext("2d");
    this.measureCtx.font = this.getFont(DEFAULT_FONT);
    this.spaceWidth = this.measureText(" ").width;
  }

  measureText(text: string): { width: number; heigth: number } {
    const metrics = this.measureCtx.measureText(text);
    return {
      width: metrics.width,
      heigth:
        metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent,
    };
  }

  getFont(tokenFont: TokenFont): string {
    let result = "";
    result += `${tokenFont.bold ? "bold" : "normal"} `;
    result += `${tokenFont.italic ? "italic " : ""}`;
    result += `${tokenFont.size}px sans-serif`;
    return result;
  }

  calculate(tokens: Token[], windowWidth: number): Layout {
    let cursorX = HSTEP;
    let cursorY = VSTEP;
    this.displayList = [];
    let currentFont = DEFAULT_FONT;
    let currentLineNumber = 0;
    let currentLineHeight = VSTEP;
    let lineHeights: number[] = [];
    const displayLists: DisplayItem[][] = [];

    for (const token of tokens) {
      if (token instanceof Text) {
        for (const word of token.text.split(/\s+/)) {
          const { width: wordWidth, heigth: wordHeight } =
            this.measureText(word);

          currentLineHeight = Math.max(currentLineHeight, wordHeight);

          if (cursorX + wordWidth >= windowWidth - HSTEP) {
            lineHeights[currentLineNumber] =
              currentLineHeight * LINE_HEIGHT_MULTIPLIER + LINE_HEIGHT_PADDING;
            cursorY += currentLineHeight;
            cursorX = HSTEP;
            currentLineNumber++;
            currentLineHeight = VSTEP;
          }
          if (!displayLists[currentLineNumber]) {
            displayLists[currentLineNumber] = [];
          }

          displayLists[currentLineNumber]!.push({
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
          currentFont = { ...currentFont, italic: true, size: 34 };
        } else if (token.name === "/b" || token.name === "/i") {
          currentFont = DEFAULT_FONT;
        }
        this.measureCtx.font = this.getFont(currentFont);
        this.spaceWidth = this.measureText(" ").width;
      }

      // setting the line height for the last line
      lineHeights[currentLineNumber] =
        currentLineHeight * LINE_HEIGHT_MULTIPLIER + LINE_HEIGHT_PADDING;
    }

    displayLists.forEach((line, i) => {
      const lineHeightSum = lineHeights
        .slice(0, i + 1)
        .reduce((a, b) => a + b, 0);
      for (const item of line) {
        item.y = lineHeightSum;
      }
    });

    this.totalHeight = cursorY + VSTEP; // Add bottom padding in form of VSTEP
    this.displayList = displayLists.flat();
    return { displayList: this.displayList, totalHeight: this.totalHeight };
  }
}
