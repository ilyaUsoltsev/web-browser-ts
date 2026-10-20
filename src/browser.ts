// Chapter 2: Drawing to the Screen
// https://browser.engineering/graphics.html

import { Window } from "skia-canvas";
import type { URL } from "./url.ts";
import { Parser } from "./parser.ts";

export const WIDTH = 800;
export const HEIGHT = 600;
export const HSTEP = 13;
export const VSTEP = 18;
export const SCROLL_STEP = 100;

// The book's display list holds (x, y, c) tuples; an object type is the
// idiomatic TypeScript equivalent and reads better at the use site.
export type DisplayItem = { x: number; y: number; c: string };
type Layout = { displayList: DisplayItem[]; totalHeight: number };

export function layout(text: string, windowWidth: number = WIDTH): Layout {
  const displayList: DisplayItem[] = [];
  let cursorX = HSTEP;
  let cursorY = VSTEP;
  for (const c of text) {
    // Handle newline characters by moving the cursor to the next line.
    if (c === "\n") {
      cursorY += VSTEP;
      cursorX = HSTEP;
    } else {
      displayList.push({ x: cursorX, y: cursorY, c });
      cursorX += HSTEP;
      if (cursorX >= windowWidth - HSTEP) {
        cursorY += VSTEP;
        cursorX = HSTEP;
      }
    }
  }
  return { displayList, totalHeight: cursorY };
}

export class Browser {
  window: Window;
  layout: Layout = { displayList: [], totalHeight: 0 };
  scroll = 0;
  parsedBody: string = "";
  scrollbarHeight = 0;
  scrollbarY = 0;

  constructor() {
    // Replaces tkinter.Tk() + tkinter.Canvas(): a skia-canvas Window owns
    // both the OS window and the canvas we draw on.
    this.window = new Window(WIDTH, HEIGHT, {
      title: "Browser",
      background: "white",
      fit: "resize",
    });
    // Replaces self.window.bind("<Down>", self.scrolldown).
    this.window.on("keydown", (e) => {
      if (e.key === "ArrowDown") {
        this.scrolldown();
      } else if (e.key === "ArrowUp") {
        this.scrollup();
      }
    });

    this.window.on("wheel", (e) => {
      if (e.deltaY > 0) {
        this.scrollup(SCROLL_STEP / 10);
      } else if (e.deltaY < 0) {
        this.scrolldown(SCROLL_STEP / 10);
      }
    });

    this.window.on("resize", (e) => {
      this.window.height = e.height;
      this.window.width = e.width;
      this.layout = layout(this.parsedBody, this.window.width);
      this.draw();
    });
  }

  async load(url: URL): Promise<void> {
    const body = await url.request();
    if (url.skipParsing) {
      this.layout = layout(body, this.window.width);
    } else {
      const parser = new Parser(body);
      parser.process();
      this.parsedBody = parser.result;
      this.layout = layout(this.parsedBody, this.window.width);
    }
    this.draw();
  }

  draw(): void {
    // Tk's canvas keeps a list of shapes, so the book calls canvas.delete("all").
    // A 2D canvas is just pixels, so we paint over the old frame instead.
    const ctx = this.window.ctx;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, this.window.width, this.window.height);
    // Tk's create_text centers text on (x, y) by default; match that.
    ctx.fillStyle = "black";
    ctx.font = "14px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (const { x, y, c } of this.layout.displayList) {
      if (y > this.scroll + this.window.height) {
        continue;
      }
      if (y + VSTEP < this.scroll) {
        continue;
      }
      ctx.fillText(c, x, y - this.scroll);
    }

    // Add scrollbar
    ctx.fillStyle = "gray";
    this.scrollbarHeight =
      (this.window.height * this.window.height) / this.layout.totalHeight;
    this.scrollbarY =
      (this.scroll * this.window.height) / this.layout.totalHeight;

    if (this.scrollbarHeight >= this.window.height) {
      return;
    }

    ctx.fillRect(
      this.window.width - HSTEP / 2,
      this.scrollbarY,
      this.window.width,
      this.scrollbarHeight,
    );
  }

  scrolldown(step = SCROLL_STEP): void {
    if (this.scrollbarY + this.scrollbarHeight >= this.window.height) {
      return;
    }
    this.scroll += step;
    this.draw();
  }

  scrollup(step = SCROLL_STEP): void {
    this.scroll -= step;
    if (this.scroll < 0) {
      this.scroll = 0;
    }
    this.draw();
  }
}
