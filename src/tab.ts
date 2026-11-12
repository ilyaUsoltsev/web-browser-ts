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
import type { DrawCommand, Rule } from "./types.ts";
import { cascadePriority } from "./utils.ts";
import { JSContext } from "./jscontext.ts";

export class Tab {
  displayList: DrawCommand[] = [];
  totalHeight = 0;
  document!: DocumentLayout;
  scroll = 0;
  scrollbarHeight = 0;
  scrollbarY = 0;
  url!: URL;
  history: URL[] = [];
  rootElement: Element | null = null;
  rules: Rule[] = [];
  // The text entry (if any) that receives key presses sent to this tab.
  focus: Element | null = null;
  // The current page's JS environment; a new page gets a fresh one.
  js: JSContext | null = null;

  constructor(
    public width = WIDTH,
    public height = HEIGHT,
  ) {}

  async click(x: number, y: number): Promise<void> {
    if (!this.document) {
      return;
    }
    // Clicking anywhere unfocuses the current text entry, lest it keep drawing its cursor.
    this.blur();
    y += this.scroll;
    const objects = treeToList<LayoutObject>(this.document, []).filter(
      (obj) => x >= obj.x && x <= obj.x + obj.width && y >= obj.y && y <= obj.y + obj.height,
    );

    let clickedEl: Token | undefined | null = objects[objects.length - 1]?.node;
    while (clickedEl) {
      if (clickedEl instanceof Text) {
        clickedEl = clickedEl.parent;
        continue;
      } else if (clickedEl.name === "a" && clickedEl.attributes.href) {
        const url = this.url.resolve(clickedEl.attributes.href);
        await this.load(url);
        return;
      } else if (clickedEl.name === "input") {
        clickedEl.attributes["value"] = "";
        this.focus = clickedEl;
        clickedEl.isFocused = true;
        this.render();
        return;
      } else if (
        clickedEl.name === "button" &&
        // A <button> with no type is a submit button, as in real browsers.
        (clickedEl.attributes.type ?? "submit") === "submit"
      ) {
        let ancestor: Token | null = clickedEl;
        while (ancestor instanceof Element) {
          if (ancestor.name === "form" && ancestor.attributes.action) {
            await this.submitForm(ancestor);
            return;
          }
          ancestor = ancestor.parent;
        }
        // A button outside a submittable form does nothing.
        return;
      }

      clickedEl = clickedEl.parent;
    }
  }

  async submitForm(element: Element) {
    const inputs = treeToList(element, []).filter(
      (child) =>
        child instanceof Element && child.name === "input" && Boolean(child.attributes.name),
    ) as Element[];
    let body = "";
    for (const input of inputs) {
      const name = input.attributes.name!;
      const value = input.attributes.value ?? "";
      body += encodeURIComponent(name) + "=" + encodeURIComponent(value) + "&";
    }
    body = body.slice(0, -1); // Remove the trailing '&'
    // A form without an action submits to the page it's on, like real browsers.
    const action = element.attributes.action;
    const actionUrl = action ? this.url.resolve(action) : this.url;

    await this.load(actionUrl, {
      method: "POST",
      body,
    });
  }

  blur(): void {
    if (this.focus) {
      this.focus.isFocused = false;
      this.focus = null;
      // Repaint without the cursor.
      this.render();
    }
  }

  backspace(): void {
    if (this.focus) {
      const value = this.focus.attributes["value"] ?? "";
      this.focus.attributes["value"] = value.slice(0, -1);
      this.render();
    }
  }

  keypress(char: string): void {
    if (this.focus) {
      this.focus.attributes["value"] = (this.focus.attributes["value"] ?? "") + char;
      this.render();
    }
  }

  async goBack(): Promise<void> {
    if (this.history.length <= 1) {
      return;
    }
    this.history.pop();
    const url = this.history.pop()!;
    await this.load(url);
  }

  async load(url: URL, options?: { method?: string; body?: string }): Promise<void> {
    this.js = new JSContext(this);
    this.history.push(url);
    this.url = url;
    this.scroll = 0;
    this.focus = null;
    const body = await url.request(options);
    if (url.skipParsing) {
      // this.layout = layout(body, this.width);
    } else {
      const parser = new Parser(body);
      const root: Element | undefined = parser.parse();

      if (!root) {
        throw new Error("Failed to parse HTML");
      }
      // Set before scripts run: their DOM calls (querySelectorAll) read this
      // tree, which would otherwise still be the previous page's.
      this.rootElement = root;

      // Walk the tree once; scripts and stylesheets are both picked from it.
      const nodes = treeToList(root, []);

      // Run the page's scripts before styling and layout. Inline scripts
      // (<script>code</script>) aren't supported, only <script src=...>.
      const scripts = nodes.flatMap((child) =>
        child instanceof Element && child.name === "script" && child.attributes.src
          ? [child.attributes.src]
          : [],
      );

      for (const script of scripts) {
        const scriptUrl = url.resolve(script);
        let code: string;
        try {
          code = await scriptUrl.request();
        } catch {
          // Like a missing stylesheet, a missing script shouldn't stop the page.
          continue;
        }
        console.log("Script returned: ", this.js.run(script, code));
      }

      // read all css links
      const links = nodes.flatMap((child) =>
        child instanceof Element &&
        child.name === "link" &&
        child.attributes.rel === "stylesheet" &&
        child.attributes.href
          ? [child.attributes.href]
          : [],
      );

      const rules = [...DEFAULT_STYLE_SHEET];

      for (const link of links) {
        const linkUrl = url.resolve(link);
        try {
          const cssFile = await linkUrl.request();
          rules.push(...new CSSParser(cssFile).parse());
        } catch {
          // An unavailable stylesheet should not prevent the page from loading.
        }
      }

      // Style sheets are downloaded once per load, not on every render.
      this.rules = rules.sort((a, b) => cascadePriority(a) - cascadePriority(b));
      this.render();
    }
  }

  // Style, layout and paint: rerun whenever the page's HTML tree changes.
  render(): void {
    if (!this.rootElement) {
      return;
    }
    style(this.rootElement, this.rules);
    this.document = new DocumentLayout(this.rootElement);
    this.layout();
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

  draw(ctx: CanvasRenderingContext2D, offset = 0): void {
    if (this.height <= 0) {
      return;
    }
    for (const cmd of this.displayList) {
      if (cmd.rect.top > this.scroll + this.height) {
        continue;
      }
      if (cmd.rect.bottom < this.scroll) {
        continue;
      }
      cmd.execute(this.scroll - offset, ctx);
    }

    // Add scrollbar
    ctx.fillStyle = "gray";
    if (this.totalHeight <= this.height) {
      return;
    }
    this.scrollbarHeight = (this.height * this.height) / this.totalHeight;
    this.scrollbarY = (this.scroll * this.height) / this.totalHeight;

    if (this.scrollbarHeight >= this.height) {
      return;
    }

    ctx.fillRect(this.width - HSTEP / 2, this.scrollbarY + offset, HSTEP / 2, this.scrollbarHeight);
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
