/**
 * What the soles miss: every ordered pair of the core's bodies at each starting gap, each bout to
 * its verdict in a world of its own on a worker (`bout-pool.mjs`), reading after every step what
 * each side's stance asked of the ground and its bearing soles could not give
 * (`StanceReading.shortfall`).
 *
 *   node research/assist-need.mjs [--gaps 4] [--workers 14]
 *
 * It prints the harness, a row for each side of each bout (the bout's mean of the missed force, in
 * the body's weights, and of the missed moment, N m; the share of steps either is over 0.05 weights
 * or 5 N m; and the mean of each over the bout's last second), and the range of each column over
 * the sides that fell and over those that did not. Steps after the verdict are not read: past a
 * fall the stance's ask has no bound.
 */
import { parseArgs } from "node:util";
import { HUMANOID_MODELS as BODY_MODELS } from "../src/core/models.ts";
import { SIDES } from "../src/arena/duel.ts";
import { BOUT_HARNESS } from "./bout.mjs";
import { defaultLanes, playBouts } from "./bout-pool.mjs";

const { values } = parseArgs({ options: { gaps: { type: "string", default: "4" }, workers: { type: "string" } } });
const gaps = values.gaps.split(",").map(Number);

const jobs = [];
for (const gap of gaps) for (const left of BODY_MODELS) for (const right of BODY_MODELS) jobs.push({ recipe: { left, right, gap }, shortfall: true });
const started = Date.now();
const rows = await playBouts(jobs, Number(values.workers ?? defaultLanes()));

console.log(`${BOUT_HARNESS}; ${rows.length} bouts in ${((Date.now() - started) / 1000).toFixed(0)} s; every character's balance as its spec has it`);
console.log("| Left | Right | Gap, m | Ending | Seconds | Side | Fell | Mean force, weights | Mean moment, N m | Steps over, % | Last second: force, weights | Last second: moment, N m |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|");
const sides = [];
for (const row of rows) SIDES.forEach((side, k) => {
  const missed = row.shortfall[k], fell = row.fallen.includes(side);
  sides.push({ ...missed, fell });
  console.log(`| ${row.recipe.left} | ${row.recipe.right} | ${row.recipe.gap} | ${row.ending} | ${row.seconds.toFixed(2)} | ${side} | ${fell ? "yes" : ""} | ${missed.force.toFixed(3)} | ${missed.moment.toFixed(1)} | ${(100 * missed.over).toFixed(0)} | ${missed.lastForce.toFixed(3)} | ${missed.lastMoment.toFixed(1)} |`);
});

const range = (values_, digits) => values_.length ? `${Math.min(...values_).toFixed(digits)} to ${Math.max(...values_).toFixed(digits)}` : "none";
console.log(`\nOver a whole bout (${sides.length} sides): ${range(sides.map((s) => s.force), 3)} weights and ${range(sides.map((s) => s.moment), 1)} N m on average; over in ${range(sides.map((s) => 100 * s.over), 0)} % of steps.`);
for (const [name, fell] of [["fell", true], ["did not fall", false]]) {
  const of = sides.filter((s) => s.fell === fell);
  console.log(`In the last second, the ${of.length} that ${name}: ${range(of.map((s) => s.lastForce), 3)} weights and ${range(of.map((s) => s.lastMoment), 1)} N m.`);
}
