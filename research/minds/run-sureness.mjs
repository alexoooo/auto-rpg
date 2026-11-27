/**
 * **How sure a measured run is** (the forked record's step 4), read before any fit uses one: for
 * the runs of a matchup's bank (`fork-bank.mjs`'s `runs.jsonl`), each quantity a run measures
 * (`QUANTITIES`, `runs.mjs`), how much of it is which Option was taken and how much the nudge,
 * and how far the Options' models are from it.
 *
 *   node research/minds/run-sureness.mjs <entrant> [<entrant>] [--commit <sha>] [--cap 6] [--until 1] [--nudge 0.5]
 *
 * It reads the runs of the bank at `--commit` (the last that changed what the game computes,
 * `gameCommit`, unless named) under those settings and the measure in hand. At a state it
 * compares the Options taken under every nudge the state was forked under whose runs the quantity
 * reads (rule 5: alike nudges only), twins once (`tableOf`). For each quantity it prints, over
 * those states:
 * - `between`: the median share of its variance at a state that lies between the Options rather
 *   than across the nudges;
 * - `noise/gap`: at each state, the noise of an Option's mean over all the nudges (their spread
 *   over the root of their count, pooled over the state's Options) over the spread of the
 *   Options' means there: its median and its 90th percentile over the states. Below 1, a state's
 *   Options are told apart by their means;
 * - `model`: the median distance from the Option's model, as its search asked it at the fork
 *   (its ends weighed by their chances), to the mean of what it did, over every Option of every
 *   state the model says it of; and the share of those whose model is more than twice its mean's
 *   noise away, so wrong by more than the nudges account for.
 * Before them, how the runs ended, and why those that ended over or were dropped did: what the
 * Option said of itself there (`run.why`).
 */
import { parseArgs } from "node:util";
import { gameCommit } from "./record.mjs";
import { QUANTITIES, apartIn, mean, median, quantile, runsOf, saidOf, tableOf, variance } from "./runs.mjs";

const USAGE = "usage: node research/minds/run-sureness.mjs <entrant> [<entrant>] [--commit <sha>] [--cap 6] [--until 1] [--nudge 0.5]";
const { values: flags, positionals } = parseArgs({ allowPositionals: true, options: {
  commit: { type: "string" }, cap: { type: "string", default: "6" }, until: { type: "string", default: "1" }, nudge: { type: "string", default: "0.5" },
} });
if (positionals.length < 1 || positionals.length > 2) { console.error(USAGE); process.exit(1); }
const settings = { cap: Number(flags.cap), until: Number(flags.until), nudge: Number(flags.nudge) };

await import("../../tests/harness/preload-data.mjs");
const { EVALUATIONS } = await import("../../src/app/node/evaluation.ts");
const ids = positionals.map((id) => EVALUATIONS.tournament.subjects([id])[0].id), commit = flags.commit ?? gameCommit();
const states = runsOf(ids, commit, settings);

const forks = [...states.values()].flatMap((state) => state.forks), runs = forks.filter((fork) => fork.run);
const tally = (keys) => { const counts = new Map(); for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1); return [...counts].sort((a, b) => b[1] - a[1]); };
console.log(`${states.size} states of the bank at ${commit}, ${forks.length} forks, ${runs.length} taken; each to its end or ${settings.cap} s, an open one held ${settings.until} s, ${settings.nudge} N s`);
console.log(`ended: ${tally(runs.map((fork) => fork.run.ended)).map(([how, n]) => `${how} ${n}`).join(", ")}; ${runs.filter((fork) => fork.run.to).length} read at an end`);
console.log(`model asked at the fork for ${runs.filter((fork) => fork.predicted).length} of ${runs.length}`);
console.log("why runs ended over or were dropped (kind, ending: its status, its entry):");
for (const [why, n] of tally(runs.filter((fork) => fork.run.why).map(({ run, predicted }) => `${predicted?.kind} ${run.ended}: ${run.why.status}, ${run.why.entry}`))) console.log(`  ${String(n).padStart(5)}  ${why}`);

const fixed = (x) => Number.isFinite(x) ? x.toFixed(3).padStart(7) : "      -";
const percent = (x) => (Number.isFinite(x) ? `${(100 * x).toFixed(0)} %` : "-").padStart(6);
console.log("\nquantity                          states  between   noise/gap: median    90th   model: median distance, beyond noise (Options)");
for (const [name, quantity] of Object.entries(QUANTITIES)) {
  const shares = [], ratios = [], errors = [];
  let beyond = 0;
  for (const state of states.values()) {
    const { trials, rows } = tableOf(state, quantity);
    if (trials < 2) continue;
    for (const { values, fork } of rows) {
      const said = saidOf(fork, quantity);
      if (said === null) continue;
      const error = Math.abs(apartIn(quantity, said, mean(values)));
      errors.push(error);
      if (error > 2 * Math.sqrt(variance(values) / trials) + 1e-9) beyond++;
    }
    if (rows.length < 2) continue;
    const within = mean(rows.map((row) => variance(row.values))), total = variance(rows.flatMap((row) => row.values)), gap = Math.sqrt(variance(rows.map((row) => mean(row.values))));
    if (total > 0) shares.push(Math.max(0, 1 - within / total));
    if (gap > 0) ratios.push(Math.sqrt(within / trials) / gap);
  }
  console.log(`${name.padEnd(33)} ${String(ratios.length).padStart(6)}  ${percent(median(shares))}              ${fixed(median(ratios))} ${fixed(quantile(ratios, .9))}   ${errors.length ? `${fixed(median(errors))}, ${percent(beyond / errors.length)} (${errors.length})` : "      -"}`);
}
