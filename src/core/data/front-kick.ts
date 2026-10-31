import records from "../../../assets/core/front-kick.json" with { type: "json" };
import { deepFreeze } from "../state.ts";

/** Every body's front kick record (`dataOf("front-kick")`): a module of its own, imported only when loaded (`loadData`). */
export const FRONT_KICK_RECORDS: unknown = deepFreeze(records);
