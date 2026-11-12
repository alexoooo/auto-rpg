/**
 * **A skill's drill trials, for research** ([the skill recipe](../docs/recipes/skill.md#an-options-code):
 * research scores on its drill). A table cell's trials (`cell`) or those of its readings' training
 * twins (`twin`, `Cases.twin`): the conditions the drill's own admission gives the cell's subject on
 * the cell's body and loadout (`casesOf`, `casesOn`), each a plain record a worker can take. A trial
 * is played with a subject's value given whole (the cell's subject with a candidate's settings in
 * it), at the game's rate or a finer one, and valued as the cell values it (`trialValue`, a fall at
 * `FALL_PRICE`), its reading beside the value; a search scores it by `searchScore`, the value
 * graded. A search works a body's row (`rowOf`), its trials played on worker threads (`trialPool`,
 * `scoreOn`), and its record is kept on the row's confirmation (`confirmRow`).
 *
 *   import { cellOf, drillTrials, playTrial, subjectOf, confirm } from "../drill-trials.mjs";
 *   const cell = cellOf({ body: "workshop-fighter", skill: "stomp", loadout: "empty,empty" });
 *   const trials = drillTrials(cell, "twin");           // research's; "cell" for the held-out cases
 *   const one = await playTrial(trials[0], valueWith(subjectOf(trials[0])), { hz: 120 });
 *   const kept = await confirm(cell, (trial) => valueWith(subjectOf(trial)));   // 120 and 480 Hz, the worse counting
 */
import { fileURLToPath } from "node:url";
import { isMainThread, parentPort, workerData } from "node:worker_threads";
import "../tests/harness/preload-data.mjs";
import { workerPool } from "./cma.mjs";
import { graded } from "../src/evaluation/strike/score.ts";
import { isRefused } from "../src/core/refusal.ts";
import { DEFAULT_ENGINE } from "../src/core/physics/engines.ts";
import { loadoutKey } from "../src/core/bodies/items/held.ts";
import { EVALUATIONS, playCase, tableCells } from "../src/app/node/evaluation.ts";
import { casesOf } from "../src/evaluation/run.ts";
import { caseName } from "../src/evaluation/results.ts";
import { casesOn, FALL_PRICE, keep, trialValue, unitOf } from "../src/evaluation/table/judge.ts";

/** The rates a confirmation plays the cell's cases at, Hz: the game's and a finer one, the worse counting. */
export const CONFIRM_RATES = Object.freeze([120, 480]);

/** The table's cell of `body`, `skill` and `loadout` (`left,right`, empty hands where not given). */
export function cellOf({ body, skill, loadout = "empty,empty" }) {
  const cell = tableCells().find((one) => one.body === body && one.skill === skill && loadoutKey(one.loadout) === loadout);
  if (!cell) throw new Error(`the table has no cell ${body} ${loadout} ${skill}`);
  return cell;
}

/** The protocol `reading` plays as `held`: its own (`cell`) or its training twin (`twin`), which every protocol a cell reads names. */
function protocolOf(reading, held) {
  if (held === "cell") return reading.protocol;
  if (held !== "twin") throw new Error(`a cell's trials are its own (cell) or its twin's (twin), not ${held}`);
  const twin = EVALUATIONS[reading.drill].protocols[reading.protocol]?.twin;
  if (!twin) throw new Error(`${reading.drill}/${reading.protocol} names no training twin (Cases.twin)`);
  return twin;
}

/**
 * **`cell`'s trials as `held`** (`twin`, research's; `cell`, held out): for each of its readings,
 * every condition its subject is admitted to on the cell's body and loadout, each a plain record
 * of where it is played and how it is judged.
 */
export function drillTrials(cell, held) {
  return cell.readings.flatMap((reading) => {
    const evaluation = EVALUATIONS[reading.drill], protocol = protocolOf(reading, held), cases = evaluation.protocols[protocol];
    const [subject] = evaluation.subjects([reading.subject]);
    const scheduled = casesOf(evaluation, protocol, [subject], { engine: cases.engine ?? DEFAULT_ENGINE, code: () => "", schedule: { kind: "all" } });
    if (isRefused(scheduled)) throw new Error(`${reading.drill}/${protocol}: ${scheduled.refused}`);
    return casesOn(cell, reading, scheduled.units.flat()).map(({ condition }) => ({ drill: reading.drill, protocol, subject: reading.subject,
      judge: { judge: reading.judge, ...(reading.hit === undefined ? {} : { hit: reading.hit }) }, condition, name: caseName(condition) }));
  });
}

/** The subject `trial` reads as its evaluation resolves it: its value, the one a candidate's settings are written into. */
export const subjectOf = (trial) => EVALUATIONS[trial.drill].subjects([trial.subject])[0];

/**
 * **`trial` played with the subject's value `value`**, at `hz` steps a second (the game's where not
 * given): its reading, what its judge keeps, its outcome and its value as the cell values it.
 */
export async function playTrial(trial, value, { hz } = {}) {
  const evaluation = EVALUATIONS[trial.drill], cases = evaluation.protocols[trial.protocol], subject = subjectOf(trial);
  const world = cases.world([value], trial.condition, cases.engine ?? DEFAULT_ENGINE, [subject.character ?? {}]);
  if (isRefused(world)) throw new Error(`${trial.drill}/${trial.protocol} ${trial.name}: ${world.refused}`);
  const played = await playCase(world, cases.seconds, (built) => cases.read(built, trial.condition), hz === undefined ? {} : { hz });
  if (isRefused(played)) throw new Error(`${trial.drill}/${trial.protocol} ${trial.name}: ${played.refused}`);
  const kept = keep(trial.judge, played.reading), outcome = evaluation.outcome?.(played.reading).label ?? null;
  return { name: trial.name, reading: played.reading, kept, outcome, value: trialValue(trial.judge.judge, { kept, outcome }, FALL_PRICE) };
}

/** The mean value of `played` trials that count (a fall not made, a blow whose fixture did not reach its case, does not), null where none does. */
export function meanValue(played) {
  const counted = played.map((one) => one.value).filter((value) => value !== null);
  return counted.length === 0 ? null : counted.reduce((sum, value) => sum + value, 0) / counted.length;
}

/**
 * **The confirmation**: `cell`'s own cases, held out from research, played at each rate of `rates`
 * with `valueOf(trial)` (the subject's value with the candidate's settings), on `play` (`playTrial`
 * by default; a worker pool's in a script). Each rate's mean value, and the worse of them, the one a
 * record is kept on, so a fit to the engine's step at the game's rate is caught at the finer one.
 */
export async function confirm(cell, valueOf, { rates = CONFIRM_RATES, play = playTrial } = {}) {
  const trials = drillTrials(cell, "cell"), unit = unitOf(cell.readings[0].judge), byRate = {};
  for (const hz of rates) byRate[hz] = meanValue(await Promise.all(trials.map((trial) => play(trial, valueOf(trial), { hz }))));
  const values = Object.values(byRate);
  const worse = values.includes(null) ? null : unit.better === "higher" ? Math.min(...values) : Math.max(...values);
  return { byRate, worse, unit };
}

/**
 * **A body's row of `skill`**: the table's cells of that body and skill, one a loadout the body
 * does it holding ([the skill recipe](../docs/recipes/skill.md#one-row-one-question): a run works
 * one row); the one cell of `loadout` where it is given.
 */
export function rowOf({ body, skill, loadout }) {
  if (loadout !== undefined) return [cellOf({ body, skill, loadout })];
  const cells = tableCells().filter((one) => one.body === body && one.skill === skill);
  if (cells.length === 0) throw new Error(`the table has no ${skill} on ${body}`);
  return cells;
}

/**
 * **A row confirmed**: each of `cells` confirmed (`confirm`) and the mean of their worse values, the
 * row's, which a record is kept on; null where a cell's is.
 */
export async function confirmRow(cells, valueOf, options = {}) {
  const each = [];
  for (const cell of cells) each.push({ loadout: loadoutKey(cell.loadout), ...await confirm(cell, valueOf, options) });
  const worse = each.some((one) => one.worse === null) ? null : each.reduce((sum, one) => sum + one.worse, 0) / each.length;
  return { cells: each, worse };
}

/**
 * **A subject's value with its skill so set**: a drill subject's mind with the Option of the skill
 * it drills (`value.skill`) given `tuning`, its research tuning over the body's record (the
 * record's network then unread), everything else the cell's: its other Options, its window's
 * settings where `tuning` names none, what it holds.
 */
export function withTuning(value, tuning) {
  let found = 0;
  const options = value.mind.options.map((option) => option.skill?.kind !== value.skill ? option : (found++, { ...option, skill: { ...option.skill, tuning } }));
  if (found !== 1) throw new Error(`the subject's mind has ${found} Options of ${value.skill}, not one`);
  return { ...value, mind: { ...value.mind, options } };
}

/**
 * **A trial's score in a search**, the skill's value graded ([the skill recipe](../docs/recipes/skill.md#1-the-reader-and-its-score)):
 * its value as the cell values it (`playTrial`), a blow that did not land graded below it by how far
 * short of the drill's bar it came (`graded`, the strike drill's `value` term, which training is
 * rewarded by). Any other judge's, its value alone. Null where the trial does not count.
 */
export function searchScore(trial, { value, reading, outcome }) {
  if (value === null || trial.judge.judge !== "strike") return value;
  return graded(value, reading, "hand" in trial.condition ? trial.condition.hand : null, outcome === "landed");
}

/** A played trial as a worker sends it back: its name, outcome, value and search score, and whether it ended down (a blow's or a cover's `down`, a move's `fell`). */
const brief = (trial, played) => ({ name: played.name, outcome: played.outcome, value: played.value, score: searchScore(trial, played), down: !!(played.reading?.down || played.reading?.fell) });

/**
 * **Trials played on worker threads**, `count` of them: `play(trial, value, { hz })` as `playTrial`
 * plays it, resolved with its brief (its name, outcome, value, search score and fall), for a
 * search's candidates and `confirm` alike; `terminate` when done.
 */
export function trialPool(count) {
  const pool = workerPool(fileURLToPath(import.meta.url), { drillTrials: true }, count);
  return {
    play: async (trial, value, { hz } = {}) => {
      const r = await pool.evaluate({ trial, value, hz });
      if (r.error) throw new Error(`${trial.name}: ${r.error}`);
      return r;
    },
    terminate: () => pool.terminate(),
  };
}

/**
 * **A candidate scored on `trials`**: each played with `valueOf(trial)` at `hz` (the game's rate)
 * on `play` (a `trialPool`'s), the mean search score and value of those that count, how many
 * landed and fell, and each one's brief.
 */
export async function scoreOn(trials, valueOf, { play, hz = 120 }) {
  const each = await Promise.all(trials.map(async (trial) => {
    const played = await play(trial, valueOf(trial), { hz });
    return "score" in played ? played : brief(trial, played);
  }));
  const counted = each.filter((one) => one.score !== null);
  return { score: counted.length === 0 ? null : counted.reduce((sum, one) => sum + one.score, 0) / counted.length, value: meanValue(each),
    landed: each.filter((one) => one.outcome === "landed").length, falls: each.filter((one) => one.down).length, trials: each.length, each };
}

if (!isMainThread && workerData?.drillTrials) {
  parentPort.on("message", async ({ id, x: { trial, value, hz } }) => {
    let r; try { r = brief(trial, await playTrial(trial, value, hz === undefined ? {} : { hz })); } catch (error) { r = { error: String(error?.stack ?? error) }; }
    parentPort.postMessage({ id, r });
  });
}
