import type { Align, DrawCommand, FontStyle, FontWeight } from "./types.ts";
import {
  WIDTH,
  HSTEP,
  VSTEP,
  BLOCK_ELEMENTS,
  DEFAULT_FONT_SIZE,
  LINE_HEIGHT_PADDING,
  LINE_HEIGHT_MULTIPLIER,
} from "./constants.ts";
import { type Token, Text, Element } from "./tokens.ts";
import { type Font, getFont } from "./fonts.ts";
import { DrawRect, DrawText } from "./draw.ts";

type LayoutObject = DocumentLayout | BlockLayout;

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
}

type LineItem = { x: number; word: string; font: Font; align: Align; color: string };
type DisplayItem = { x: number; y: number; word: string; font: Font; color: string };

export class BlockLayout {
  node: Token;
  parent: LayoutObject;
  previous: BlockLayout | null;
  children: BlockLayout[] = [];
  x = 0;
  y = 0;
  width = 0;
  height = 0;

  displayList: DisplayItem[] = [];
  line: LineItem[] = [];
  cursorX = 0;
  cursorY = 0;
  weight: FontWeight = "normal";
  fontStyle: FontStyle = "roman";
  size = DEFAULT_FONT_SIZE;
  align: Align = "left";

  constructor(node: Token, parent: LayoutObject, previous: BlockLayout | null) {
    this.node = node;
    this.parent = parent;
    this.previous = previous;
  }

  layoutMode(): "inline" | "block" {
    if (this.node instanceof Text) {
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
      this.cursorX = 0;
      this.cursorY = 0;
      this.weight = "normal";
      this.fontStyle = "roman";
      this.size = DEFAULT_FONT_SIZE;
      this.align = "left";
      this.line = [];
      this.recurse(this.node);
      this.flush();
    }

    for (const child of this.children) {
      child.layout();
    }

    this.height =
      mode === "block" ? this.children.reduce((sum, child) => sum + child.height, 0) : this.cursorY;
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
        this.flush();
      }
      for (const child of node.children) {
        this.recurse(child);
      }
    }
  }

  // Flush the current line to the display list and reset cursor positions.
  flush(): void {
    if (!this.line.length) {
      return;
    }
    const last = this.line[this.line.length - 1]!;
    const lineWidth = last.x + last.font.measure(last.word);

    const maxAscent = Math.max(...this.line.map(({ font }) => font.ascent));
    const baseline = this.cursorY + LINE_HEIGHT_MULTIPLIER * maxAscent;
    for (const { x: relX, word, font, align, color } of this.line) {
      let x = this.x + relX;
      if (align === "center") {
        x += (this.width - lineWidth) / 2;
      } else if (align === "right") {
        x += this.width - lineWidth;
      }
      const y = this.y + baseline - font.ascent;
      this.displayList.push({ x, y, word, font, color });
    }

    const maxDescent = Math.max(...this.line.map(({ font }) => font.descent));
    this.cursorY = baseline + LINE_HEIGHT_MULTIPLIER * maxDescent + LINE_HEIGHT_PADDING;
    this.cursorX = 0;
    this.line = [];
  }

  word(word: string, node: Token): void {
    const fontWeight = node.style["font-weight"] as FontWeight;
    const fontStyle = node.style["font-style"] as FontStyle;
    const color = node.style["color"] as string;
    const size = parseFloat(node.style["font-size"] ?? `${DEFAULT_FONT_SIZE}px`);
    const font = getFont(size, fontWeight, fontStyle);
    const w = font.measure(word);
    if (this.cursorX + w > this.width) {
      this.flush();
    }
    this.line.push({ x: this.cursorX, word, font, align: this.align, color });
    this.cursorX += w + font.measure(" ");
  }

  paint(): DrawCommand[] {
    const cmds: DrawCommand[] = [];
    const bgcolor =
      this.node instanceof Element
        ? (this.node.style["background-color"] ?? "transparent")
        : "transparent";
    if (bgcolor !== "transparent") {
      const x2 = this.x + this.width;
      const y2 = this.y + this.height;
      cmds.push(new DrawRect(this.x, this.y, x2, y2, bgcolor));
    }
    if (this.layoutMode() === "inline") {
      for (const { x, y, word, font, color } of this.displayList) {
        cmds.push(new DrawText(x, y, word, font, color));
      }
    }
    return cmds;
  }
}

export function paintTree(layoutObject: LayoutObject, displayList: DrawCommand[]): void {
  displayList.push(...layoutObject.paint());
  for (const child of layoutObject.children) {
    paintTree(child, displayList);
  }
}
