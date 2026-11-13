import { bodyRecords } from "../../../framework/records.ts";
import type { DataLoaders } from "../../../../core/data/store.ts";

/** The bonk's per-body settings and networks, its swing variation's. */
export const BONK_DATA = {
  "bonk/swing": bodyRecords(() => import("./swing.ts").then((m) => m.BONK_RECORDS)),
} satisfies DataLoaders;
