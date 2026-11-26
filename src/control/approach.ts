/**
 * **The critically damped approach** a caller of the bearing solve (`bearing.ts`) asks of a point,
 * a frame or a freedom: the acceleration that brings it to its goal at rate `n`, 1/s, without
 * overshoot. The servo, the stance, the supported motor and the staged rise all aim by it.
 */
import type { Quaternion, Vector3 } from "../core/math/vector.ts";
import { exp } from "../core/math/real.ts";
import { spinBetweenToRef } from "../core/math/turn.ts";

/**
 * The gains of the approach at rate `n`, 1/s, exact over a step of `dt` s: an error `e` and its
 * rate `e'` are asked `-error e - rate e'`, and a rate alone damped `-decay e'`.
 *
 * The world steps a rate by the acceleration asked and then a place by the new rate. The
 * continuous motion's own gains, n^2 and 2n (and n), hold over such a step only while n dt is
 * small: a response within a few steps is softened at a coarse rate and not at a fine one, so a
 * time meant one thing at 120 Hz and another at 480. These make the step carry the error as the
 * damped motion's own samples carry it, both of its roots e^(-n dt) (and a rate alone by
 * e^(-n dt)), and are n^2, 2n and n where n dt is small: a response is then a time, alike at
 * every rate.
 */
export function damping(n: number, dt: number): { readonly error: number; readonly rate: number; readonly decay: number } {
  const decay = exp(-n * dt);
  return { error: (1 - decay) * (1 - decay) / (dt * dt), rate: (1 - decay * decay) / dt, decay: (1 - decay) / dt };
}

/** A point at `at`, moving at `velocity` relative to its goal's, asked toward `to` at rate `n` over a step of `dt` (`damping`), into `result`. */
export function approachToRef(to: Vector3, at: Vector3, velocity: Vector3, n: number, dt: number, result: Vector3): Vector3 {
  const { error, rate } = damping(n, dt);
  return result.set(error * (to.x - at.x) - rate * velocity.x, error * (to.y - at.y) - rate * velocity.y,
    error * (to.z - at.z) - rate * velocity.z);
}

/**
 * A frame turned `rotation`, spinning at `spin`, asked toward `target` in `seconds` over a step of
 * `dt` (`damping`): the angle between them less the spin, into `result`.
 */
export function turnToRef(rotation: Quaternion, target: Quaternion, seconds: number, spin: Vector3, dt: number, result: Vector3): Vector3 {
  const { error, rate } = damping(1 / seconds, dt);
  // The steady spin that closes the angle in `seconds`, times `seconds`: the angle.
  spinBetweenToRef(rotation, target, seconds, result).scaleInPlace(seconds);
  return result.set(error * result.x - rate * spin.x, error * result.y - rate * spin.y, error * result.z - rate * spin.z);
}
