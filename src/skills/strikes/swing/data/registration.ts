import { bodyRecords } from "../../../framework/records.ts";
import type { DataLoaders } from "../../../../core/data/store.ts";

/** The swing implementation's per-body settings for its held blows. */
export const SWING_DATA = {
  "club-blow": bodyRecords(() => import("./club-blow.ts").then((m) => m.CLUB_BLOW_RECORDS)),
  "cut": bodyRecords(() => import("./cut.ts").then((m) => m.CUT_RECORDS)),
  "bonk": bodyRecords(() => import("./bonk.ts").then((m) => m.BONK_RECORDS)),
} satisfies DataLoaders;
