// Which closure in a live world holds state that no `captureState` hands over?
//
// A walk of object fields -- which is what the fork does -- cannot see a closure's variables. This
// harness can: it asks V8's inspector for every reachable function's `[[Scopes]]`, reads each
// closure scope's variables back as live values, and walks on through them, so it reaches every
// closure the world can reach and not only those hung on a field. Then, for each closure scope, it
// asks which of its variables are state -- an object that can be mutated, or a primitive declared
// with `let` -- and whether a `Forkable` built in that same scope hands each one over.
//
// It is the completeness check for skill ceiling session 02 (`tests/fork.test.mjs`): a module, a
// carrier or a mind that grows a `let` tomorrow, and does not put it in its record, shows up here
// with its file and its name. A variable that is state in form but not in fact -- a cache, a value
// rebuilt from others before it is read -- is exempted where it is declared, with a comment on the
// declaration line that says so: `// fork: derived -- <why>` (or `fork: config`, `fork: presentation`,
// or `fork: instrument` for a wall-clock reading; `names: a, b` after the kind limits it to those
// names, for a parameter list).
//
// Inspector reads are slow, which is fine for a test and wrong for anything else; the fork itself
// never uses this.

import { Session } from "node:inspector";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { babylonStructure } from "../../src/fork/world.ts";
import { worldIdentities } from "../../src/fork/native.ts";
import { captureGraph, isForkable } from "../../src/fork/graph.ts";

let session = null;
const scriptUrls = new Map();
function inspector() {
  if (session) return session;
  session = new Session();
  session.connect();
  session.on("Debugger.scriptParsed", (m) => scriptUrls.set(m.params.scriptId, m.params.url));
  post("Debugger.enable", {});
  return session;
}
function post(method, params) {
  let out, err;
  session.post(method, params, (e, r) => { err = e; out = r; });
  if (err) throw err;
  return out;
}

/** The closure scopes of a function: [{ type, name, file, variables }] with live values. */
function scopesOf(fn) {
  inspector();
  globalThis.__forkAuditProbe = fn;
  const { result } = post("Runtime.evaluate", { expression: "globalThis.__forkAuditProbe" });
  globalThis.__forkAuditProbe = undefined;
  const props = post("Runtime.getProperties", { objectId: result.objectId, ownProperties: true });
  const location = props.internalProperties?.find((p) => p.name === "[[FunctionLocation]]")?.value?.value;
  const scopeList = props.internalProperties?.find((p) => p.name === "[[Scopes]]");
  const file = location ? scriptUrls.get(location.scriptId) ?? null : null;
  const out = [];
  if (!scopeList) { post("Runtime.releaseObject", { objectId: result.objectId }); return { file, scopes: out }; }
  const list = post("Runtime.getProperties", { objectId: scopeList.value.objectId, ownProperties: true });
  for (const entry of list.result) {
    if (!/^\d+$/.test(entry.name)) continue;
    const description = entry.value.description ?? "";
    if (!description.startsWith("Closure") && !description.startsWith("Block")) continue;
    globalThis.__forkAuditScope = null;
    post("Runtime.callFunctionOn", {
      objectId: entry.value.objectId,
      functionDeclaration: "function () { globalThis.__forkAuditScope = this; }",
    });
    const scope = globalThis.__forkAuditScope?.object ?? null;
    globalThis.__forkAuditScope = undefined;
    if (scope) out.push({ description, variables: scope });
  }
  post("Runtime.releaseObjectGroup", { objectGroup: "" });
  post("Runtime.releaseObject", { objectId: result.objectId });
  return { file, scopes: out };
}

const letNames = new Map();
/** Names declared with `let` in a file, minus those whose line says `fork: derived`. */
function lets(file) {
  if (!file?.startsWith("file:")) return new Set();
  const known = letNames.get(file);
  if (known) return known;
  const names = new Set();
  const exempt = new Set();
  let source = "";
  try { source = readFileSync(fileURLToPath(file), "utf8"); } catch { /* not ours */ }
  for (const line of source.split(/\r?\n/)) {
    const derived = /\/\/.*fork: (derived|config|presentation|instrument)\b/.test(line);
    // A parameter, or anything not declared on the marked line, is named outright: `names: a, b`.
    const named = derived ? /names: ([\w$, ]+)/.exec(line) : null;
    if (named) for (const name of named[1].split(",").map((n) => n.trim()).filter(Boolean)) exempt.add(name);
    for (const match of line.matchAll(/\b(let|const)\s+([^=;]+?)\s*(=|;|$)/g)) {
      const declared = match[2].replace(/:[^,{}\[\]]+/g, "").replace(/[{}\[\]\s]/g, "").split(",").filter(Boolean)
        .map((n) => n.split(":").pop());
      for (const name of declared) {
        if (derived) exempt.add(name);
        else if (match[1] === "let") names.add(name);
      }
    }
  }
  const entry = { lets: names, exempt };
  letNames.set(file, entry);
  return entry;
}

const IMMUTABLE = new WeakMap();
function deeplyFrozen(value) {
  if (value === null || typeof value !== "object") return true;
  const known = IMMUTABLE.get(value);
  if (known !== undefined) return known;
  IMMUTABLE.set(value, true);
  const result = Object.isFrozen(value) && !ArrayBuffer.isView(value) && !(value instanceof Map) && !(value instanceof Set)
    && Object.values(value).every((child) => typeof child !== "function" && deeplyFrozen(child));
  IMMUTABLE.set(value, result);
  return result;
}

// Object identities, numbered once for the whole process so two worlds' scopes can be compared.
const ids = new WeakMap();
let nextId = 1;
const idOf = (v) => { if (!ids.has(v)) ids.set(v, nextId++); return ids.get(v); };
const signature = (variables) => Object.keys(variables).sort().map((name) => {
  const v = variables[name];
  return `${name}=${v !== null && (typeof v === "object" || typeof v === "function") ? `#${idOf(v)}` : typeof v}`;
}).join("|");
/**
 * One closure scope, across every function that closes over it. The file and the scope's name are
 * part of the key because two scopes that hold only primitives -- every random stream's `state`,
 * say -- would otherwise share a signature, and a record covering one would cover the other.
 */
const scopeKey = (file, scope) => `${file}|${scope.description}|${signature(scope.variables)}`;

/**
 * Every closure scope reachable from `roots`, through fields, collections and closures alike, with
 * the record keys each `Forkable` built in a scope hands over for it.
 */
function walkScopes(scene, roots) {
  const identities = worldIdentities(scene);
  const seen = new Set();
  const queue = [];
  const push = (value, path) => {
    if (value === null || (typeof value !== "object" && typeof value !== "function")) return;
    if (seen.has(value) || identities.has(value)) return;
    if (typeof value === "object" && (babylonStructure(value) || deeplyFrozen(value))) return;
    if (value instanceof WeakMap || value instanceof WeakSet || value instanceof Promise) return;
    seen.add(value);
    queue.push([value, path]);
  };
  for (const [key, value] of Object.entries(roots)) push(value, key);

  const scopes = new Map(); // signature -> { description, file, variables, path }
  const coveredBy = new Map(); // signature -> Set of record keys
  let functions = 0;
  while (queue.length > 0) {
    const [value, path] = queue.shift();
    // Before the function branch, which ends in a `continue`: a random stream or a director is a
    // Forkable *function*, and its record covers its own scope exactly as an object's does.
    if (isForkable(value)) {
      const { file, scopes: found } = scopesOf(value.captureState);
      const keys = Object.keys(value.captureState());
      for (const scope of found) {
        const sig = scopeKey(file, scope);
        if (!coveredBy.has(sig)) coveredBy.set(sig, new Set());
        for (const key of keys) coveredBy.get(sig).add(key);
      }
      push(value.captureState, `${path}.captureState`);
    }
    if (typeof value === "function") {
      functions += 1;
      const { file, scopes: found } = scopesOf(value);
      for (const scope of found) {
        const sig = scopeKey(file, scope);
        if (!scopes.has(sig)) {
          scopes.set(sig, { description: scope.description, file, variables: scope.variables, path });
          for (const [name, v] of Object.entries(scope.variables)) push(v, `${path}<${scope.description}>.${name}`);
        }
      }
      for (const key of Object.getOwnPropertyNames(value)) {
        if (key === "prototype" || key === "length" || key === "name" || key === "caller" || key === "arguments") continue;
        const d = Object.getOwnPropertyDescriptor(value, key);
        if (d && "value" in d) push(d.value, `${path}.${key}`);
      }
      continue;
    }
    if (value instanceof Map) {
      let i = 0;
      for (const [k, v] of value) { push(k, `${path}<key ${i}>`); push(v, `${path}<${i}>`); i += 1; }
      continue;
    }
    if (value instanceof Set) {
      let i = 0;
      for (const v of value) { push(v, `${path}<${i}>`); i += 1; }
      continue;
    }
    if (ArrayBuffer.isView(value)) continue;
    for (const key of Object.getOwnPropertyNames(value)) { // non-enumerable too, as the graph walks
      const d = Object.getOwnPropertyDescriptor(value, key);
      if (d && "value" in d) push(d.value, `${path}.${key}`);
    }
  }
  return { identities, functions, scopes, coveredBy, signatures: new Set(scopes.keys()) };
}

/**
 * Audit every closure reachable from `roots` in the world on `scene`. Returns the closure scopes
 * holding state, each with the variables no `Forkable` in that scope hands over.
 *
 * `twin` is a second world built independently by the same code. A scope the twin reaches too,
 * holding the very same objects, is not per-world: it is a definition's closure over its tables,
 * made once when its module loaded, and a fork shares it with its original rather than copying it.
 * Were such a scope written during a bout it would be state two worlds share, which the isolation
 * test is the check for rather than this one.
 */
export function auditClosures(scene, roots, twin = null) {
  const shared = twin ? walkScopes(twin.scene, twin.roots).signatures : new Set();
  const { identities, functions, scopes, coveredBy } = walkScopes(scene, roots);
  // What the fork itself reaches, by field or through a record: an object in here is restored in
  // place wherever a closure holds it, so a closure holding it needs to list nothing.
  const captured = new Set();
  captureGraph(roots, { identities, structural: babylonStructure, seen: captured });

  const findings = [];
  for (const [sig, scope] of scopes) {
    const { lets: declared, exempt } = lets(scope.file);
    const state = [];
    let holdsObject = false, holdsLet = false;
    for (const [name, v] of Object.entries(scope.variables)) {
      if (v !== null && (typeof v === "object" || typeof v === "function")) holdsObject = true;
      else if (declared.has(name)) holdsLet = true;
      if (exempt.has(name)) continue;
      if (v !== null && typeof v === "object") {
        if (identities.has(v) || babylonStructure(v) || deeplyFrozen(v)) continue;
        if (v instanceof WeakMap || v instanceof WeakSet || v instanceof Promise) continue;
        // Reached by the fork already -- by a field, or through some record. A `Forkable` held only
        // in a closure is not: its record is never taken unless something hands the piece over.
        if (captured.has(v)) continue;
        state.push(name);
      } else if (typeof v === "function") {
        // A function is structure unless it keeps state of its own -- a random stream does.
        if (isForkable(v) && !captured.has(v)) state.push(name);
      } else if (declared.has(name)) {
        state.push(name);
      }
    }
    if (state.length === 0) continue;
    if (shared.has(sig) && holdsObject && !holdsLet) continue;
    const covered = coveredBy.get(sig);
    const missing = covered ? state.filter((name) => !covered.has(name)) : state;
    if (missing.length === 0) continue;
    findings.push({
      scope: scope.description,
      file: scope.file?.replace(/^.*\/(src|tests)\//, "$1/") ?? "?",
      forkable: !!covered,
      missing,
      path: scope.path,
    });
  }
  return { functions, scopes: scopes.size, captured: captured.size, findings };
}
