import type { FittedValue } from "../value/fitted-value.ts";

declare module "../../../../core/data/store.ts" { interface DataOf { "fitted-value": FittedValue } }

import data from "../../../../../assets/minds/fitted-value.json" with { type: "json" };
import { deepFreeze } from "../../../../core/state.ts";

/** The value fitted to what followed (`dataOf("fitted-value")`), from bouts' played states (`research/minds/fitted-value.mjs`): a module of its own, imported only when loaded (`loadData`). */
export const FITTED_VALUE: unknown = deepFreeze(data);
