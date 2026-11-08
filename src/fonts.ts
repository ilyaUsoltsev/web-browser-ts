import { Canvas } from "skia-canvas";
import type { FontStyle, FontWeight } from "./types.ts";

// One shared context for measuring; its `font` is switched per measurement.
const measureCtx = new Canvas(1, 1).getContext("2d");

export class Font {
  css: string;
  ascent: number;
  descent: number;
  linespace: number;

  constructor(size: number, weight: FontWeight, style: FontStyle) {
    this.css = `${style === "italic" ? "italic " : ""}${weight} ${size}px sans-serif`;
    measureCtx.font = this.css;
    // font metrics, not glyph ink: every word in the same font gets the same height
    const metrics = measureCtx.measureText(" ");
    this.ascent = metrics.fontBoundingBoxAscent;
    this.descent = metrics.fontBoundingBoxDescent;
    this.linespace = this.ascent + this.descent;
  }

  measure(text: string): number {
    measureCtx.font = this.css;
    return measureCtx.measureText(text).width;
  }
}

const FONTS = new Map<string, Font>();

export function getFont(
  size: number,
  weight: FontWeight,
  style: FontStyle,
): Font {
  const key = `${size}|${weight}|${style}`;
  let font = FONTS.get(key);
  if (!font) {
    font = new Font(size, weight, style);
    FONTS.set(key, font);
  }
  return font;
}
