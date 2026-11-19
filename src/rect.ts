export class Rect {
  constructor(
    public left: number,
    public top: number,
    public right: number,
    public bottom: number,
  ) {}

  containsPoint(x: number, y: number): boolean {
    return x >= this.left && x < this.right && y >= this.top && y < this.bottom;
  }

  isEmpty(): boolean {
    return this.right <= this.left || this.bottom <= this.top;
  }

  // The smallest rect covering both (Skia's Rect.join); empty rects are ignored.
  union(other: Rect): Rect {
    if (other.isEmpty()) {
      return this;
    }
    if (this.isEmpty()) {
      return other;
    }
    return new Rect(
      Math.min(this.left, other.left),
      Math.min(this.top, other.top),
      Math.max(this.right, other.right),
      Math.max(this.bottom, other.bottom),
    );
  }
}
