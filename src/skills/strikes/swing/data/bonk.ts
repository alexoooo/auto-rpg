import records from "../../../../../assets/skills/strikes/bonk/bonk.json" with { type: "json" };
import { deepFreeze } from "../../../../core/state.ts";

/** Every body's bonk record (`dataOf("bonk")`): a module of its own, imported only when loaded (`loadData`). */
export const BONK_RECORDS: unknown = deepFreeze(records);
