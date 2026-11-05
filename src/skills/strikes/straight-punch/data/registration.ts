import { bodyRecords } from "../../../framework/records.ts";
import type { DataLoaders } from "../../../../core/data/store.ts";

/** The straight punch's per-body settings and networks. */
export const STRAIGHT_PUNCH_DATA = {
  "straight-punch": bodyRecords(() => import("./straight-punch.ts").then((m) => m.STRAIGHT_PUNCH_RECORDS)),
} satisfies DataLoaders;
