import { Rect } from "./rect.ts";
import type { Align, DrawCommand, FontStyle, FontWeight } from "./types.ts";
import {
  WIDTH,
  HSTEP,
  VSTEP,
  BLOCK_ELEMENTS,
  DEFAULT_FONT_SIZE,
  LINE_HEIGHT_PADDING,
  LINE_HEIGHT_MULTIPLIER,
  INPUT_WIDTH_PX,
} from "./constants.ts";
import { type Token, Text, Element } from "./tokens.ts";
import { type Font, getFont } from "./fonts.ts";
import { Blend, DrawLine, DrawRect, DrawRRect, DrawText, Opacity } from "./draw.ts";

function background(node: Token, rect: Rect, color: string): DrawRect {
  const radius = Math.max(0, parseFloat(node.style["border-radius"] ?? "0") || 0);
  return radius > 0 ? new DrawRRect(rect, color, radius) : new DrawRect(rect, color);
}

/** Font for a node's computed style. Needed both when wrapping words (BlockLayout)
 *  and when positioning them (TextLayout/InputLayout), so it lives in one place. */
export function fontFor(node: Token): Font {
  const weight = node.style["font-weight"] as FontWeight;
  const style = node.style["font-style"] as FontStyle;
  const size = parseFloat(node.style["font-size"] ?? `${DEFAULT_FONT_SIZE}px`);
  return getFont(size, weight, style);
}

export type LayoutObject = DocumentLayout | BlockLayout | LineLayout | TextLayout | InputLayout;

export class DocumentLayout {
  node: Token;
  parent = null;
  children: BlockLayout[] = [];
  x = 0;
  y = 0;
  width = 0;
  height = 0;

  constructor(node: Token) {
    this.node = node;
  }

  layout(windowWidth: number = WIDTH): void {
    this.children = [];
    const child = new BlockLayout(this.node, this, null);
    this.children.push(child);
    this.width = windowWidth - 2 * HSTEP;
    this.x = HSTEP;
    this.y = VSTEP;
    child.layout();
    this.height = child.height;
  }

  paint(): DrawCommand[] {
    return [];
  }

  // Not an element box (or anonymous): no visual effects of its own.
  paintEffects(cmds: DrawCommand[]): DrawCommand[] {
    return cmds;
  }

  shouldPaint(): boolean {
    return this.children.length > 0;
  }
}

export class BlockLayout {
  node: Token;
  parent: LayoutObject;
  previous: BlockLayout | null;
  children: (BlockLayout | LineLayout)[] = [];
  x = 0;
  y = 0;
  width = 0;
  height = 0;

  cursorX = 0;

  constructor(node: Token, parent: LayoutObject, previous: BlockLayout | null) {
    this.node = node;
    this.parent = parent;
    this.previous = previous;
  }

  layoutMode(): "inline" | "block" {
    if (this.node instanceof Text) {
      return "inline";
    } else if (
      this.node.name === "input" ||
      this.node.name === "button" ||
      this.node.name === "br"
    ) {
      return "inline";
    } else if (
      this.node.children.some(
        (child) => child instanceof Element && BLOCK_ELEMENTS.includes(child.name),
      )
    ) {
      return "block";
    } else if (this.node.children.length) {
      return "inline";
    } else {
      return "block";
    }
  }

  layout(): void {
    this.x = this.parent.x;
    this.width = this.parent.width;
    this.y = this.previous ? this.previous.y + this.previous.height : this.parent.y;

    const mode = this.layoutMode();
    if (mode === "block") {
      let previous: BlockLayout | null = null;
      for (const child of this.node.children) {
        if (child instanceof Element && child.name === "head") {
          continue;
        }
        const next: BlockLayout = new BlockLayout(child, this, previous);
        this.children.push(next);
        previous = next;
      }
    } else {
      this.newLine(); // Add a new lineLayout before starting inline layout
      this.recurse(this.node);
    }

    for (const child of this.children) {
      child.layout();
    }

    this.height = this.children.reduce((sum, child) => sum + child.height, 0);
  }

  recurse(node: Token): void {
    if (node instanceof Element && node.name === "head") {
      return;
    }
    if (node instanceof Text) {
      for (const word of node.text.split(/\s+/)) {
        if (word) {
          this.word(word, node);
        }
      }
    } else {
      if (node.name === "br") {
        this.newLine();
      } else if (node.name === "input" || node.name === "button") {
        this.input(node);
      } else {
        for (const child of node.children) {
          this.recurse(child);
        }
      }
    }
  }

  input(node: Element): void {
    if (node.attributes.type === "hidden") {
      return;
    }
    const w = INPUT_WIDTH_PX;
    if (this.cursorX + w > this.width) {
      this.newLine();
    }
    const line = this.children[this.children.length - 1] as LineLayout;
    const previousWord = line.children[line.children.length - 1] ?? null;
    line.children.push(new InputLayout(node, line, previousWord));
    this.cursorX += w + fontFor(node).measure(" ");
  }

  word(word: string, node: Text): void {
    // Measure first (font comes from style, not from the not-yet-laid-out TextLayout),
    // then wrap, and only then pick the line to append to.
    const font = fontFor(node);
    const w = font.measure(word);
    if (this.cursorX + w > this.width) {
      this.newLine();
    }
    const line = this.children[this.children.length - 1] as LineLayout;
    const previousWord = line.children[line.children.length - 1] ?? null;
    line.children.push(new TextLayout(node, word, line, previousWord));
    this.cursorX += w + font.measure(" ");
  }

  newLine(): void {
    this.cursorX = 0;
    const lastLine = (this.children[this.children.length - 1] as LineLayout | undefined) ?? null;
    const newLine = new LineLayout(this.node, this, lastLine);
    this.children.push(newLine);
  }

  selfRect(): Rect {
    return new Rect(this.x, this.y, this.x + this.width, this.y + this.height);
  }

  paint(): DrawCommand[] {
    const cmds: DrawCommand[] = [];
    const bgcolor =
      this.node instanceof Element
        ? (this.node.style["background-color"] ?? "transparent")
        : "transparent";
    if (bgcolor !== "transparent") {
      cmds.push(background(this.node, this.selfRect(), bgcolor));
    }
    return cmds;
  }

  paintEffects(cmds: DrawCommand[]): DrawCommand[] {
    return paintVisualEffects(this.node, cmds, this.selfRect());
  }

  shouldPaint() {
    return this.node instanceof Text || (this.node.name != "input" && this.node.name != "button");
  }
}

// Paints the object's subtree, wrapped in the object's visual effects, onto
// the end of `displayList`.
export function paintTree(layoutObject: LayoutObject, displayList: DrawCommand[]): void {
  const cmds = paintSubtree(layoutObject);
  // Effects wrap the finished subtree, so they apply to the children too, not
  // just this object's own background.
  displayList.push(...(layoutObject.shouldPaint() ? layoutObject.paintEffects(cmds) : cmds));
}

// The object's own commands followed by all its descendants', in paint order.
function paintSubtree(layoutObject: LayoutObject): DrawCommand[] {
  const cmds = layoutObject.shouldPaint() ? layoutObject.paint() : [];
  for (const child of layoutObject.children) {
    paintTree(child, cmds);
  }
  return cmds;
}

// Wraps an element's painted subtree in its visual effects. Shared by every
// layout object that paints an element box.
export function paintVisualEffects(node: Token, cmds: DrawCommand[], rect: Rect): DrawCommand[] {
  const parsed = parseFloat(node.style["opacity"] ?? "1");
  const opacity = Number.isNaN(parsed) ? 1 : Math.min(1, Math.max(0, parsed));
  const clip = node.style["overflow"] === "clip";
  if (clip) {
    const radius = Math.max(0, parseFloat(node.style["border-radius"] ?? "0") || 0);
    cmds = [...cmds, new Blend("destination-in", [new DrawRRect(rect, "white", radius)])];
  }
  // Even at full opacity, isolate the mask so it only erases this subtree.
  return [new Blend(node.style["mix-blend-mode"], [new Opacity(opacity, cmds, clip)])];
}

export class TextLayout {
  children: never[] = [];
  x = 0;
  y = 0;
  width = 0;
  height = 0;
  font!: Font; // set in layout() from the computed style

  constructor(
    public node: Token,
    public word: string,
    public parent: LineLayout,
    public previous: TextLayout | InputLayout | null,
  ) {}

  layout(): void {
    this.font = fontFor(this.node);
    this.width = this.font.measure(this.word);

    if (this.previous) {
      const space = this.previous.font.measure(" ");
      this.x = this.previous.x + this.previous.width + space;
    } else {
      this.x = this.parent.x;
    }
    this.height = this.font.linespace;
  }

  paint(): DrawCommand[] {
    const color = this.node.style["color"] ?? "black";
    return [new DrawText(this.x, this.y, this.word, this.font, color)];
  }

  // Not an element box (or anonymous): no visual effects of its own.
  paintEffects(cmds: DrawCommand[]): DrawCommand[] {
    return cmds;
  }

  shouldPaint(): boolean {
    return true;
  }
}

export class LineLayout {
  children: (TextLayout | InputLayout)[] = [];
  x = 0;
  y = 0;
  width = 0;
  height = 0;

  constructor(
    public node: Token,
    public parent: BlockLayout,
    public previous: LineLayout | null,
  ) {}

  layout(): void {
    this.width = this.parent.width;
    this.x = this.parent.x;
    if (this.previous) {
      this.y = this.previous.y + this.previous.height;
    } else {
      this.y = this.parent.y;
    }

    for (const textLayout of this.children) {
      textLayout.layout();
    }

    // An empty line (e.g. a leading <br>) takes up no space.
    if (!this.children.length) {
      this.height = 0;
      return;
    }

    // text-align belongs to the block container, so the whole line shares it.
    const align = this.node.style["text-align"] as Align;
    if (align === "center" || align === "right") {
      const last = this.children[this.children.length - 1]!;
      const lineWidth = last.x + last.width - this.x;
      const shift = align === "center" ? (this.width - lineWidth) / 2 : this.width - lineWidth;
      for (const textLayout of this.children) {
        textLayout.x += shift;
      }
    }

    const maxAscent = Math.max(...this.children.map((word) => word.font.ascent));
    const baseline = this.y + LINE_HEIGHT_MULTIPLIER * maxAscent;
    for (const word of this.children) {
      word.y = baseline - word.font.ascent;
    }
    const maxDescent = Math.max(...this.children.map((word) => word.font.descent));
    this.height = LINE_HEIGHT_MULTIPLIER * (maxAscent + maxDescent) + LINE_HEIGHT_PADDING;
  }

  paint(): DrawCommand[] {
    return [];
  }

  // Not an element box (or anonymous): no visual effects of its own.
  paintEffects(cmds: DrawCommand[]): DrawCommand[] {
    return cmds;
  }

  shouldPaint(): boolean {
    return this.children.length > 0;
  }
}

export class InputLayout {
  children: never[] = [];
  x = 0;
  y = 0; // set by LineLayout (baseline alignment)
  width = 0;
  height = 0;
  font!: Font;

  constructor(
    public node: Element,
    public parent: LineLayout,
    public previous: TextLayout | InputLayout | null,
  ) {}

  // Positioned like a word on the line, just with a fixed width.
  layout(): void {
    this.font = fontFor(this.node);
    this.width = INPUT_WIDTH_PX;
    if (this.previous) {
      const space = this.previous.font.measure(" ");
      this.x = this.previous.x + this.previous.width + space;
    } else {
      this.x = this.parent.x;
    }
    this.height = this.font.linespace;
  }

  selfRect(): Rect {
    return new Rect(this.x, this.y, this.x + this.width, this.y + this.height);
  }

  paint(): DrawCommand[] {
    const cmds: DrawCommand[] = [];
    const bgColor = this.node.style["background-color"] ?? "transparent";
    if (bgColor !== "transparent") {
      cmds.push(background(this.node, this.selfRect(), bgColor));
    }
    let text = "";
    if (this.node.name === "input") {
      text = this.node.attributes["value"] ?? "";
    } else if (this.node.name === "button") {
      if (this.node.children.length === 1 && this.node.children[0] instanceof Text) {
        text = this.node.children[0].text;
      } else {
        console.log("Ignoring non-text content inside button");
      }
    }
    const color = this.node.style["color"] ?? "black";
    if (this.node.attributes.type === "password") {
      text = "*".repeat(text.length);
    }
    cmds.push(new DrawText(this.x, this.y, text, this.font, color));
    if (this.node.isFocused) {
      const cx = this.x + this.font.measure(text);
      cmds.push(new DrawLine(cx, this.y, cx, this.y + this.height, "black", 1));
    }
    return cmds;
  }

  paintEffects(cmds: DrawCommand[]): DrawCommand[] {
    return paintVisualEffects(this.node, cmds, this.selfRect());
  }

  shouldPaint(): boolean {
    return true;
  }
}
