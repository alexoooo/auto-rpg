/**
 * The core's functions of a real number (`src/core/math/real.ts`) beside the `Math` of the engine
 * that runs this: over the sweep of `tests/fixtures/real-sweep.mjs`, how many values differ from
 * the engine's in any bit, the widest difference in units of the last place, and each function's
 * digest, which is the same in every engine if the functions are.
 *
 *   node research/real-against-engine.mjs [arguments a draw]
 *
 * The default is the sweep the test runs, 20 000 a draw; the record's table
 * (`docs/reference/real-functions.md`) is at 5 000 000.
 */
import { SWEEP_EACH, sweep } from "../tests/fixtures/real-sweep.mjs";

const ENGINE = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan2: Math.atan2, exp: Math.exp,
  sinh: Math.sinh, cosh: Math.cosh, cbrt: Math.cbrt, "hypot of 2": Math.hypot, "hypot of 3": Math.hypot, "norm of 6": Math.hypot,
};

const view = new DataView(new ArrayBuffer(8));
/** A double's place among the doubles, counted from zero: a step of one is one unit in the last place. */
const place = (x) => { view.setFloat64(0, Math.abs(x)); return x < 0 ? -view.getBigInt64(0) : view.getBigInt64(0); };

const each = Number(process.argv[2] ?? SWEEP_EACH), rows = new Map();
const digests = sweep((name, args, value) => {
  const row = rows.get(name) ?? rows.set(name, { calls: 0, differ: 0, widest: 0n, kind: 0 }).get(name);
  const theirs = ENGINE[name](...args);
  row.calls += 1;
  if (Object.is(value, theirs) || (value !== value && theirs !== theirs)) return;
  row.differ += 1;
  if (value !== value || theirs !== theirs || !Number.isFinite(value) || !Number.isFinite(theirs)) { row.kind += 1; return; }
  const apart = place(value) - place(theirs), size = apart < 0n ? -apart : apart;
  if (size > row.widest) row.widest = size;
}, each);

console.log(`engine: ${globalThis.process?.versions?.v8 ? `Node ${process.versions.node}, V8 ${process.versions.v8}` : "unknown"}; ${each} arguments a draw`);
console.log("| function | calls | differ from the engine's | widest, units of the last place | differ in kind | digest |");
console.log("|---|---:|---:|---:|---:|---|");
for (const [name, row] of rows) console.log(`| ${name} | ${row.calls} | ${row.differ} | ${row.widest} | ${row.kind} | ${digests[name]} |`);
