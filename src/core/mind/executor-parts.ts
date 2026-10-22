import { deepFreeze } from "../state.ts";
import { RECIPE_PART } from "../skills/recipe-part.ts";
import { PATH_PART, DRIVEN_PART } from "../skills/path-part.ts";
import { KICK_PART } from "../skills/kick-part.ts";
import { PUNCH_PART } from "../skills/punch-part.ts";
import { COMBINATION_PART } from "../skills/combination-part.ts";
import { WHOLE_BODY_PART } from "../skills/whole-body-part.ts";
import { BLADE_CUT_PART, BLADE_THRUST_PART } from "../skills/blade-part.ts";
import type { ExecutorPart } from "./executor-part.ts";
import { partsByKind, type ConfigOf } from "./parts.ts";

/**
 * **Every executor, by its kind** (`ExecutorPart`), in the order a picker offers them: what a
 * fighter's executors list holds. A kind is its own module and a line here.
 */
export const EXECUTOR_PARTS = partsByKind(deepFreeze([RECIPE_PART, PATH_PART, DRIVEN_PART, KICK_PART, PUNCH_PART, COMBINATION_PART, WHOLE_BODY_PART,
  BLADE_CUT_PART, BLADE_THRUST_PART]));

/** **An executor's config**, by kind (`EXECUTOR_PARTS`): its settings and the name its actions call it by. */
export type ExecutorConfig = ConfigOf<typeof EXECUTOR_PARTS>;

/** The registration that owns `config`'s kind; a thrown error for a kind none has. */
export function executorPart<C extends ExecutorConfig>(config: C): ExecutorPart<C> {
  const part = Object.hasOwn(EXECUTOR_PARTS, config.kind) ? (EXECUTOR_PARTS as Readonly<Record<string, unknown>>)[config.kind] : undefined;
  if (!part) throw new Error(`unknown executor kind ${config.kind}`);
  return part as ExecutorPart<C>;
}
