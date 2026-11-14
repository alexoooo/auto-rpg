import records from "../../../../../assets/skills/strikes/straight-punch/drive.json" with { type: "json" };
import { deepFreeze } from "../../../../core/state.ts";

/** Every body's straight punch record (`dataOf("straight-punch/drive")`): a module of its own, imported only when loaded (`loadData`). */
export const STRAIGHT_PUNCH_RECORDS: unknown = deepFreeze(records);
