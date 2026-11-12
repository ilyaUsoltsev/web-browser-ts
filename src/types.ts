import type { CanvasRenderingContext2D } from "skia-canvas";
import type { Selector } from "./selectors.ts";

export type FontWeight = "normal" | "bold";
export type FontStyle = "normal" | "italic";
export type Align = "left" | "center" | "right";

import type { Rect } from "./rect.ts";

export interface DrawCommand {
  rect: Rect;
  top: number;
  bottom: number;
  execute(scroll: number, canvas: CanvasRenderingContext2D): void;
}

export type Rule = { selector: Selector; body: Record<string, string> };

export type KeyDownEvent = { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean };
