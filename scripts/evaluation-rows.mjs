/**
 * **The store of played rows** (`.cache/evaluations/<evaluation>/`, `src/evaluation/rows.ts`): an
 * evaluation's rows as every file there keeps them, found by key whatever commit they were played
 * on, and this run's own file to keep more in. Outside Git, and outside what `npm run clean`
 * deletes: machines merge by copying their files.
 */
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { indexRows, playedOn } from "../src/evaluation/rows.ts";
import { commitOf, uncommittedInputs } from "./build-identity.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

/** Every `.jsonl` file in `directory`, by name, with its rows. */
const filesIn = (directory) => existsSync(directory)
  ? readdirSync(directory).filter((name) => name.endsWith(".jsonl")).sort().map((name) => ({ name: join(directory, name),
    rows: readFileSync(join(directory, name), "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line)) }))
  : [];

/** How many of the rows a run found from other code it plays again, to say whether they are the code's now. */
const CHECKED = 4;

/**
 * The cases of `found` (cases whose rows a run found in `store`) it plays again: `CHECKED` of those
 * of other code than now with no fault, each once, drawn in key order from a point chosen anew
 * each run; and how many such there are (`of`). A row played again is compared with the one kept
 * by the digest of its trace (`Row.digest`): it is kept nowhere and gates nothing, and one that
 * reads differently says the code under its subjects changed since it was played.
 */
export function drawFound(found, store) {
  const other = [...new Map(found.filter((one) => store.rows.has(one.key) && store.rows.get(one.key).fault === null && !store.current(store.rows.get(one.key)))
    .map((one) => [one.key, one])).values()].sort((a, b) => a.key < b.key ? -1 : 1);
  const from = Math.floor(Math.random() * other.length);
  return { drawn: Array.from({ length: Math.min(CHECKED, other.length) }, (_, k) => other[(from + k) % other.length]), of: other.length };
}

/** Where a row came from, in words: its commit, whether build inputs differed from it, and its day. */
export const originText = (from) => `${from.commit?.slice(0, 12) ?? "no commit"}${from.changed ? " with build inputs changed" : ""}, ${from.date.slice(0, 10)}`;

/**
 * **`evaluation`'s rows** (`rows`, by key, the newest of each, `indexRows`), the commit checked
 * out and the build inputs that differ from it; whether a row is of the code now (`current`: this
 * commit's, with no build input changed then or now); and `keep`, which gives a played row its
 * origin, appends it to this machine's file (named with `part`, a shard's) and puts it among the
 * rows.
 */
export function rowStore(evaluation, part = "") {
  const folder = join(ROOT, ".cache/evaluations", evaluation), commit = commitOf(), changed = commit ? uncommittedInputs() : [];
  const rows = indexRows(filesIn(folder)), file = join(folder, `${hostname()}${part}.jsonl`);
  return {
    rows, commit, changed,
    current: (row) => changed.length === 0 && playedOn(row, commit),
    keep(row) {
      const kept = { ...row, from: { commit, changed: changed.length > 0, date: new Date().toISOString() } };
      mkdirSync(folder, { recursive: true });
      appendFileSync(file, JSON.stringify(kept) + "\n");
      rows.set(kept.key, kept);
      return kept;
    },
  };
}
