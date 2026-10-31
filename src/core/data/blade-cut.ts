import records from "../../../assets/core/blade-cut.json" with { type: "json" };
import { deepFreeze } from "../state.ts";

/** Every body's blade cut record (`dataOf("blade-cut")`): a module of its own, imported only when loaded (`loadData`). */
export const BLADE_CUT_RECORDS: unknown = deepFreeze(records);
