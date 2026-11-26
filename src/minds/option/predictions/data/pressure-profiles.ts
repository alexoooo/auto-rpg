import type { PressureTable } from "../exchange/pressure-table.ts";

declare module "../../../../core/data/store.ts" { interface DataOf { "pressure-profiles": readonly PressureTable[] } }

import data from "../../../../../assets/minds/pressure-profiles.json" with { type: "json" };
import { deepFreeze } from "../../../../core/state.ts";

/** The measured pressures (`dataOf("pressure-profiles")`), from bouts' records (`research/minds/pressure-profiles.mjs`): a module of its own, imported only when loaded (`loadData`). */
export const PRESSURE_PROFILES: unknown = deepFreeze(data.profiles);
