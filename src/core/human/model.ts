import type { SourceKey } from "../sources.ts";
import { derive, sourced, type Quantity } from "../spec/quantity.ts";
import type { Sex } from "./tables/de-leva-1996.ts";
import type { WorkshopModel } from "./rig.ts";

/**
 * **What each workshop model is, before its segments**: its sex, its size and its mass.
 *
 * - **Size.** x1 is the owner's typical adult, a 1.77 m man. The Warrior's skin top at the authored
 *   size sets one fit scale, and both models are built at it, so the Rogue keeps her size against
 *   him.
 * - **Mass.** The Warrior is the typical adult's 79 kg. The Rogue is his mass times the ratio of
 *   the two models' measured volumes: her own build at his density.
 */

/**
 * Which column of a sex-specific table a model reads. The models were built from MakeHuman's male
 * and female bases ("The male fighter and female rogue", `docs/art/characters.md`).
 */
export const WORKSHOP_SEX: Readonly<Record<WorkshopModel, Sex>> = Object.freeze({
  "workshop-fighter": "male",
  "workshop-rogue": "female",
});

/**
 * The top of each model's skin at the authored size, bind pose, soles on 0: the maximum height of
 * `base__skin`'s positions, as the glTF's accessor states it. Hair is not stature.
 */
const SKIN_TOP: Readonly<Record<WorkshopModel, { readonly source: SourceKey; readonly accessor: number; readonly value: number }>> = Object.freeze({
  "workshop-fighter": { source: "workshop-fighter-glb", accessor: 231, value: 1.8804991245269775 },
  "workshop-rogue": { source: "workshop-rogue-glb", accessor: 220, value: 1.7304996252059937 },
});

export const skinTop = (model: WorkshopModel): Quantity<number> => {
  const { source, accessor, value } = SKIN_TOP[model];
  return sourced(value, "m", source, `/accessors/${accessor}/max/1`);
};

/** x1's stature and mass for a man, each the middle of the owner's range. */
export const TYPICAL_MAN_STATURE = sourced(1.77, "m", "owner-typical-adult", "x1's stature for a man: the middle of 1.76-1.78 m");
export const TYPICAL_MAN_MASS = sourced(79, "kg", "owner-typical-adult", "x1's mass for a man: the middle of 78-80 kg");

/** The one factor from the authored size to x1: the typical man's stature over the Warrior's skin top. */
export const FIT_SCALE: Quantity<number> = derive("1", "the typical man's stature over the Warrior's skin top",
  [TYPICAL_MAN_STATURE, skinTop("workshop-fighter")], (stature, top) => stature / top);

/** A model's stature at x1: its skin top at the fit scale. */
export const stature = (model: WorkshopModel): Quantity<number> =>
  derive("m", "the skin top at the fit scale", [skinTop(model), FIT_SCALE], (top, scale) => top * scale);

/** Each model's volume at the authored size: the "Taken" column. */
const VOLUME: Readonly<Record<WorkshopModel, Quantity<number>>> = Object.freeze({
  "workshop-fighter": sourced(109.5, "l", "workshop-volumes", "section 8, volume table, Warrior, Taken"),
  "workshop-rogue": sourced(79.8, "l", "workshop-volumes", "section 8, volume table, Rogue, Taken"),
});

/**
 * A model's mass at x1: the typical man's mass times its volume over the Warrior's. Both volumes
 * are at the authored size and both models are built at one scale, so the scale cancels.
 */
export const bodyMass = (model: WorkshopModel): Quantity<number> =>
  derive("kg", "the typical man's mass times the model's volume over the Warrior's",
    [TYPICAL_MAN_MASS, VOLUME[model], VOLUME["workshop-fighter"]], (mass, volume, warrior) => mass * volume / warrior);
