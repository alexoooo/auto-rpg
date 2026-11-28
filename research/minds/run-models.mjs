/**
 * **Each Option's model against what it did** (the forked record's step 5, its first reading, with
 * nothing fitted): for the runs of a matchup's bank (`fork-bank.mjs`'s `runs.jsonl`), what each
 * Option's model said at the fork, as its search asked it, against the mean of what the Option did
 * under the state's nudges, for each quantity the model says (`QUANTITIES`, `runs.mjs`).
 *
 *   node research/minds/run-models.mjs <entrant> [<entrant>] [--bank <sha>] [--game <sha>] [--cap 6] [--until 1] [--nudge 0.5] [--largest 15]
 *
 * It reads the runs as `run-sureness.mjs` does. An Option at a state is read where it was taken
 * and the quantity reads its runs under one nudge or more (`tableOf`'s `some`), so a long Option is
 * not read only where it ran short. By kind of Option, and then for the largest
 * errors by Option (its name less its navigator, so a walk's two navigators are one), for each
 * quantity: how many Options at states, the model's mean, the measured mean, the model's bias (its
 * mean error, and that over its standard error, how sure the bias is: the Options of one state
 * share its nudges and its situation, so the error is taken as varying by state, not by Option), the median distance, and
 * the median noise of a measured mean (what of the distance the nudges alone account for).
 */
import { parseArgs } from "node:util";
import { QUANTITIES, apartIn, mean, median, runsOf, saidOf, tableOf, variance } from "./runs.mjs";

const USAGE = "usage: node research/minds/run-models.mjs <entrant> [<entrant>] [--bank <sha>] [--game <sha>] [--cap 6] [--until 1] [--nudge 0.5] [--largest 15]";
const { values: flags, positionals } = parseArgs({ allowPositionals: true, options: {
  bank: { type: "string" }, game: { type: "string" }, cap: { type: "string", default: "6" }, until: { type: "string", default: "1" }, nudge: { type: "string", default: "0.5" }, largest: { type: "string", default: "15" },
} });
if (positionals.length < 1 || positionals.length > 2) { console.error(USAGE); process.exit(1); }
const settings = { cap: Number(flags.cap), until: Number(flags.until), nudge: Number(flags.nudge) };

await import("../../tests/harness/preload-data.mjs");
const { EVALUATIONS } = await import("../../src/app/node/evaluation.ts");
const ids = positionals.map((id) => EVALUATIONS.tournament.subjects([id])[0].id);
const states = runsOf(ids, flags, settings);

/** An Option's name less its navigator's, so one walk by two navigators is read as one. */
const familyOf = (name) => name.replace(/ \([a-z-]+-navigation\/[a-z-]+-navigation\)/g, "");

// Each Option at each state, for each quantity: what its model said, and what it did under each nudge.
const read = [];
for (const [name, quantity] of Object.entries(QUANTITIES)) {
  for (const [file, state] of states) {
    const { trials, rows } = tableOf(state, quantity, { some: true });
    if (trials < 2) continue;
    for (const { values, fork } of rows) {
      const said = saidOf(fork, quantity);
      if (said !== null) read.push({ quantity: name, state: file, kind: fork.predicted.kind, family: familyOf(fork.name), said, done: mean(values), error: apartIn(quantity, said, mean(values)), noise: Math.sqrt(variance(values) / values.length) });
    }
  }
}
const summary = (group) => {
  // The standard error with the Options of a state taken together (clustered by state).
  const errors = group.map((g) => g.error), bias = mean(errors), byState = new Map();
  for (const g of group) byState.set(g.state, (byState.get(g.state) ?? 0) + g.error - bias);
  const se = Math.sqrt([...byState.values()].reduce((a, s) => a + s * s, 0)) / errors.length;
  return { n: group.length, said: mean(group.map((g) => g.said)), done: mean(group.map((g) => g.done)), bias, sure: se > 0 ? bias / se : 0,
    distance: median(errors.map(Math.abs)), noise: median(group.map((g) => g.noise)) };
};
const grouped = (by) => { const groups = new Map(); for (const g of read) { const key = by(g); (groups.get(key) ?? groups.set(key, []).get(key)).push(g); } return groups; };
const fixed = (x) => (Math.abs(x) >= 100 ? x.toFixed(0) : x.toFixed(3)).padStart(8);
const line = (label, s) => `${label.padEnd(46).slice(0, 46)} ${String(s.n).padStart(5)} ${fixed(s.said)} ${fixed(s.done)} ${fixed(s.bias)} ${fixed(s.sure)} ${fixed(s.distance)} ${fixed(s.noise)}`;
const HEADER = `${"".padEnd(46)} ${"n".padStart(5)} ${"model".padStart(8)} ${"done".padStart(8)} ${"bias".padStart(8)} ${"bias/se".padStart(8)} ${"distance".padStart(8)} ${"noise".padStart(8)}`;

console.log(`${states.size} states of the bank made at ${states.bank}, forked on the game at ${states.game}; each Option to its exit or ${settings.cap} s, an open one held ${settings.until} s, ${settings.nudge} N s`);
for (const [quantity, group] of grouped((g) => g.quantity)) {
  console.log(`\n${quantity}\n${HEADER}`);
  console.log(line("every Option", summary(group)));
  for (const [kind, of] of [...grouped((g) => g.quantity === quantity ? g.kind : null)].filter(([kind]) => kind !== null).sort((a, b) => b[1].length - a[1].length)) console.log(line(`  ${kind}`, summary(of)));
}
const largest = [...grouped((g) => `${g.quantity}\t${g.family}`)].map(([key, group]) => ({ key, s: summary(group) })).filter(({ s }) => s.n >= 5)
  .sort((a, b) => Math.abs(b.s.sure) - Math.abs(a.s.sure)).slice(0, Number(flags.largest));
console.log(`\nthe surest biases, by Option (five or more at states)\n${HEADER}`);
for (const { key, s } of largest) { const [quantity, family] = key.split("\t"); console.log(`${quantity}: ${family}`); console.log(line("", s)); }
