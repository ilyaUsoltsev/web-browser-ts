// Entry point, the equivalent of the book's `if __name__ == "__main__":` block.
//
//   npm start -- https://example.org/          open a browser window (chapter 2)
//   npm start -- --text https://example.org/   print the text to the terminal (chapter 1)
//   npm start                                  open https://example.org/

import { Browser } from "./browser.ts";
import { parseUrl, load } from "./url.ts";

// const dp = "https://google.ru";
const dp = "http://browser.engineering/redirect";
// const dp = "file:///Users/ilyau/Desktop/web-browser-ts/index.html";
// const dp = "data:text/html,<b>Hello world!</b>";
// const dp = "view-source:file:///Users/ilyau/Desktop/web-browser-ts/index.html";
// const dp = "view-source:https://ilyausoltsev.com/";

const args = process.argv.slice(2);
const textMode = args[0] === "--text";

// TODO: Not working with https://example.org/ -> switch to http1.0
const target = (textMode ? args[1] : args[0]) ?? dp;

if (textMode) {
  await load(parseUrl(target));
} else {
  // No tkinter.mainloop() needed: opening a Window starts skia-canvas's event
  // loop automatically, and Node keeps running until the window is closed.
  await new Browser().load(parseUrl(target));
}
