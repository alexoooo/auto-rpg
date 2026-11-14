import { bodyRecords } from "../../../framework/records.ts";
import type { DataLoaders } from "../../../../core/data/store.ts";

/** The club blow's per-body settings, its swing variation's. */
export const CLUB_BLOW_DATA = {
  "club-blow/swing": bodyRecords(() => import("./swing.ts").then((m) => m.CLUB_BLOW_RECORDS)),
} satisfies DataLoaders;
