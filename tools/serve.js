// Serves web/ for development, with /web.wasm mapped out of target/.
//
//     node tools/serve.js            # builds the wasm, then serves on :8080
//     node tools/serve.js --no-build # serve what is already built
//     node tools/serve.js --port 9000
//
// A server is not optional: a file:// page cannot instantiate WebAssembly,
// because streaming compilation needs a real `application/wasm` response.
//
// Node, with no dependencies, for the same reason the Rust workspace has none
// (tools/gen_sin_table.js is the precedent). The artifact is served straight
// out of target/ rather than copied into web/, because target/ is gitignored
// and a copy is a thing that goes stale.
"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");

// The only two directories this process will ever read from. Everything a
// request resolves to is checked against these; see `resolveRequest`.
const WEB_ROOT = path.join(ROOT, "web");
const WASM_ROOT = path.join(ROOT, "target", "wasm32-unknown-unknown", "release");
const ROOTS = [WEB_ROOT, WASM_ROOT];

const WASM_URL = "/web.wasm";
const WASM_FILE = path.join(WASM_ROOT, "web.wasm");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".gif": "image/gif",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  // The one that matters: instantiateStreaming/compileStreaming reject
  // anything else, and the failure reads as a mysterious TypeError.
  ".wasm": "application/wasm",
};

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i === -1 || i + 1 >= process.argv.length ? fallback : process.argv[i + 1];
}

/** True if `file` is inside `root` (or is `root` itself). */
function contains(root, file) {
  const a = process.platform === "win32" ? root.toLowerCase() : root;
  const b = process.platform === "win32" ? file.toLowerCase() : file;
  return b === a || b.startsWith(a + path.sep);
}

/**
 * A URL to a file on disk, or `null` if the request is not allowed.
 *
 * This is the security-relevant function in the file. A server that maps
 * request paths onto disk paths is a directory-traversal hazard even bound to
 * localhost -- a page in another tab can fetch from it, so "only I can reach
 * it" is not true. The rules, in order:
 *
 *   1. Percent-decode explicitly, so `%2e%2e%2f` is rejected by the same code
 *      that rejects `../` rather than sneaking past a check done on the raw
 *      text.
 *   2. Refuse the characters that make traversal possible at all, instead of
 *      normalising them away. Normalising turns an attack into a 200 for some
 *      other file; refusing says no.
 *   3. Resolve, then require the result to sit under one of the two roots.
 *      Belt and braces: rule 2 should make this unreachable, and it is the one
 *      that would still hold if rule 2 were ever weakened.
 */
function resolveRequest(rawUrl) {
  const raw = rawUrl.split("?")[0].split("#")[0];

  let decoded;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null; // malformed percent-encoding
  }

  if (!decoded.startsWith("/")) return null;
  if (decoded.includes("\0")) return null;
  if (decoded.includes("\\")) return null; // a Windows separator in a URL path
  if (decoded.includes(":")) return null; // "/C:/Windows/..." style absolutes
  if (decoded.split("/").includes("..")) return null;

  const file =
    decoded === WASM_URL
      ? WASM_FILE
      : path.resolve(WEB_ROOT, "." + (decoded === "/" ? "/index.html" : decoded));

  return ROOTS.some((root) => contains(root, file)) ? file : null;
}

function send(res, status, headers, body, method) {
  res.writeHead(status, {
    // The page is edited and reloaded constantly, and a cached wasm module
    // after a rebuild is the most confusing bug this server could hand anyone.
    "cache-control": "no-store, no-cache, must-revalidate",
    pragma: "no-cache",
    expires: "0",
    ...headers,
  });
  res.end(method === "HEAD" ? undefined : body);
}

function serve(req, res) {
  const method = req.method || "GET";
  if (method !== "GET" && method !== "HEAD") {
    send(res, 405, { "content-type": "text/plain", allow: "GET, HEAD" }, "method not allowed", method);
    return log(req, 405);
  }

  const file = resolveRequest(req.url || "/");
  if (file === null) {
    send(res, 403, { "content-type": "text/plain" }, "forbidden", method);
    return log(req, 403);
  }

  let stat;
  try {
    stat = fs.statSync(file);
    if (stat.isDirectory()) {
      const index = path.join(file, "index.html");
      stat = fs.statSync(index);
      return sendFile(req, res, index, stat, method);
    }
  } catch {
    const hint =
      file === WASM_FILE
        ? "web.wasm has not been built: cargo build --release --target wasm32-unknown-unknown -p web"
        : "not found";
    send(res, 404, { "content-type": "text/plain; charset=utf-8" }, hint, method);
    return log(req, 404);
  }

  sendFile(req, res, file, stat, method);
}

function sendFile(req, res, file, stat, method) {
  const type = TYPES[path.extname(file).toLowerCase()] || "application/octet-stream";
  let body;
  try {
    body = method === "HEAD" ? null : fs.readFileSync(file);
  } catch (err) {
    send(res, 500, { "content-type": "text/plain" }, String(err), method);
    return log(req, 500);
  }
  send(
    res,
    200,
    {
      "content-type": type,
      "content-length": String(stat.size),
      // Informational only -- `send` sets `no-store`, so nothing will ever
      // conditionally request against it. It is here because the page asks for
      // it: the mtime of `web.wasm` is the build time of the binary that is
      // actually running, which is a much more honest answer than anything the
      // build could stamp into itself. A build stamp baked at compile time goes
      // stale the moment only a dependency changed.
      "last-modified": stat.mtime.toUTCString(),
    },
    body,
    method,
  );
  log(req, 200);
}

function log(req, status) {
  const mark = status >= 400 ? "!" : " ";
  console.log(`${mark} ${status} ${req.method} ${req.url}`);
}

function build() {
  console.log("cargo build --release --target wasm32-unknown-unknown -p web");
  // -p web, never a bare workspace build: lab uses std::thread::scope and has
  // no business being compiled for wasm.
  const out = spawnSync(
    "cargo",
    ["build", "--release", "--target", "wasm32-unknown-unknown", "-p", "web"],
    { cwd: ROOT, stdio: "inherit" }
  );
  if (out.error) {
    console.error(`could not run cargo: ${out.error.message}`);
    process.exit(1);
  }
  if (out.status !== 0) process.exit(out.status === null ? 1 : out.status);
}

if (!process.argv.includes("--no-build")) build();

const port = Number(arg("--port", "8080"));
const server = http.createServer(serve);

server.on("error", (err) => {
  console.error(
    err.code === "EADDRINUSE"
      ? `port ${port} is busy -- node tools/serve.js --port ${port + 1}`
      : String(err)
  );
  process.exit(1);
});

server.listen(port, "127.0.0.1", () => {
  const size = fs.existsSync(WASM_FILE) ? `${(fs.statSync(WASM_FILE).size / 1024).toFixed(1)} KB` : "missing";
  console.log(`web/      ${WEB_ROOT}`);
  console.log(`web.wasm  ${WASM_FILE} (${size})`);
  console.log(`serving   http://127.0.0.1:${port}/`);
});
