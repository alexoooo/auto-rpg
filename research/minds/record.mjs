/**
 * **The fight record**: one row a bout, in one format that each fit reads (the measured-mind plan's
 * mechanism 1). The measuring command writes it (`research/minds/measure.mjs`), each bout played on
 * a worker that reads the Mind's decisions as it makes them (`record-worker.mjs`). A row holds:
 *
 * - `key`: the bout, as its protocol, its condition's place and the two entrants by side; the same
 *   key played again is a newer row beside the old (`--again`), the old counting for less (`weightsOf`).
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
 *   either side. What each Option did where the forked record forked a root's state is in its
 *   bank's `runs.jsonl` (`fork-bank.mjs`), found by the row's key, the side and `t`.
 *
 * Rows are kept in `.cache/record/<matchup>/<machine>.jsonl.gz`, outside Git: a matchup's folder is
 * every row of its two entrants, each machine's in its own file, so machines merge by copying. Each
 * row is compressed on its own and appended to the file in one write, so a run stopped by its PID
 * leaves only whole rows, and the file is read back as one stream. A file kept uncompressed
 * (`<machine>.jsonl`) is read as well. Once a play's rows are written, the rows that count for less
 * than an eighth are deleted (`keep`), so a matchup keeps about its last three plays.
 */
import { appendFileSync, createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import { once } from "node:events";
import { finished } from "node:stream/promises";
import { createGunzip, createGzip, gzipSync } from "node:zlib";
import { hostname } from "node:os";
import { execFileSync } from "node:child_process";
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

/** Where the record keeps its matchups' folders, and how many bytes they may hold before a play warns. */
export const RECORD = join(ROOT, ".cache/record"), RECORD_BUDGET = 1 << 30;

/** Where the forked record's banks are kept: a folder a matchup, and in it a folder a commit. */
export const BANKS = join(ROOT, ".cache/bank");

/** The folder a matchup's rows are kept in. */
export const folderOf = (entrants) => join(RECORD, matchupOf(entrants));

/** The folder the forked record's bank of a matchup keeps its states in at `commit` (`bank.mjs`), with the forks of them (`fork-bank.mjs`). */
export const bankOf = (entrants, commit) => join(BANKS, matchupOf(entrants), commit);

/** How many bytes `path` holds, everything under it counted. */
export const bytesIn = (path) => { const own = statSync(path); return own.isDirectory() ? readdirSync(path).reduce((sum, name) => sum + bytesIn(join(path, name)), 0) : own.size; };

/** What the game computes from, as a fork reads it: a bank is of the last commit that changed these. */
const GAME = Object.freeze(["src", "assets", "vendor/rapier", "tests/harness", "package.json", "package-lock.json"]);
const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" });

/** The last commit that changed what the game computes (`GAME`): a bank and its forks are of it, whatever commits came after that did not. */
export const gameCommit = () => git("log", "-1", "--format=%H", "--", ...GAME).trim();

/**
 * Whether the bank at `commit` is of a game a later commit changed: nothing forks its saves again
 * (`fork-bank.mjs` forks only `gameCommit`'s bank), though its rows are still read. Not where Git
 * does not know the commit, nor where it came after the commit in hand.
 */
export const bankStale = (commit) => {
  const now = gameCommit();
  if (commit === now) return false;
  try { execFileSync("git", ["merge-base", "--is-ancestor", commit, now], { cwd: ROOT, stdio: "ignore" }); return true; } catch { return false; }
};

/** The last commit that changed what the game computes as of each commit a row names; the commit itself where Git does not know it. */
const gameAt = new Map();
const gameCommitAt = (commit) => {
  if (!gameAt.has(commit)) {
    let at = commit;
    try { at = execFileSync("git", ["log", "-1", "--format=%H", commit, "--", ...GAME], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || commit; } catch { /* a commit this clone does not have */ }
    gameAt.set(commit, at);
  }
  return gameAt.get(commit);
};

/**
 * A row's play: the game it was played on (the last commit that changed what the game computes as
 * of its commit, or its commit itself where build inputs differed from it) and the Minds that
 * played it. A commit that changes nothing the game computes starts no new play.
 */
export const playOf = (row) => JSON.stringify([row.changed ? `${row.commit} changed` : gameCommitAt(row.commit), row.sides.left.played, row.sides.right.played]);

/** The least a row may count for and be kept (`keep`). */
export const LEAST = 1 / 8;

/**
 * **What each row counts for**, of a matchup's rows each given as `{ key, date, play }` (`playOf`):
 * half for each newer play of the matchup, whatever bouts that play was (a play is newer where its
 * first row is), and half again for each newer row of its own bout in its own play.
 */
export function weightsOf(rows) {
  const began = new Map(), dates = new Map();
  for (const { key, date, play } of rows) {
    if (!(began.get(play) <= date)) began.set(play, date);
    const bout = `${key}\n${play}`;
    (dates.get(bout) ?? dates.set(bout, []).get(bout)).push(date);
  }
  const starts = [...began.values()];
  return rows.map(({ key, date, play }) => 0.5 ** (starts.filter((start) => start > began.get(play)).length + dates.get(`${key}\n${play}`).filter((other) => other > date).length));
}

/** What the game computes from that differs from `gameCommit` or is untracked, each as `git status` names it. */
export const gameChanged = () => git("status", "--porcelain", "--untracked-files=all", "--", ...GAME).split("\n").filter((line) => line.length > 3);

/** Every file of rows in `folder`, compressed (`.jsonl.gz`) or not (`.jsonl`), by name. */
const filesIn = (folder) => existsSync(folder) ? readdirSync(folder).filter((name) => /.jsonl(.gz)?$/.test(name)).sort().map((name) => join(folder, name)) : [];

/** Each line of `file`, as it is read: a compressed file's members one stream. */
const linesOf = (file) => createInterface({ input: file.endsWith(".gz") ? createReadStream(file).pipe(createGunzip()) : createReadStream(file), crlfDelay: Infinity });

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

/**
 * **Keep `folder`'s rows that count for `LEAST` or more** (`weightsOf`), the rest deleted, and
 * every file of them compressed: a machine's uncompressed file and its compressed one become one
 * compressed file. A file is written beside itself and then moved into place, so a run stopped
 * meanwhile leaves the rows as they were. One stopped between the move and deleting the plain file
 * leaves those rows twice: a row of the same bout and time as one before it is deleted as its
 * copy. It gives how many rows it kept and deleted.
 */
export async function keep(folder) {
  const rows = [], at = (file, line) => `${file}\n${line}`;
  for (const file of filesIn(folder)) {
    let line = 0;
    for await (const text of linesOf(file)) if (text) { const row = JSON.parse(text); rows.push({ file, line: line++, key: row.key, date: row.date, play: playOf(row) }); }
  }
  const weights = weightsOf(rows), seen = new Set();
  const copy = ({ key, date }) => seen.has(at(key, date)) || !seen.add(at(key, date));
  const deleted = new Set(rows.filter((row, i) => copy(row) || weights[i] < LEAST).map(({ file, line }) => at(file, line)));
  const machines = new Map();
  for (const file of filesIn(folder)) { const stem = file.replace(/\.jsonl(\.gz)?$/, ""); (machines.get(stem) ?? machines.set(stem, []).get(stem)).push(file); }
  for (const [stem, files] of machines) {
    if (files.every((file) => file.endsWith(".gz")) && !rows.some(({ file, line }) => files.includes(file) && deleted.has(at(file, line)))) continue;
    const to = `${stem}.jsonl.gz`, part = `${to}.part`, gzip = createGzip(), out = createWriteStream(part);
    gzip.pipe(out);
    for (const file of files) {
      let line = 0;
      for await (const text of linesOf(file)) if (text && !deleted.has(at(file, line++)) && !gzip.write(text + "\n")) await once(gzip, "drain");
    }
    gzip.end();
    await finished(out);
    renameSync(part, to);
    for (const file of files) if (file !== to) rmSync(file);
  }
  return { kept: rows.length - deleted.size, deleted: deleted.size };
}

/** A row as written: its numbers to four places, so a row is about half as long, and its key first. */
export const rowText = (row) => JSON.stringify(row, (_, v) => typeof v === "number" && !Number.isInteger(v) ? Math.round(v * 1e4) / 1e4 : v);

/**
 * **Play `jobs`, bouts for the record**, on `lanes` workers of `record-worker.mjs`, each row
 * appended compressed to `folder`'s file for this machine as it comes, with the commit it was played on;
 * the price said from the first chunk. `each(result, job, commit)` sees each worker's answer first
 * and gives the bout's row of it (a worker may answer more than the row, as the bank's saves). Then
 * the rows that count for too little are deleted (`keep`), and it warns where the record holds more
 * than `RECORD_BUDGET`.
 */
export async function playRecord(jobs, { folder, lanes, each = (result) => result }) {
  const commit = commitOf(), changed = (commit ? uncommittedInputs() : []).length > 0, file = join(folder, `${hostname()}.jsonl.gz`);
  const chunk = Math.min(lanes, jobs.length), from = performance.now();
  let done = 0;
  mkdirSync(folder, { recursive: true });
  console.log(`playing on ${lanes} workers at ${commit ?? "no commit"}${changed ? " with build inputs changed" : ""}; stop it by its PID (${process.pid}) and run it again to go on`);
  await workerJobs(jobs, { lanes, create: () => simulationWorker(new URL("./record-worker.mjs", import.meta.url)),
    result: ({ result }, job) => {
      const row = each(result, job, commit);
      appendFileSync(file, gzipSync(rowText({ key: job.key, ...row, commit, changed, date: new Date().toISOString() }) + "\n"));
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
  const { kept, deleted } = await keep(folder), bytes = bytesIn(RECORD);
  console.log(`the matchup keeps ${kept} rows${deleted ? `, ${deleted} deleted as counting for less than ${LEAST}` : ""}; the record holds ${(bytes / 2 ** 20).toFixed(0)} MiB`);
  if (bytes > RECORD_BUDGET) console.log(`warning: the record holds more than its budget of ${(RECORD_BUDGET / 2 ** 20).toFixed(0)} MiB (npm run clean lists it by matchup)`);
}
