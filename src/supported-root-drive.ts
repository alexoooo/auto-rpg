import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";

/**
 * Build the next bounded keyframe for an upright supported root.
 *
 * The virtual carrier already resolved the horizontal velocity. Advancing from
 * the live physical position preserves the old velocity-drive behaviour instead
 * of snapping across any accumulated carrier/body disagreement. Rotation takes
 * the same bounded path: an exact one-step upright snap can launch every joint
 * attached to a root that a weapon just tilted.
 */
export function supportedRootTargetToRef(
  livePosition: Vector3,
  liveRotation: Quaternion,
  velocity: Readonly<{ x: number; z: number }>,
  targetYaw: number,
  dt: number,
  maximumAngularSpeed: number,
  targetPosition: Vector3,
  desiredRotation: Quaternion,
  targetRotation: Quaternion,
): void {
  targetPosition.set(livePosition.x + velocity.x * dt, livePosition.y,
    livePosition.z + velocity.z * dt);
  Quaternion.RotationAxisToRef(Vector3.Up(), targetYaw, desiredRotation);
  const dot = Math.min(1, Math.abs(Quaternion.Dot(liveRotation, desiredRotation)));
  const angle = 2 * Math.acos(dot);
  const blend = angle > 1e-9 ? Math.min(1, maximumAngularSpeed * dt / angle) : 1;
  Quaternion.SlerpToRef(liveRotation, desiredRotation, blend, targetRotation);
}
