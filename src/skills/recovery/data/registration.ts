import type { DataLoaders } from "../../../core/data/store.ts";
import { bodyProfiles } from "../../framework/profile.ts";

/** The recovery techniques' measured profiles. */
export const RECOVERY_DATA = {
  "edge-profiles": bodyProfiles(() => import("./edge-profiles.ts").then((m) => m.EDGE_PROFILES)),
} satisfies DataLoaders;
