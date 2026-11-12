/**
 * **The locomotion scorecard**: a move's settings read on its drill, so that two gaits, or two
 * settings of one, are read on the same thing ([the skill recipe](../../../docs/recipes/skill.md#an-options-code):
 * research scores on its drill). Each body's walk row (`--skills walk,run` adds the run's), its
 * cells' training twins at the game's rate, 120 Hz (`move-drill.mjs`), each trial played with the
 * cell's own subject (`option-drill`) given the settings and valued as the cell values it: seconds
 * lost against the orders, a fall at `FALL_PRICE`. With `--cell`, the cells' own cases instead, held
 * out from research, at `--hz` (the confirmation's rates are 120 and 480).
 *
 * It prints, per body, skill and loadout, the trials, the falls and the mean time lost, and writes
 * each trial to `--out` (a line each: body, skill, loadout, trial, outcome, value, fell). With
 * `--against <other.jsonl>`, each cell is paired with that reading's trial by trial: the mean
 * difference with its 95 % bootstrap interval and verdict (`compareValues`), and the trials only one
 * of them fell in.
 *
 *   node research/skills/locomotion/locomotion-scorecard.mjs --out .tmp/<task>/card.jsonl [--bodies workshop-fighter,workshop-rogue]
 *     [--skills walk,run] [--legs '<json>'|file] [--stance '<json>'|file] [--gait run='<json>'|file ...]
 *     [--cell [--hz 480]] [--against <other.jsonl>] [--workers 14]
 *
 * - `--legs`: Move's legs in place of those the body fits (`withLegs`), whole.
 * - `--stance`: the stance's research tuning (`StanceTuning`) over the body's calibration.
 * - `--gait <name>=<tuning>`: a stock gait's research tuning over its own, the run's
 *   (`walk`, `run`, `braking`, `stride`, `learned`); given once a gait.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { parseArgs } from "node:util";
import { loadoutKey } from "../../../src/core/bodies/items/held.ts";
import { compareValues, unitOf } from "../../../src/evaluation/table/judge.ts";
import { drillTrials, scoreOn, trialPool } from "../../drill-trials.mjs";
import { moveRow, valuesWith } from "./move-drill.mjs";

const { values: o } = parseArgs({ options: {
  out: { type: "string" }, bodies: { type: "string", default: "workshop-fighter,workshop-rogue" }, skills: { type: "string", default: "walk" },
  legs: { type: "string" }, stance: { type: "string" }, gait: { type: "string", multiple: true }, cell: { type: "boolean" }, hz: { type: "string", default: "120" },
  against: { type: "string" }, workers: { type: "string" },
} });
if (!o.out) throw new Error("--out names the reading");
/** A setting given inline as JSON or as a file holding it. */
const given = (text) => JSON.parse(text.trimStart().startsWith("{") ? text : readFileSync(text, "utf8"));
const gaits = Object.fromEntries((o.gait ?? []).map((one) => {
  const at = one.indexOf("=");
  if (at < 1) throw new Error(`--gait names a gait and its tuning (run=<json>), not ${one}`);
  return [one.slice(0, at), given(one.slice(at + 1))];
}));
const settings = { ...(o.legs ? { legs: given(o.legs) } : {}), ...(Object.keys(gaits).length ? { gaits } : {}), ...(o.stance ? { stance: given(o.stance) } : {}) };
const valueOf = valuesWith(Object.keys(settings).length ? settings : null), hz = Number(o.hz);
const pool = trialPool(Number(o.workers ?? Math.max(1, availableParallelism() - 4)));
const rows = [], started = Date.now();
try {
  for (const body of o.bodies.split(",")) for (const skill of o.skills.split(",")) for (const cell of moveRow({ body, skill }).cells) {
    const loadout = loadoutKey(cell.loadout), played = await scoreOn(drillTrials(cell, o.cell ? "cell" : "twin"), valueOf, { play: pool.play, hz });
    for (const one of played.each) rows.push({ body, skill, loadout, trial: one.name, outcome: one.outcome, value: one.value, fell: one.down });
    console.log(`${body} ${skill} ${loadout}: ${played.trials} trials, fell ${played.falls}, lost ${played.value?.toFixed(3) ?? "-"} s a trial`);
  }
} finally { await pool.terminate(); }
writeFileSync(o.out, rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
console.log(`scorecard ${o.out}: ${rows.length} trials (${o.cell ? `the cells' own cases at ${hz} Hz` : "the twins at 120 Hz"}) in ${((Date.now() - started) / 60000).toFixed(1)} min; ${JSON.stringify(settings)}`);
if (o.against) {
  if (!existsSync(o.against)) throw new Error(`no reading ${o.against}`);
  const then = readFileSync(o.against, "utf8").trim().split("\n").map((line) => JSON.parse(line));
  const keyOf = (row) => `${row.body} ${row.skill} ${row.loadout}`, unit = unitOf("orders");
  for (const group of [...new Set(rows.map(keyOf))]) {
    const mine = rows.filter((row) => keyOf(row) === group), theirs = new Map(then.filter((row) => keyOf(row) === group).map((row) => [row.trial, row]));
    const values = (list) => new Map(list.filter((row) => row.value !== null).map((row) => [row.trial, row.value]));
    const c = compareValues(values(mine), values([...theirs.values()]), unit);
    const onlyNow = mine.filter((row) => row.fell && theirs.has(row.trial) && !theirs.get(row.trial).fell).length;
    const onlyThen = mine.filter((row) => !row.fell && theirs.get(row.trial)?.fell).length;
    console.log(`${group}: ${c.verdict} over ${c.pairs} pairs, ${c.difference?.toFixed(3) ?? "-"} s (${c.low?.toFixed(3) ?? "-"} to ${c.high?.toFixed(3) ?? "-"}); fell only now ${onlyNow}, only then ${onlyThen}`);
  }
}
