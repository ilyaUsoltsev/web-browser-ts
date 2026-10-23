export type TokenFont = {
  italic: boolean;
  bold: boolean;
  size: number;
  align: "left" | "center" | "right";
};

export type DisplayItem = {
  x: number;
  y: number;
  word: string;
  font: string;
  align: "left" | "center" | "right";
};
export type Layout = { displayList: DisplayItem[]; totalHeight: number };
