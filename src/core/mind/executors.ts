import { RECIPE_PART } from "../skills/recipe-part.ts";
import { PATH_PART } from "../skills/path-part.ts";
import { KICK_PART } from "../skills/kick-part.ts";
import { PUNCH_PART } from "../skills/punch-part.ts";
import { COMBINATION_PART } from "../skills/combination-part.ts";
import { BLADE_CUT_PART, BLADE_THRUST_PART } from "../skills/blade-part.ts";

/**
 * **Every executor, by its kind** (`ExecutorPart`), in the order a picker offers them: what a
 * fighter's executors list holds, a kind its own module and a line here. This module holds its
 * imports and this list and nothing else: a case's code reads it as where each kind's own code
 * begins (`caseCoder`, `scripts/build-identity.mjs`).
 */
export const EXECUTORS = { "recipe-strike": RECIPE_PART, "path-strike": PATH_PART, "front-kick": KICK_PART,
  "straight-punch": PUNCH_PART, "combination": COMBINATION_PART, "blade-cut": BLADE_CUT_PART, "blade-thrust": BLADE_THRUST_PART };
