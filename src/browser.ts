import { Window } from "skia-canvas";
import type { URL } from "./url.ts";
import { Parser } from "./parser.ts";
import type { Element } from "./tokens.ts";
import { WIDTH, HSTEP, VSTEP, HEIGHT, SCROLL_STEP } from "./constants.ts";
import { DocumentLayout, paintTree } from "./layout.ts";
import type { DrawCommand } from "./types.ts";

export class Browser {
  window: Window;
  displayList: DrawCommand[] = [];
  totalHeight = 0;
  document: DocumentLayout | undefined;
  scroll = 0;
  scrollbarHeight = 0;
  scrollbarY = 0;

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
      this.layout();
      this.draw();
    });
  }

  async load(url: URL): Promise<void> {
    const body = await url.request();
    if (url.skipParsing) {
      // this.layout = layout(body, this.window.width);
    } else {
      const parser = new Parser(body);
      const root: Element | undefined = parser.parse();
      if (!root) {
        throw new Error("Failed to parse HTML");
      }
      parser.printTree(root);
      this.document = new DocumentLayout(root);
      this.layout();
    }
    this.draw();
  }

  layout(): void {
    if (!this.document) {
      return;
    }
    this.document.layout(this.window.width);
    this.displayList = [];
    paintTree(this.document, this.displayList);
    this.totalHeight = this.document.height + 2 * VSTEP;
  }

  draw(): void {
    const ctx = this.window.ctx;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, this.window.width, this.window.height);

    for (const cmd of this.displayList) {
      if (cmd.top > this.scroll + this.window.height) {
        continue;
      }
      if (cmd.bottom < this.scroll) {
        continue;
      }
      cmd.execute(this.scroll, ctx);
    }

    // Add scrollbar
    ctx.fillStyle = "gray";
    this.scrollbarHeight =
      (this.window.height * this.window.height) / this.totalHeight;
    this.scrollbarY =
      (this.scroll * this.window.height) / this.totalHeight;

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
