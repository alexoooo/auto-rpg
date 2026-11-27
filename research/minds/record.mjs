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
 *   either side. What forks of a root's state did, where the forked record played them, is in
 *   its bank's `forks.jsonl` (`fork-bank.mjs`), found by the row's key, the side and `t`.
 *
 * Rows are kept in `.cache/record/<matchup>/<machine>.jsonl`, outside Git: a matchup's folder is
 * every row of its two entrants, each machine's in its own file, so machines merge by copying.
 */
import { appendFileSync, createReadStream, existsSync, mkdirSync, readdirSync } from "node:fs";
import { hostname } from "node:os";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { simulationWorker } from "../../scripts/lanes.mjs";
import { commitOf, uncommittedInputs } from "../../scripts/build-identity.mjs";
import { workerJobs } from "../worker-jobs.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

/** What each of a root's `lines` holds, in order: its Option by its place in the row's `options`, and the rest. */
export const LINE = Object.freeze(["option", "target", "kind", "open", "seconds", "dealt", "taken", "price", "runs", "worth"]);

/** What each Option on offer in a root's `reading` holds, in order (`Offered`). */
export const OFFERED = Object.freeze(["kind", "open", "duration", "dealt", "taken"]);

/** A root's state as the fitted leaf reads it (`Reading`), its Options on offer as objects again. */
export const readingOf = (root) => ({ ...root.reading, offered: root.reading.offered.map(([kind, open, duration, dealt, taken]) => ({ kind, open: open === 1, duration, dealt, taken })) });

/** A bout's key: its protocol, its condition's place and its entrants by side. */
export const keyOf = (protocol, index, left, right) => `${protocol}/${index}/${left} v ${right}`;

/** A matchup's name as a folder's: its two entrants in order, as a file name may hold them. */
const matchupOf = (entrants) => [...entrants].sort().join(" v ").replace(/[^\w.-]+/g, "_");

/** The folder a matchup's rows are kept in. */
export const folderOf = (entrants) => join(ROOT, ".cache/record", matchupOf(entrants));

/** The folder the forked record's bank of a matchup keeps its states in at `commit` (`bank.mjs`), with the forks of them (`fork-bank.mjs`). */
export const bankOf = (entrants, commit) => join(ROOT, ".cache/bank", matchupOf(entrants), commit);

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

/**
 * **Play `jobs`, bouts for the record**, on `lanes` workers of `record-worker.mjs`, each row
 * appended to `folder`'s file for this machine as it comes, with the commit it was played on;
 * the price said from the first chunk. `each(result, job, commit)` sees each worker's answer first
 * and gives the bout's row of it (a worker may answer more than the row, as the bank's saves).
 */
export async function playRecord(jobs, { folder, lanes, each = (result) => result }) {
  const commit = commitOf(), changed = (commit ? uncommittedInputs() : []).length > 0, file = join(folder, `${hostname()}.jsonl`);
  const chunk = Math.min(lanes, jobs.length), from = performance.now();
  let done = 0;
  mkdirSync(folder, { recursive: true });
  console.log(`playing on ${lanes} workers at ${commit ?? "no commit"}${changed ? " with build inputs changed" : ""}; stop it by its PID (${process.pid}) and run it again to go on`);
  await workerJobs(jobs, { lanes, create: () => simulationWorker(new URL("./record-worker.mjs", import.meta.url)),
    result: ({ result }, job) => {
      const row = each(result, job, commit);
      appendFileSync(file, rowText({ key: job.key, ...row, commit, changed, date: new Date().toISOString() }) + "\n");
      done++;
      const seconds = (performance.now() - from) / 1000;
      console.log(`${job.key}: ${row.roots.length} roots, ${row.end.toFixed(1)} s (${done} of ${jobs.length})`);
      if (done === chunk && jobs.length > chunk) {
        const each = seconds / chunk * lanes, rest = (jobs.length - done) * each / lanes;
        console.log(`the price, from the first ${chunk}: ${(each).toFixed(0)} worker-seconds a bout, so about ${(rest / 60).toFixed(0)} min more for the other ${jobs.length - done}`);
      }
      return null;
    } });
  console.log(`played ${jobs.length} bouts in ${((performance.now() - from) / 60000).toFixed(1)} min`);
}
