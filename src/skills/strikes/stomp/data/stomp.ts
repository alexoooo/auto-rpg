import records from "../../../../../assets/skills/strikes/stomp/stomp.json" with { type: "json" };
import { deepFreeze } from "../../../../core/state.ts";

/** Every body's stomp record (`dataOf("stomp")`): a module of its own, imported only when loaded (`loadData`). */
export const STOMP_RECORDS: unknown = deepFreeze(records);
