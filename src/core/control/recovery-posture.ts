import preset from "../../../assets/core/assisted-rise.json" with { type: "json" };
import { guardPosture } from "../skills/guard.ts";
import type { BodySpec } from "../spec/body.ts";
import { deepFreeze } from "../state.ts";

/** Root feedback and a collision-aware staggered standing target, executed through ordinary muscles. */
export const ASSISTED_RECOVERY = deepFreeze(preset);

/** Preserve the held-item guard while the legs form the recovery's staggered support. */
export const assistedPosture = (spec: BodySpec, late = false): Readonly<Record<string,number>> =>
  Object.freeze({...guardPosture(spec),...ASSISTED_RECOVERY.posture,
    ...(late && spec.model === "workshop-rogue" ? ASSISTED_RECOVERY.latePosture[spec.model] : {})});


/** Flexion folds the leg while other axes retain their current support target. */
export function recoveryFoldAngles(channels: readonly {readonly name:string;readonly min:number;readonly max:number}[], knee:number): readonly (number|null)[] {
  return Object.freeze(channels.map(c => {
    const target = c.name.startsWith("knee.") && c.name.endsWith(" flexion") ? knee
      : (c.name.startsWith("hip.") && c.name.endsWith(" flexion")) || (c.name.startsWith("ankle.") && c.name.endsWith(" dorsiflexion")) ? knee/2 : null;
    return target === null ? null : Math.max(c.min,Math.min(c.max,target));
  }));
}
