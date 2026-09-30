/**
 * The provenance rule for any spec in `src/core/` (`docs/plans/2026-09-28-core-foundation.md`:
 * "Every number in a spec says where it came from"). `specProvenanceFaults` lists what breaks it;
 * a spec's own test asserts the list is empty, and `tests/core-spec.test.mjs` shows each fault
 * being found.
 */
import fs from "node:fs";
import path from "node:path";
import { SOURCES } from "../../src/core/sources.ts";
import { derivationsOf, inventory, sourcesOf } from "../../src/core/spec/provenance.ts";
import { readGlb } from "../../scripts/core/glb.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");

/**
 * The literals a rule may write: the arithmetic of a formula (a half, a square, a cube, four
 * thirds) and a vector's component index. Anything else is a claim about a body and must be an
 * input with a source.
 */
export const ARITHMETIC = new Set(["0", "1", "2", "3", "4"]);

/** Numeric literals in a function's source, other than `ARITHMETIC`. */
export function claimsIn(fn) {
  const code = fn.toString().replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const literals = code.match(/(?<![\w$.])(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?(?![\w$])/gi) ?? [];
  return literals.filter((literal) => !ARITHMETIC.has(literal));
}

const sameValue = (a, b) => typeof a === "number"
  ? a === b
  : a.length === b.length && a.every((x, i) => x === b[i]);

/** The value at a JSON pointer, or `undefined`. */
function atPointer(document, pointer) {
  return pointer.split("/").slice(1).map((token) => token.replace(/~1/g, "/").replace(/~0/g, "~"))
    .reduce((node, token) => (node == null ? undefined : node[token]), document);
}

/** An asset's JSON: the file itself, or a GLB's JSON chunk. */
const files = new Map();
function json(file) {
  if (!files.has(file)) {
    const full = path.join(ROOT, file);
    files.set(file, file.endsWith(".glb") ? readGlb(full).json : JSON.parse(fs.readFileSync(full, "utf8")));
  }
  return files.get(file);
}

/**
 * A record that looks like a repository path must exist, unless it names the commit that holds it
 * (`path@commit`, a file since deleted; a shallow clone cannot read it back, so its shape is all that is checked).
 */
const recordExists = (record) => !/^(docs|src|tests|research|scripts|assets)\//.test(record)
  || /^[^@#]+@[0-9a-f]{8,40}$/.test(record)
  || fs.existsSync(path.join(ROOT, record.split("#")[0]));

/** Every way `spec` breaks the provenance rule, as readable lines; empty when it keeps it. */
export function specProvenanceFaults(spec) {
  const faults = [];
  const { quantities, bare } = inventory(spec);
  for (const where of bare) faults.push(`${where} is a bare number`);
  const checked = new Set();
  for (const [where, quantity] of quantities) {
    for (const derived of derivationsOf(quantity)) {
      if (checked.has(derived)) continue;
      checked.add(derived);
      const { rule, inputs, compute } = derived.provenance;
      const again = compute(...inputs.map((input) => input.value));
      if (!sameValue(again, derived.value)) faults.push(`${where}: "${rule}" gives ${again}, not ${derived.value}`);
      const claims = claimsIn(compute);
      if (claims.length) faults.push(`${where}: "${rule}" writes ${claims.join(", ")}; a factor is an input`);
    }
    for (const leaf of sourcesOf(quantity)) {
      if (checked.has(leaf)) continue;
      checked.add(leaf);
      const { source: key, where: at } = leaf.provenance;
      const source = SOURCES[key];
      if (!source) { faults.push(`${where} rests on "${key}", which SOURCES does not list`); continue; }
      if (!at) faults.push(`${where} rests on ${key} without saying where in it`);
      if (source.kind === "asset" && !/\.(json|glb)$/.test(source.file)) {
        faults.push(`${where}: ${key} is ${source.file}, which a JSON pointer cannot read back`);
      } else if (source.kind === "asset") {
        const found = atPointer(json(source.file), at);
        if (found === undefined || !sameValue(leaf.value, found)) {
          faults.push(`${where}: ${source.file} ${at} is ${JSON.stringify(found)}, not ${leaf.value}`);
        }
      }
      if ((source.kind === "decision" || source.kind === "measurement") && !recordExists(source.record)) {
        faults.push(`${where}: ${key}'s record ${source.record} does not exist`);
      }
    }
  }
  return faults;
}
