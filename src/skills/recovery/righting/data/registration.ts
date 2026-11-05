import { bodyRecords } from "../../../framework/records.ts";
import type { DataLoaders } from "../../../../core/data/store.ts";

/** The righting implementation's per-body recipes. */
export const RIGHTING_DATA = {
  "righting": bodyRecords(() => import("./righting.ts").then((m) => m.RIGHTING_RECORDS)),
} satisfies DataLoaders;
