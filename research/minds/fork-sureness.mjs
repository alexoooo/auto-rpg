/**
 * **How sure a forked label is** (the forked record's step 4), read before any fit uses one: for the
 * forks of a matchup's bank (`fork-bank.mjs`), at each horizon they were read at, how far a forked
 * worth (`forked-worth.mjs`) spreads across the nudges of one Option at one state, against the gaps
 * between the Options at that state; and whether the best Option by some nudges is the best by
 * others.
 *
 *   node research/minds/fork-sureness.mjs <entrant> [<entrant>] [--commit <sha>] [--hold] [--horizon 4] [--every 1] [--nudge 0.5]
 *
 * It reads the forks of the bank (held where `--hold` says, `fork-bank.mjs`) at `--commit` (the last that changed what the game computes, `gameCommit`, unless named) under those settings. At a
 * state it compares the Options taken, and read, under every nudge it was forked under (rule 5:
 * alike nudges only). For each horizon it prints, over the states with two or more such Options: the median
 * spread (each Option's standard deviation across nudges, pooled at the state), the median spread of
 * the Options' means and the median gap from the best mean to the next; how much of the variance
 * of a single fork's worth lies between Options; and, for each count of nudges n that two disjoint
 * sets of n can be drawn from, the share of states where the two sets' best Option is the same,
 * beside what chance alone gives; and, since Options alike (one run by two navigators) trade
 * places without harm, what trusting one set's best loses by the other's worths (its regret), beside
 * what an Option drawn at random loses. It also says what the forks did: how many Options were taken,
 * and how long one ran before it ended or the Mind let it go.
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

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN; };
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const variance = (xs) => { const m = mean(xs); return xs.reduce((a, x) => a + (x - m) ** 2, 0) / Math.max(1, xs.length - 1); };
const meanOf = (row, trials) => mean(trials.map((t) => row[t]));
const best = (table, trials) => { let at = 0, top = -Infinity; table.forEach((row, k) => { const m = mean(trials.map((t) => row[t])); if (m > top) { top = m; at = k; } }); return at; };

for (let h = every; h <= horizon + 1e-9; h += every) {
  const spreads = [], between = [], gaps = [], shares = [], agree = new Map();
  for (const state of states.values()) {
    const side = state.side, priced = pricingOf(entrantOf(state.key, side));
    const trials = [...new Set(state.forks.map((fork) => fork.trial))].sort((a, b) => a - b);
    // Each Option's worth under each nudge, where it was taken under every one.
    const byKey = new Map();
    for (const fork of state.forks) (byKey.get(fork.key) ?? byKey.set(fork.key, new Map()).get(fork.key)).set(fork.trial, fork);
    const table = [...byKey.values()].filter((row) => trials.every((t) => row.get(t)?.chose?.taken))
      .map((row) => trials.map((t) => forkedWorth(row.get(t), side, h, every, priced))).filter((row) => row.every((worth) => worth !== null));
    if (table.length < 2 || trials.length < 2) continue;
    const within = mean(table.map(variance)), means = table.map(mean).sort((a, b) => b - a);
    spreads.push(Math.sqrt(within)); between.push(Math.sqrt(variance(means))); gaps.push(means[0] - means[1]);
    const all = table.flat(), total = variance(all);
    if (total > 0) shares.push(Math.max(0, 1 - within / total));
    for (let n = 1; 2 * n <= trials.length; n++) {
      const a = Array.from({ length: n }, (_, k) => k), b = a.map((k) => k + n), tally = agree.get(n) ?? agree.set(n, { same: 0, of: 0, chance: 0, regret: 0, random: 0 }).get(n);
      const byB = table.map((row) => meanOf(row, b)), top = Math.max(...byB);
      tally.same += best(table, a) === best(table, b) ? 1 : 0; tally.of++; tally.chance += 1 / table.length;
      tally.regret += top - byB[best(table, a)]; tally.random += top - mean(byB);
    }
  }
  console.log(`\nat ${h} s: ${spreads.length} states with two or more Options taken under every nudge`);
  console.log(`  spread across nudges ${median(spreads).toFixed(4)} life; the Options' means spread ${median(between).toFixed(4)}, best to next ${median(gaps).toFixed(4)} (medians); between Options ${(100 * median(shares)).toFixed(0)} % of a fork's variance`);
  for (const [n, { same, of, chance, regret, random }] of agree) console.log(`  the best by ${n} nudge${n > 1 ? "s" : ""} is the best by ${n} others at ${share(same, of)} of states, chance ${share(chance, of)}; it loses ${(regret / of).toFixed(4)} life by the others' worths, one drawn at random ${(random / of).toFixed(4)}`);
}
