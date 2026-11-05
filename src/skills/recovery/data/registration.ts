import type { DataLoaders } from "../../../core/data/store.ts";

/** The recovery techniques' measured profiles. */
export const RECOVERY_DATA = {
  "edge-profiles": () => import("./edge-profiles.ts").then((m) => m.EDGE_PROFILES),
} satisfies DataLoaders;
