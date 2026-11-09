import type { CanvasRenderingContext2D } from "skia-canvas";
import type { Font } from "./fonts.ts";
import type { DrawCommand } from "./types.ts";

import { Rect } from "./rect.ts";

class RectCommand {
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

  execute(scroll: number, canvas: CanvasRenderingContext2D): void {
    canvas.font = this.font.css;
    canvas.fillStyle = this.color;
    // `top` is the top of the line box, like Tk's anchor="nw"
    canvas.textBaseline = "alphabetic";
    canvas.fillText(this.text, this.left, this.top + this.font.ascent - scroll);
  }
}

export class DrawRect extends RectCommand implements DrawCommand {
  constructor(
    rect: Rect,
    public color: string,
  ) {
    super(rect);
  }

  execute(scroll: number, canvas: CanvasRenderingContext2D): void {
    canvas.fillStyle = this.color;
    canvas.fillRect(this.left, this.top - scroll, this.right - this.left, this.bottom - this.top);
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

  execute(scroll: number, canvas: CanvasRenderingContext2D): void {
    canvas.strokeStyle = this.color;
    canvas.lineWidth = this.thickness;
    canvas.strokeRect(this.left, this.top - scroll, this.right - this.left, this.bottom - this.top);
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

  execute(scroll: number, canvas: CanvasRenderingContext2D): void {
    canvas.strokeStyle = this.color;
    canvas.lineWidth = this.thickness;
    canvas.beginPath();
    canvas.moveTo(this.left, this.top - scroll);
    canvas.lineTo(this.right, this.bottom - scroll);
    canvas.stroke();
  }
}
