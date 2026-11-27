/**
 * **The forked record's measured runs, as its readers read them** (`run-sureness.mjs`, its step 4;
 * `run-models.mjs`, its step 5): a matchup's bank's `runs.jsonl` (`fork-bank.mjs`) by state, and
 * each quantity a run measures beside what its model says of it.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { bankOf } from "./record.mjs";
import { MEASURE } from "../rollouts.mjs";

/** Each state's forks under these settings and the measure in hand (`MEASURE`), every line of it together, by its save; it fails where the bank at `commit` has none. */
export function runsOf(ids, commit, { cap, until, nudge }) {
  const file = join(bankOf([ids[0], ids[1] ?? ids[0]], commit), "runs.jsonl");
  if (!existsSync(file)) throw new Error(`no runs of this matchup's bank at ${commit}`);
  const states = new Map();
  for (const line of readFileSync(file, "utf8").split("\n").filter(Boolean).map((text) => JSON.parse(text))) {
    if (line.measure !== MEASURE || line.cap !== cap || line.until !== until || line.nudge !== nudge) continue;
    const state = states.get(line.file) ?? states.set(line.file, { ...line, forks: [] }).get(line.file);
    state.forks.push(...line.forks);
  }
  return states;
}

export const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
export const variance = (xs) => { const m = mean(xs); return xs.reduce((a, x) => a + (x - m) ** 2, 0) / Math.max(1, xs.length - 1); };
export const quantile = (xs, q) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : NaN; };
export const median = (xs) => quantile(xs, .5);
/** An angle brought within a half turn either way. */
export const turn = (a) => Math.atan2(Math.sin(a), Math.cos(a));
/** The mean direction of angles. */
const circularMean = (as) => Math.atan2(mean(as.map(Math.sin)), mean(as.map(Math.cos)));

/** What the model's ends say of `key`, weighed by their chances. An end that does not name it leaves it as it was (`Leaves`), `start`. */
const expected = (predicted, key, start) => predicted.outcomes.reduce((a, o) => a + o.chance * (o[key] ?? start), 0) / predicted.outcomes.reduce((a, o) => a + o.chance, 0);
const strikes = (predicted) => predicted?.kind === "strike";
/** Which runs a quantity reads: those read at an end; those that ended of themselves (not cut at the cap or the verdict); those not cut at the cap (a knockout's life counts). */
const AT_END = (run) => run.to !== null, ENDED = (run) => run.to !== null && run.ended !== "cap" && run.ended !== "verdict", NOT_CAPPED = (run) => run.ended !== "cap";

/**
 * **Each quantity a run measures**: which runs it reads (`reads`), what it measured (`of`; null
 * where it does not say), what its model said (`model`; null where it says nothing of it), and
 * whether it is an angle (`circular`: read about its state's mean direction, and its distances
 * wrapped), and the least error worth telling from none (`floor`: an Option's runs alike under
 * every nudge have no noise, and a model a hair off them is not wrong by more than the nudges).
 * - The life dealt over a run is all the body dealt, its free limbs' blows too, so it is read for
 *   strikes alone. Life is the bars', so the end rules' drain is not in it.
 * - The model's life is over its own seconds and a run's over its own, so the life a second is
 *   read beside it.
 * - An open Option runs as long as the fork holds it, so its seconds are not read.
 * - A model's bearing is read only where none of its ends moves the body without saying its
 *   bearing: there the search reckons it afresh from where the foe is then (`placedWith`).
 */
export const QUANTITIES = {
  "seconds, not open": { floor: .05, reads: ENDED, of: (run, p) => p && !p.open ? run.seconds : null, model: (p) => p.duration },
  "life taken": { floor: .005, reads: NOT_CAPPED, of: (run) => run.taken, model: (p) => p.taken },
  "life taken a second": { floor: .005, reads: NOT_CAPPED, of: (run) => run.seconds > 0 ? run.taken / run.seconds : null, model: (p) => p.duration > 0 ? p.taken / p.duration : null },
  "life dealt, strikes": { floor: .005, reads: NOT_CAPPED, of: (run, p) => strikes(p) ? run.dealt : null, model: (p) => p.dealt },
  "landed, strikes": { floor: .1, reads: NOT_CAPPED, of: (run, p) => strikes(p) ? (run.dealt > 0 ? 1 : 0) : null, model: () => null },
  "x at its end, m": { floor: .03, reads: AT_END, of: (run) => run.to.x, model: (p, run) => expected(p, "x", run.from.x) },
  "z at its end, m": { floor: .03, reads: AT_END, of: (run) => run.to.z, model: (p, run) => expected(p, "z", run.from.z) },
  "heading turned, rad": { floor: .05, reads: AT_END, circular: true, of: (run) => turn(run.to.face - run.from.face), model: (p, run) => turn(expected(p, "face", run.from.face) - run.from.face) },
  "bearing around the foe, rad": { floor: .1, reads: AT_END, circular: true, of: (run) => run.to.around,
    model: (p, run) => p.outcomes.some((o) => o.x !== undefined && o.around === undefined) ? null : expected(p, "around", run.from.around) },
  "range at its end, m": { floor: .03, reads: AT_END, of: (run) => run.to.range, model: () => null },
  "velocity x at its end, m/s": { floor: .05, reads: AT_END, of: (run) => run.to.vx, model: (p, run) => expected(p, "vx", run.from.vx) },
  "velocity z at its end, m/s": { floor: .05, reads: AT_END, of: (run) => run.to.vz, model: (p, run) => expected(p, "vz", run.from.vz) },
  "standing at its end": { floor: .1, reads: AT_END, of: (run) => run.to.posture === "standing" ? 1 : 0,
    model: (p, run) => p.outcomes.reduce((a, o) => a + o.chance * ((o.posture ?? run.from.posture) === "standing" ? 1 : 0), 0) / p.outcomes.reduce((a, o) => a + o.chance, 0) },
};

/** How far `a` is from `b` in `quantity`, signed: wrapped for an angle. */
export const apartIn = (quantity, a, b) => quantity.circular ? turn(a - b) : a - b;

/**
 * A state's table for `quantity`: a row an Option taken under every nudge the state was forked
 * under whose runs the quantity reads, with its readings (`values`, in the nudges' order; an angle
 * unwrapped about the state's mean direction, so its means and spreads are an angle's) and its
 * first fork. Twins (runs alike under every nudge, as one run by two navigators) once. With the
 * nudges' count. With `some`, a row holds the runs the quantity reads however many of the nudges
 * they are (one or more): where only the Option's mean is read, as against its model, a run cut at
 * the cap or the verdict then leaves its row in and the long runs are not read the shorter.
 */
export function tableOf(state, quantity, { some = false } = {}) {
  const trials = [...new Set(state.forks.map((fork) => fork.trial))].sort((a, b) => a - b);
  const byKey = new Map();
  for (const fork of state.forks) (byKey.get(fork.key) ?? byKey.set(fork.key, new Map()).get(fork.key)).set(fork.trial, fork);
  const rows = [], seen = new Set();
  for (const row of byKey.values()) {
    const read = trials.filter((t) => row.get(t)?.run && quantity.reads(row.get(t).run));
    if (some ? read.length === 0 : read.length < trials.length) continue;
    const values = read.map((t) => quantity.of(row.get(t).run, row.get(t).predicted));
    const twin = JSON.stringify(trials.map((t) => row.get(t).run));
    if (values.some((v) => v === null || !Number.isFinite(v)) || seen.has(twin)) continue;
    seen.add(twin);
    rows.push({ values, fork: row.get(read[0]) });
  }
  if (quantity.circular && rows.length) {
    const centre = circularMean(rows.flatMap((row) => row.values));
    for (const row of rows) row.values = row.values.map((v) => centre + turn(v - centre));
  }
  return { trials: trials.length, rows };
}

/** What `fork`'s model said of `quantity`, where it said; null where not. */
export function saidOf(fork, quantity) {
  const said = fork.predicted && quantity.model(fork.predicted, fork.run);
  return said !== null && said !== undefined && Number.isFinite(said) ? said : null;
}
