import records from "../../../assets/core/straight-punch.json" with { type: "json" };
import { deepFreeze } from "../state.ts";

/** Every body's straight punch record (`dataOf("straight-punch")`): a module of its own, imported only when loaded (`loadData`). */
export const STRAIGHT_PUNCH_RECORDS: unknown = deepFreeze(records);
