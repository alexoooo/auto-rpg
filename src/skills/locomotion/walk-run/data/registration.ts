import type { DataLoaders } from "../../../../core/data/store.ts";

/** The walk and run's per-body settings. */
export const WALK_RUN_DATA = {
  "walk-run": () => import("./walk-run.ts").then((m) => m.WALK_RUN_RECORDS),
} satisfies DataLoaders;
