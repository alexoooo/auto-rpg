/**
 * **The critically damped approach** a caller of the bearing solve (`bearing.ts`) asks of a point
 * or a frame: the acceleration that brings it to its goal at rate `n`, 1/s, without overshoot. The
 * stance's planted pose, the supported motor and the staged rise all aim by it.
 */
import type { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { spinBetweenToRef } from "../math/turn.ts";

/** A point at `at`, moving at `velocity` relative to its goal's, asked toward `to`: n²(to − at) − 2n·velocity, into `result`. */
export function approachToRef(to: Vector3, at: Vector3, velocity: Vector3, n: number, result: Vector3): Vector3 {
  return result.set(n * n * (to.x - at.x) - 2 * n * velocity.x, n * n * (to.y - at.y) - 2 * n * velocity.y,
    n * n * (to.z - at.z) - 2 * n * velocity.z);
}

/**
 * A frame turned `rotation`, spinning at `spin`, asked toward `target` in `seconds`: n times the
 * steady spin between them less 2n·spin, n = 1/seconds, into `result`.
 */
export function turnToRef(rotation: Quaternion, target: Quaternion, seconds: number, spin: Vector3, result: Vector3): Vector3 {
  const n = 1 / seconds;
  spinBetweenToRef(rotation, target, seconds, result);
  return result.set(result.x * n - 2 * n * spin.x, result.y * n - 2 * n * spin.y, result.z * n - 2 * n * spin.z);
}
