import policy from "../../../assets/core/learned-run.json" with { type: "json" };
import type { RunPolicy } from "../skills/learned-run.ts";
import { deepFreeze } from "../state.ts";

/** The learned run's trained policy (`dataOf("learned-run")`): a module of its own, imported only when loaded (`loadData`). */
export const LEARNED_RUN: RunPolicy = deepFreeze(policy as RunPolicy);
