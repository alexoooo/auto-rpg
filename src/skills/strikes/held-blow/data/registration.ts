import { bodyRecords } from "../../../framework/records.ts";
import type { DataLoaders } from "../../../../core/data/store.ts";

/** The held straight blow's per-body settings and networks. */
export const HELD_BLOW_DATA = {
  "sword-thrust": bodyRecords(() => import("./sword-thrust.ts").then((m) => m.SWORD_THRUST_RECORDS)),
} satisfies DataLoaders;
