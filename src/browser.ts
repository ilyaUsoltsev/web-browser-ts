import { Window } from "skia-canvas";
import type { URL } from "./url.ts";
import { treeToList } from "./utils.ts";
import { CSSParser, DEFAULT_STYLE_SHEET, style } from "./css-parser.ts";
import { Parser } from "./parser.ts";
import { Element } from "./tokens.ts";
import { WIDTH, HSTEP, VSTEP, HEIGHT, SCROLL_STEP } from "./constants.ts";
import { DocumentLayout, paintTree } from "./layout.ts";
import type { DrawCommand } from "./types.ts";
import fs from "fs";
import { cascadePriority } from "./utils.ts";

export class Browser {
  window!: Window;
  displayList: DrawCommand[] = [];
  totalHeight = 0;
  document: DocumentLayout | undefined;
  scroll = 0;
  scrollbarHeight = 0;
  scrollbarY = 0;

  // The window is created only once there is something to draw. skia-canvas
  // sends canvas contents to the screen only during its event dispatch, so
  // anything drawn after an `await` (while the window sits idle) would not
  // show up until the next UI event, such as a mouse hover. Creating the
  // window and drawing in the same tick means the first frame already has the
  // page in it.
  private openWindow(): void {
    if (this.window) {
      return;
    }
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
    this.openWindow();
    if (url.skipParsing) {
      // this.layout = layout(body, this.window.width);
    } else {
      const parser = new Parser(body);
      const root: Element | undefined = parser.parse();

      if (!root) {
        throw new Error("Failed to parse HTML");
      }

      // read all css links
      const links = treeToList(root, []).flatMap((child) =>
        child instanceof Element &&
        child.name === "link" &&
        child.attributes.rel === "stylesheet" &&
        Boolean(child.attributes.href)
          ? [child.attributes.href]
          : [],
      ) as string[];

      const rules = [...DEFAULT_STYLE_SHEET];

      for (const link of links) {
        const linkUrl = url.resolve(link);
        const cssFile = fs.readFileSync(linkUrl.path, "utf-8");
        const linkRules = new CSSParser(cssFile).parse();
        rules.push(...linkRules);
      }

      style(
        root,
        rules.sort((a, b) => cascadePriority(a) - cascadePriority(b)),
      );

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
    this.scrollbarHeight = (this.window.height * this.window.height) / this.totalHeight;
    this.scrollbarY = (this.scroll * this.window.height) / this.totalHeight;

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
