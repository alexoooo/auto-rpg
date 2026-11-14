import { bodyRecords } from "../../../framework/records.ts";
import type { DataLoaders } from "../../../../core/data/store.ts";

/** The bite's per-body settings, its bite variation's. */
export const BITE_DATA = {
  "bite/bite": bodyRecords(() => import("./bite.ts").then((m) => m.BITE_RECORDS)),
} satisfies DataLoaders;
