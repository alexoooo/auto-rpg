import { bodyRecords } from "../../../framework/records.ts";
import type { DataLoaders } from "../../../../core/data/store.ts";

/** The sword thrust's per-body settings and networks, its drive variation's. */
export const SWORD_THRUST_DATA = {
  "sword-thrust/drive": bodyRecords(() => import("./drive.ts").then((m) => m.SWORD_THRUST_RECORDS)),
} satisfies DataLoaders;
