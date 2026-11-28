import records from "../../../../../assets/skills/strikes/kick/stepping.json" with { type: "json" };
import { deepFreeze } from "../../../../core/state.ts";

/** Every body's stepping front kick record (`dataOf("kick/stepping")`): a module of its own, imported only when loaded (`loadData`). */
export const STEPPING_KICK_RECORDS: unknown = deepFreeze(records);
