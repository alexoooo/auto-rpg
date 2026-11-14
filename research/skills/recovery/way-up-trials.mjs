/**
 * **The way-up cells a staged record drives, for research** ([research scores on its
 * drill](../../../docs/recipes/skill.md#an-options-code)): a search of the step-up or the sit-back
 * record scores on the twin of every table cell of the ways up that record drives
 * (`RECORD_WAYS`, [the way-up drill](../../../docs/reference/rising.md#the-way-up-drill)), a
 * candidate played as the cell's subject with every staged way up of its mind tuned by it
 * (`stagedValue`), and is confirmed on the cells' own falls (`confirm`, `research/drill-trials.mjs`).
 *
 *   import { RECORD_WAYS, wayCells, stagedValue, tuningOn } from "./way-up-trials.mjs";
 *   const cells = wayCells(RECORD_WAYS["sit-back"], "woman");
 *   const value = (trial) => stagedValue(subjectOf(trial).value, tuningOn(trial, { sitBack: settings }));
 */
import { tableCells } from "../../../src/app/node/evaluation.ts";
import { loadoutKey } from "../../../src/core/bodies/items/held.ts";
import { modelHolding } from "../../../src/core/bodies/models.ts";
import { stepUpTuningWith } from "../../../src/skills/recovery/implementations/staged/records.ts";

/** The ways up each staged record drives: the step-up record the roll and the way down to hands and knees, the sit-back record both sit-backs. */
export const RECORD_WAYS = Object.freeze({ "step-up": ["staged-roll", "staged-down"], "sit-back": ["sit-back", "front-sit-back"] });

/** The staged ways up, whose technique takes a whole step-up tuning (`StagedConfig.tuning`) in place of the body's records. */
const STAGED = new Set([...RECORD_WAYS["step-up"], ...RECORD_WAYS["sit-back"]]);

/** **The table's way-up cells of `ways` on `model`**: on every loadout it has one, or on `loadout` (`left,right`) alone. */
export const wayCells = (ways, model, loadout) => tableCells().filter((cell) => cell.body === model && ways.includes(cell.skill)
  && (loadout === undefined || loadoutKey(cell.loadout) === loadout));

/** A way-up subject's value (`WayUpValue`) with every staged way up of its mind played on `tuning`, a whole step-up tuning. */
export const stagedValue = (value, tuning) => ({ ...value, mind: { ...value.mind,
  options: value.mind.options.map((option) => STAGED.has(option.skill?.kind) ? { ...option, skill: { ...option.skill, tuning } } : option) } });

/** The step-up tuning of `trial`'s body holding its loadout with `records` (`stepUp`, `sitBack`) in place of its records (`stepUpTuningWith`). */
export const tuningOn = (trial, records) => stepUpTuningWith(modelHolding(trial.condition.model, trial.condition.loadout), records);
