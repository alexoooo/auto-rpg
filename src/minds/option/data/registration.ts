import type { DataLoaders } from "../../../core/data/store.ts";

/** What a foe's fighting took from a body in bouts (`PressureTable`): a striker's body on a struck one, read by any pairing near enough (`pressureTable`), so every body's (no `identity`). */
export const PRESSURE_PROFILES_DATA = {
  "pressure-profiles": () => import("./pressure-profiles.ts").then((m) => m.PRESSURE_PROFILES),
} satisfies DataLoaders;
