# Web Browser Engineering, in TypeScript

Following [Web Browser Engineering](https://browser.engineering/) by Pavel
Panchekha and Chris Harrelson, using TypeScript on Node.js instead of Python
and [skia-canvas](https://skia-canvas.org/) instead of Tkinter.

The point is to build things by hand: HTTP goes over raw `node:net` / `node:tls`
sockets, and there are no HTTP, HTML, or CSS libraries.

Status: chapters 1–2.

## Setup

Requires Node.js 22+.

```sh
npm install
```

## Run

```sh
npm start -- https://example.org/          # open a browser window (chapter 2); Down arrow scrolls
npm start -- --text http://example.org/    # print page text to the terminal (chapter 1)
npm start                                  # no URL: opens https://example.org/
npm test                                   # run tests (node:test)
npm run typecheck                          # type-check with tsc
```

## Layout

| File             | Book equivalent                           |
| ---------------- | ----------------------------------------- |
| `src/url.ts`     | `URL` class, `show()`, `load()` (ch. 1)   |
| `src/browser.ts` | `lex()`, `layout()`, `Browser` (ch. 2)    |
| `src/main.ts`    | the `if __name__ == "__main__":` block    |
| `test/`          | tests for each module                     |

## Where TypeScript/Node differs from the book

- **Async sockets.** Python's `makefile()` blocks until data arrives. Node
  sockets are event-based, so `URL.request()` is `async`: it collects `data`
  chunks as raw `Buffer`s until `end` and decodes UTF-8 only after
  concatenating them, because a chunk can end in the middle of a multi-byte
  character. As a result, `load()` is `async` too.
- **`split(sep, 1)`.** JS's `split(sep, limit)` throws away the rest of the
  string instead of keeping it as the final piece, so `url.ts` has a small
  `split1()` helper.
- **TLS.** `tls.connect({ servername })` plays the role of
  `ctx.wrap_socket(s, server_hostname=host)`.
- **Window and canvas.** A skia-canvas `Window` replaces both `tkinter.Tk()`
  and `tkinter.Canvas`, and its `keydown` event replaces `bind("<Down>")`.
  There's no `mainloop()` call: opening a window starts the event loop.
- **Clearing.** A Tk canvas keeps a list of shapes, so the book calls
  `delete("all")`. An HTML-style 2D canvas only holds pixels, so `draw()`
  paints over the previous frame with white.
- **Text anchor.** Tk centers text on `(x, y)`. The canvas uses
  `textAlign = "center"` and `textBaseline = "middle"` to match.
- **Display list.** The display list holds `{ x, y, c }` objects rather than
  tuples.
- **`URL` name.** Our `URL` class shadows Node's global `URL` in any module
  that imports it.
