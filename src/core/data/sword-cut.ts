import records from "../../../assets/core/sword-cut.json" with { type: "json" };
import { deepFreeze } from "../state.ts";

/** Every body's sword cut record (`dataOf("sword-cut")`): a module of its own, imported only when loaded (`loadData`). */
export const SWORD_CUT_RECORDS: unknown = deepFreeze(records);
