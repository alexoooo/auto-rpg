import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BuiltBody, BuiltJoint, BuiltSegment } from "../build/build-body.ts";
import { rotationOfToRef } from "../build/joint-state.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { solve3 } from "../math/linalg.ts";

/**
 * **A body's kinematics in its joints' angles**, in the root's frame: where a point on a segment is
 * when the joints between it and the root stand at given angles, and the angles that put it at a
 * given place (inverse kinematics).
 *
 * The root's frame is the body frame carried by the root: a point is where it would be were the
 * root at its reference pose. A hand goal "in the body frame" is in this frame, so it moves with the
 * pelvis. Angles are each freedom's, in its own sense, as `jointAngles` reads them, and a joint's
 * rotation is theirs composed as the engine's limits measure them (`anglesOf`, `rotationOfToRef`):
 * each angle is twice the atan2 of its axis's part of the rotation against the scalar part, a
 * locked axis's part zero. A child's turn from its reference pose is its
 * parent's times its joint's (`relativeRotationToRef`: rel = D_parent^-1 D_child), and a point on it
 * swings about its joint's centre.
 */

/** The joints from the root out to `segment`, root first. */
export function chainTo(built: BuiltBody, segment: BuiltSegment): BuiltJoint[] {
  const byChild = new Map([...built.joints.values()].map((joint) => [joint.child, joint]));
  const chain: BuiltJoint[] = [];
  for (let joint = byChild.get(segment); joint; joint = byChild.get(joint.parent)) chain.unshift(joint);
  return chain;
}

const scratch = { a: new Quaternion(), b: new Quaternion(), d: new Quaternion(), v: new Vector3() };

/** `joint`'s rotation at `angles` (each freedom's, its own sense), body frame: `jointAngles` undone. */
export function rotationAtToRef(joint: BuiltJoint, angles: readonly number[], out: Quaternion): Quaternion {
  const { dofs } = joint, engine = (k: number) => (k < dofs.length ? dofs[k]!.sign * angles[k]! : 0);
  return rotationOfToRef(joint.axes, engine(0), engine(1), engine(2), out);
}

/**
 * Where `point` (body frame, reference pose, on the chain's last segment) is in the root's frame
 * with the chain's joints at `angles` (by joint, in the chain's order).
 */
export function pointAtToRef(chain: readonly BuiltJoint[], angles: readonly (readonly number[])[], point: Vec3, out: Vector3): Vector3 {
  const turn = scratch.d.copyFromFloats(0, 0, 0, 1);
  const first = chain[0]!.spec.centre.value;
  out.set(first[0], first[1], first[2]);
  chain.forEach((joint, j) => {
    turn.multiplyInPlace(rotationAtToRef(joint, angles[j]!, scratch.b));
    const centre = joint.spec.centre.value, next = j + 1 < chain.length ? chain[j + 1]!.spec.centre.value : point;
    scratch.v.set(next[0] - centre[0], next[1] - centre[1], next[2] - centre[2]).applyRotationQuaternionToRef(turn, scratch.v);
    out.addInPlace(scratch.v);
  });
  return out;
}

/**
 * Where `point` (body frame, reference pose, on `segment`) stands now, in `root`'s frame, from the
 * nodes' `position` and `rotationQuaternion` (never the world matrix, which caches per frame): a
 * segment's node carries its reference pose by its turn since then, node times rest^-1.
 */
export function pointNowToRef(segment: BuiltSegment, root: BuiltSegment, point: Vec3, out: Vector3): Vector3 {
  const origin = segment.frame.origin;
  Quaternion.InverseToRef(segment.rest, scratch.a);
  segment.node.rotationQuaternion!.multiplyToRef(scratch.a, scratch.d);
  out.set(point[0] - origin[0], point[1] - origin[1], point[2] - origin[2]).applyRotationQuaternionToRef(scratch.d, out).addInPlace(segment.node.position);
  // Into the root's frame: its turn undone about its node.
  out.subtractInPlace(root.node.position);
  root.rest.multiplyToRef(Quaternion.InverseToRef(root.node.rotationQuaternion!, scratch.a), scratch.d);
  out.applyRotationQuaternionToRef(scratch.d, out);
  const rootOrigin = root.frame.origin;
  return out.addInPlaceFromFloats(rootOrigin[0], rootOrigin[1], rootOrigin[2]);
}

/** What `solveReach` may move: freedom `k` of the chain's joint `joint`, within `[min, max]`, drawn toward `preferred`. */
interface ReachFreedom {
  readonly joint: number;
  readonly k: number;
  readonly min: number;
  readonly max: number;
  readonly preferred: number;
}

/**
 * The angles that put `point` at `target` (root's frame), moving only `free` and holding every
 * other angle in `angles` as given; `angles` is the start and is overwritten with the answer.
 * Returns the distance left, m.
 *
 * Damped least squares: each pass moves the free angles by J+ e, J's pseudo-inverse damped by
 * `IK_DAMPING` so a straight arm does not fling, plus the null space's share of a pull toward the
 * preferred angles, so a redundant arm settles its swing where the posture asks rather than
 * wherever it began; then clamps each to its range. J is read by differences of `IK_STEP` rad.
 */
export function solveReach(chain: readonly BuiltJoint[], angles: number[][], free: readonly ReachFreedom[], point: Vec3, target: Vec3,
  passes = IK_PASSES): number {
  const at = new Vector3(), moved = new Vector3(), n = free.length;
  const J = free.map(() => [0, 0, 0]);
  let left = Infinity;
  for (let pass = 0; pass < passes; pass++) {
    pointAtToRef(chain, angles, point, at);
    const e = [target[0] - at.x, target[1] - at.y, target[2] - at.z];
    left = Math.hypot(e[0]!, e[1]!, e[2]!);
    free.forEach((f, c) => {
      const row = angles[f.joint]!, keep = row[f.k]!;
      row[f.k] = keep + IK_STEP;
      pointAtToRef(chain, angles, point, moved);
      row[f.k] = keep;
      J[c]![0] = (moved.x - at.x) / IK_STEP; J[c]![1] = (moved.y - at.y) / IK_STEP; J[c]![2] = (moved.z - at.z) / IK_STEP;
    });
    // The step is J' (J J' + damping^2 I)^-1 e, and the posture's pull is projected off what J
    // sees, (I - J' (J J')^-1 J) p, undamped: a damped projector leaks a share of the pull into
    // the hand's place, and the solve settles that far from the target.
    const JJ = [0, 1, 2].map((r) => [0, 1, 2].map((c) => free.reduce((s, _, k) => s + J[k]![r]! * J[k]![c]!, 0)));
    const A = JJ.map((row, r) => row.map((v, c) => v + (r === c ? IK_DAMPING ** 2 : 0)));
    const toward = free.map((f) => IK_POSTURE_PULL * (f.preferred - angles[f.joint]![f.k]!));
    const y = solve3(A, e);
    const Jp = [0, 1, 2].map((r) => free.reduce((s, _, k) => s + J[k]![r]! * toward[k]!, 0));
    const z = solve3(JJ, Jp);
    const steps = free.map((_, k) => J[k]![0]! * y[0]! + J[k]![1]! * y[1]! + J[k]![2]! * y[2]!
      + toward[k]! - (J[k]![0]! * z[0]! + J[k]![1]! * z[1]! + J[k]![2]! * z[2]!));
    // A pass turns no angle more than `IK_TURN`, the whole step scaled alike, so a target out of
    // reach draws the arm straight toward it rather than across the singularity at full stretch.
    const scale = Math.min(1, IK_TURN / Math.max(...steps.map(Math.abs)));
    let largest = 0;
    for (let k = 0; k < n; k++) {
      const f = free[k]!, row = angles[f.joint]!;
      const was = row[f.k]!;
      row[f.k] = Math.max(f.min, Math.min(f.max, was + scale * steps[k]!));
      largest = Math.max(largest, Math.abs(row[f.k]! - was));
    }
    // Done when the angles no longer move: a path differenced for its rates must not carry a
    // solve's unfinished drift along the posture's pull.
    if (largest < IK_TOLERANCE) break;
  }
  return left;
}

/**
 * The solver's settings, which are numerics, not anatomy: passes at most, the largest change of an
 * angle it stops at (rad), the angle it differences by (rad), its damping (m), the share of the
 * way to the preferred angles each pass asks in the null space, and the most any angle turns in
 * one pass (rad).
 */
const IK_PASSES = 200, IK_TOLERANCE = 1e-10, IK_STEP = 1e-7, IK_DAMPING = 0.01, IK_POSTURE_PULL = 0.5, IK_TURN = 0.2;

