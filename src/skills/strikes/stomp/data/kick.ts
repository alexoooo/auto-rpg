import records from "../../../../../assets/skills/strikes/stomp/kick.json" with { type: "json" };
import { deepFreeze } from "../../../../core/state.ts";

/** Every body's low kick record (`dataOf("stomp/kick")`): a module of its own, imported only when loaded (`loadData`). */
export const LOW_KICK_RECORDS: unknown = deepFreeze(records);
