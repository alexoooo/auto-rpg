import records from "../../../../../assets/skills/strikes/straight-punch/moving.json" with { type: "json" };
import { deepFreeze } from "../../../../core/state.ts";

/** Every body's record of the punch on the move (`dataOf("straight-punch/moving")`): a module of its own, imported only when loaded (`loadData`). */
export const MOVING_PUNCH_RECORDS: unknown = deepFreeze(records);
