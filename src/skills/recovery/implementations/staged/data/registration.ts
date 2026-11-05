import { bodyRecords } from "../../../../framework/records.ts";
import type { DataLoaders } from "../../../../../core/data/store.ts";

/** The staged rise's per-body records. */
export const STAGED_DATA = {
  "step-up": bodyRecords(() => import("./step-up.ts").then((m) => m.STEP_UP_RECORDS)),
  "sit-back": bodyRecords(() => import("./sit-back.ts").then((m) => m.SIT_BACK_RECORDS)),
} satisfies DataLoaders;
