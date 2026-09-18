// A mind out of a gitignored run and into the tree, carrying the executor it was measured under.
//
//   node scripts/export-snapshot.mjs --checkpoint tournaments/<run>/pool-120.json
//     --out snapshots/<name>.json [--tactics latchAbort=true] [--note "..."]
//
// **Why this script exists rather than a copy command.** `tournaments/` is gitignored, so no mind
// this project has fitted can be pulled onto another machine -- and the owner watches fights on a
// machine that is not the one that trains them. A plain copy would carry the weights and lose the
// one thing the weights cannot say: which executor they were measured under. Every league from AM
// onward ran `--tactics latchAbort=true`, the shipped row is `false`, and un-latched the same
// weights abandon most of the strokes they start. Somebody watching the copy would be watching a
// mind that flinches and would conclude the training did nothing.
//
// So the file that lands in the tree is the pool member plus a `tactics` field, which
// `src/golem/snapshot.ts` reads and `golem-snapshot` plays. A file without one still loads and
// still plays the shipped row: this adds a name to a thing that was already there and unnamed.
//
// The `note` is prose for a person opening the file, and nothing reads it.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { parseTactics } from "./train-ppo.mjs";

/** The file to write: the checkpoint as it stands, plus what the checkpoint cannot say. */
export function snapshotFile(checkpoint, { tactics = null, note = null, source = null } = {}) {
  if (checkpoint === null || typeof checkpoint !== "object" || Array.isArray(checkpoint)) {
    throw new Error("a snapshot is written from a checkpoint object");
  }
  if (!Array.isArray(checkpoint.weights) || checkpoint.weights.length === 0) {
    throw new Error("a snapshot needs the checkpoint's `weights`");
  }
  if ("tactics" in checkpoint) throw new Error("the checkpoint already carries a `tactics`; it would be overwritten");
  const extra = {};
  if (tactics !== null && Object.keys(tactics).length > 0) extra.tactics = tactics;
  if (note !== null) extra.note = note;
  if (source !== null) extra.source = source;
  return { ...checkpoint, ...extra };
}

const isMain = process.argv[1] !== undefined
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  const argv = process.argv.slice(2);
  const flag = (name, fallback) => {
    const at = argv.indexOf(`--${name}`);
    return at >= 0 && argv[at + 1] !== undefined ? argv[at + 1] : fallback;
  };
  const from = flag("checkpoint", null);
  const out = flag("out", null);
  if (from === null || out === null) throw new Error("--checkpoint <path> and --out <path> are both needed");
  const tactics = parseTactics(flag("tactics", null));
  const note = flag("note", null);
  const file = snapshotFile(JSON.parse(readFileSync(resolve(from), "utf8")), { tactics, note, source: from });
  mkdirSync(dirname(resolve(out)), { recursive: true });
  const text = `${JSON.stringify(file)}\n`;
  writeFileSync(resolve(out), text);
  console.log(`${out}: ${(text.length / 1024).toFixed(0)} KB, ${file.weights.length} weights, `
    + `executor ${tactics === null ? "the shipped one" : JSON.stringify(tactics)}`);
}
