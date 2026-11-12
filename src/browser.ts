import { Chrome } from "./chrome.ts";
import { Window } from "skia-canvas";
import { WIDTH, HEIGHT, SCROLL_STEP } from "./constants.ts";
import { Tab } from "./tab.ts";
import type { URL } from "./url.ts";
import type { KeyDownEvent } from "./types.ts";

export class Browser {
  window!: Window;
  tabs: Tab[] = [];
  activeTab: Tab | null = null;
  chrome = new Chrome(this);
  // Where key presses go: the chrome's address bar, the active tab, or nowhere.
  focus: "address bar" | "content" | null = null;
  private keepAlive = (): void => {};

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
      } else if (e.key === "Backspace") {
        if (this.focus === "address bar") {
          this.chrome.backspace();
        }
        if (this.focus === "content" && this.activeTab) {
          this.activeTab.backspace();
        }
      } else if (e.key === "Enter") {
        if (this.focus === "address bar") {
          this.runAsync(this.chrome.enter().then(() => this.draw()));
        } else if (this.focus === "content") {
          this.activeTab?.blur();
        }
      } else {
        this.handleKey(e);
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
      if (e.button !== 0) {
        return;
      }
      this.runAsync(this.click(e.x, e.y));
    });
  }

  // skia-canvas only pushes the canvas to screen when its native loop
  // dispatches (OS event or animating window). Keep it animating while async
  // work (e.g. a network load) runs, so the result shows up without waiting
  // for the next mouse move.
  private runAsync(work: Promise<void>): void {
    this.window.on("frame", this.keepAlive);
    void work.catch(console.error).finally(() => {
      // Remove on the next frame: that frame's dispatch ships the drawn canvas.
      this.window.once("frame", () => this.window.off("frame", this.keepAlive));
    });
  }

  // Only printable ASCII; skip modifier combos and special keys (arrows, F-keys).
  private handleKey(e: KeyDownEvent): void {
    // winit reports the space bar as the named key "Space", not " ".
    const key = e.key === "Space" ? " " : e.key;
    if (key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) {
      return;
    }
    const code = key.charCodeAt(0);
    if (!(code >= 0x20 && code < 0x7f)) {
      return;
    }
    if (this.focus === "address bar") {
      this.chrome.keypress(key);
    } else if (this.focus === "content") {
      this.activeTab?.keypress(key);
    } else {
      return;
    }
    this.draw();
  }

  async click(x: number, y: number): Promise<void> {
    if (y < this.chrome.bottom) {
      await this.chrome.click(x, y);
    } else {
      this.focus = "content";
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
