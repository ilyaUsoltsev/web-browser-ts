import type { CanvasRenderingContext2D } from "skia-canvas";

export type FontWeight = "normal" | "bold";
export type FontStyle = "roman" | "italic";
export type Align = "left" | "center" | "right";

export interface DrawCommand {
  top: number;
  bottom: number;
  execute(scroll: number, canvas: CanvasRenderingContext2D): void;
}
