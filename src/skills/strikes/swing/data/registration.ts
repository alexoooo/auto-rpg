import type { DataLoaders } from "../../../../core/data/store.ts";

/** The swing implementation's per-body settings for its held blows. */
export const SWING_DATA = {
  "club-blow": () => import("./club-blow.ts").then((m) => m.CLUB_BLOW_RECORDS),
  "cut": () => import("./cut.ts").then((m) => m.CUT_RECORDS),
} satisfies DataLoaders;
