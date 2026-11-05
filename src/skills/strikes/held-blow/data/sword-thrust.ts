import records from "../../../../../assets/skills/strikes/sword-thrust/sword-thrust.json" with { type: "json" };
import { deepFreeze } from "../../../../core/world/state.ts";

/** Every body's sword thrust record (`dataOf("sword-thrust")`): a module of its own, imported only when loaded (`loadData`). */
export const SWORD_THRUST_RECORDS: unknown = deepFreeze(records);
