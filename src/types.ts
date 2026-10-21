export type TokenFont = {
  italic: boolean;
  bold: boolean;
  size: number;
};

export type DisplayItem = {
  x: number;
  y: number;
  word: string;
  font: string;
};
export type Layout = { displayList: DisplayItem[]; totalHeight: number };
