import records from "../../../assets/core/straight-punch.json" with { type: "json" };
import type { PunchRecords } from "../skills/strikes/punch-records.ts";
import { deepFreeze } from "../state.ts";

/** Every body's straight punch record (`dataOf("straight-punch")`): a module of its own, imported only when loaded (`loadData`). */
export const STRAIGHT_PUNCH_RECORDS: PunchRecords = deepFreeze(records as unknown as PunchRecords);
