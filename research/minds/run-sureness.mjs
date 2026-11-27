/**
 * **How sure a measured run is** (the forked record's step 4), read before any fit uses one: for
 * the runs of a matchup's bank (`fork-bank.mjs`'s `runs.jsonl`), each quantity a run measures, how
 * much of it is which Option was taken and how much the nudge, and how far the Options' models
 * are from it.
 *
 *   node research/minds/run-sureness.mjs <entrant> [<entrant>] [--commit <sha>] [--cap 3] [--until 1] [--nudge 0.5]
 *
 * It reads the runs of the bank at `--commit` (the last that changed what the game computes,
 * `gameCommit`, unless named) under those settings. At a state it compares the Options taken and
 * run to an end under every nudge the state was forked under (rule 5: alike nudges only), twins
 * (alike under every nudge, as one run by two navigators) counted once. For each quantity it
 * prints, over those states:
 * - `between`: the median share of its variance at a state that lies between the Options rather
 *   than across the nudges;
 * - `halves`: how well an Option's mean over half the nudges, less its state's mean, foretells
 *   the same over the other half, as a correlation over every Option of every state;
 * - `noise` and `gaps`: the median spread of an Option's mean over all the nudges, and of the
 *   Options' means at a state;
 * - `model`: the median distance from the Option's model, as its search asked it at the fork
 *   (`predicted`, its ends weighed by their chances), to the mean of what it did, where the model
 *   says.
 * And how many runs ended which way, and how many were cut at the cap or the verdict.
 *
 * The life dealt over a run is all the body dealt meanwhile, its free limbs' blows too, so it is
 * the Option's own only where the Option strikes; it is read for strikes alone.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { bankOf, gameCommit } from "./record.mjs";

const USAGE = "usage: node research/minds/run-sureness.mjs <entrant> [<entrant>] [--commit <sha>] [--cap 3] [--until 1] [--nudge 0.5]";
const { values: flags, positionals } = parseArgs({ allowPositionals: true, options: {
  commit: { type: "string" }, cap: { type: "string", default: "3" }, until: { type: "string", default: "1" }, nudge: { type: "string", default: "0.5" },
} });
if (positionals.length < 1 || positionals.length > 2) { console.error(USAGE); process.exit(1); }
const cap = Number(flags.cap), until = Number(flags.until), nudge = Number(flags.nudge);

await import("../../tests/harness/preload-data.mjs");
const { EVALUATIONS } = await import("../../src/app/node/evaluation.ts");
const ids = positionals.map((id) => EVALUATIONS.tournament.subjects([id])[0].id);
const commit = flags.commit ?? gameCommit(), file = join(bankOf([ids[0], ids[1] ?? ids[0]], commit), "runs.jsonl");
if (!existsSync(file)) throw new Error(`no runs of this matchup's bank at ${commit}`);
const states = new Map();
for (const line of readFileSync(file, "utf8").split("\n").filter(Boolean).map((text) => JSON.parse(text))) {
  if (line.cap !== cap || line.until !== until || line.nudge !== nudge) continue;
  const state = states.get(line.file) ?? states.set(line.file, { ...line, forks: [] }).get(line.file);
  state.forks.push(...line.forks);
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const variance = (xs) => { const m = mean(xs); return xs.reduce((a, x) => a + (x - m) ** 2, 0) / Math.max(1, xs.length - 1); };
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[s.length >> 1] : NaN; };
const turn = (a) => Math.atan2(Math.sin(a), Math.cos(a));
/** What the model's ends say of `key`, weighed by their chances; null where none of them says. */
const expected = (predicted, key) => {
  const saying = predicted.outcomes.filter((outcome) => outcome[key] !== undefined), chance = saying.reduce((a, o) => a + o.chance, 0);
  return chance > 0 ? saying.reduce((a, o) => a + o.chance * o[key], 0) / chance : null;
};
const strikes = (predicted) => predicted?.kind === "strike";

/**
 * Each quantity: what a run measured of it (null where it does not say), what its model said
 * (null where it does not), and how far apart two of them are.
 */
const QUANTITIES = {
  "seconds": { of: (run) => run.seconds, model: (p) => p.duration },
  "life taken": { of: (run) => run.taken, model: (p) => p.taken },
  "life dealt, strikes": { of: (run, p) => strikes(p) ? run.dealt : null, model: (p) => p.dealt },
  "landed, strikes": { of: (run, p) => strikes(p) ? (run.dealt > 0 ? 1 : 0) : null, model: () => null },
  "x at its end, m": { of: (run) => run.to.x, model: (p) => expected(p, "x") },
  "z at its end, m": { of: (run) => run.to.z, model: (p) => expected(p, "z") },
  "heading turned, rad": { of: (run) => turn(run.to.face - run.from.face), model: (p, run) => { const face = expected(p, "face"); return face === null ? null : turn(face - run.from.face); } },
  "bearing around the foe, rad": { of: (run) => run.to.around, model: (p) => expected(p, "around"), apart: (a, b) => Math.abs(turn(a - b)) },
  "range at its end, m": { of: (run) => run.to.range, model: () => null },
  "speed at its end, m/s": { of: (run) => Math.hypot(run.to.vx, run.to.vz), model: (p) => { const x = expected(p, "vx"), z = expected(p, "vz"); return x === null || z === null ? null : Math.hypot(x, z); } },
  "standing at its end": { of: (run) => run.to.posture === "standing" ? 1 : 0, model: (p) => { const said = p.outcomes.filter((o) => o.posture !== undefined); return said.length ? said.reduce((a, o) => a + o.chance * (o.posture === "standing" ? 1 : 0), 0) / said.reduce((a, o) => a + o.chance, 0) : null; } },
};

const forks = [...states.values()].flatMap((state) => state.forks), runs = forks.filter((fork) => fork.run);
const endings = new Map();
for (const { run } of runs) endings.set(run.ended, (endings.get(run.ended) ?? 0) + 1);
console.log(`${states.size} states of the bank at ${commit}, ${forks.length} forks, ${runs.length} taken; each to its exit or ${cap} s, an open one held ${until} s, ${nudge} N s`);
console.log(`ended: ${[...endings].sort((a, b) => b[1] - a[1]).map(([how, n]) => `${how} ${n}`).join(", ")}; ${runs.filter((fork) => fork.run.to).length} read at an end`);
console.log(`model asked at the fork for ${runs.filter((fork) => fork.predicted).length} of ${runs.length}`);

console.log("\nquantity                          states  between  halves  noise    gaps     model (median distance, Options)");
for (const [name, quantity] of Object.entries(QUANTITIES)) {
  const apart = quantity.apart ?? ((a, b) => Math.abs(a - b));
  const shares = [], noises = [], gaps = [], firsts = [], seconds = [], errors = [];
  for (const state of states.values()) {
    const trials = [...new Set(state.forks.map((fork) => fork.trial))].sort((a, b) => a - b);
    const byKey = new Map();
    for (const fork of state.forks) (byKey.get(fork.key) ?? byKey.set(fork.key, new Map()).get(fork.key)).set(fork.trial, fork);
    const rows = [], seen = new Set();
    for (const row of byKey.values()) {
      if (!trials.every((t) => row.get(t)?.run?.to)) continue;
      const values = trials.map((t) => quantity.of(row.get(t).run, row.get(t).predicted));
      if (values.some((v) => v === null || !Number.isFinite(v)) || seen.has(JSON.stringify(values))) continue;
      seen.add(JSON.stringify(values));
      rows.push({ values, fork: row.get(trials[0]) });
    }
    if (trials.length < 2) continue;
    // The model against the mean of what was done, an Option at a time, wherever there is one.
    for (const { values, fork } of rows) {
      const said = fork.predicted && quantity.model(fork.predicted, fork.run);
      if (said !== null && said !== undefined && Number.isFinite(said)) errors.push(apart(said, mean(values)));
    }
    if (rows.length < 2) continue;
    const within = mean(rows.map((row) => variance(row.values))), total = variance(rows.flatMap((row) => row.values));
    if (total > 0) shares.push(Math.max(0, 1 - within / total));
    noises.push(Math.sqrt(within / trials.length));
    gaps.push(Math.sqrt(variance(rows.map((row) => mean(row.values)))));
    const half = trials.length >> 1, centre = (part) => { const means = rows.map((row) => mean(part(row.values))), m = mean(means); return means.map((x) => x - m); };
    firsts.push(...centre((v) => v.slice(0, half))); seconds.push(...centre((v) => v.slice(half, 2 * half)));
  }
  const ma = mean(firsts), mb = mean(seconds), r = firsts.reduce((a, x, k) => a + (x - ma) * (seconds[k] - mb), 0) / Math.sqrt(firsts.reduce((a, x) => a + (x - ma) ** 2, 0) * seconds.reduce((a, x) => a + (x - mb) ** 2, 0));
  const fixed = (x) => Number.isFinite(x) ? x.toFixed(3).padStart(7) : "      -";
  console.log(`${name.padEnd(33)} ${String(shares.length).padStart(6)}  ${shares.length ? `${(100 * median(shares)).toFixed(0)} %`.padStart(6) : "     -"}  ${fixed(r)} ${fixed(median(noises))}  ${fixed(median(gaps))}  ${errors.length ? `${fixed(median(errors))} (${errors.length})` : "      -"}`);
}
