import policy from "../../../assets/core/learned-rise.json" with { type: "json" };
import type { RisePolicy } from "../mind/ground/learned-rise.ts";
import { deepFreeze } from "../state.ts";

/** The learned rise's trained policy (`dataOf("learned-rise")`): a module of its own, imported only when loaded (`loadData`). */
export const LEARNED_RISE: RisePolicy = deepFreeze(policy as RisePolicy);
