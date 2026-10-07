/**
 * Whether a fighter that aims at the part its blow pays most on (`RecipeFighterConfig.aim`,
 * `"pays"`) does better than one that aims at the head: arena bouts (`bout.mjs`), each in a world
 * of its own on a worker (`bout-pool.mjs`).
 *
 *   node research/core-aim.mjs [--bouts 384] [--from 0] [--held club,empty] [--models <every body>] [--workers 14]
 *     [--save rows.jsonl] [--load a.jsonl,b.jsonl]
 *
 * A bout has no seed: it is its recipe's. What stands for one is the gap the two start at, `--bouts`
 * of them from 3 to 5 m by the golden ratio's sequence, begun at its `--from`th: another `--from`
 * is a fresh set. At each gap, for what the right hands hold (`--held`) and each ordered pair of
 * `--models`, there is one bout with both sides aiming at the head, the control, one with the left
 * aiming at what pays and one with the right.
 *
 * A cell is what is held, the pair and the side that aims at what pays. It prints:
 * - what each body's right hand nets by band with each thing held (`netsOf`), and so where it
 *   aims under `"pays"`: a cell whose side aims at the head either way is the control's bout, and
 *   is not played;
 * - a row a cell: that side's margin at the end of a bout (its bar less its foe's), in the control
 *   and aiming at what pays, the mean of the second less the first at the same gap and its effect
 *   size (Cohen's d of those paired differences); the share of bouts it won and fell in, the hit
 *   points its foe lost, the blows its foe's head and trunk met, and the bout's seconds, in each;
 * - the cells pooled by what is held, and all of them.
 *
 * `--save` appends each bout's record to a file as it is read, and `--load` reads records in
 * place of playing: a run cut short is not lost, and two sets are read as one.
 */
import { appendFileSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { DUEL_HELD, SIDES } from "../src/arena/duel.ts";
import { HUMANOID_MODELS } from "../src/core/models.ts";
import { FIGHTER } from "../src/core/mind/config.ts";
import { BAND_NAMES, netsOf, recipesFor, REPERTOIRE } from "../src/core/skills/strikes.ts";
import { BOUT_HARNESS } from "./bout.mjs";
import { defaultLanes, playBouts } from "./bout-pool.mjs";
import { heldSpec } from "./core-blow.mjs";

const { values } = parseArgs({ options: {
  bouts: { type: "string", default: "384" }, from: { type: "string", default: "0" },
  held: { type: "string", default: "club,empty" }, models: { type: "string", default: HUMANOID_MODELS.join(",") },
  workers: { type: "string" }, save: { type: "string" }, load: { type: "string" },
} });
const bouts = Number(values.bouts), from = Number(values.from), helds = values.held.split(","), models = values.models.split(",");
for (const held of helds) if (!DUEL_HELD.includes(held)) throw new Error(`--held is of ${DUEL_HELD.join(", ")}, not ${held}`);
for (const model of models) if (!HUMANOID_MODELS.includes(model)) throw new Error(`--models names no body: ${model} (one of ${HUMANOID_MODELS.join(", ")})`);

/** The gaps the bouts start at, m: from `GAPS.least`, over `GAPS.span`, to a tenth of a millimetre. */
const GAPS = { least: 3, span: 2 }, GOLDEN = (Math.sqrt(5) - 1) / 2;
const gapOf = (seed) => Math.round(1e4 * (GAPS.least + GAPS.span * (((seed + 0.5) * GOLDEN) % 1))) / 1e4;

/** What a bout's right hands hold (`DUEL_HELD`), by the name a recipe knows it by. */
const HELD_NAME = { club: "wooden club", empty: "fist" };

/** What `model`'s right hand nets by band with `held`, and the band it aims at under `"pays"`: the first of those that net most, the high one with none. */
function aimOf(model, held) {
  const nets = netsOf(recipesFor(REPERTOIRE, heldSpec(model, HELD_NAME[held]), "right"));
  let best = BAND_NAMES[0], most = null;
  for (const band of BAND_NAMES) if (nets[band] !== null && (most === null || nets[band] > most)) { best = band; most = nets[band]; }
  return { nets, band: best };
}
const AIMS = new Map(helds.flatMap((held) => models.map((model) => [`${held}|${model}`, aimOf(model, held)])));
/** Whether aiming at what pays is another bout than aiming at the head: its side's band is not the high one. */
const differs = (held, model) => AIMS.get(`${held}|${model}`).band !== BAND_NAMES[0];

/** What a bout was to `side`: its margin, whether it won and fell, and what its foe lost and met. */
function sideOf(row, side) {
  const k = SIDES.indexOf(side), foe = SIDES[1 - k];
  let lost = 0, head = 0, trunk = 0;
  for (const blow of row.landed) {
    const met = blow.sides.find((one) => one.fighter === foe);
    lost += (met.wound?.taken ?? []).reduce((sum, { hp }) => sum + hp, 0);
    if (met.item === null && met.segment === "head") head++;
    if (met.item === null && met.segment.endsWith("Trunk")) trunk++;
  }
  return { margin: row.bars[k] - row.bars[1 - k], won: row.winner === side, fell: row.fallen.includes(side), lost, head, trunk };
}

/** A bout's job, and the record its row becomes: `pays` is the side that aims at what pays, or null in the control. */
function jobOf(seed, held, left, right, pays) {
  const mind = (side) => side === pays ? { ...FIGHTER, aim: "pays" } : FIGHTER;
  return {
    key: { seed, gap: gapOf(seed), held, left, right, pays },
    recipe: { left, right, gap: gapOf(seed), held: { left: held, right: held }, minds: { left: mind("left"), right: mind("right") } },
    blows: true,
  };
}
const recordOf = (job, row) => ({ ...job.key, ending: row.ending, seconds: row.seconds, sides: Object.fromEntries(SIDES.map((side) => [side, sideOf(row, side)])) });

const records = [];
const started = Date.now();
if (values.load) {
  for (const path of values.load.split(",")) for (const line of readFileSync(path, "utf8").split("\n")) if (line.trim()) records.push(JSON.parse(line));
} else {
  const lanes = Number(values.workers ?? defaultLanes());
  // A few gaps at a time: what is played is saved, and the run says how far it is.
  const AT_A_TIME = 4;
  for (let first = from; first < from + bouts; first += AT_A_TIME) {
    const jobs = [];
    for (let seed = first; seed < Math.min(first + AT_A_TIME, from + bouts); seed++) {
      for (const held of helds) for (const left of models) for (const right of models) {
        const sides = SIDES.filter((side) => differs(held, side === "left" ? left : right));
        if (sides.length === 0) continue;
        jobs.push(jobOf(seed, held, left, right, null));
        for (const pays of sides) jobs.push(jobOf(seed, held, left, right, pays));
      }
    }
    const rows = await playBouts(jobs, lanes);
    const read = jobs.map((job, k) => recordOf(job, rows[k]));
    if (values.save) appendFileSync(values.save, read.map((record) => JSON.stringify(record)).join("\n") + "\n");
    records.push(...read);
    process.stderr.write(`gaps ${first - from + Math.min(AT_A_TIME, from + bouts - first)}/${bouts}, ${records.length} bouts in ${((Date.now() - started) / 1000).toFixed(0)} s\n`);
  }
}

const mean = (some) => some.reduce((sum, v) => sum + v, 0) / Math.max(1, some.length);
/** Cohen's d of paired differences: their mean over their standard deviation; 0 where none differs. */
function effect(differences) {
  const m = mean(differences), n = differences.length;
  const sd = Math.sqrt(differences.reduce((sum, v) => sum + (v - m) * (v - m), 0) / Math.max(1, n - 1));
  return sd > 0 ? m / sd : 0;
}

const seeds = [...new Set(records.map((record) => record.seed))].sort((a, b) => a - b), gaps = seeds.map(gapOf);
console.log(`${BOUT_HARNESS}; each side's balance its character's; ${records.length} bouts${values.load ? ` read from ${values.load}` : ` in ${((Date.now() - started) / 1000).toFixed(0)} s`}`);
console.log(seeds.length ? `Starting gaps: ${seeds.length}, the golden ratio's sequence from its ${seeds[0]}th to its ${seeds.at(-1)}th, ${Math.min(...gaps)} to ${Math.max(...gaps)} m.`
  : "No side aims anywhere but the head: no bout is played.");

console.log("\nWhat each right hand's recipes net by band, HP, and the band it aims at under \"pays\". A side that aims at the head either way plays the control's bout, and has no cell.\n");
console.log(`| Held | Body | ${BAND_NAMES.join(" | ")} | Aims at |`);
console.log(`|---|---|${BAND_NAMES.map(() => "---|").join("")}---|`);
for (const held of helds) for (const model of models) {
  const { nets, band } = AIMS.get(`${held}|${model}`);
  console.log(`| ${held} | ${model} | ${BAND_NAMES.map((name) => nets[name] === null ? "no recipe" : nets[name]).join(" | ")} | ${band} |`);
}

const cellKey = (record) => `${record.held}|${record.left}|${record.right}`;
const controls = new Map(records.filter((record) => record.pays === null).map((record) => [`${cellKey(record)}|${record.seed}`, record]));
/** A cell's pairs: the control and the bout aimed at what pays at the same gap, as that side had them. */
const cells = new Map();
for (const record of records) {
  if (record.pays === null) continue;
  const control = controls.get(`${cellKey(record)}|${record.seed}`);
  if (!control) continue;
  const key = `${cellKey(record)}|${record.pays}`;
  if (!cells.has(key)) cells.set(key, { held: record.held, left: record.left, right: record.right, pays: record.pays, pairs: [] });
  cells.get(key).pairs.push({ head: control.sides[record.pays], pays: record.sides[record.pays], seconds: [control.seconds, record.seconds] });
}
/** What a set of pairs reads as: each measure aiming at the head and at what pays, and the margin's effect size. */
const read = (pairs) => {
  const of = (which, measure) => mean(pairs.map((pair) => Number(pair[which][measure])));
  const two = (measure) => [of("head", measure), of("pays", measure)];
  return {
    n: pairs.length, margin: two("margin"), d: effect(pairs.map((pair) => pair.pays.margin - pair.head.margin)),
    won: two("won"), fell: two("fell"), lost: two("lost"), atHead: two("head"), atTrunk: two("trunk"),
    seconds: [mean(pairs.map((pair) => pair.seconds[0])), mean(pairs.map((pair) => pair.seconds[1]))],
  };
};
const two = (pair, digits) => `${pair[0].toFixed(digits)} | ${pair[1].toFixed(digits)}`;
const line = (label, r) => `| ${label} | ${r.n} | ${two(r.margin, 3)} | ${(r.margin[1] - r.margin[0]).toFixed(3)} | ${r.d.toFixed(2)} | ${two(r.won, 2)} | ${two(r.fell, 2)} | ${two(r.lost, 3)} | ${two(r.atHead, 2)} | ${two(r.atTrunk, 2)} | ${two(r.seconds, 1)} |`;

console.log("\nA bout, to the side that aims at what pays, aiming at the head (the control) and at what pays: its margin at the end (its bar less its foe's), what aiming at what pays gained of it and its effect size; the share of bouts it won, and fell in; the hit points its foe lost; the blows its foe's head met, and its trunk; the bout's seconds.\n");
console.log("| Held | Left | Right | Aims | Gaps | Margin, head | pays | Gained | d | Won, head | pays | Fell, head | pays | Foe's HP lost, head | pays | Blows at its head, head | pays | At its trunk, head | pays | Seconds, head | pays |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
const all = [...cells.values()].map((cell) => ({ cell, r: read(cell.pairs) }));
for (const { cell, r } of all) console.log(line(`${cell.held} | ${cell.left} | ${cell.right} | ${cell.pays}`, r));
for (const held of helds) {
  const pooled = [...cells.values()].filter((cell) => cell.held === held).flatMap((cell) => cell.pairs);
  if (pooled.length) console.log(line(`${held} | every | pair | either`, read(pooled)));
}
if (all.length) {
  console.log(line("every | every | pair | either", read([...cells.values()].flatMap((cell) => cell.pairs))));
  const gained = all.filter(({ r }) => r.d > 0.2);
  console.log(`\nAiming at what pays gains margin at d over 0.2 in ${gained.length} of ${all.length} cells; the least d is ${Math.min(...all.map(({ r }) => r.d)).toFixed(2)}.`);
}
