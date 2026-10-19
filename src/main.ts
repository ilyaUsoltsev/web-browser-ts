// Entry point, the equivalent of the book's `if __name__ == "__main__":` block.
//
//   npm start -- https://example.org/          open a browser window (chapter 2)
//   npm start -- --text https://example.org/   print the text to the terminal (chapter 1)
//   npm start                                  open https://example.org/

import { Browser } from './browser.ts';
import { URL, load } from './url.ts';

const defaultFilePath = 'file:///Users/ilyau/Desktop/web-browser-ts/index.html';

const args = process.argv.slice(2);
const textMode = args[0] === '--text';

// TODO: Not working with https://example.org/ -> switch to http1.0
const target = (textMode ? args[1] : args[0]) ?? defaultFilePath;

if (textMode) {
  await load(new URL(target));
} else {
  // No tkinter.mainloop() needed: opening a Window starts skia-canvas's event
  // loop automatically, and Node keeps running until the window is closed.
  await new Browser().load(new URL(target));
}
