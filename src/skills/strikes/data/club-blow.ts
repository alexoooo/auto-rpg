import records from "../../../../assets/skills/strikes/club-blow/club-blow.json" with { type: "json" };
import { deepFreeze } from "../../../core/world/state.ts";

/** Every body's club blow record (`dataOf("club-blow")`): a module of its own, imported only when loaded (`loadData`). */
export const CLUB_BLOW_RECORDS: unknown = deepFreeze(records);
