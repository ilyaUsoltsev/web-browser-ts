import type { Layout, DisplayItem } from "./types.ts";
import { WIDTH, HSTEP, VSTEP, FONT } from "./constants.ts";
import { type Token, Text } from "./tokens.ts";
import { Canvas, CanvasRenderingContext2D } from "skia-canvas";

export class LayoutClass {
  displayList: DisplayItem[] = [];
  totalHeight: number = 0;
  spaceWidth: number;
  measureCtx: CanvasRenderingContext2D;

  constructor() {
    this.measureCtx = new Canvas(1, 1).getContext("2d");
    this.measureCtx.font = FONT;
    this.spaceWidth = this.measureText(" ");
  }

  measureText(text: string): number {
    return this.measureCtx.measureText(text).width;
  }

  calculate(tokens: Token[], windowWidth: number = WIDTH): Layout {
    let cursorX = HSTEP;
    let cursorY = VSTEP;
    this.displayList = [];
    for (const token of tokens) {
      if (token instanceof Text) {
        for (const word of token.text.split(/\s+/)) {
          const wordWidth = this.measureText(word);

          // Handle newline characters by moving the cursor to the next line.
          if (word === "\n") {
            cursorY += VSTEP;
            cursorX = HSTEP;
          } else {
            if (cursorX >= windowWidth - HSTEP) {
              cursorY += VSTEP;
              cursorX = HSTEP;
            }
            this.displayList.push({ x: cursorX, y: cursorY, word });
            cursorX += wordWidth + this.spaceWidth;
          }
        }
      }
    }

    this.totalHeight = cursorY + VSTEP;
    return { displayList: this.displayList, totalHeight: this.totalHeight };
  }
}
