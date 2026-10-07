/**
 * Whether a fighter that covers what threatens its head (`FighterMindConfig.guard`, `"cover"`) is
 * hit there less than one that guards in the pose: arena bouts (`bout.mjs`), each in a world of
 * its own on a worker (`bout-pool.mjs`).
 *
 *   node research/core-guard.mjs [--bouts 384] [--from 0] [--delays 0,24] [--held club,empty] [--models workshop-fighter,workshop-rogue]
 *     [--variants '[{}]'] [--workers 14] [--save rows.jsonl] [--load a.jsonl,b.jsonl]
 *
 * A bout has no seed: it is its recipe's. What stands for one is the gap the two start at, `--bouts`
 * of them from 3 to 5 m by the golden ratio's sequence, begun at its `--from`th: another `--from`
 * is a fresh set. At each gap, for what the right hands hold (`--held`), how many steps old what
 * each side senses is (`--delays`), and each ordered pair of `--models`, there is one bout with
 * both sides in the pose, the control, and for each variant one with the left covering and one
 * with the right.
 *
 * A cell is what is held, the delay, the pair and the side that covers. It prints, for each
 * variant:
 * - a row a cell: the hit points the covering side lost a bout to blows that met its head, in the
 *   control and covering, the mean of the control's less the cover's at the same gap and its
 *   effect size (Cohen's d of those paired differences); the same of all the hit points it lost;
 *   its falls, its wins and the bout's seconds, in each;
 * - a row a cell of the blows that side met a bout by the surface it met them with: its head, its
 *   trunk, a hand or forearm, what it holds, or anything else of it;
 * - the cells pooled by what is held and the delay, and whether the bar is met: every cell's d of
 *   the head's hit points over 0.2, with no more falls.
 *
 * - `--variants` are the covering side's experiments, each a part of its mind's config
 *   (`covering`, `threat`: `FighterMindConfig`): a sweep's cells, against one control.
 * - `--save` appends each bout's record to a file as it is read, and `--load` reads records in
 *   place of playing: a run cut short is not lost, and two sets are read as one.
 */
import { appendFileSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { DUEL_HELD, SIDES } from "../src/arena/duel.ts";
import { HUMANOID_MODELS } from "../src/core/models.ts";
import { FIGHTER } from "../src/core/mind/config.ts";
import { BOUT_HARNESS } from "./bout.mjs";
import { defaultLanes, playBouts } from "./bout-pool.mjs";

const { values } = parseArgs({ options: {
  bouts: { type: "string", default: "384" }, from: { type: "string", default: "0" }, delays: { type: "string", default: "0,24" },
  held: { type: "string", default: "club,empty" }, models: { type: "string", default: "workshop-fighter,workshop-rogue" },
  variants: { type: "string", default: "[{}]" }, workers: { type: "string" }, save: { type: "string" }, load: { type: "string" },
} });
const bouts = Number(values.bouts), from = Number(values.from), delays = values.delays.split(",").map(Number);
const helds = values.held.split(","), models = values.models.split(","), variants = JSON.parse(values.variants);
for (const held of helds) if (!DUEL_HELD.includes(held)) throw new Error(`--held is of ${DUEL_HELD.join(", ")}, not ${held}`);
for (const model of models) if (!HUMANOID_MODELS.includes(model)) throw new Error(`--models names no body: ${model} (one of ${HUMANOID_MODELS.join(", ")})`);

/** The gaps the bouts start at, m: from `GAPS.least`, over `GAPS.span`, to a tenth of a millimetre. */
const GAPS = { least: 3, span: 2 }, GOLDEN = (Math.sqrt(5) - 1) / 2;
const gapOf = (seed) => Math.round(1e4 * (GAPS.least + GAPS.span * (((seed + 0.5) * GOLDEN) % 1))) / 1e4;

/** The surfaces a side meets a blow with. */
const SURFACES = ["head", "trunk", "arm", "item", "other"];
function surfaceOf(side) {
  if (side.item !== null) return "item";
  if (side.segment === "head") return "head";
  if (side.segment.endsWith("Trunk")) return "trunk";
  if (side.segment.startsWith("hand.") || side.segment.startsWith("forearm.")) return "arm";
  return "other";
}

/** What a bout was to `side`: the hit points it lost, those of them to blows that met its head, the blows it met by surface, and how it ended for it. */
function sideOf(row, side) {
  const on = Object.fromEntries(SURFACES.map((surface) => [surface, 0]));
  let head = 0, taken = 0;
  for (const blow of row.landed) {
    const mine = blow.sides.find((one) => one.fighter === side), surface = surfaceOf(mine);
    on[surface]++;
    const lost = (mine.wound?.taken ?? []).reduce((sum, { hp }) => sum + hp, 0);
    taken += lost;
    if (surface === "head") head += lost;
  }
  return { head, taken, on, fell: row.fallen.includes(side), won: row.winner === side };
}

/** A bout's job, and the record its row becomes: `covers` is the side that covers, or null in the control. */
function jobOf(seed, held, delay, left, right, variant, covers) {
  const mind = (side) => side === covers ? { ...FIGHTER, guard: "cover", ...variants[variant] } : FIGHTER;
  return {
    key: { seed, gap: gapOf(seed), held, delay, left, right, variant, covers },
    recipe: { left, right, gap: gapOf(seed), senseDelay: delay, held: { left: held, right: held }, minds: { left: mind("left"), right: mind("right") } },
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
      for (const held of helds) for (const delay of delays) for (const left of models) for (const right of models) {
        jobs.push(jobOf(seed, held, delay, left, right, null, null));
        variants.forEach((_, variant) => { for (const covers of SIDES) jobs.push(jobOf(seed, held, delay, left, right, variant, covers)); });
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

const seeds = [...new Set(records.map((record) => record.seed))].sort((a, b) => a - b);
const variantsRead = [...new Set(records.filter((record) => record.variant !== null).map((record) => record.variant))].sort((a, b) => a - b);
const cellKey = (record) => `${record.held}|${record.delay}|${record.left}|${record.right}`;
const controls = new Map(records.filter((record) => record.covers === null).map((record) => [`${cellKey(record)}|${record.seed}`, record]));
const gaps = seeds.map(gapOf);
console.log(`${BOUT_HARNESS}; each side's balance its character's; ${records.length} bouts${values.load ? ` read from ${values.load}` : ` in ${((Date.now() - started) / 1000).toFixed(0)} s`}`);
console.log(`Starting gaps: ${seeds.length}, the golden ratio's sequence from its ${seeds[0]}th to its ${seeds.at(-1)}th, ${Math.min(...gaps)} to ${Math.max(...gaps)} m. Delay: steps old what each side senses of the other.`);

for (const variant of variantsRead) {
  const covered = records.filter((record) => record.variant === variant);
  /** A cell's pairs: the control and the covering bout at the same gap, as the covering side had them. */
  const cells = new Map();
  for (const record of covered) {
    const control = controls.get(`${cellKey(record)}|${record.seed}`);
    if (!control) continue;
    const key = `${cellKey(record)}|${record.covers}`;
    if (!cells.has(key)) cells.set(key, { held: record.held, delay: record.delay, left: record.left, right: record.right, covers: record.covers, pairs: [] });
    cells.get(key).pairs.push({ pose: control.sides[record.covers], cover: record.sides[record.covers], seconds: [control.seconds, record.seconds] });
  }
  /** What a set of pairs reads as: each measure in the pose and covering, and the two effect sizes. */
  const read = (pairs) => {
    const of = (which, measure) => mean(pairs.map((pair) => Number(pair[which][measure])));
    return {
      n: pairs.length,
      head: [of("pose", "head"), of("cover", "head")], headD: effect(pairs.map((pair) => pair.pose.head - pair.cover.head)),
      taken: [of("pose", "taken"), of("cover", "taken")], takenD: effect(pairs.map((pair) => pair.pose.taken - pair.cover.taken)),
      falls: [of("pose", "fell"), of("cover", "fell")], wins: [of("pose", "won"), of("cover", "won")],
      seconds: [mean(pairs.map((pair) => pair.seconds[0])), mean(pairs.map((pair) => pair.seconds[1]))],
      on: SURFACES.map((surface) => [mean(pairs.map((pair) => pair.pose.on[surface])), mean(pairs.map((pair) => pair.cover.on[surface]))]),
    };
  };
  const two = (pair, digits) => `${pair[0].toFixed(digits)} | ${pair[1].toFixed(digits)}`;
  const line = (label, r) => `| ${label} | ${r.n} | ${two(r.head, 3)} | ${(r.head[0] - r.head[1]).toFixed(3)} | ${r.headD.toFixed(2)} | ${two(r.taken, 3)} | ${r.takenD.toFixed(2)} | ${two(r.falls, 2)} | ${two(r.wins, 2)} | ${two(r.seconds, 1)} |`;
  const label = (cell) => `${cell.held} | ${cell.delay} | ${cell.left} | ${cell.right} | ${cell.covers}`;

  console.log(`\n## The covering side's mind: ${JSON.stringify({ guard: "cover", ...variants[variant] })}`);
  console.log("\nA bout, to the side that covers, in the pose (the control) and covering: hit points lost to blows that met its head, what covering saved of them and its effect size; all the hit points it lost and the effect size of what covering saved; the share of bouts it fell in, and won; the bout's seconds.\n");
  console.log("| Held | Delay | Left | Right | Covers | Gaps | Head HP, pose | cover | Saved | d | HP, pose | cover | d | Fell, pose | cover | Won, pose | cover | Seconds, pose | cover |");
  console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  const all = [...cells.values()].map((cell) => ({ cell, r: read(cell.pairs) }));
  for (const { cell, r } of all) console.log(line(label(cell), r));
  for (const held of helds) for (const delay of delays) {
    const pooled = [...cells.values()].filter((cell) => cell.held === held && cell.delay === delay).flatMap((cell) => cell.pairs);
    if (pooled.length) console.log(line(`${held} | ${delay} | every | pair | either`, read(pooled)));
  }
  console.log(line("every | delay | every | pair | either", read([...cells.values()].flatMap((cell) => cell.pairs))));

  console.log("\nThe blows the covering side met a bout, by the surface it met them with, in the pose and covering.\n");
  console.log(`| Held | Delay | Left | Right | Covers | ${SURFACES.map((surface) => `${surface}, pose | cover`).join(" | ")} |`);
  console.log(`|---|---|---|---|---|${SURFACES.map(() => "---|---|").join("")}`);
  for (const { cell, r } of all) console.log(`| ${label(cell)} | ${r.on.map((pair) => two(pair, 2)).join(" | ")} |`);

  const saved = all.filter(({ r }) => r.headD > 0.2), standing = saved.filter(({ r }) => r.falls[1] <= r.falls[0]);
  console.log(`\nThe bar: covering saves the head at d over 0.2 in ${saved.length} of ${all.length} cells, and in ${standing.length} of them with no more falls; the least d is ${Math.min(...all.map(({ r }) => r.headD)).toFixed(2)}.`);
}
