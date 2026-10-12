import preset from "../../../assets/core/assisted-rise.json" with { type: "json" };
import { guardPosture } from "../skills/guard.ts";
import type { BodySpec } from "../spec/body.ts";
import { deepFreeze } from "../state.ts";

/** Root feedback and a collision-aware staggered standing target, executed through ordinary muscles. */
export const ASSISTED_RECOVERY = deepFreeze(preset);

/** Preserve the held-item guard while the legs form the recovery's staggered support. */
export const assistedPosture = (spec: BodySpec): Readonly<Record<string,number>> =>
  Object.freeze({...guardPosture(spec),...ASSISTED_RECOVERY.posture});
