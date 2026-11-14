import { variationFault, variedMake, type Varied } from "../../framework/variations.ts";
import type { MotorAndGuard } from "../../framework/motor-and-guard.ts";
import meta from "../../../../assets/skills/recovery/righting/righting.meta.json" with { type: "json" };
import type { BodyView } from "../../../control/body.ts";
import type { Clock } from "../../../core/world/clock.ts";
import { dataOf } from "../../../core/data/store.ts";
import type { OwnBody } from "../../../core/bodies/own-body.ts";
import { fitsAll, type KeysOf } from "../../../parts/parts.ts";
import type { TechniquePart } from "../shared/technique.ts";
import { recordFault, tunedSettings, type SkillRecords } from "../../framework/records.ts";
import { deepFreeze } from "../../../core/state.ts";
import { fitsPaws } from "../../../control/quadruped/fit.ts";
import { LYING, RIGHTING, toStanding } from "../shared/righting.ts";
import { rightingByRecipe, wholeRecipe, type RightingRecipe } from "./righting-recipe/recipe.ts";

declare module "../../../core/data/store.ts" {
  interface DataOf {
    /** Every body's righting recipe. */
    "righting": SkillRecords<RightingRecipe>;
  }
}

/** **Righting by recipe**'s config: its kind, and an experiment's research `tuning`, a whole recipe in place of its body's, which a link does not carry. */
interface RecipeConfig extends Varied { readonly kind: "righting-recipe"; readonly tuning?: Partial<RightingRecipe> }

/**
 * **Righting by recipe** (`rightingByRecipe`) as a way up from lying (`LYING`): a body on paws
 * (`fitsPaws`) with a righting record of its own (`assets/skills/recovery/righting/righting.json`,
 * `dataOf("righting")`), or a whole research recipe in its place. It is done once its last pose
 * holds the trunk upright and still, wherever its legs bear.
 */
const RECIPE_VARIATIONS = {
  "righting-recipe": (own: OwnBody, _view: BodyView, _clock: Clock, _fitted: MotorAndGuard, config: RecipeConfig) =>
    rightingByRecipe(own, tunedSettings(dataOf("righting"), own.spec, config)),
};

export const RIGHTING_RECIPE = deepFreeze<TechniquePart<RecipeConfig>>({
  ...RIGHTING, edges: toStanding(LYING), label: "Right by recipe", defaults: { kind: "righting-recipe" }, keys: { kind: true, variation: true, tuning: true } as KeysOf<RecipeConfig>, tuning: ["settle", "servo", "upright", "calm", "still", "limit", "side", "back"],
  fits: fitsAll<RecipeConfig>(variationFault("righting-recipe", "righting by recipe", RECIPE_VARIATIONS), fitsPaws, recordFault("righting", deepFreeze(meta.bodies), wholeRecipe)),
  faults: (config: RecipeConfig) => config.tuning === undefined || wholeRecipe(config.tuning) ? [] : ["invalid righting recipe"],
  reads: () => ["righting"],
  make: variedMake("righting-recipe", RECIPE_VARIATIONS, (own, _view, _clock, _fitted, config) => [own.spec, config]),
  skillGroup: "Stand-up", variations: Object.keys(RECIPE_VARIATIONS),
});

declare module "../shared/technique.ts" {
  interface TechniqueConfigs {
    readonly "righting-recipe": RecipeConfig;
  }
}
