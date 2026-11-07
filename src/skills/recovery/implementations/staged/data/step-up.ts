import records from "../../../../../../assets/skills/recovery/staged/step-up.json" with { type: "json" };
import { deepFreeze } from "../../../../../core/state.ts";

/** Every body's step-up record (`dataOf("step-up")`): a module of its own, imported only when loaded (`loadData`). */
export const STEP_UP_RECORDS: unknown = deepFreeze(records);
