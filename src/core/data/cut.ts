import records from "../../../assets/core/cut.json" with { type: "json" };
import { deepFreeze } from "../state.ts";

/** Every body's cut record (`dataOf("cut")`): a module of its own, imported only when loaded (`loadData`). */
export const CUT_RECORDS: unknown = deepFreeze(records);
