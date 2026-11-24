import { bodyRecords } from "../../../framework/records.ts";
import type { DataLoaders } from "../../../../core/data/store.ts";

/** The kick's per-body settings, its kick variation's. */
export const KICK_DATA = {
  "kick/kick": bodyRecords(() => import("./kick.ts").then((m) => m.KICK_RECORDS)),
} satisfies DataLoaders;
