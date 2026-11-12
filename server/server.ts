// Guest book server (chapter 8, "A Simple Web App").
//
// The book writes this server by hand on a raw socket. Express does that part
// for us: it accepts connections, parses the request line, headers, and the
// Content-Length body, and writes the status line and Content-Length back.
// What's left is the book's do_request(): routing a request to a function
// that builds the page.
//
//   npm run server     start on http://localhost:8000/

import express from "express";

const PORT = 8000;

const ENTRIES: string[] = ["Pavel was here"];

// Our browser has no entity support yet, but escaping keeps guests from
// injecting markup into the page.
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function showComments(): string {
  let out = "<!doctype html>";
  for (const entry of ENTRIES) {
    out += `<p>${escapeHtml(entry)}</p>`;
  }
  out += "<form action=add method=post>";
  out += "<p><input name=guest></p>";
  out += '<p><button type="submit">Sign the book!</button></p>';
  out += "</form>";
  return out;
}

function addEntry(params: Record<string, string | undefined>): string {
  if (params.guest) {
    ENTRIES.push(params.guest);
  }
  return showComments();
}

function notFound(url: string, method: string): string {
  return `<!doctype html><h1>${escapeHtml(method)} ${escapeHtml(url)} not found!</h1>`;
}

const app = express();

// Parses `application/x-www-form-urlencoded` bodies (what our browser's
// submitForm sends) into req.body — the book's form_decode(), including
// unquote_plus's "+" -> " " handling.
app.use(express.urlencoded({ extended: false }));

// These routes are the book's do_request(): pick a handler by method and URL.
// res.send() defaults to "200 OK".
app.get("/", (_req, res) => {
  res.send(showComments());
});

app.post("/add", (req, res) => {
  res.send(addEntry(req.body as Record<string, string | undefined>));
});

// Anything no route matched falls through to here.
app.use((req, res) => {
  res.status(404).send(notFound(req.path, req.method));
});

app.listen(PORT, () => {
  console.log(`Guest book listening on http://localhost:${PORT}/`);
});
