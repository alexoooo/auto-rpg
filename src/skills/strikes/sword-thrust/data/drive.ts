import records from "../../../../../assets/skills/strikes/sword-thrust/drive.json" with { type: "json" };
import { deepFreeze } from "../../../../core/state.ts";

/** Every body's sword thrust record (`dataOf("sword-thrust/drive")`): a module of its own, imported only when loaded (`loadData`). */
export const SWORD_THRUST_RECORDS: unknown = deepFreeze(records);
