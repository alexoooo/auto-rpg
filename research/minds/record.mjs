/**
 * **The fight record**: one row a bout, in one format that each fit reads (the measured-mind plan's
 * mechanism 1). The measuring command writes it (`research/minds/measure.mjs`), each bout played on
 * a worker that reads the Mind's decisions as it makes them (`record-worker.mjs`). A row holds:
 *
 * - `key`: the bout, as its protocol, its condition's place and the two entrants by side; the same
 *   key played again is a newer row beside the old (`--again`), the old kept and counting for less.
 * - `protocol`, `index`, `condition`: the tournament's protocol, the condition's place and the
 *   condition itself (`TournamentCondition`).
 * - `sides`, for `left` and `right`: the entrant (`mind/body/left,right`), the body as the fitted
 *   value names it (`bodyOf`), the body as numbers (`struckNumbers`), and the Mind that played it
 *   with a digest of every record it read (`Played`, `research/skills/profile-origin.mjs`).
 * - `commit`, `changed`, `date`: the commit it was played on, whether a build input differed from
 *   it, and when.
 * - `end` and `lives`: the bout's last clock, s, and both lives at each change, `[clock, left,
 *   right]`: what each decision was followed by, dealt and taken.
 * - `options`: the name of each Option the bout's roots name, by its place.
 * - `roots`: each decision state a tree search started from, both sides': its `side` and clock
 *   (`t`, s); the state as the fitted leaf reads it (`reading`, `readingAt`: where both stand and
 *   how they move, their postures and lives, and each Option on offer as its model prices one try,
 *   `OFFERED`; `readingOf` gives it back); each Option the search weighed (`lines`, `LINE`) as
 *   the search's first step prices it, an open one run to the search's horizon, with the runs it
 *   took and its worth; and the Option the selection then took (`ran`, its option and target),
 *   null where it took none new at that decision. The selection may take one the search did not
 *   weigh. Where the foe went and how each body ended are read from the later roots of
 *   either side. A line may carry what a fork of the state found it did (`forked`, the forked
 *   record), where one was played.
 *
 * Rows are kept in `.cache/record/<matchup>/<machine>.jsonl`, outside Git: a matchup's folder is
 * every row of its two entrants, each machine's in its own file, so machines merge by copying.
 */
import { createReadStream, existsSync, readdirSync } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

/** What each of a root's `lines` holds, in order: its Option by its place in the row's `options`, and the rest. */
export const LINE = Object.freeze(["option", "target", "kind", "open", "seconds", "dealt", "taken", "price", "runs", "worth"]);

/** What each Option on offer in a root's `reading` holds, in order (`Offered`). */
export const OFFERED = Object.freeze(["kind", "open", "duration", "dealt", "taken"]);

/** A root's state as the fitted leaf reads it (`Reading`), its Options on offer as objects again. */
export const readingOf = (root) => ({ ...root.reading, offered: root.reading.offered.map(([kind, open, duration, dealt, taken]) => ({ kind, open: open === 1, duration, dealt, taken })) });

/** A bout's key: its protocol, its condition's place and its entrants by side. */
export const keyOf = (protocol, index, left, right) => `${protocol}/${index}/${left} v ${right}`;

/** The folder a matchup's rows are kept in: its two entrants in order, as a file name may hold them. */
export const folderOf = (entrants) => join(ROOT, ".cache/record", [...entrants].sort().join(" v ").replace(/[^\w.-]+/g, "_"));

/** Every `.jsonl` file in `folder`, by name. */
const filesIn = (folder) => existsSync(folder) ? readdirSync(folder).filter((name) => name.endsWith(".jsonl")).sort().map((name) => join(folder, name)) : [];

/** Each line of `file`, as it is read. */
const linesOf = (file) => createInterface({ input: createReadStream(file), crlfDelay: Infinity });

/** How many rows `folder` keeps of each key, read from the start of each line alone. */
export async function keysIn(folder) {
  const keys = new Map();
  for (const file of filesIn(folder)) for await (const line of linesOf(file)) {
    const key = /^\{"key":"((?:[^"\\]|\\.)*)"/.exec(line)?.[1];
    if (key !== undefined) keys.set(key, (keys.get(key) ?? 0) + 1);
  }
  return keys;
}

/** Every row `folder` keeps, one at a time. */
export async function* rowsIn(folder) {
  for (const file of filesIn(folder)) for await (const line of linesOf(file)) if (line) yield JSON.parse(line);
}

/** A row as written: its numbers to four places, so a row is about half as long, and its key first. */
export const rowText = (row) => JSON.stringify(row, (_, v) => typeof v === "number" && !Number.isInteger(v) ? Math.round(v * 1e4) / 1e4 : v);
