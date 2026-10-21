import type { TokenFont } from "./types.ts";

export const SELF_CLOSING_TAGS = [
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
];

export const WIDTH = 800;
export const HEIGHT = 600;
export const HSTEP = 10;
export const VSTEP = 18;
export const SCROLL_STEP = 100;
export const LINE_HEIGHT_PADDING = 1;
export const LINE_HEIGHT_MULTIPLIER = 1;

export const DEFAULT_FONT: TokenFont = {
  italic: false,
  bold: false,
  size: 14,
};
