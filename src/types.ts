export type TokenFont = {
  style: "italic" | "sans-serif";
  weight: "normal" | "bold";
  size: number;
};

export type DisplayItem = {
  x: number;
  y: number;
  word: string;
  font: string;
};
export type Layout = { displayList: DisplayItem[]; totalHeight: number };
