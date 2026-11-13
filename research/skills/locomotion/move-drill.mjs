/**
 * **A move's settings on its drill** ([the skill recipe](../../../docs/recipes/skill.md#an-options-code):
 * research scores on its drill): the walk's or the run's row of a body (`rowOf`; the walk's cells
 * read Locomotion `every`, the run's Travel `confirmation` on the Warrior and Locomotion `run` on the
 * Rogue), its trials those cells' training twins, each played with the cell's own subject (the
 * drills' Option Mind, `option-drill`) given a candidate's settings (`moveValue`) and valued as the
 * cell values it: seconds lost against the orders, a fall at `FALL_PRICE`, lower better. A search
 * maximises `-lost`; a record is kept on the row's own cases at 120 and 480 Hz, the worse counting
 * (`confirmMove`).
 *
 * A candidate's settings (`MoveSettings`): `legs`, Move's legs in place of those the body fits
 * (`withLegs`); `gaits`, by a stock gait's name, research tuning over its own (`withGaitTuning`: the
 * run's `walk`, `run`, `braking`, `stride`, `learned`); `stance`, the stance's tuning over its
 * body's calibration (`withStanceTuning`).
 */
import "../../../tests/harness/preload-data.mjs";
import { isRefused } from "../../../src/core/refusal.ts";
import { dataOf } from "../../../src/core/data/store.ts";
import { modelSpec } from "../../../src/core/bodies/models.ts";
import { withLegs } from "../../../src/minds/option/config.ts";
import { withGaitTuning, withStanceTuning } from "../../../src/minds/option/index.ts";
import { confirmRow, drillTrials, rowOf, subjectOf } from "../../drill-trials.mjs";

/** The skills a move's research works: the walk's row and the run's. */
export const MOVES = Object.freeze(["walk", "run"]);

/** `body`'s row of the move `skill` (`walk` or `run`), the one cell of `loadout` where given, and their training twins' trials. */
export function moveRow({ body, skill, loadout }) {
  if (!MOVES.includes(skill)) throw new Error(`a move's research works the walk or the run, not ${skill}`);
  const cells = rowOf({ body, skill, ...(loadout ? { loadout } : {}) });
  return { cells, trials: cells.flatMap((cell) => drillTrials(cell, "twin")) };
}

/** A drill subject's mind `value` with `settings` (`legs`, `gaits`, `stance`) in it; the value itself where they name none. */
export function moveValue(value, { legs, gaits = {}, stance } = {}) {
  let mind = legs === undefined ? value : withLegs(value, legs);
  for (const [gait, tuning] of Object.entries(gaits)) {
    if (legs !== undefined) throw new Error("a gait's tuning goes onto the stock gaits, not onto legs given whole");
    const tuned = withGaitTuning(mind, gait, tuning);
    if (isRefused(tuned)) throw new Error(tuned.refused);
    mind = tuned;
  }
  return stance === undefined ? mind : withStanceTuning(mind, stance);
}

/** Each trial's subject value with `settings` in it (`moveValue`), each subject resolved once; null settings, the cell's own. */
export function valuesWith(settings) {
  const values = new Map();
  return (trial) => {
    if (!values.has(trial.subject)) values.set(trial.subject, settings === null ? subjectOf(trial).value : moveValue(subjectOf(trial).value, settings));
    return values.get(trial.subject);
  };
}

/** The walk and run's record of `body` (`walk-run.json`, by its key): its settings, which a search's start and a learned policy go over. */
export function walkRunRecord(body) {
  const settings = dataOf("walk-run")[modelSpec(body).model]?.settings;
  if (!settings) throw new Error(`${body} has no walk and run record`);
  return settings;
}

/**
 * **A candidate against the record, confirmed**: the row's own cases, held out from research, at
 * 120 and 480 Hz with `settings` and with none (the record), the worse rate counting (`confirmRow`);
 * kept, the one that lost less time.
 */
export async function confirmMove(cells, settings, { play }) {
  const best = await confirmRow(cells, valuesWith(settings), { play }), record = await confirmRow(cells, valuesWith(null), { play });
  return { best, record, kept: best.worse !== null && (record.worse === null || best.worse < record.worse) ? "best" : "record" };
}
