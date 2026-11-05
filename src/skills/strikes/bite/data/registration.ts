import type { DataLoaders } from "../../../../core/data/store.ts";

/** The bite's per-body settings. */
export const BITE_DATA = {
  "bite": () => import("./bite.ts").then((m) => m.BITE_RECORDS),
} satisfies DataLoaders;
