import { deepFreeze } from "../state.ts";
import { RECIPE_PART } from "../skills/recipe-part.ts";
import { PATH_PART, DRIVEN_PART } from "../skills/path-part.ts";
import { KICK_PART } from "../skills/kick-part.ts";
import { PUNCH_PART } from "../skills/punch-part.ts";
import { COMBINATION_PART } from "../skills/combination-part.ts";
import { WHOLE_BODY_PART } from "../skills/whole-body-part.ts";
import { BLADE_CUT_PART, BLADE_THRUST_PART } from "../skills/blade-part.ts";
import type { ExecutorConfig } from "./config.ts";
import type { ExecutorPart } from "./executor-part.ts";

/** Construction and editor metadata are registered by the owning execution modules. */
export const EXECUTOR_PARTS = deepFreeze({ "recipe-strike": RECIPE_PART, "path-strike": PATH_PART, "driven-strike": DRIVEN_PART,
  "front-kick": KICK_PART, "straight-punch": PUNCH_PART, "combination": COMBINATION_PART, "whole-body-strike": WHOLE_BODY_PART,
  "blade-cut": BLADE_CUT_PART, "blade-thrust": BLADE_THRUST_PART });

/** A typed config selects exactly the registration that owns its kind. */
export function executorPart<C extends ExecutorConfig>(config: C): ExecutorPart<C> {
  const part = EXECUTOR_PARTS[config.kind];
  if (!part) throw new Error(`unknown executor kind ${config.kind}`);
  return part as unknown as ExecutorPart<C>;
}
