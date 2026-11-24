import records from "../../../../../assets/skills/strikes/kick/kick.json" with { type: "json" };
import { deepFreeze } from "../../../../core/state.ts";

/** Every body's kick record (`dataOf("kick/kick")`): a module of its own, imported only when loaded (`loadData`). */
export const KICK_RECORDS: unknown = deepFreeze(records);
