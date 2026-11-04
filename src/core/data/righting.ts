import records from "../../../assets/core/righting.json" with { type: "json" };
import { deepFreeze } from "../state.ts";

/** Every body's righting recipe (`dataOf("righting")`): a module of its own, imported only when loaded (`loadData`). */
export const RIGHTING_RECORDS: unknown = deepFreeze(records);
