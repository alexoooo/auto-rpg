import type { WalkTimes } from "../walk-times.ts";

declare module "../../../../core/data/store.ts" { interface DataOf { "walk-times": WalkTimes } }

import data from "../../../../../assets/minds/walk-times.json" with { type: "json" };
import { deepFreeze } from "../../../../core/state.ts";

/** How long the record's walks took to arrive (`dataOf("walk-times")`), fitted by the measuring command (`research/minds/walk-fit.mjs`): a module of its own, imported only when loaded (`loadData`). */
export const WALK_TIMES: unknown = deepFreeze(data);
