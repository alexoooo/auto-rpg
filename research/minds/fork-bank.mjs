/**
 * **The forked record's forks** (its steps 2 and 3): each state of a matchup's bank (`bank.mjs`)
 * forked once for each Option on offer there, under each of the same nudges.
 *
 *   node research/minds/fork-bank.mjs <entrant> [<entrant>] [--hold] [--horizon 4] [--every 1] [--nudges 4] [--nudge 0.5] [--states N] [--workers N]
 *
 * It reads the bank of the last commit that changed what the game computes (`gameCommit`), so it
 * refuses with that changed and not committed (`gameChanged`); each line names the commit it was
 * forked at.
 * Each state is loaded from its save and played `--horizon` s on, once for each Option the side
 * had on offer there (its key: its place in the Mind's Options and its target) under each of
 * `--nudges` nudges of `--nudge` N s (`nudgesOf`, the same for every Option of the state, rule 5),
 * the side's Mind taking that Option at its first decision and then deciding as it always does,
 * the other's as it always does (`rollout`'s `option`); with `--hold`, taking it again at each
 * decision it runs on to, so it runs to its exit as a search's line runs it (an open one not held). Each fork keeps what the side met
 * (`rollout`'s `watch`): the lives, how long the Option ran, and the side's reading at its first
 * search, at the Option's end and every `--every` s.
 *
 * Its rows are a line a state in the bank's `forks.jsonl`: the state (its bout's key, side, time
 * and save), the settings, and each fork's key, name, nudge, whether it was taken, and what it met.
 * A state is forked under nudges it has no line of, so a run stopped by its PID goes on when run
 * again, and more nudges are added by asking for more. `--states` forks only that many states
 * more, in an order drawn once, so any first few are spread over the bank. Its price is said from its first batch: forks a state, worker-seconds a fork and a state,
 * and states a night (8 h) on this machine's workers. It fails where a state's forks did not all
 * start on the bank's poses.
 */
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { deserialize } from "node:v8";
import { gunzipSync } from "node:zlib";
import { defaultLanes } from "../../scripts/lanes.mjs";
import { commitOf } from "../../scripts/build-identity.mjs";
import { rolloutPool } from "../rollout-pool.mjs";
import { nudgesOf } from "../rollouts.mjs";
import { bankOf, gameChanged, gameCommit } from "./record.mjs";

const USAGE = "usage: node research/minds/fork-bank.mjs <entrant> [<entrant>] [--hold] [--horizon 4] [--every 1] [--nudges 4] [--nudge 0.5] [--states N] [--workers N]";
const { values: flags, positionals } = parseArgs({ allowPositionals: true, options: {
  hold: { type: "boolean", default: false }, horizon: { type: "string", default: "4" }, every: { type: "string", default: "1" }, nudges: { type: "string", default: "4" }, nudge: { type: "string", default: "0.5" },
  states: { type: "string" }, workers: { type: "string" },
} });
if (positionals.length < 1 || positionals.length > 2) { console.error(USAGE); process.exit(1); }
const horizon = Number(flags.horizon), every = Number(flags.every), nudges = Number(flags.nudges), nudge = Number(flags.nudge);
const lanes = flags.workers ? Number(flags.workers) : defaultLanes(), HZ = 120;

await import("../../tests/harness/preload-data.mjs");
const { EVALUATIONS } = await import("../../src/app/node/evaluation.ts");
const { DEFAULT_ENGINE } = await import("../../src/core/physics/engines.ts");

const commit = gameCommit(), changed = gameChanged(), at = commitOf();
if (changed.length) throw new Error(`the forks are of the bank's commit: commit ${changed.join(", ")} first`);
const tournament = EVALUATIONS.tournament, entrants = positionals.map((id) => tournament.subjects([id])[0].id);
const folder = bankOf([entrants[0], entrants[1] ?? entrants[0]], commit), index = join(folder, "bank.jsonl"), out = join(folder, "forks.jsonl");
if (!existsSync(index)) throw new Error(`no bank of this matchup at ${commit}: node research/minds/bank.mjs first`);
const states = readFileSync(index, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line)).filter((state) => !state.none);
const hold = flags.hold, settings = { hold, horizon, every, nudge };
const same = (line) => (line.hold ?? false) === hold && line.horizon === horizon && line.every === every && line.nudge === nudge;
const done = new Map();
if (existsSync(out)) for (const line of readFileSync(out, "utf8").split("\n").filter(Boolean).map((text) => JSON.parse(text))) if (same(line))
  done.set(line.file, Math.max(done.get(line.file) ?? 0, line.trials[1]));
// In an order drawn from the saves' names, so the first states forked are spread over the bank's bouts and times.
const drawn = (name) => { let h = 2166136261; for (const c of name) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0; return h; };
const todo = states.filter((state) => (done.get(state.file) ?? 0) < nudges).sort((a, b) => drawn(a.file) - drawn(b.file))
  .slice(0, flags.states === undefined ? Infinity : Number(flags.states));
console.log(`forks of the bank at ${commit}: ${states.length} states, ${todo.length} to fork under nudges to ${nudges}${hold ? ", each Option held" : ""}; ${horizon} s on, ${nudge} N s, read every ${every} s, on ${lanes} workers`);

const pool = rolloutPool(lanes), began = performance.now();
let forked = 0, statesForked = 0, failed = 0, taken = 0, refused = 0;
try {
  // Batches of states, so a state's line is written whole and the price is said early.
  for (let b = 0; b < todo.length; b += lanes) {
    const batch = todo.slice(b, b + lanes), from = performance.now();
    const jobs = batch.flatMap((state) => {
      const save = deserialize(gunzipSync(readFileSync(join(folder, state.file)))), engine = EVALUATIONS.tournament.protocols[state.protocol].engine ?? DEFAULT_ENGINE;
      const trials = [done.get(state.file) ?? 0, nudges];
      state.trials = trials;
      return Array.from({ length: trials[1] - trials[0] }, (_, k) => trials[0] + k).flatMap((trial) => state.offered.map(([i, target, name]) => ({
        state, trial, key: `${i}:${target}`, name,
        job: { recipe: save.recipe, save, from: state.from, steps: Math.round(horizon * HZ), engine, nudges: nudgesOf(state.from, trial, nudge),
          option: { side: state.side, key: `${i}:${target}`, hold }, watch: { side: state.side, every } },
      })));
    });
    const rows = await pool.run(jobs.map(({ job }) => job));
    for (const state of batch) {
      const forks = jobs.flatMap((fork, k) => fork.state === state ? [{ key: fork.key, name: fork.name, trial: fork.trial, row: rows[k] }] : []);
      const astray = forks.filter(({ row }) => row.at !== state.at).length;
      if (astray) { failed++; console.log(`${state.key} ${state.side} at ${state.t.toFixed(3)} s: ${astray} of ${forks.length} forks did not start on the bank's poses`); }
      for (const { row } of forks) row.chose?.taken ? taken++ : refused++;
      appendFileSync(out, JSON.stringify({ commit: at, key: state.key, side: state.side, t: state.t, time: state.time, from: state.from, file: state.file, pick: state.pick, ...settings, trials: state.trials,
        forks: forks.map(({ key, name, trial, row }) => ({ key, name, trial, chose: row.chose, steps: row.steps - state.from, verdict: row.verdict, out: row.out, watched: row.watched })) }, round) + "\n");
      forked += forks.length; statesForked++;
    }
    if (b === 0) {
      const seconds = (performance.now() - from) / 1000, perFork = seconds * lanes / jobs.length, perState = seconds * lanes / batch.length;
      console.log(`the price, from the first ${batch.length} states: ${(jobs.length / batch.length).toFixed(1)} forks a state, ${perFork.toFixed(2)} worker-seconds a fork, ${perState.toFixed(0)} a state; `
        + `${Math.floor(8 * 3600 * lanes / perState)} states a night on ${lanes} workers; about ${((todo.length - batch.length) * perState / lanes / 3600).toFixed(1)} h more for the other ${todo.length - batch.length}`);
    } else console.log(`${statesForked} of ${todo.length} states, ${forked} forks, ${((performance.now() - began) / 60000).toFixed(1)} min`);
  }
} finally { await pool.close(); }
console.log(`forked ${statesForked} states, ${forked} forks (${taken} taken, ${refused} refused) in ${((performance.now() - began) / 60000).toFixed(1)} min; ${failed} states astray`);
if (failed) process.exitCode = 1;

/** Numbers to four places, as the record's rows (`rowText`). */
function round(_, v) { return typeof v === "number" && !Number.isInteger(v) ? Math.round(v * 1e4) / 1e4 : v; }
