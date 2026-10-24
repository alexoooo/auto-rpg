import { AIMED_ACTIONS, type ExecutorPart } from "../../mind/executor-part.ts";
import { text } from "../../mind/fields.ts";
import { RECIPE_PART } from "../../skills/recipe-part.ts";
import { holdsNothing } from "../../skills/strikes.ts";

type RecipeConfig = typeof RECIPE_PART.defaults;
interface WeaponConfig extends Omit<RecipeConfig, "kind"> { readonly kind: "vanguard-weapon" }

const recipe = (config: WeaponConfig): RecipeConfig => ({ ...config, kind: "recipe-strike" });

/** Held items use the shared recipe executor; an empty hand retains its committed punch. */
export const VANGUARD_WEAPON: ExecutorPart<WeaponConfig> = {
  role: "executor", label: "Vanguard weapon strike", stage: "experimental",
  defaults: { kind: "vanguard-weapon", name: "weapon" }, keys: { kind: true, name: true, tuning: true },
  fields: [text("name", "Name")], slots: [], tuning: RECIPE_PART.tuning, effectors: RECIPE_PART.effectors, ...AIMED_ACTIONS,
  fits: (spec, config, parts) => RECIPE_PART.fits(spec, recipe(config), parts),
  faults: (config, parts) => RECIPE_PART.faults(recipe(config), parts),
  strikesWith: (spec, config, effector) => !holdsNothing(spec, effector) && RECIPE_PART.strikesWith!(spec, recipe(config), effector),
  make: (making, config, actions) => RECIPE_PART.make(making, recipe(config), actions),
  estimate: (spec, config, action, aim, unit) => RECIPE_PART.estimate?.(spec, recipe(config), action, aim, unit) ?? null,
};
