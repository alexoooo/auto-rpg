/**
 * **How sure a forked label is** (the forked record's step 4), read before any fit uses one: for the
 * forks of a matchup's bank (`fork-bank.mjs`), at each horizon they were read at, how far a forked
 * worth (`forked-worth.mjs`) spreads across the nudges of one Option at one state, against the gaps
 * between the Options at that state; and whether the best Option by some nudges is the best by
 * others.
 *
 *   node research/minds/fork-sureness.mjs <entrant> [<entrant>] [--commit <sha>] [--hold] [--horizon 4] [--every 1] [--nudge 0.5]
 *
 * It reads the forks of the bank (held where `--hold` says, `fork-bank.mjs`) at `--commit` (the
 * last that changed what the game computes, `gameCommit`, unless named) under those settings. At a
 * state it compares the Options taken, and read, under every nudge it was forked under (rule 5:
 * alike nudges only). For each horizon it prints, over the states with two or more such Options:
 * the median spread (each Option's standard deviation across nudges, pooled at the state), the
 * median spread of the distinct Options' means and the gap from the best to the next; how much of
 * the variance of a single fork's worth lies between Options; and, for each count of nudges n that
 * two disjoint sets of n can be drawn from, the share of states where the two sets' best is the
 * same Option or its twin (alike under every nudge, as one run by two navigators), beside chance
 * among the distinct ones; and what the first set's best gains over an Option drawn at random,
 * judged by the other set at the longest horizon read: its median, 10th and 90th percentiles, and
 * how often it gains or loses. A worth read early is mostly the fitted value's reading of where the
 * fork is then, so a label is worth what it predicts of later play, not how well it agrees with
 * itself. It also says what the forks did: how many Options were taken, and how long one ran
 * before it ended or the Mind let it go.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { bankOf, gameCommit } from "./record.mjs";

const USAGE = "usage: node research/minds/fork-sureness.mjs <entrant> [<entrant>] [--commit <sha>] [--hold] [--horizon 4] [--every 1] [--nudge 0.5]";
const { values: flags, positionals } = parseArgs({ allowPositionals: true, options: {
  commit: { type: "string" }, hold: { type: "boolean", default: false }, horizon: { type: "string", default: "4" }, every: { type: "string", default: "1" }, nudge: { type: "string", default: "0.5" },
} });
if (positionals.length < 1 || positionals.length > 2) { console.error(USAGE); process.exit(1); }
const horizon = Number(flags.horizon), every = Number(flags.every), nudge = Number(flags.nudge);

await import("../../tests/harness/preload-data.mjs");
const { EVALUATIONS } = await import("../../src/app/node/evaluation.ts");
const { forkedWorth, pricing } = await import("./forked-worth.mjs");

const tournament = EVALUATIONS.tournament, ids = positionals.map((id) => tournament.subjects([id])[0].id);
const commit = flags.commit ?? gameCommit(), file = join(bankOf([ids[0], ids[1] ?? ids[0]], commit), "forks.jsonl");
if (!existsSync(file)) throw new Error(`no forks of this matchup's bank at ${commit}`);
// Each state's forks under these settings, every line of it together.
const states = new Map();
for (const line of readFileSync(file, "utf8").split("\n").filter(Boolean).map((text) => JSON.parse(text))) {
  if ((line.hold ?? false) !== flags.hold || line.horizon !== horizon || line.every !== every || line.nudge !== nudge) continue;
  const state = states.get(line.file) ?? states.set(line.file, { ...line, forks: [] }).get(line.file);
  state.forks.push(...line.forks);
}
/** The Mind's pricing for each entrant, made once. */
const pricings = new Map();
const pricingOf = (id) => pricings.get(id) ?? pricings.set(id, pricing(tournament.subjects([id])[0].value.mind)).get(id);
/** The entrant of `side` in the bout `key` names (`keyOf`). */
const entrantOf = (key, side) => key.split("/").slice(2).join("/").split(" v ")[side === "left" ? 0 : 1];

const forks = [...states.values()].flatMap((state) => state.forks);
const taken = forks.filter((fork) => fork.chose?.taken), runs = taken.filter((fork) => fork.watched.run || !fork.verdict).map((fork) => fork.watched.run?.seconds ?? Infinity).sort((a, b) => a - b);
const share = (n, of) => `${(100 * n / Math.max(1, of)).toFixed(1)} %`;
console.log(`${states.size} states of the bank at ${commit}, ${forks.length} forks, ${horizon} s on at ${nudge} N s, read every ${every} s`);
console.log(`taken ${share(taken.length, forks.length)} (the rest not priced or not free at the fork's decision, under its nudge)`);
console.log(`an Option taken ran: within 0.15 s ${share(runs.filter((s) => s <= .15).length, runs.length)}, median ${runs.length ? (runs[runs.length >> 1] === Infinity ? "past the fork's end" : `${runs[runs.length >> 1].toFixed(2)} s`) : "none"}, to the fork's end ${share(runs.filter((s) => s === Infinity).length, runs.length)}; ${taken.length - runs.length} more ran until the bout ended`);

const sorted = (xs) => [...xs].sort((a, b) => a - b);
const quantile = (xs, q) => { const s = sorted(xs); return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : NaN; };
const median = (xs) => quantile(xs, .5);
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const variance = (xs) => { const m = mean(xs); return xs.reduce((a, x) => a + (x - m) ** 2, 0) / Math.max(1, xs.length - 1); };
const meanOf = (row, trials) => mean(trials.map((t) => row[t]));
/** The place of the best row of `table` by its mean over `trials`; the first of equals. */
const best = (table, trials) => { let at = 0, top = -Infinity; table.forEach((row, k) => { const m = meanOf(row, trials); if (m > top) { top = m; at = k; } }); return at; };
const horizons = Array.from({ length: Math.round(horizon / every) }, (_, k) => (k + 1) * every);

// Each state's table at each horizon: a row an Option taken and read under every nudge, a column a nudge.
const tables = [];
for (const state of states.values()) {
  const side = state.side, priced = pricingOf(entrantOf(state.key, side));
  const trials = [...new Set(state.forks.map((fork) => fork.trial))].sort((a, b) => a - b);
  const byKey = new Map();
  for (const fork of state.forks) (byKey.get(fork.key) ?? byKey.set(fork.key, new Map()).get(fork.key)).set(fork.trial, fork);
  const rows = [...byKey.values()].filter((row) => trials.every((t) => row.get(t)?.chose?.taken))
    .map((row) => horizons.map((h) => trials.map((t) => forkedWorth(row.get(t), side, h, every, priced)))).filter((row) => row.every((at) => at.every((worth) => worth !== null)));
  if (rows.length >= 2 && trials.length >= 2) tables.push({ trials: trials.length, at: horizons.map((_, k) => rows.map((row) => row[k])) });
}
const last = horizons.length - 1;
const fixed = (x) => x.toFixed(4);
for (const [k, h] of horizons.entries()) {
  const spreads = [], between = [], gaps = [], shares = [], agree = new Map();
  for (const { trials, at } of tables) {
    const table = at[k], judge = at[last];
    const within = mean(table.map(variance)), means = [...new Set(table.map((row) => meanOf(row, row.map((_, t) => t))))].sort((a, b) => b - a);
    spreads.push(Math.sqrt(within)); between.push(Math.sqrt(variance(means))); gaps.push(means.length > 1 ? means[0] - means[1] : 0);
    const total = variance(table.flat());
    if (total > 0) shares.push(Math.max(0, 1 - within / total));
    // Rows alike under every nudge (one run by two navigators) are one Option to choose between.
    const distinct = new Set(table.map((row) => JSON.stringify(row))).size;
    for (let n = 1; 2 * n <= trials; n++) {
      const a = Array.from({ length: n }, (_, j) => j), b = a.map((j) => j + n), tally = agree.get(n) ?? agree.set(n, { same: 0, chance: 0, gains: [] }).get(n);
      const pickA = best(table, a), pickB = best(table, b);
      tally.same += JSON.stringify(table[pickA]) === JSON.stringify(table[pickB]) ? 1 : 0; tally.chance += 1 / distinct;
      // Judged by the other nudges at the longest horizon read: what the pick gains over an Option drawn at random.
      const judged = judge.map((row) => meanOf(row, b));
      tally.gains.push(judged[pickA] - mean(judged));
    }
  }
  console.log(`
at ${h} s: ${spreads.length} states with two or more Options taken and read under every nudge`);
  console.log(`  spread across nudges ${fixed(median(spreads))} life; the distinct Options' means spread ${fixed(median(between))}, best to next ${fixed(median(gaps))} (medians); between Options ${(100 * median(shares)).toFixed(0)} % of a fork's variance`);
  for (const [n, { same, chance, gains }] of agree) console.log(`  by ${n} nudge${n > 1 ? "s" : ""}: the best is the best by ${n} others (or its twin) at ${share(same, gains.length)} of states, chance ${share(chance, gains.length)}; `
    + `judged at ${horizons[last]} s by the others, it gains over an Option drawn at random ${fixed(median(gains))} life (median; 10th to 90th ${fixed(quantile(gains, .1))} to ${fixed(quantile(gains, .9))}), better at ${share(gains.filter((g) => g > 0).length, gains.length)}, worse at ${share(gains.filter((g) => g < 0).length, gains.length)}`);
}
