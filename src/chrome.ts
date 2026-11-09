import type { Browser } from "./browser.ts";
import { WIDTH } from "./constants.ts";
import { DrawLine, DrawOutline, DrawRect, DrawText } from "./draw.ts";
import { Font, getFont } from "./fonts.ts";
import { Rect } from "./rect.ts";
import type { DrawCommand } from "./types.ts";
import { parseUrl } from "./url.ts";

export class Chrome {
  font: Font;
  fontHeight: number;
  padding: number;
  tabbarTop: number;
  tabbarBottom: number;
  newtabRect: Rect;
  backRect: Rect;
  addressRect: Rect;
  urlbarTop: number;
  urlbarBottom: number;
  bottom: number;

  constructor(private browser: Browser) {
    this.font = getFont(20, "normal", "normal");
    this.fontHeight = this.font.linespace;
    this.padding = 5;
    this.tabbarTop = 0;
    this.tabbarBottom = this.fontHeight + 2 * this.padding;
    this.newtabRect = new Rect(
      this.padding,
      this.padding,
      this.padding + this.font.measure("+") + 2 * this.padding,
      this.padding + this.fontHeight,
    );
    this.urlbarTop = this.tabbarBottom;
    this.urlbarBottom = this.urlbarTop + this.fontHeight + 2 * this.padding;
    this.bottom = this.urlbarBottom;
    const backWidth = this.font.measure("<") + 2 * this.padding;
    this.backRect = new Rect(
      this.padding,
      this.urlbarTop + this.padding,
      this.padding + backWidth,
      this.urlbarBottom - this.padding,
    );
    this.addressRect = new Rect(
      this.backRect.right + this.padding,
      this.urlbarTop + this.padding,
      WIDTH - this.padding,
      this.urlbarBottom - this.padding,
    );
  }

  tabRect(i: number): Rect {
    const start = this.newtabRect.right + this.padding;
    const width = this.font.measure("Tab X") + 2 * this.padding;
    return new Rect(start + width * i, this.tabbarTop, start + width * (i + 1), this.tabbarBottom);
  }

  paint(): DrawCommand[] {
    const width = this.browser.window?.width ?? WIDTH;
    const cmds: DrawCommand[] = [
      new DrawRect(new Rect(0, 0, width, this.bottom), "white"),
      new DrawLine(0, this.bottom, width, this.bottom, "black", 1),
      new DrawOutline(this.newtabRect, "black", 1),
      new DrawText(
        this.newtabRect.left + this.padding,
        this.newtabRect.top,
        "+",
        this.font,
        "black",
      ),
    ];
    this.browser.tabs.forEach((tab, i) => {
      const bounds = this.tabRect(i);
      cmds.push(
        new DrawLine(bounds.left, 0, bounds.left, bounds.bottom, "black", 1),
        new DrawLine(bounds.right, 0, bounds.right, bounds.bottom, "black", 1),
        new DrawText(
          bounds.left + this.padding,
          bounds.top + this.padding,
          `Tab ${i}`,
          this.font,
          "black",
        ),
      );
      if (tab === this.browser.activeTab) {
        // Erase the separator under the active tab to make its folder shape.
        cmds.push(
          new DrawLine(bounds.left + 1, bounds.bottom, bounds.right - 1, bounds.bottom, "white", 1),
        );
      }
      cmds.push(new DrawOutline(this.backRect, "black", 1));
      cmds.push(
        new DrawText(this.backRect.left + this.padding, this.backRect.top, "<", this.font, "black"),
      );
      cmds.push(new DrawOutline(this.addressRect, "black", 1));
      const url = this.browser.activeTab?.url.getUrlString() ?? "";
      cmds.push(
        new DrawText(
          this.addressRect.left + this.padding,
          this.addressRect.top,
          url,
          this.font,
          "black",
        ),
      );
    });
    return cmds;
  }

  async click(x: number, y: number): Promise<void> {
    if (this.newtabRect.containsPoint(x, y)) {
      await this.browser.newTab(parseUrl("https://browser.engineering/"));
      return;
    } else if (this.backRect.containsPoint(x, y)) {
      await this.browser.activeTab?.goBack();
      return;
    }
    const index = this.browser.tabs.findIndex((_, i) => this.tabRect(i).containsPoint(x, y));
    if (index !== -1) {
      this.browser.activeTab = this.browser.tabs[index]!;
    }
  }
}
