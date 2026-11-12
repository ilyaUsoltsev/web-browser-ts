// Guest book server (chapter 8, "A Simple Web App").
//
// The book writes this server by hand on a raw socket. Express does that part
// for us: it accepts connections, parses the request line, headers, and the
// Content-Length body, and writes the status line and Content-Length back.
// What's left is the book's do_request(): turning a request into a page.
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

const app = express();

// Parses `application/x-www-form-urlencoded` bodies (what our browser's
// submitForm sends) into req.body — the book's form_decode().
app.use(express.urlencoded({ extended: false }));

app.get("/", (_req, res) => {
  res.send(showComments());
});

app.post("/add", (req, res) => {
  const guest = (req.body as Record<string, string | undefined>).guest;
  if (guest) {
    ENTRIES.push(guest);
  }
  res.send(showComments());
});

app.use((req, res) => {
  res
    .status(404)
    .send(`<!doctype html><h1>${escapeHtml(req.method)} ${escapeHtml(req.path)} not found!</h1>`);
});

app.listen(PORT, () => {
  console.log(`Guest book listening on http://localhost:${PORT}/`);
});
