import records from "../../../../../assets/skills/strikes/stomp/front.json" with { type: "json" };
import { deepFreeze } from "../../../../core/state.ts";

/** Every body's low front kick record (`dataOf("stomp/front")`): a module of its own, imported only when loaded (`loadData`). */
export const LOW_FRONT_KICK_RECORDS: unknown = deepFreeze(records);
