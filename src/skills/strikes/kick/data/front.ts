import records from "../../../../../assets/skills/strikes/kick/front.json" with { type: "json" };
import { deepFreeze } from "../../../../core/state.ts";

/** Every body's front kick record (`dataOf("kick/front")`): a module of its own, imported only when loaded (`loadData`). */
export const FRONT_KICK_RECORDS: unknown = deepFreeze(records);
