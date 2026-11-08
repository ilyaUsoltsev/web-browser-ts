import type { CanvasRenderingContext2D } from "skia-canvas";
import type { Font } from "./fonts.ts";
import type { DrawCommand } from "./types.ts";

export class DrawText implements DrawCommand {
  top: number;
  left: number;
  bottom: number;
  text: string;
  font: Font;

  constructor(x1: number, y1: number, text: string, font: Font) {
    this.top = y1;
    this.left = x1;
    this.text = text;
    this.font = font;
    this.bottom = y1 + font.linespace;
  }

  execute(scroll: number, canvas: CanvasRenderingContext2D): void {
    canvas.font = this.font.css;
    canvas.fillStyle = "black";
    // `top` is the top of the line box, like Tk's anchor="nw"
    canvas.textBaseline = "alphabetic";
    canvas.fillText(this.text, this.left, this.top + this.font.ascent - scroll);
  }
}

export class DrawRect implements DrawCommand {
  top: number;
  left: number;
  bottom: number;
  right: number;
  color: string;

  constructor(x1: number, y1: number, x2: number, y2: number, color: string) {
    this.top = y1;
    this.left = x1;
    this.bottom = y2;
    this.right = x2;
    this.color = color;
  }

  execute(scroll: number, canvas: CanvasRenderingContext2D): void {
    canvas.fillStyle = this.color;
    canvas.fillRect(
      this.left,
      this.top - scroll,
      this.right - this.left,
      this.bottom - this.top,
    );
  }
}
