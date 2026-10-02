/**
 * How the arena's bouts end: every ordered pair of the core's bodies at each starting gap, each
 * bout to its verdict in a world of its own on a worker (`bout-pool.mjs`).
 *
 *   node research/bout-baseline.mjs [--gaps 3,4,5] [--workers 14] [--held empty] [--never-off] [--hand 0.5] [--floors 1,5] [--unit 138.26]
 *
 * It prints the harness, a row for each bout (who won, how it ended, when, the blows that landed,
 * those that wounded, the clashes in which nobody was, each side's bar), a row for each matchup
 * over its gaps (how its bouts ended, and what the blows cost the two sides a bout: `costOf`,
 * `bout.mjs`), and the totals: the bouts by ending, the falls and the wounding blows for each
 * minute of bout time, and the share of bouts that ended before any blow wounded. A count over one
 * bout is not a rate; the totals are read over all of them.
 *
 * - `--held` is what both sides' right hands hold (`DUEL_HELD`): the club unless given.
 * - `--never-off` plays under a sever margin no blow reaches: a blunt blow empties a part and
 *   never takes it off.
 * - `--hand` plays with both hands' surfaces that many times as stiff, on both sides.
 * - `--unit` plays with that many joules of blunt blow a hit point, in place of the rulebook's.
 * - `--floors` adds, for each floor in joules, what the blows under it were: how many, and the
 *   hit points they took. It is read from the blows that landed, not played again: a bout that a
 *   fall or the clock decided is the same bout under a floor, less those blows; one a pool's
 *   ending decided would have gone on, and is counted apart.
 */
import { parseArgs } from "node:util";
import { DUEL_HELD } from "../src/arena/duel.ts";
import { BODY_MODELS } from "../src/core/human/spec.ts";
import { sourced } from "../src/core/spec/quantity.ts";
import { BOUT_HARNESS } from "./bout.mjs";
import { defaultLanes, playBouts } from "./bout-pool.mjs";

const { values } = parseArgs({ options: {
  gaps: { type: "string", default: "3,4,5" }, workers: { type: "string" }, held: { type: "string", default: "club" },
  "never-off": { type: "boolean", default: false }, hand: { type: "string" }, floors: { type: "string" },
  unit: { type: "string" },
} });
const gaps = values.gaps.split(",").map(Number), floors = values.floors?.split(",").map(Number) ?? [];
if (!DUEL_HELD.includes(values.held)) throw new Error(`--held is one of ${DUEL_HELD.join(", ")}, not ${values.held}`);
const experiment = {
  ...(values.held !== "club" ? { held: { left: values.held, right: values.held } } : {}),
  ...(values["never-off"] || values.unit ? { rules: {
    ...(values["never-off"] ? { severMargin: sourced(1e9, "1", "owner-hp-pool", "an experiment's: no blow goes this far past empty") } : {}),
    ...(values.unit ? { unit: sourced(Number(values.unit), "J/HP", "owner-damage-unit", "an experiment's") } : {}),
  } } : {}),
  ...(values.hand ? { surfaces: { "hand.left": Number(values.hand), "hand.right": Number(values.hand) } } : {}),
};

const jobs = [];
for (const gap of gaps) for (const left of BODY_MODELS) for (const right of BODY_MODELS) jobs.push({ recipe: { left, right, gap, ...experiment }, blows: floors.length > 0 });

const started = Date.now();
const rows = await playBouts(jobs, Number(values.workers ?? defaultLanes()));
console.log(`${BOUT_HARNESS}; each side's balance its character's; ${rows.length} bouts in ${((Date.now() - started) / 1000).toFixed(0)} s`);
console.log(`Each right hand holds: ${values.held}.`);
if (values["never-off"]) console.log("No blow takes a part off (the sever margin out of reach).");
if (values.hand) console.log(`Both hands' surfaces ${values.hand} times as stiff.`);
if (values.unit) console.log(`A hit point is ${values.unit} J of blunt blow.`);
console.log("\n| Left | Right | Gap, m | Winner | Ending | Seconds | Blows | Wounding | Clashes | Left bar | Right bar |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|");
for (const row of rows) {
  console.log(`| ${row.recipe.left} | ${row.recipe.right} | ${row.recipe.gap} | ${row.winner ?? "draw"} | ${row.ending} | ${row.seconds.toFixed(2)} | ${row.blows} | ${row.wounding} | ${row.clashes} | ${row.bars.map((bar) => bar.toFixed(2)).join(" | ")} |`);
}

/** `ending count`, the commonest first. */
function endingsOf(some) {
  const endings = new Map();
  for (const row of some) endings.set(row.ending, (endings.get(row.ending) ?? 0) + 1);
  return [...endings].sort((a, b) => b[1] - a[1]).map(([ending, count]) => `${ending} ${count}`).join(", ");
}
const mean = (some, of) => some.reduce((sum, row) => sum + of(row), 0) / some.length;
/** A cost summed over a bout's two sides. */
const both = (key) => (row) => row.cost[0][key] + row.cost[1][key];

console.log("\nA bout, by matchup: hit points the blows took from the two sides together; of them, those a side lost to a blow its own bare hand was in (own), and those lost where neither surface was a hand's or an item's (jostled); hands emptied by such a blow of their own (ruined), and taken off by one (off).\n");
console.log("| Left | Right | Bouts | Endings | Seconds | Blows | HP taken | Own | Jostled | Ruined | Off |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|");
const line = (left, right, some) => `| ${left} | ${right} | ${some.length} | ${endingsOf(some)} | ${mean(some, (row) => row.seconds).toFixed(1)} | ${mean(some, (row) => row.blows).toFixed(1)} | ${mean(some, both("taken")).toFixed(3)} | ${mean(some, both("own")).toFixed(3)} | ${mean(some, both("jostled")).toFixed(3)} | ${mean(some, both("ruined")).toFixed(2)} | ${mean(some, both("off")).toFixed(2)} |`;
for (const left of BODY_MODELS) for (const right of BODY_MODELS) {
  console.log(line(left, right, rows.filter((row) => row.recipe.left === left && row.recipe.right === right)));
}
console.log(line("every", "matchup", rows));

const minutes = rows.reduce((sum, row) => sum + row.seconds, 0) / 60;
const falls = rows.reduce((sum, row) => sum + row.fallen.length, 0), wounding = rows.reduce((sum, row) => sum + row.wounding, 0);
console.log(`\nBouts by ending: ${endingsOf(rows)}.`);
console.log(`Bout time ${(60 * minutes).toFixed(0)} s; falls a minute ${(falls / minutes).toFixed(2)} (${falls} falls); wounding blows a minute ${(wounding / minutes).toFixed(1)}.`);
console.log(`Ended before any wounding blow: ${rows.filter((row) => row.wounding === 0).length} of ${rows.length}.`);

if (floors.length > 0) {
  const hp = (blow) => blow.sides.reduce((sum, side) => sum + (side.wound?.taken.reduce((s, taken) => s + taken.hp, 0) ?? 0), 0);
  const plain = (side) => side.item === null && !side.segment.startsWith("hand.");
  const all = rows.flatMap((row) => row.landed.map((blow) => ({ blow, row })));
  const total = all.reduce((sum, { blow }) => sum + hp(blow), 0);
  const physical = (row) => row.ending === "fallen" || row.ending === "time" || row.ending === "none";
  console.log(`\nBlows under a floor, read from the ${all.length} that landed (${total.toFixed(3)} HP taken):\n`);
  console.log("| Floor, J | Blows under it | Of them, neither surface a hand's or an item's | HP they took | Of all HP taken, % | In bouts a pool's ending decided: blows | HP |");
  console.log("|---|---|---|---|---|---|---|");
  for (const floor of floors) {
    const under = all.filter(({ blow }) => blow.energy < floor);
    const taken = under.reduce((sum, { blow }) => sum + hp(blow), 0), pooled = under.filter(({ row }) => !physical(row));
    console.log(`| ${floor} | ${under.length} | ${under.filter(({ blow }) => blow.sides.every(plain)).length} | ${taken.toFixed(3)} | ${(100 * taken / total).toFixed(1)} | ${pooled.length} | ${pooled.reduce((sum, { blow }) => sum + hp(blow), 0).toFixed(3)} |`);
  }
  const energies = all.map(({ blow }) => blow.energy).sort((a, b) => a - b);
  const at = (p) => energies[Math.min(energies.length - 1, Math.floor(p * energies.length))].toFixed(2);
  console.log(`\nA blow's energy, J: the least ${at(0)}, a quarter under ${at(0.25)}, half under ${at(0.5)}, three quarters under ${at(0.75)}, nine tenths under ${at(0.9)}, the most ${energies.at(-1).toFixed(2)}.`);
}
