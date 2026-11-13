import type { SourceKey } from "../../sources.ts";
import { derive, sourced, type Quantity } from "../../quantity.ts";
import type { Sex } from "./tables/de-leva-1996.ts";
import type { HumanModel } from "./rig.ts";
import skinBounds from "../../../../assets/humanoid/skin-bounds.json" with { type: "json" };

/**
 * **What each human model is, before its segments**: its sex, its size and its mass.
 *
 * - **Size.** x1 is a typical adult, a 1.77 m man. The Warrior's skin top at the authored
 *   size sets one fit scale, and both models are built at it, so the Rogue keeps her size against
 *   him.
 * - **Mass.** The Warrior is the typical adult's 79 kg. The Rogue is his mass times the ratio of
 *   the two models' measured volumes: her own build at his density.
 */

/**
 * Which column of a sex-specific table a model reads. The models were built from MakeHuman's male
 * and female bases ("The male fighter and female rogue", `docs/art/characters.md`).
 */
export const HUMAN_SEX: Readonly<Record<HumanModel, Sex>> = Object.freeze({
  man: "male",
  woman: "female",
});

/**
 * The top of each model's skin at the authored size, bind pose, soles on 0: the maximum height of
 * `base__skin`'s positions, recorded losslessly in `assets/humanoid/skin-bounds.json`.
 * Hair is not stature; delivery compression never supplies this measurement.
 */
const SKIN_SOURCE: Readonly<Record<HumanModel, SourceKey>> = Object.freeze({
  man: "man-bounds",
  woman: "woman-bounds",
});

export const skinTop = (model: HumanModel): Quantity<number> => {
  return sourced(skinBounds[model].skinTop, "m", SKIN_SOURCE[model], `/${model}/skinTop`);
};

/** x1's stature and mass for a man, each the middle of a typical man's range. */
const TYPICAL_MAN_STATURE = sourced(1.77, "m", "owner-typical-adult", "x1's stature for a man: the middle of 1.76-1.78 m");
const TYPICAL_MAN_MASS = sourced(79, "kg", "owner-typical-adult", "x1's mass for a man: the middle of 78-80 kg");

/** The one factor from the authored size to x1: the typical man's stature over the Warrior's skin top. */
export const FIT_SCALE: Quantity<number> = derive("1", "the typical man's stature over the Warrior's skin top",
  [TYPICAL_MAN_STATURE, skinTop("man")], (stature, top) => stature / top);

/** A model's stature at x1: its skin top at the fit scale. */
export const stature = (model: HumanModel): Quantity<number> =>
  derive("m", "the skin top at the fit scale", [skinTop(model), FIT_SCALE], (top, scale) => top * scale);

/** Each model's volume at the authored size: the "Taken" column. */
const VOLUME: Readonly<Record<HumanModel, Quantity<number>>> = Object.freeze({
  man: sourced(109.5, "l", "human-volumes", "section 8, volume table, Warrior, Taken"),
  woman: sourced(79.8, "l", "human-volumes", "section 8, volume table, Rogue, Taken"),
});

/**
 * A model's mass at x1: the typical man's mass times its volume over the Warrior's. Both volumes
 * are at the authored size and both models are built at one scale, so the scale cancels.
 */
export const bodyMass = (model: HumanModel): Quantity<number> =>
  derive("kg", "the typical man's mass times the model's volume over the Warrior's",
    [TYPICAL_MAN_MASS, VOLUME[model], VOLUME["man"]], (mass, volume, warrior) => mass * volume / warrior);
