import records from "../../../assets/core/stomp.json" with { type: "json" };
import { deepFreeze } from "../state.ts";

/** Every body's stomp record (`dataOf("stomp")`): a module of its own, imported only when loaded (`loadData`). */
export const STOMP_RECORDS: unknown = deepFreeze(records);
