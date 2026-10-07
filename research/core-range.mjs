/**
 * Whether a fighter that holds at the edge of its foe's reach (`FighterMindConfig.range`, `"edge"`)
 * does better than one that walks in to attack: arena bouts (`bout.mjs`), each in a world of its
 * own on a worker (`bout-pool.mjs`).
 *
 *   node research/core-range.mjs [--bouts 96] [--from 0] [--held club,empty] [--models <every body>]
 *     [--patience 4] [--band 0.25] [--workers 14] [--save rows.jsonl] [--load a.jsonl,b.jsonl]
 *
 * A bout has no seed: it is its recipe's. What stands for one is the gap the two start at, `--bouts`
 * of them from 3 to 5 m by the golden ratio's sequence, begun at its `--from`th: another `--from`
 * is a fresh set. At each gap, for what the right hands hold (`--held`) and each ordered pair of
 * `--models`, there is one bout with both sides walking in, the control, and for each `--patience`
 * (s) and `--band` (m) of the edge (`EDGE`) one with the left holding at the edge and one with the
 * right.
 *
 * A cell is what is held, the pair, the side that holds at the edge, and its edge. It prints a row a
 * cell: that side's margin at the end of a bout (its bar less its foe's) walking in and at the
 * edge, the mean of the second less the first at the same gap and its effect size (Cohen's d of
 * those paired differences); the share of bouts it won and fell in, the hit points it took and its
 * foe lost, the blows it landed on its foe, and the bout's seconds, in each; then the cells pooled
 * by what is held and edge, and by edge.
 *
 * `--save` appends each bout's record to a file as it is read, and `--load` reads records in
 * place of playing: a run cut short is not lost, and two sets are read as one.
 */
import { appendFileSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { DUEL_HELD, SIDES } from "../src/arena/duel.ts";
import { HUMANOID_MODELS as BODY_MODELS } from "../src/core/models.ts";
import { FIGHTER } from "../src/core/mind/config.ts";
import { EDGE } from "../src/core/mind/fighter.ts";
import { BOUT_HARNESS } from "./bout.mjs";
import { defaultLanes, playBouts } from "./bout-pool.mjs";

const { values } = parseArgs({ options: {
  bouts: { type: "string", default: "96" }, from: { type: "string", default: "0" },
  held: { type: "string", default: "club,empty" }, models: { type: "string", default: BODY_MODELS.join(",") },
  patience: { type: "string", default: String(EDGE.patience) }, band: { type: "string", default: String(EDGE.band) },
  workers: { type: "string" }, save: { type: "string" }, load: { type: "string" },
} });
const bouts = Number(values.bouts), from = Number(values.from), helds = values.held.split(","), models = values.models.split(",");
for (const held of helds) if (!DUEL_HELD.includes(held)) throw new Error(`--held is of ${DUEL_HELD.join(", ")}, not ${held}`);
for (const model of models) if (!BODY_MODELS.includes(model)) throw new Error(`--models names no body: ${model} (one of ${BODY_MODELS.join(", ")})`);
const edges = values.patience.split(",").map(Number).flatMap((patience) => values.band.split(",").map(Number).map((band) => ({ band, patience })));

/** The gaps the bouts start at, m: from `GAPS.least`, over `GAPS.span`, to a tenth of a millimetre. */
const GAPS = { least: 3, span: 2 }, GOLDEN = (Math.sqrt(5) - 1) / 2;
const gapOf = (seed) => Math.round(1e4 * (GAPS.least + GAPS.span * (((seed + 0.5) * GOLDEN) % 1))) / 1e4;
const edgeName = (edge) => edge === null ? "close" : `patience ${edge.patience} s, band ${edge.band} m`;

/** What a bout was to `side`: its margin, whether it won and fell, what it took, and what its foe lost and met of its blows. */
function sideOf(row, side) {
  const k = SIDES.indexOf(side), foe = SIDES[1 - k];
  let lost = 0, took = 0, landed = 0;
  for (const blow of row.landed) {
    const met = blow.sides.find((one) => one.fighter === foe), mine = blow.sides.find((one) => one.fighter === side);
    lost += (met.wound?.taken ?? []).reduce((sum, { hp }) => sum + hp, 0);
    took += (mine.wound?.taken ?? []).reduce((sum, { hp }) => sum + hp, 0);
    if (met.item === null && (met.wound?.taken.length ?? 0) > 0) landed++;
  }
  return { margin: row.bars[k] - row.bars[1 - k], won: row.winner === side, fell: row.fallen.includes(side), lost, took, landed };
}

/** A bout's job, and the record its row becomes: `edge` is the side that holds at the edge, or null in the control. */
function jobOf(seed, held, left, right, at, edge) {
  const mind = (side) => side === at ? { ...FIGHTER, range: "edge", edge } : FIGHTER;
  return {
    key: { seed, gap: gapOf(seed), held, left, right, at, edge },
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
        jobs.push(jobOf(seed, held, left, right, null, null));
        for (const edge of edges) for (const at of SIDES) jobs.push(jobOf(seed, held, left, right, at, edge));
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
console.log(`Starting gaps: ${seeds.length}, the golden ratio's sequence from its ${seeds[0]}th to its ${seeds.at(-1)}th, ${Math.min(...gaps)} to ${Math.max(...gaps)} m.`);

const cellKey = (record) => `${record.held}|${record.left}|${record.right}`;
const controls = new Map(records.filter((record) => record.at === null).map((record) => [`${cellKey(record)}|${record.seed}`, record]));
/** A cell's pairs: the control and the bout held at the edge at the same gap, as the side at the edge had them. */
const cells = new Map();
for (const record of records) {
  if (record.at === null) continue;
  const control = controls.get(`${cellKey(record)}|${record.seed}`);
  if (!control) continue;
  const key = `${cellKey(record)}|${record.at}|${edgeName(record.edge)}`;
  if (!cells.has(key)) cells.set(key, { held: record.held, left: record.left, right: record.right, at: record.at, edge: edgeName(record.edge), pairs: [] });
  cells.get(key).pairs.push({ close: control.sides[record.at], edge: record.sides[record.at], seconds: [control.seconds, record.seconds] });
}
/** What a set of pairs reads as: each measure walking in and at the edge, and the margin's effect size. */
const read = (pairs) => {
  const two = (measure) => ["close", "edge"].map((which) => mean(pairs.map((pair) => Number(pair[which][measure]))));
  return {
    n: pairs.length, margin: two("margin"), d: effect(pairs.map((pair) => pair.edge.margin - pair.close.margin)),
    won: two("won"), fell: two("fell"), took: two("took"), lost: two("lost"), landed: two("landed"),
    seconds: [mean(pairs.map((pair) => pair.seconds[0])), mean(pairs.map((pair) => pair.seconds[1]))],
  };
};
const two = (pair, digits) => `${pair[0].toFixed(digits)} | ${pair[1].toFixed(digits)}`;
const line = (label, r) => `| ${label} | ${r.n} | ${two(r.margin, 3)} | ${(r.margin[1] - r.margin[0]).toFixed(3)} | ${r.d.toFixed(2)} | ${two(r.won, 2)} | ${two(r.fell, 2)} | ${two(r.took, 3)} | ${two(r.lost, 3)} | ${two(r.landed, 2)} | ${two(r.seconds, 1)} |`;

console.log("\nA bout, to the side that holds at the edge, walking in (the control) and at the edge: its margin at the end (its bar less its foe's), what the edge gained of it and its effect size; the share of bouts it won, and fell in; the hit points it took, and its foe lost; the blows it landed that wounded its foe; the bout's seconds.\n");
console.log("| Held | Left | Right | At the edge | Edge | Gaps | Margin, close | edge | Gained | d | Won, close | edge | Fell, close | edge | HP taken, close | edge | Foe's HP lost, close | edge | Blows landed, close | edge | Seconds, close | edge |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
const all = [...cells.values()].map((cell) => ({ cell, r: read(cell.pairs) }));
for (const { cell, r } of all) console.log(line(`${cell.held} | ${cell.left} | ${cell.right} | ${cell.at} | ${cell.edge}`, r));
const names = [...new Set(all.map(({ cell }) => cell.edge))];
for (const name of names) {
  for (const held of helds) {
    const pooled = [...cells.values()].filter((cell) => cell.held === held && cell.edge === name).flatMap((cell) => cell.pairs);
    if (pooled.length) console.log(line(`${held} | every | pair | either | ${name}`, read(pooled)));
  }
  console.log(line(`every | every | pair | either | ${name}`, read([...cells.values()].filter((cell) => cell.edge === name).flatMap((cell) => cell.pairs))));
}
if (all.length) {
  const gained = all.filter(({ r }) => r.d > 0.2), lost = all.filter(({ r }) => r.d < -0.2);
  console.log(`\nHolding at the edge gains margin at d over 0.2 in ${gained.length} of ${all.length} cells, and loses it at d under -0.2 in ${lost.length}.`);
}
