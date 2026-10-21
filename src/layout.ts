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
      // font metrics, not glyph ink: every word in the same font gets the same height
      heigth: Math.round(
        metrics.fontBoundingBoxAscent + metrics.fontBoundingBoxDescent,
      ),
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
    let currentWordHeight = VSTEP;
    let lineHeights: number[] = [];
    const displayLists: DisplayItem[][] = [];

    for (const token of tokens) {
      const moveToNewLine = () => {
        lineHeights[currentLineNumber] =
          currentWordHeight * LINE_HEIGHT_MULTIPLIER + LINE_HEIGHT_PADDING;
        cursorY += lineHeights[currentLineNumber]!;
        cursorX = HSTEP;
        currentLineNumber++;
        currentWordHeight = VSTEP;
      };
      if (token instanceof Text) {
        for (const word of token.text.split(/\s+/)) {
          const { width: wordWidth, heigth: wordHeight } =
            this.measureText(word);

          if (cursorX + wordWidth >= windowWidth - HSTEP) {
            moveToNewLine();
          }
          // after the wrap check, so a wrapped word only affects its own line
          currentWordHeight = Math.max(currentWordHeight, wordHeight);

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
        } else if (token.name === "br" || token.name === "br /") {
          moveToNewLine();
        }
        this.measureCtx.font = this.getFont(currentFont);
        this.spaceWidth = this.measureText(" ").width;
      }

      // setting the line height for the last line
      lineHeights[currentLineNumber] =
        currentWordHeight * LINE_HEIGHT_MULTIPLIER + LINE_HEIGHT_PADDING;
    }

    displayLists.forEach((line, i) => {
      const lineHeightSum = lineHeights
        .slice(0, i + 1)
        .reduce((a, b) => a + b, 0);
      for (const item of line) {
        item.y = lineHeightSum;
      }
    });
    console.log(lineHeights, "line heights after layout calculation");
    this.totalHeight = cursorY + VSTEP; // Add bottom padding in form of VSTEP
    this.displayList = displayLists.flat();
    return { displayList: this.displayList, totalHeight: this.totalHeight };
  }
}
