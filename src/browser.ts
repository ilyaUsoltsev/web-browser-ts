import { Chrome } from "./chrome.ts";
import { Window } from "skia-canvas";
import { WIDTH, HEIGHT, SCROLL_STEP } from "./constants.ts";
import { Tab } from "./tab.ts";
import type { URL } from "./url.ts";

export class Browser {
  window!: Window;
  tabs: Tab[] = [];
  activeTab: Tab | null = null;
  chrome = new Chrome(this);

  // Create and draw in the same tick so skia-canvas displays the first frame.
  private openWindow(): void {
    if (this.window) {
      return;
    }
    this.window = new Window(WIDTH, HEIGHT, {
      title: "Browser",
      background: "white",
      fit: "resize",
    });
    this.window.on("keydown", (e) => {
      if (e.key === "ArrowDown") {
        this.activeTab?.scrolldown();
      } else if (e.key === "ArrowUp") {
        this.activeTab?.scrollup();
      } else {
        return;
      }
      this.draw();
    });
    this.window.on("wheel", (e) => {
      if (e.deltaY > 0) {
        this.activeTab?.scrollup(SCROLL_STEP / 10);
      } else if (e.deltaY < 0) {
        this.activeTab?.scrolldown(SCROLL_STEP / 10);
      }
      this.draw();
    });
    this.window.on("resize", (e) => {
      this.window.width = e.width;
      this.window.height = e.height;
      for (const tab of this.tabs) {
        tab.width = e.width;
        tab.height = Math.max(0, e.height - this.chrome.bottom);
        tab.layout();
      }
      this.draw();
    });
    this.window.on("mousedown", (e) => {
      if (e.button === 0) {
        void this.click(e.x, e.y).catch(console.error);
      }
    });
  }

  async click(x: number, y: number): Promise<void> {
    if (y < this.chrome.bottom) {
      await this.chrome.click(x, y);
    } else {
      await this.activeTab?.click(x, y - this.chrome.bottom);
    }
    this.draw();
  }

  async newTab(url: URL): Promise<void> {
    const tab = new Tab(
      this.window?.width ?? WIDTH,
      Math.max(0, (this.window?.height ?? HEIGHT) - this.chrome.bottom),
    );
    await tab.load(url);
    this.openWindow();
    // The shared window may have resized while the page was loading.
    if (
      tab.width !== this.window.width ||
      tab.height !== Math.max(0, this.window.height - this.chrome.bottom)
    ) {
      tab.width = this.window.width;
      tab.height = Math.max(0, this.window.height - this.chrome.bottom);
      tab.layout();
    }
    this.tabs.push(tab);
    this.activeTab = tab;
    this.draw();
  }

  draw(): void {
    if (!this.window) {
      return;
    }
    const ctx = this.window.ctx;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, this.window.width, this.window.height);
    this.activeTab?.draw(ctx, this.chrome.bottom);
    for (const cmd of this.chrome.paint()) {
      cmd.execute(0, ctx);
    }
  }
}
