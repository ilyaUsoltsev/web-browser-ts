import { Window } from "skia-canvas";
import type { URL } from "./url.ts";
import { Parser } from "./parser.ts";
import type { Element } from "./tokens.ts";
import { WIDTH, HSTEP, VSTEP, HEIGHT, SCROLL_STEP } from "./constants.ts";
import { LayoutClass } from "./layout.ts";
import type { Layout } from "./types.ts";

export class Browser {
  window: Window;
  layout: Layout = { displayList: [], totalHeight: 0 };
  root: Element | undefined;
  scroll = 0;
  scrollbarHeight = 0;
  scrollbarY = 0;
  layoutClass: LayoutClass = new LayoutClass();

  constructor() {
    this.window = new Window(WIDTH, HEIGHT, {
      title: "Browser",
      background: "white",
      fit: "resize",
    });

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
      if (this.root) {
        this.layout = this.layoutClass.calculate(this.root, this.window.width);
      }
      this.draw();
    });
  }

  async load(url: URL): Promise<void> {
    const body = await url.request();
    if (url.skipParsing) {
      // this.layout = layout(body, this.window.width);
    } else {
      const parser = new Parser(body);
      this.root = parser.parse();
      console.log(this.root, "root");
      if (!this.root) {
        throw new Error("Failed to parse HTML");
      }
      parser.printTree(this.root);
      this.layout = this.layoutClass.calculate(this.root, this.window.width);
    }
    this.draw();
  }

  draw(): void {
    const ctx = this.window.ctx;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, this.window.width, this.window.height);
    ctx.fillStyle = "black";

    for (const { x, y, word, font } of this.layout.displayList) {
      if (y > this.scroll + this.window.height) {
        continue;
      }
      if (y + VSTEP < this.scroll) {
        continue;
      }
      ctx.font = font;
      ctx.fillText(word, x, y - this.scroll);
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
