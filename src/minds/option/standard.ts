import { deepFreeze } from "../../core/state.ts";
import type { ConfigFor } from "../../parts/lookup.ts";
import { COVER_OPTION, GUARD_OPTION, HOLD_OPTION, ORDERS_OPTION } from "./kinds.ts";
import { BRACE_OPTION, BRACE_TUMBLING_OPTION, FLATTEN_OPTION, LAND_OPTION, STEADY_OPTION } from "./rise.ts";

/**
 * **The Options a body gets up by**, in preference order, for every body: bracing as it tumbles
 * and steadying, each way up and each reposition by its technique, then flattening and landing. A
 * body offers those whose technique it fits (`skillsOf`).
 */
export const RISE_OPTIONS: readonly ConfigFor<"option">[] = deepFreeze([
  BRACE_TUMBLING_OPTION.defaults, STEADY_OPTION.defaults,
  ...(["staged-roll", "staged-down", "sit-back", "front-sit-back", "righting-recipe", "righting-routes"] as const).map((kind) => ({ kind: "way-up" as const, skill: { kind } })),
  ...(["roll", "roll-back"] as const).map((kind) => ({ kind: "reposition" as const, skill: { kind } })),
  FLATTEN_OPTION.defaults, LAND_OPTION.defaults,
]);

/**
 * **Every Option but a blow**: following orders first, a walk by every gait the body's legs go by,
 * getting up (`RISE_OPTIONS`), then cover, hold, guard and brace. What an Option Mind's config
 * that names no options takes in the game, and what a fighter adds its blows to.
 */
export const BASE_OPTIONS: readonly ConfigFor<"option">[] = deepFreeze([ORDERS_OPTION.defaults, { kind: "walk" as const }, ...RISE_OPTIONS,
  ...[COVER_OPTION, HOLD_OPTION, GUARD_OPTION, BRACE_OPTION].map((part) => part.defaults)]);
