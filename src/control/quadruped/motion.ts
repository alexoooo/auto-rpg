import type { Quaternion, Vector3 } from "../../core/math/vector.ts";
import type { EffectorGoal } from "../effector-tracker.ts";
/**
 * A paw's goal, root frame: its `point` to `at` and turned to `turn` in `seconds`, coming down
 * at `landing`. On a `curve`, it leaves from rest and bows by `curve`. Kept on the `ground`, its
 * path begins at `origin` and moves through the root frame at `drift`, driven firm where it swings.
 */
export function soleGoal(point: string, at: Vector3, seconds: number, sequence: number, landing: Vector3, turn: Quaternion, curve?: Vector3,
  ground?: { readonly origin: Vector3; readonly drift: Vector3; readonly firm: boolean; readonly response: number }): EffectorGoal {
  return { places: [{ point, position: [at.x, at.y, at.z] }], seconds, follows: true, sequence,
    ...(ground ? { origin: [ground.origin.x, ground.origin.y, ground.origin.z] as const, drift: [ground.drift.x, ground.drift.y, ground.drift.z] as const } : {}),
    ...(ground?.firm ? { firm: true, response: ground.response } : {}),
    ...(curve ? { initialVelocity: [0, 0, 0] as const } : {}), terminalVelocity: [landing.x, landing.y, landing.z],
    ...(curve ? { curve: [curve.x, curve.y, curve.z] as const } : {}), orientation: { target: [turn.x, turn.y, turn.z, turn.w], seconds } };
}
