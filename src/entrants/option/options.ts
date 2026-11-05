import type { PartConfig } from "../../parts/index.ts";
import { deepFreeze } from "../../core/world/index.ts";
import { ORDERS_OPTION, COVER_OPTION, HOLD_OPTION, GUARD_OPTION, type WalkConfig } from "../../minds/option/index.ts";
import { BRACE_OPTION, BRACE_TUMBLING_OPTION, STEADY_OPTION, FLATTEN_OPTION, LAND_OPTION } from "../../minds/option/index.ts";

/** The gaits this fighter may walk by, in preference order. */
const WALKS: readonly WalkConfig[] = deepFreeze(["braced", "run", "trot", "crawl"].map((gait) => ({ kind: "walk", gait })));

/** Recovery choices, in preference order, for every body this fighter fits. */
const RISE_OPTIONS: readonly PartConfig[] = deepFreeze([
  BRACE_TUMBLING_OPTION.defaults, STEADY_OPTION.defaults,
  ...["staged-roll", "staged-down", "sit-back", "front-sit-back", "righting-recipe", "righting-routes"].map((kind) => ({ kind: "way-up", skill: { kind } })),
  ...["roll", "roll-back"].map((kind) => ({ kind: "reposition", skill: { kind } })),
  FLATTEN_OPTION.defaults, LAND_OPTION.defaults,
]);

/** The root controller's fallback assembly, without a blow. */
export const BASE_OPTIONS: readonly PartConfig[] = deepFreeze([ORDERS_OPTION.defaults, ...WALKS, ...RISE_OPTIONS,
  ...[COVER_OPTION, HOLD_OPTION, GUARD_OPTION, BRACE_OPTION].map((part) => part.defaults)]);
