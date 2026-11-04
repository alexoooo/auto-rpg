import records from "../../../assets/core/sit-back.json" with { type: "json" };
import { deepFreeze } from "../state.ts";

/** Every body's sit-back record (`dataOf("sit-back")`): a module of its own, imported only when loaded (`loadData`). */
export const SIT_BACK_RECORDS: unknown = deepFreeze(records);
