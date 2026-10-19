// Chapter 2: Drawing to the Screen
// https://browser.engineering/graphics.html

import { Window } from "skia-canvas";
import type { URL } from "./url.ts";

export const WIDTH = 800;
export const HEIGHT = 600;
export const HSTEP = 13;
export const VSTEP = 18;
export const SCROLL_STEP = 100;

// The book's display list holds (x, y, c) tuples; an object type is the
// idiomatic TypeScript equivalent and reads better at the use site.
export type DisplayItem = { x: number; y: number; c: string };

// Chapter 1's show(), changed to return the text instead of printing it.
export function lex(body: string): string {
  let text = "";
  let inTag = false;
  for (const c of body) {
    if (c === "<") {
      inTag = true;
    } else if (c === ">") {
      inTag = false;
    } else if (!inTag) {
      text += c;
    }
  }
  return text;
}

export function layout(text: string): DisplayItem[] {
  const displayList: DisplayItem[] = [];
  let cursorX = HSTEP;
  let cursorY = VSTEP;
  for (const c of text) {
    displayList.push({ x: cursorX, y: cursorY, c });
    cursorX += HSTEP;
    if (cursorX >= WIDTH - HSTEP) {
      cursorY += VSTEP;
      cursorX = HSTEP;
    }
  }
  return displayList;
}

export class Browser {
  window: Window;
  displayList: DisplayItem[] = [];
  scroll = 0;

  constructor() {
    // Replaces tkinter.Tk() + tkinter.Canvas(): a skia-canvas Window owns
    // both the OS window and the canvas we draw on.
    this.window = new Window(WIDTH, HEIGHT, {
      title: "Browser",
      background: "white",
    });
    // Replaces self.window.bind("<Down>", self.scrolldown).
    this.window.on("keydown", (e) => {
      if (e.key === "ArrowDown") this.scrolldown();
    });
  }

  async load(url: URL): Promise<void> {
    const body = await url.request();
    const text = lex(body);
    this.displayList = layout(text);
    this.draw();
  }

  draw(): void {
    // Tk's canvas keeps a list of shapes, so the book calls canvas.delete("all").
    // A 2D canvas is just pixels, so we paint over the old frame instead.
    const ctx = this.window.ctx;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Tk's create_text centers text on (x, y) by default; match that.
    ctx.fillStyle = "black";
    ctx.font = "14px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (const { x, y, c } of this.displayList) {
      if (y > this.scroll + HEIGHT) continue;
      if (y + VSTEP < this.scroll) continue;
      ctx.fillText(c, x, y - this.scroll);
    }
  }

  scrolldown(): void {
    this.scroll += SCROLL_STEP;
    this.draw();
  }
}
