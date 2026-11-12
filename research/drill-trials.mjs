/**
 * **A skill's drill trials, for research** ([the skill recipe](../docs/recipes/skill.md#an-options-code):
 * research scores on its drill). A table cell's trials (`cell`) or those of its readings' training
 * twins (`twin`, `Cases.twin`): the conditions the drill's own admission gives the cell's subject on
 * the cell's body and loadout (`casesOf`, `casesOn`), each a plain record a worker can take. A trial
 * is played with a subject's value given whole (the cell's subject with a candidate's settings in
 * it), at the game's rate or a finer one, and valued as the cell values it (`trialValue`, a fall at
 * `FALL_PRICE`), its reading beside the value for a script's own graded score.
 *
 *   import { cellOf, drillTrials, playTrial, subjectOf, confirm } from "../drill-trials.mjs";
 *   const cell = cellOf({ body: "workshop-fighter", skill: "stomp", loadout: "empty,empty" });
 *   const trials = drillTrials(cell, "twin");           // research's; "cell" for the held-out cases
 *   const one = await playTrial(trials[0], valueWith(subjectOf(trials[0])), { hz: 120 });
 *   const kept = await confirm(cell, (trial) => valueWith(subjectOf(trial)));   // 120 and 480 Hz, the worse counting
 */
import "../tests/harness/preload-data.mjs";
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
