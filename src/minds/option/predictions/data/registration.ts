import type { DataLoaders } from "../../../../core/data/store.ts";

/** What a foe's fighting took from a body in bouts (`PressureTable`): a striker's body on a struck one, read by any pairing near enough (`pressureTable`), so every body's (no `identity`). */
export const PRESSURE_PROFILES_DATA = {
  "pressure-profiles": () => import("./pressure-profiles.ts").then((m) => m.PRESSURE_PROFILES),
} satisfies DataLoaders;

/** What the record's tries on the ground did (`GroundTries`), read by a try on the ground priced by them: every body's (no `identity`). */
export const GROUND_TRIES_DATA = {
  "ground-tries": () => import("./ground-tries.ts").then((m) => m.GROUND_TRIES),
} satisfies DataLoaders;

/** How long walks took to arrive (`WalkTimes`), read by a walk timed by what walks measured: every body's (no `identity`). */
export const WALK_TIMES_DATA = {
  "walk-times": () => import("./walk-times.ts").then((m) => m.WALK_TIMES),
} satisfies DataLoaders;

/** What followed the states bouts reached (`FittedValue`), read by the tree chooser's fitted leaf: every body's (no `identity`). */
export const FITTED_VALUE_DATA = {
  "fitted-value": () => import("./fitted-value.ts").then((m) => m.FITTED_VALUE),
} satisfies DataLoaders;


