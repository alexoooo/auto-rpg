// The emitted-chunk graph: what the browser fetches before it has run a line of
// route code, and what it only fetches on demand.
//
// **Why this exists instead of a regex over the one script tag.** Until the
// studio shell landed, `dist/index.html` had one `<script>` and every module in
// the application hung off it, so reading that one chunk out of the HTML and
// grepping it *was* reading the main thread. `client/src/studio.ts` has no
// static imports at all -- every route is a bare `import()` -- so the entry
// chunk became a ~3.5 KB router and every line of game code moved into lazy
// chunks that grep never opens. From that commit on, "the main-thread chunk
// contains no `WebAssembly.instantiate`" was true of a router that could not
// have contained one no matter what the routes did, and the same held for the
// modulepreload assertion: there are no modulepreload links left to be outside
// of. Both assertions passed because they had stopped asking anything.
//
// What survived the change is a property about a *closure* rather than a file:
// whatever the HTML fetches eagerly, closed transitively over static imports, is
// what the main thread runs before any navigation. That is the set the checks in
// `vite.config.ts` and in `render-contract.test.mjs` are both written against,
// and they share this walker so a build that passes and a test that passes
// cannot be agreeing about two different graphs.
//
// A lazy `import()` is deliberately not an edge. That boundary is the whole
// point, so the two forms are separated syntactically rather than by heuristic:
// `from "..."` and a side-effect `import "..."` take a string literal and are
// the only two static forms JavaScript has, while `import(...)` takes an
// expression and is always followed by `(`. The minifier makes the distinction
// even sharper -- it rewrites the dynamic specifier as a template literal, which
// a `from` clause is not allowed to be -- but the walker does not lean on that.

import fs from "node:fs";
import path from "node:path";

/** Instantiating wasm anywhere the main thread can reach it is the thing banned. */
export const WASM_INSTANTIATION = /WebAssembly\.(?:instantiate|compile)/;

/** Every emitted JavaScript chunk in `directory`, by file name, with its source. */
export function readChunks(directory) {
  const chunks = new Map();
  for (const name of fs.readdirSync(directory).sort()) {
    if (!name.endsWith(".js")) continue;
    chunks.set(name, fs.readFileSync(path.join(directory, name), "utf8"));
  }
  return chunks;
}

// `import ... from`, `export ... from`, `export * from`; then a side-effect
// `import "./x.js"`. The second requires a quote immediately after the keyword,
// which is what keeps it off `import(` -- a dynamic import takes an expression,
// so its next character is always a parenthesis.
const IMPORT_FROM = /\bfrom\s*["'](\.\/[^"'\n]+)["']/g;
const IMPORT_BARE = /(?:^|[^\w$.])import\s*["'](\.\/[^"'\n]+)["']/g;

/** The sibling chunks `source` imports statically, as emitted file names. */
export function staticImports(source) {
  const names = new Set();
  for (const pattern of [IMPORT_FROM, IMPORT_BARE]) {
    pattern.lastIndex = 0;
    let match = pattern.exec(source);
    while (match !== null) {
      names.add(match[1].slice("./".length));
      match = pattern.exec(source);
    }
  }
  return names;
}

/**
 * Every chunk reachable from `seeds` through static imports, seeds included.
 *
 * A specifier naming no emitted chunk throws rather than being skipped. Silently
 * dropping an edge under-reports the closure, and under-reporting is exactly how
 * a guarantee about the closure turns back into a guarantee about nothing.
 */
export function staticImportClosure(chunks, seeds) {
  const closure = new Set();
  const pending = [...seeds];
  while (pending.length > 0) {
    const name = pending.pop();
    if (closure.has(name)) continue;
    const source = chunks.get(name);
    if (source === undefined) {
      throw new Error(`a static import names ${name}, which is not an emitted chunk`);
    }
    closure.add(name);
    for (const next of staticImports(source)) pending.push(next);
  }
  return closure;
}

/**
 * The chunks the built HTML fetches eagerly: its module scripts and its
 * modulepreloads, which are the two ways a chunk arrives without a navigation.
 */
export function eagerChunks(html) {
  const names = new Set();
  for (const [tag] of html.matchAll(/<(?:script|link)\b[^>]*>/gi)) {
    if (/^<link/i.test(tag) && !/rel\s*=\s*"?modulepreload/i.test(tag)) continue;
    const url = /\b(?:src|href)\s*=\s*"([^"]+)"/i.exec(tag)?.[1];
    if (url === undefined) continue;
    const asset = url.replace(/^\.?\//, "");
    if (asset.startsWith("assets/") && asset.endsWith(".js")) {
      names.add(asset.slice("assets/".length));
    }
  }
  return names;
}
