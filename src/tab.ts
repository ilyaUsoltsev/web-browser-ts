import type { CanvasRenderingContext2D } from "skia-canvas";
import type { LayoutObject } from "./layout.ts";
import type { URL } from "./url.ts";
import { treeToList } from "./utils.ts";
import { CSSParser, DEFAULT_STYLE_SHEET, style } from "./css-parser.ts";
import { Parser } from "./parser.ts";
import { Element, type Token } from "./tokens.ts";
import { WIDTH, HSTEP, VSTEP, HEIGHT, SCROLL_STEP } from "./constants.ts";
import { DocumentLayout, paintTree } from "./layout.ts";
import { Text } from "./tokens.ts";
import type { DrawCommand } from "./types.ts";
import fs from "fs";
import { cascadePriority } from "./utils.ts";

export class Tab {
  displayList: DrawCommand[] = [];
  totalHeight = 0;
  document!: DocumentLayout;
  scroll = 0;
  scrollbarHeight = 0;
  scrollbarY = 0;
  url!: URL;

  constructor(
    public width = WIDTH,
    public height = HEIGHT,
  ) {}

  async click(x: number, y: number): Promise<void> {
    if (!this.document) return;
    // Handle click events here
    y += this.scroll;
    const objects = treeToList<LayoutObject>(this.document, []).filter(
      (obj) => x >= obj.x && x <= obj.x + obj.width && y >= obj.y && y <= obj.y + obj.height,
    );
    if (objects.length === 0) {
      return;
    }

    let clickedEl: Token | undefined | null = objects[objects.length - 1]?.node;
    while (clickedEl) {
      if (clickedEl instanceof Text) {
        clickedEl = clickedEl.parent;
        continue;
      } else if (
        clickedEl instanceof Element &&
        clickedEl.name === "a" &&
        clickedEl.attributes.href
      ) {
        const url = this.url.resolve(clickedEl.attributes.href);
        await this.load(url);
        return;
      }
      clickedEl = clickedEl.parent;
    }
  }

  async load(url: URL): Promise<void> {
    this.url = url;
    this.scroll = 0;
    const body = await url.request();
    if (url.skipParsing) {
      // this.layout = layout(body, this.width);
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
  }

  layout(): void {
    if (!this.document) {
      return;
    }
    this.document.layout(this.width);
    this.displayList = [];
    paintTree(this.document, this.displayList);
    this.totalHeight = this.document.height + 2 * VSTEP;
    this.scroll = Math.min(this.scroll, Math.max(0, this.totalHeight - this.height));
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const cmd of this.displayList) {
      if (cmd.top > this.scroll + this.height) {
        continue;
      }
      if (cmd.bottom < this.scroll) {
        continue;
      }
      cmd.execute(this.scroll, ctx);
    }

    // Add scrollbar
    ctx.fillStyle = "gray";
    this.scrollbarHeight = (this.height * this.height) / this.totalHeight;
    this.scrollbarY = (this.scroll * this.height) / this.totalHeight;

    if (this.scrollbarHeight >= this.height) {
      return;
    }

    ctx.fillRect(this.width - HSTEP / 2, this.scrollbarY, this.width, this.scrollbarHeight);
  }

  scrolldown(step = SCROLL_STEP): void {
    this.scroll = Math.min(this.scroll + step, Math.max(0, this.totalHeight - this.height));
  }

  scrollup(step = SCROLL_STEP): void {
    this.scroll -= step;
    if (this.scroll < 0) {
      this.scroll = 0;
    }
  }
}
