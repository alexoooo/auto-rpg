import { bodyRecords } from "../../../framework/records.ts";
import type { DataLoaders } from "../../../../core/data/store.ts";

/** The walk and run's per-body settings. */
export const WALK_RUN_DATA = {
  "walk-run": bodyRecords(() => import("./walk-run.ts").then((m) => m.WALK_RUN_RECORDS)),
} satisfies DataLoaders;
