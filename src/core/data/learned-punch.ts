import policy from "../../../assets/core/learned-punch.json" with { type: "json" };
import type { PunchPolicy } from "../skills/learned-punch.ts";
import { deepFreeze } from "../state.ts";

/** The learned punch (`dataOf("learned-punch")`): a module of its own, imported only when loaded (`loadData`). */
export const LEARNED_PUNCH: PunchPolicy = deepFreeze(policy as PunchPolicy);
