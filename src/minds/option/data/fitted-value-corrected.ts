import type { FittedValue } from "../fitted-value.ts";

declare module "../../../core/data/store.ts" { interface DataOf { "fitted-value-corrected": FittedValue } }

import data from "../../../../assets/minds/fitted-value-corrected.json" with { type: "json" };
import { deepFreeze } from "../../../core/state.ts";

/**
 * The value fitted to what followed the states a Mind with truer own-body models reached
 * (`dataOf("fitted-value-corrected")`: walks priced from their speed along their way, a sway left
 * by its own steps; `research/minds/fitted-value.mjs`): a module of its own, imported only when
 * loaded (`loadData`).
 */
export const FITTED_VALUE_CORRECTED: unknown = deepFreeze(data);
