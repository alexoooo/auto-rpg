import { bodyRecords } from "../../../framework/records.ts";
import type { DataLoaders } from "../../../../core/data/store.ts";

/** The stomp's per-body settings, its stomp variation's. */
export const STOMP_DATA = {
  "stomp/stomp": bodyRecords(() => import("./stomp.ts").then((m) => m.STOMP_RECORDS)),
} satisfies DataLoaders;
