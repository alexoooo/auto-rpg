import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BodyView } from "../../body.ts";
import type { SwingGoal } from "../../control/stance.ts";
import { swingProgressToRef } from "../../control/swing-path.ts";
import type { Pose } from "../../spec/pose.ts";
import type { Side } from "../../spec/body.ts";
import { GUARD } from "../guard/guard.ts";
import { sin, cos } from "../../math/real.ts";
import { otherSide } from "../../spec/body.ts";

/**
 * **The arms swinging** against the legs, each from the guard (`GUARD`): the upper arm hanging,
 * turned forward by `gain` rad for every metre the other side's sole leads the centre of mass
 * along the heading, and no further than `ARM_REACH` rad either way, the elbow bent as the guard
 * bends it. An arm reaches a posture that moves at a walk's cadence about `ARM_LEAD` s late (the
 * servo's lag), so each arm is asked where the other side's sole will be then: a swinging sole
 * along its way to its landing, a bearing one where it is, from the centre of mass run on.
 */
const ARM_REACH = 0.8, ARM_LEAD = 0.15;

/** What an arm swing is read from: the step under way, if any, how long it has swung, s, and whether its foot is off the ground. */
interface Swinging {
  readonly step: SwingGoal | null;
  readonly swung: number;
  readonly off: boolean;
}

/**
 * An arm swing (`ARM_REACH`): `pose(view, heading, swinging)` gives the arms' posture. `centred`,
 * each arm is turned by the half the other side's sole leads its own by instead, so the arms swing
 * against each other about the hanging whatever the soles' mean lead, which a run carries behind.
 */
export function armSwing(gain: number, centred = false): (view: BodyView, heading: number, swinging: Swinging) => Pose {
  const progress = new Vector3();
  return (view, heading, { step, swung, off }) => {
    const s = view.stance, fx = sin(heading), fz = cos(heading);
    const eased = (t: number): number => swingProgressToRef(t, step?.ramp, progress).x;
    const lead = (side: Side): number => {
      let x = s.soles[side].x, z = s.soles[side].z;
      if (step && step.foot === side && off) {
        const from = eased(Math.min(swung / step.seconds, 1)), to = eased(Math.min((swung + ARM_LEAD) / step.seconds, 1));
        const k = from < 1 ? (to - from) / (1 - from) : 0;
        x += (step.to[0] - x) * k;
        z += (step.to[1] - z) * k;
      }
      return (x - s.centre.x - s.velocity.x * ARM_LEAD) * fx + (z - s.centre.z - s.velocity.z * ARM_LEAD) * fz;
    };
    const flexion = (side: Side): number => {
      const other = lead(otherSide(side));
      return Math.min(ARM_REACH, Math.max(-ARM_REACH, gain * (centred ? (other - lead(side)) / 2 : other)));
    };
    return {
      "shoulder.left flexion": flexion("left"), "shoulder.left abduction": GUARD["shoulder.left abduction"]!, "elbow.left flexion": GUARD["elbow.left flexion"]!,
      "shoulder.right flexion": flexion("right"), "shoulder.right abduction": GUARD["shoulder.right abduction"]!, "elbow.right flexion": GUARD["elbow.right flexion"]!,
    };
  };
}
