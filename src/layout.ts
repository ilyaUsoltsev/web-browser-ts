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

type LayoutObject = DocumentLayout | BlockLayout | LineLayout | TextLayout;

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
      this.newLine();
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
      }
      for (const child of node.children) {
        this.recurse(child);
      }
    }
  }

  word(word: string, node: Token): void {
    const fontWeight = node.style["font-weight"] as FontWeight;
    const fontStyle = node.style["font-style"] as FontStyle;
    const size = parseFloat(node.style["font-size"] ?? `${DEFAULT_FONT_SIZE}px`);
    const font = getFont(size, fontWeight, fontStyle);
    const w = font.measure(word);
    if (this.cursorX + w > this.width) {
      this.newLine();
    }
    const line = this.children[this.children.length - 1] as LineLayout;
    const previousWord = line.children[line.children.length - 1] ?? null;
    const text = new TextLayout(node, word, line, previousWord);
    line.children.push(text);
    this.cursorX += w + font.measure(" ");
  }

  newLine(): void {
    this.cursorX = 0;
    const lastLine = (this.children[this.children.length - 1] as LineLayout | undefined) ?? null;
    const newLine = new LineLayout(this.node, this, lastLine);
    this.children.push(newLine);
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
    return cmds;
  }
}

export function paintTree(layoutObject: LayoutObject, displayList: DrawCommand[]): void {
  displayList.push(...layoutObject.paint());
  for (const child of layoutObject.children) {
    paintTree(child, displayList);
  }
}

class TextLayout {
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
    public previous: TextLayout | null,
  ) {}

  layout(): void {
    const weight = this.node.style["font-weight"] as FontWeight;
    const style = this.node.style["font-style"] as FontStyle;
    const size = parseFloat(this.node.style["font-size"] ?? `${DEFAULT_FONT_SIZE}px`);
    this.font = getFont(size, weight, style);
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
}

class LineLayout {
  children: TextLayout[] = [];
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
}
