import records from "../../../assets/core/club-blow.json" with { type: "json" };
import { deepFreeze } from "../state.ts";

/** Every body's club blow record (`dataOf("club-blow")`): a module of its own, imported only when loaded (`loadData`). */
export const CLUB_BLOW_RECORDS: unknown = deepFreeze(records);
