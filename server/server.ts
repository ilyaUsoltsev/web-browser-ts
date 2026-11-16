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
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const PORT = 8000;

const LOGINS = new Map([
  ["crashoverride", "0cool"],
  ["cerealkiller", "emmanuel"],
]);
const ENTRIES: [string, string][] = [
  ["No names. We are nameless!", "cerealkiller"],
  ["HACK THE PLANET!!!", "crashoverride"],
];

type Session = { user?: string; nonce?: string };
type FormParams = Record<string, unknown>;
const SESSIONS = new Map<string, Session>();

// Encode user text before inserting it into HTML, like Python's html.escape.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function nonceInput(session: Session): string {
  // One active form per session, as in the book. Each new form replaces it.
  session.nonce = randomBytes(32).toString("hex");
  return `<input name=nonce type=hidden value=${session.nonce}>`;
}

function consumeNonce(session: Session, params: FormParams): boolean {
  if (!session.nonce || typeof params.nonce !== "string" || !/^[0-9a-f]{64}$/.test(params.nonce)) {
    return false;
  }
  if (!timingSafeEqual(Buffer.from(session.nonce, "hex"), Buffer.from(params.nonce, "hex"))) {
    return false;
  }
  delete session.nonce;
  return true;
}

function showComments(session: Session): string {
  let out = "<!doctype html>";
  out += "<link rel=stylesheet href=/comment.css>";
  for (const [entry, who] of ENTRIES) {
    out += `<p>${escapeHtml(entry)}\n<i>by ${escapeHtml(who)}</i></p>`;
  }
  if (session.user) {
    out += `<h1>Hello, ${escapeHtml(session.user)}</h1>`;
    out += "<form action=add method=post>";
    out += nonceInput(session);
    out += "<p><input name=guest></p>";
    out += '<p><button type="submit">Sign the book!</button></p>';
    out += "</form>";
  } else {
    out += "<a href=/login>Sign in to write in the guest book</a>";
  }
  // Empty until comment.js writes a warning into it.
  out += "<strong></strong>";
  out += "<script src=/comment.js></script>";
  return out;
}

function addEntry(session: Session, params: FormParams): string {
  if (session.user && typeof params.guest === "string" && params.guest.length <= 100) {
    ENTRIES.push([params.guest, session.user]);
  }
  return showComments(session);
}

function loginForm(session: Session): string {
  return (
    "<!doctype html><form action=/ method=post>" +
    "<h1>Log in</h1>" +
    nonceInput(session) +
    "<p>Username: <input name=username></p>" +
    "<p>Password: <input name=password type=password></p>" +
    "<p><button>Log in</button></p></form>"
  );
}

function doLogin(session: Session, params: FormParams): [number, string] {
  const username = typeof params.username === "string" ? params.username : "";
  const password = typeof params.password === "string" ? params.password : "";
  const expected = LOGINS.get(username);
  // Compare fixed-length digests without an early exit on password characters.
  const digest = (value: string) => createHash("sha256").update(value).digest();
  const matches = timingSafeEqual(digest(password), digest(expected ?? ""));
  if (expected !== undefined && typeof params.password === "string" && matches) {
    session.user = username;
    return [200, showComments(session)];
  }
  return [401, `<!doctype html><h1>Invalid password for ${escapeHtml(username)}</h1>`];
}

function notFound(url: string, method: string): string {
  return `<!doctype html><h1>${escapeHtml(method)} ${escapeHtml(url)} not found!</h1>`;
}

const app = express();

// Cookies carry only an opaque identifier; user data stays on the server.
app.use((req, res, next) => {
  const tokenCookie = req.headers.cookie
    ?.split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith("token="));
  let token = tokenCookie?.slice("token=".length);
  let session = token ? SESSIONS.get(token) : undefined;
  if (!session) {
    // 256 cryptographically random bits, represented as a decimal number.
    token = BigInt(`0x${randomBytes(32).toString("hex")}`).toString();
    session = {};
    SESSIONS.set(token, session);
    res.cookie("token", token, { httpOnly: true, sameSite: "lax", path: "/" });
  }
  res.locals.session = session;
  next();
});

// Parses `application/x-www-form-urlencoded` bodies (what our browser's
// submitForm sends) into req.body — the book's form_decode(), including
// unquote_plus's "+" -> " " handling.
app.use(express.urlencoded({ extended: false }));

// These routes are the book's do_request(): pick a handler by method and URL.
// res.send() defaults to "200 OK".
app.get("/", (_req, res) => {
  res.send(showComments(res.locals.session));
});

app.get("/login", (_req, res) => {
  res.send(loginForm(res.locals.session));
});

// Both forms require a secret issued to this session before changing state.
app.post(["/", "/add"], (req, res, next) => {
  if (!consumeNonce(res.locals.session, req.body ?? {})) {
    res.status(403).send("<!doctype html><h1>Invalid or expired form</h1>");
    return;
  }
  next();
});

app.post("/", (req, res) => {
  const [status, body] = doLogin(res.locals.session, req.body ?? {});
  res.status(status).send(body);
});

app.post("/add", (req, res) => {
  res.send(addEntry(res.locals.session, req.body ?? {}));
});

// The page's script and style sheet, read from next to this file.
app.get("/comment.js", (_req, res) => {
  res.sendFile("comment.js", { root: import.meta.dirname });
});

app.get("/comment.css", (_req, res) => {
  res.sendFile("comment.css", { root: import.meta.dirname });
});

// Anything no route matched falls through to here.
app.use((req, res) => {
  res.status(404).send(notFound(req.path, req.method));
});

app.listen(PORT, () => {
  console.log(`Guest book listening on http://localhost:${PORT}/`);
});
