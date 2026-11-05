import type { DataLoaders } from "../../../data/store.ts";

/** The walk and run's records. */
export const LOCOMOTION_DATA = {
  "walk-run": () => import("./walk-run.ts").then((m) => m.WALK_RUN_RECORDS),
} satisfies DataLoaders;
