/**
 * **The forked record's bank** (its step 2): decision states of one matchup's bouts, each kept as a
 * save, for `fork-bank.mjs` to fork once for each Option on offer.
 *
 *   node research/minds/bank.mjs <entrant> [<entrant>] --every <n> [--protocol measuring] [--bouts <n>] [--workers N]
 *
 * It plays the matchup's bouts on the tournament's `--protocol` (the first `--bouts` of them, else
 * all) as the measuring command does (`measure.mjs`), so each bout's row goes into the fight record
 * (`record.mjs`), a newer row beside any older one of it. Of each side's decisions made afresh with
 * an Option to take, every `--every`th is kept (`record-worker.mjs`'s `bank`): the bout's save
 * before the step it was made in, in `.cache/bank/<matchup>/<commit>/` (the last commit that changed
 * what the game computes, `gameCommit`), and a line in that folder's
 * `bank.jsonl` saying the bout, its side, its time, the save's step and poses, what was on offer
 * and what the Mind took. The record keeps no saves and replays only on the code that played it;
 * a save stands when the Mind changes after it.
 *
 * A bank is of one commit: it refuses to play with what the game computes from changed and not
 * committed (`gameChanged`). It plays only the bouts that commit's bank lacks, so a run stopped by
 * its PID goes on when run again, and goes on across commits that change nothing the game computes.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { defaultLanes } from "../../scripts/lanes.mjs";
import { bankOf, folderOf, gameChanged, gameCommit, keyOf, playRecord } from "./record.mjs";

const USAGE = "usage: node research/minds/bank.mjs <entrant> [<entrant>] --every <n> [--protocol measuring] [--bouts <n>] [--workers N]";
const { values: flags, positionals } = parseArgs({ allowPositionals: true, options: {
  every: { type: "string" }, protocol: { type: "string", default: "measuring" }, bouts: { type: "string" }, workers: { type: "string" },
} });
const every = Number(flags.every);
if (positionals.length < 1 || positionals.length > 2 || !(Number.isInteger(every) && every >= 1)) { console.error(USAGE); process.exit(1); }

await import("../../tests/harness/preload-data.mjs");
const { EVALUATIONS } = await import("../../src/app/node/evaluation.ts");

const commit = gameCommit(), changed = gameChanged();
if (changed.length) throw new Error(`a bank is of one commit: commit ${changed.join(", ")} first`);
const tournament = EVALUATIONS.tournament, cases = tournament.protocols[flags.protocol];
if (!cases) throw new Error(`the tournament has no protocol ${flags.protocol}`);
const entrants = positionals.map((id) => tournament.subjects([id])[0]);
const [a, b = a] = entrants, record = folderOf([a.id, b.id]), folder = bankOf([a.id, b.id], commit), index = join(folder, "bank.jsonl");
const count = flags.bouts === undefined ? cases.conditions.length : Number(flags.bouts);
const jobs = (a.id === b.id ? [[a, b]] : [[a, b], [b, a]]).flatMap(([left, right]) =>
  cases.conditions.slice(0, count).map((_, i) => ({ key: keyOf(flags.protocol, i, left.id, right.id), protocol: flags.protocol, index: i, entrants: [left, right],
    // A save is named by its bout: its place, and which entrant is on the left where they differ.
    bank: { every, folder, name: a.id === b.id ? `${i}` : `${i}-${left.id === a.id ? "a" : "b"}` } })));
const banked = new Set(existsSync(index) ? readFileSync(index, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line).key) : []);
const toPlay = jobs.filter((job) => !banked.has(job.key));
console.log(`the bank of ${a.id === b.id ? `${a.id}'s mirror` : `${a.id} against ${b.id}`} at ${commit}, every ${every}th decision: ${jobs.length} bouts, ${jobs.length - toPlay.length} banked, ${toPlay.length} to play`);
mkdirSync(folder, { recursive: true });
let states = 0;
if (toPlay.length) await playRecord(toPlay, { folder: record, lanes: flags.workers ? Number(flags.workers) : defaultLanes(), each: ({ banked, ...row }, job) => {
  // A bout's saves are all written before its lines, so a bout in the index is whole.
  appendFileSync(index, banked.map((state) => JSON.stringify({ key: job.key, protocol: job.protocol, index: job.index, ...state }) + "\n").join("") || `${JSON.stringify({ key: job.key, none: true })}\n`);
  states += banked.length;
  return row;
} });
console.log(`banked ${states} states in ${folder}`);
