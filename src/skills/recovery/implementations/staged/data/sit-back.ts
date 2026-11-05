import records from "../../../../../../assets/skills/recovery/staged/sit-back.json" with { type: "json" };
import { deepFreeze } from "../../../../../core/world/state.ts";

/** Every body's sit-back record (`dataOf("sit-back")`): a module of its own, imported only when loaded (`loadData`). */
export const SIT_BACK_RECORDS: unknown = deepFreeze(records);
