import { Canvas, type CanvasRenderingContext2D } from "skia-canvas";
import type { Font } from "./fonts.ts";
import type { DrawCommand } from "./types.ts";

import { Rect } from "./rect.ts";

class RectCommand {
  // Leaf commands: nothing nested inside.
  children: DrawCommand[] = [];
  constructor(public rect: Rect) {}
  get top() {
    return this.rect.top;
  }
  get left() {
    return this.rect.left;
  }
  get bottom() {
    return this.rect.bottom;
  }
  get right() {
    return this.rect.right;
  }
}

export class DrawText extends RectCommand implements DrawCommand {
  text: string;
  font: Font;
  color: string;

  constructor(x1: number, y1: number, text: string, font: Font, color: string) {
    super(new Rect(x1, y1, x1 + font.measure(text), y1 + font.linespace));
    this.text = text;
    this.font = font;
    this.color = color;
  }

  execute(canvas: CanvasRenderingContext2D): void {
    canvas.font = this.font.css;
    canvas.fillStyle = this.color;
    // `top` is the top of the line box, like Tk's anchor="nw"
    canvas.textBaseline = "alphabetic";
    canvas.fillText(this.text, this.left, this.top + this.font.ascent);
  }
}

export class DrawRect extends RectCommand implements DrawCommand {
  constructor(
    rect: Rect,
    public color: string,
  ) {
    super(rect);
  }

  execute(canvas: CanvasRenderingContext2D): void {
    canvas.fillStyle = this.color;
    canvas.fillRect(this.left, this.top, this.right - this.left, this.bottom - this.top);
  }
}

export class DrawOutline extends RectCommand implements DrawCommand {
  constructor(
    rect: Rect,
    public color: string,
    public thickness: number,
  ) {
    super(rect);
  }

  execute(canvas: CanvasRenderingContext2D): void {
    canvas.strokeStyle = this.color;
    canvas.lineWidth = this.thickness;
    canvas.strokeRect(this.left, this.top, this.right - this.left, this.bottom - this.top);
  }
}

export class DrawLine extends RectCommand implements DrawCommand {
  constructor(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    public color: string,
    public thickness: number,
  ) {
    super(new Rect(x1, y1, x2, y2));
  }

  execute(canvas: CanvasRenderingContext2D): void {
    canvas.strokeStyle = this.color;
    canvas.lineWidth = this.thickness;
    canvas.beginPath();
    canvas.moveTo(this.left, this.top);
    canvas.lineTo(this.right, this.bottom);
    canvas.stroke();
  }
}

// Extra room around a layer's bounds: strokes extend half their width past a
// rect, and glyphs (italics especially) can overhang their measured box.
const LAYER_PADDING = 4;

// Draws its children as one group, then blends that group into the parent at
// `opacity`. Unlike a translucent color, overlapping children don't show
// through each other: they're flattened first, then made transparent.
export class Opacity implements DrawCommand {
  rect: Rect;

  constructor(
    public opacity: number,
    public children: DrawCommand[],
  ) {
    this.rect = children.reduce((rect, cmd) => rect.union(cmd.rect), new Rect(0, 0, 0, 0));
  }

  get top() {
    return this.rect.top;
  }
  get bottom() {
    return this.rect.bottom;
  }

  execute(ctx: CanvasRenderingContext2D): void {
    // Fully opaque: no layer needed, draw straight into the parent.
    if (this.opacity >= 1) {
      for (const cmd of this.children) {
        cmd.execute(ctx);
      }
      return;
    }
    if (this.opacity <= 0 || this.rect.isEmpty()) {
      return;
    }
    this.paintLayer(ctx, this.opacity, "source-over");
  }

  protected paintLayer(
    ctx: CanvasRenderingContext2D,
    opacity: number,
    mode: "source-over" | "multiply" | "difference",
  ): void {
    if (this.rect.isEmpty()) {
      return;
    }
    // Canvas2D has no saveLayer, so make the layer by hand: a temporary
    // canvas covering just the children's bounds.
    const left = Math.floor(this.rect.left) - LAYER_PADDING;
    const top = Math.floor(this.rect.top) - LAYER_PADDING;
    const width = Math.ceil(this.rect.right) + LAYER_PADDING - left;
    const height = Math.ceil(this.rect.bottom) + LAYER_PADDING - top;
    // Match the parent's device scale (e.g. DEVICE_SCALE) or the layer blurs.
    const { a: scaleX, d: scaleY } = ctx.getTransform();
    const layer = new Canvas(Math.ceil(width * scaleX), Math.ceil(height * scaleY));
    const layerCtx = layer.getContext("2d");
    // Children paint in page coordinates; shift so (left, top) is the layer's origin.
    layerCtx.setTransform(scaleX, 0, 0, scaleY, -left * scaleX, -top * scaleY);
    for (const cmd of this.children) {
      cmd.execute(layerCtx);
    }

    // Blend the layer into the parent (saveLayer's restore()).
    ctx.save();
    ctx.globalAlpha *= opacity;
    ctx.globalCompositeOperation = mode;
    ctx.drawImage(layer, left, top, width, height);
    ctx.restore();
  }
}

export function parseBlendMode(mode?: string): "source-over" | "multiply" | "difference" {
  return mode === "multiply" || mode === "difference" ? mode : "source-over";
}

// Blend the flattened subtree against the existing backdrop. Normal blending
// draws directly, preserving the backdrop for any nested blending children.
export class Blend extends Opacity {
  constructor(public blendMode: string | undefined, children: DrawCommand[]) {
    super(1, children);
  }

  override execute(ctx: CanvasRenderingContext2D): void {
    const mode = parseBlendMode(this.blendMode);
    if (mode === "source-over") {
      super.execute(ctx);
    } else {
      this.paintLayer(ctx, 1, mode);
    }
  }
}
