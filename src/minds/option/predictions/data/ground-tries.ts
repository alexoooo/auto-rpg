import type { GroundTries } from "../ground-tries.ts";

declare module "../../../../core/data/store.ts" { interface DataOf { "ground-tries": GroundTries } }

import data from "../../../../../assets/minds/ground-tries.json" with { type: "json" };
import { deepFreeze } from "../../../../core/state.ts";

/** What the record's tries on the ground did (`dataOf("ground-tries")`), fitted by the measuring command (`research/minds/ground-fit.mjs`): a module of its own, imported only when loaded (`loadData`). */
export const GROUND_TRIES: unknown = deepFreeze(data);
