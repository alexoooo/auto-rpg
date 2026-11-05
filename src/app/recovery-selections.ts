import { deepFreeze } from "../core/world/state.ts";
import type { TechniqueConfig } from "../skills/recovery/technique.ts";

/** The Lab's stock stand-up route, in the order offered to the mind. */
export const STAND_UP: readonly TechniqueConfig[] = deepFreeze([
  { kind: "staged-roll" }, { kind: "staged-down" }, { kind: "sit-back" }, { kind: "front-sit-back" },
]);
