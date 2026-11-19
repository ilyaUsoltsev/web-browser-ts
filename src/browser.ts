import { Chrome } from "./chrome.ts";
import { Canvas, Window, type CanvasRenderingContext2D } from "skia-canvas";
import { WIDTH, HEIGHT, SCROLL_STEP, DEVICE_SCALE } from "./constants.ts";
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

  // Compositing: the tab and the chrome are each rastered onto their own
  // offscreen surface; draw() just copies them onto the window. Scrolling
  // then only re-composites, it never re-runs the display list.
  private tabSurface: Canvas | null = null;
  private chromeSurface: Canvas | null = null;
  // Which tab the tab surface currently holds (it's shared by all tabs).
  private rasteredTab: Tab | null = null;
  // The chrome's look depends on browser state (focus, address bar, tabs,
  // URL), so the browser marks it stale whenever that may have changed.
  needsChromeRaster = true;

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
          this.needsChromeRaster = true;
        }
        if (this.focus === "content" && this.activeTab) {
          this.activeTab.backspace();
        }
      } else if (e.key === "Enter") {
        if (this.focus === "address bar") {
          this.needsChromeRaster = true;
          this.runAsync(
            this.chrome.enter().then(() => {
              // The URL shown in the address bar changed.
              this.needsChromeRaster = true;
              this.draw();
            }),
          );
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
      this.needsChromeRaster = true;
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
      this.needsChromeRaster = true;
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
    // Any click can change focus, the active tab, or (by navigating) the URL.
    // Marked after the await so a load that finishes late still shows up.
    this.needsChromeRaster = true;
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
    this.needsChromeRaster = true;
    this.draw();
  }

  // Paint the active tab's whole page onto the tab surface.
  rasterTab(): void {
    const tab = this.activeTab;
    if (!tab) {
      return;
    }
    const width = this.window.width;
    const height = Math.max(1, Math.ceil(tab.totalHeight));
    this.tabSurface = surfaceFor(this.tabSurface, width, height);
    const ctx = rasterContext(this.tabSurface);
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, width, height);
    tab.raster(ctx);
    this.rasteredTab = tab;
    tab.needsRaster = false;
  }

  rasterChrome(): void {
    const width = this.window.width;
    // +1: the 1px separator line at chrome.bottom straddles that edge.
    const height = this.chrome.bottom + 1;
    this.chromeSurface = surfaceFor(this.chromeSurface, width, height);
    const ctx = rasterContext(this.chromeSurface);
    ctx.clearRect(0, 0, width, height);
    for (const cmd of this.chrome.paint()) {
      cmd.execute(ctx);
    }
    this.needsChromeRaster = false;
  }

  // Composite: re-raster only stale surfaces, then copy them onto the window.
  draw(): void {
    if (!this.window) {
      return;
    }
    const tab = this.activeTab;
    if (tab && (tab !== this.rasteredTab || tab.needsRaster)) {
      this.rasterTab();
    }
    if (this.needsChromeRaster || this.chromeSurface?.width !== this.window.width * DEVICE_SCALE) {
      this.rasterChrome();
    }

    const ctx = this.window.ctx;
    const { width, height } = this.window;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, width, height);

    if (tab && this.tabSurface) {
      const top = this.chrome.bottom;
      // Clip to the tab's viewport so the page never paints over the chrome.
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, top, width, height - top);
      ctx.clip();
      drawSurface(ctx, this.tabSurface, 0, top - tab.scroll);
      ctx.restore();
      tab.drawScrollbar(ctx, top);
    }

    if (this.chromeSurface) {
      drawSurface(ctx, this.chromeSurface, 0, 0);
    }
  }
}

// An offscreen surface of `width` x `height` CSS pixels, backed by
// DEVICE_SCALE times as many device pixels. Reuses `existing` if it fits.
function surfaceFor(existing: Canvas | null, width: number, height: number): Canvas {
  const w = width * DEVICE_SCALE;
  const h = height * DEVICE_SCALE;
  return existing?.width === w && existing.height === h ? existing : new Canvas(w, h);
}

// The surface's context, scaled so draw commands keep working in CSS pixels.
// setTransform (not scale): a canvas hands out the same context every time,
// so a scale() would stack up across rasters.
function rasterContext(surface: Canvas): CanvasRenderingContext2D {
  const ctx = surface.getContext("2d");
  ctx.setTransform(DEVICE_SCALE, 0, 0, DEVICE_SCALE, 0, 0);
  return ctx;
}

// Copy a surface at its CSS size: its extra device pixels map 1:1 onto a
// HiDPI screen instead of being stretched.
function drawSurface(ctx: CanvasRenderingContext2D, surface: Canvas, x: number, y: number): void {
  ctx.drawImage(surface, x, y, surface.width / DEVICE_SCALE, surface.height / DEVICE_SCALE);
}
