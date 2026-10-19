// Entry point, the equivalent of the book's `if __name__ == "__main__":` block.
//
//   npm start -- https://example.org/          open a browser window (chapter 2)
//   npm start -- --text https://example.org/   print the text to the terminal (chapter 1)
//   npm start                                  open https://example.org/

import { Browser } from "./browser.ts";
import { URL, load } from "./url.ts";

const args = process.argv.slice(2);
const textMode = args[0] === "--text";
const target = (textMode ? args[1] : args[0]) ?? "https://example.org/";

if (textMode) {
  await load(new URL(target));
} else {
  // No tkinter.mainloop() needed: opening a Window starts skia-canvas's event
  // loop automatically, and Node keeps running until the window is closed.
  await new Browser().load(new URL(target));
}
