import type { BuiltBody } from "../build/build-body.ts";
import type { MotionConstraint } from "../build/constrained-mass.ts";
import { jointCoordinateMotion } from "../build/joint-coordinate.ts";
import { jointAngles } from "../build/joint-state.ts";
import type { Vec3 } from "../spec/quantity.ts";

export interface JointStopSettings {
  /** Angular proximity for admitting an existing stop; this does not predict distant impacts. */
  readonly margin: number;
  /** Maximum pulling reaction accepted as roundoff, N m in the angle's coordinate. */
  readonly forceTolerance: number;
  /** Acceleration-row acceptance tolerance, rad/s2. */
  readonly accelerationTolerance: number;
  readonly iterations: number;
  readonly absoluteTolerance: number;
  readonly relativeTolerance: number;
}

/** Immutable numerical settings, validated before a controller owns a body. */
export function checkedJointStopSettings(settings: JointStopSettings): Readonly<JointStopSettings> {
  if (!(settings.margin >= 0) || !Number.isFinite(settings.margin)
    || ![settings.forceTolerance, settings.accelerationTolerance, settings.absoluteTolerance, settings.relativeTolerance].every((v) => v > 0 && Number.isFinite(v))
    || !Number.isSafeInteger(settings.iterations) || settings.iterations < 1) throw new Error("invalid joint-stop tracking settings");
  return Object.freeze({ ...settings });
}

/**
 * Inward motion rows near anatomical bounds. A backward-Euler coordinate step asks for
 * acceleration (-gap/dt - inwardRate)/dt at the bound, including the row's changing gradient.
 * This is a local end-step approximation, not an impact model or a constraint installed in physics.
 * A unilateral controller selects reactions and verifies released rows separately.
 */
export function nearJointStops(built: BuiltBody, margin: number, dt: number) {
  if (!(margin >= 0) || !Number.isFinite(margin) || !(dt > 0) || !Number.isFinite(dt)) throw new Error("invalid joint-stop sampling settings");
  const stops: { id: string; row: MotionConstraint; target: number; gap: number; rate: number }[] = [];
  for (const joint of built.joints.values()) {
    const angles = jointAngles(joint);
    joint.dofs.forEach((dof, i) => {
      const below = angles[i]! - dof.spec.min.value, above = dof.spec.max.value - angles[i]!;
      const sense = below <= margin ? 1 : above <= margin ? -1 : 0;
      if (!sense) return;
      const motion = jointCoordinateMotion(joint, i);
      if (!motion) throw new Error("undefined joint-stop coordinate");
      const gap = sense > 0 ? below : above, rate = sense * motion.rate;
      stops.push({ id: joint.spec.name + ":" + i, gap, rate,
        row: motion.row.map((entry) => ({ ...entry, angular: entry.angular.map((v) => sense * v) as unknown as Vec3 })),
        target: sense * motion.target + (-gap / dt - rate) / dt });
    });
  }
  return stops;
}
