/**
 * How blind the oracle's blind search is: how far the forks it nudges stand from the true fork.
 *
 *   node research/oracle-spread.mjs [--left workshop-fighter] [--right workshop-rogue] [--gap 4]
 *     [--every 0.5] [--horizon 2] [--blind 4] [--nudge 0.5]
 *
 * At each decision of the bout under its tactics alone (every `--every` s) the bout is saved, and
 * forked under nobody's orders once as it is and `--blind` times nudged as the oracle nudges a
 * blind fork (`nudgesOf`, `research/rollouts.mjs`). Each fork is read `--horizon` s on. A row is a
 * decision: the true fork's value to the left side, the nudged forks' mean and range, how many of
 * them put other bodies out of the fight than the true fork, and the furthest any of their centres
 * of mass stands from the true fork's. The last line is the bout's summary.
 *
 * Harness: Node, the core world, Rapier, 120 Hz; forks by a load, in this thread.
 */
import { parseArgs } from "node:util";
import { BOUT_HARNESS, buildBout } from "./bout.mjs";
import { nudgesOf, rollout, valueOf } from "./rollouts.mjs";

const { values } = parseArgs({ options: {
  left: { type: "string", default: "workshop-fighter" }, right: { type: "string", default: "workshop-rogue" },
  gap: { type: "string", default: "4" }, every: { type: "string", default: "0.5" }, horizon: { type: "string", default: "2" },
  blind: { type: "string", default: "4" }, nudge: { type: "string", default: "0.5" },
} });
const recipe = { left: values.left, right: values.right, gap: Number(values.gap) };
const trials = Number(values.blind), nudge = Number(values.nudge);
const mean = (numbers) => numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
/** The furthest a side's centre of mass in `row` stands from the same side's in `truth`, m. */
const apart = (row, truth) => Math.max(...row.centres.map((c, side) => Math.sqrt(c.reduce((sum, x, axis) => sum + (x - truth.centres[side][axis]) * (x - truth.centres[side][axis]), 0))));

console.log(`${BOUT_HARNESS}; ${recipe.left} against ${recipe.right}, gap ${recipe.gap} m, under its tactics; at every ${values.every} s the fork under nobody's orders, as it is and in ${trials} forks nudged ${nudge} N s at both roots, each read ${values.horizon} s on; forks by a load`);
console.log("\n| At, s | True value | Nudged: mean | Range | Another out | Furthest centre, m |\n|---|---|---|---|---|---|");
const { world, duel, dispose } = await buildBout(recipe);
const every = Math.round(Number(values.every) * world.hz), horizon = Math.round(Number(values.horizon) * world.hz);
const rows = [];
try {
  while (!duel.verdict) {
    const from = duel.steps, save = duel.save();
    const fork = (nudges) => rollout({ recipe, save, from, branch: [{ step: from, side: "left", orders: null }], steps: horizon, nudges });
    const truth = await fork([]), nudged = [];
    for (let trial = 0; trial < trials; trial++) nudged.push(await fork(nudgesOf(from, trial, nudge)));
    const worth = nudged.map((row) => valueOf(row, "left"));
    const row = {
      value: valueOf(truth, "left"), mean: mean(worth), range: Math.max(...worth) - Math.min(...worth),
      out: nudged.filter((each) => each.out.join() !== truth.out.join()).length,
      same: nudged.filter((each) => each.end === truth.end).length, apart: Math.max(...nudged.map((each) => apart(each, truth))),
    };
    rows.push(row);
    console.log(`| ${(from / world.hz).toFixed(1)} | ${row.value.toFixed(3)} | ${row.mean.toFixed(3)} | ${row.range.toFixed(3)} | ${row.out} | ${row.apart.toFixed(3)} |`);
    for (let step = 0; step < every && !duel.verdict; step++) world.step();
  }
} finally { dispose(); }
const furthest = rows.map((row) => row.apart).sort((a, b) => a - b);
console.log(`\n${rows.length} decisions, ${rows.length * trials} nudged forks: ${rows.reduce((sum, row) => sum + row.same, 0)} end in the true fork's poses; `
  + `${rows.reduce((sum, row) => sum + row.out, 0)} put other bodies out than the true fork, in ${rows.filter((row) => row.out > 0).length} decisions; `
  + `the furthest centre is a median of ${furthest[rows.length >> 1].toFixed(3)} m from the true fork's; `
  + `the nudged mean is ${mean(rows.map((row) => Math.abs(row.mean - row.value))).toFixed(3)} from the true value on average, and the range of the nudged values ${mean(rows.map((row) => row.range)).toFixed(3)}.`);
