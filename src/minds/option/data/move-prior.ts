import type { MovePrior } from "../move-prior.ts";

declare module "../../../core/data/store.ts" { interface DataOf { "move-prior": MovePrior } }

import data from "../../../../assets/minds/move-prior.json" with { type: "json" };
import { deepFreeze } from "../../../core/state.ts";

/** The move prior (`dataOf("move-prior")`), from searches' roots (`research/minds/move-prior.mjs`): a module of its own, imported only when loaded (`loadData`). */
export const MOVE_PRIOR: unknown = deepFreeze(data);
