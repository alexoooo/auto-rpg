import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BuiltBody, BuiltJoint, BuiltSegment } from "../build/build-body.ts";
import { rotationOfToRef } from "../build/joint-state.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { cross, dot, normalize, orthogonalTo } from "../spec/vec.ts";
import { solve3, solveLinear } from "../math/linalg.ts";
import { hypot } from "../math/real.ts";

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

/** A frame in the world: a point `p` of it is at `position + rotation p`. */
export interface Frame {
  readonly position: Vector3;
  readonly rotation: Quaternion;
}

/**
 * The root's frame in the world, from `root`'s node, into `out`: what `pointNowToRef` undoes, the
 * root's turn since its reference pose about its node.
 */
export function rootFrameToRef(root: BuiltSegment, out: Frame): Frame {
  root.node.rotationQuaternion!.multiplyToRef(Quaternion.InverseToRef(root.rest, scratch.a), out.rotation);
  const origin = root.frame.origin;
  scratch.v.set(origin[0], origin[1], origin[2]).applyRotationQuaternionToRef(out.rotation, scratch.v);
  out.position.copyFrom(root.node.position).subtractInPlace(scratch.v);
  return out;
}

/** The world point `world` in `frame`: what is left of the frame's place, turned by its turn's conjugate. */
export function intoFrameToRef(frame: Frame, world: Vec3, out: Vector3): Vector3 {
  out.set(world[0], world[1], world[2]).subtractInPlace(frame.position);
  return out.applyRotationQuaternionToRef(Quaternion.InverseToRef(frame.rotation, scratch.a), out);
}

/** A point of the chain's last segment (body frame, reference pose, m) and where it goes (root's frame, m). */
interface ReachTask {
  readonly point: Vec3;
  readonly target: Vec3;
}

/** What `solveReach` may move: freedom `k` of the chain's joint `joint`, within `[min, max]`, drawn toward `preferred`. */
interface ReachFreedom {
  readonly joint: number;
  readonly k: number;
  readonly min: number;
  readonly max: number;
  readonly preferred: number;
}

/** How a solve ended: the passes it took, and whether it stopped of itself (no angle moved `IK_TOLERANCE` in its last pass) or at `IK_PASSES`. */
export interface ReachEnd { passes: number; still: boolean }

/**
 * The angles that carry out `tasks`, moving only `free` and holding every other angle in
 * `angles` as given; `angles` is the start and is overwritten with the answer. Returns the
 * greatest distance left over the tasks, m, and says in `end`, if given, how it ended.
 *
 * One task puts its point at its target: three rows. Two are two points of one rigid body, which
 * can be asked five things, not six: the first point's place, and the second's error taken across
 * the line between the two points as they lie (two rows, along two directions square to it), the
 * distance along that line being the body's own.
 *
 * Damped least squares: each pass moves the free angles by J+ e, J's pseudo-inverse damped by
 * `IK_DAMPING` so a straight arm does not fling, plus the null space's share of a pull toward the
 * preferred angles, so a redundant arm settles its swing where the posture asks rather than
 * wherever it began; then clamps each to its range. J is read by differences of `IK_STEP` rad.
 * Where the free angles do not outnumber the rows there is no null space, and no pull.
 *
 * A range that reaches a half turn is taken `IK_SHORT` short of it: a joint's angles read within
 * a half turn (`rotationOfToRef`), so a limit at one or beyond never acts, and an angle there
 * has no rotation.
 */
export function solveReach(chain: readonly BuiltJoint[], angles: number[][], free: readonly ReachFreedom[], tasks: readonly ReachTask[],
  end?: ReachEnd): number {
  if (tasks.length !== 1 && tasks.length !== 2) throw new Error(`a reach is one task or two, not ${tasks.length}`);
  const [first, second] = tasks as readonly [ReachTask, ReachTask?];
  const n = free.length, rows = Array.from({ length: second ? 5 : 3 }, (_, r) => r), solve = second ? solveLinear : solve3;
  const at = new Vector3(), moved = new Vector3(), at2 = new Vector3(), moved2 = new Vector3();
  const J = free.map(() => rows.map(() => 0));
  // Each freedom's range, kept short of the half turn its joint's measure reads within.
  const least = free.map((f) => Math.max(f.min, IK_SHORT - Math.PI)), most = free.map((f) => Math.min(f.max, Math.PI - IK_SHORT));
  /** Freedom k's column of J against `x`, summed in the rows' order. */
  const across = (k: number, x: readonly number[]): number => {
    let sum = J[k]![0]! * x[0]!;
    for (let r = 1; r < rows.length; r++) sum += J[k]![r]! * x[r]!;
    return sum;
  };
  let left = Infinity, taken = 0, still = false;
  while (taken < IK_PASSES && !still) {
    taken++;
    pointAtToRef(chain, angles, first.point, at);
    const e = [first.target[0] - at.x, first.target[1] - at.y, first.target[2] - at.z];
    left = hypot(e[0]!, e[1]!, e[2]!);
    // The second point's two directions: square to the line from the first point to it, as they lie.
    let a: Vec3 | null = null, b: Vec3 | null = null;
    if (second) {
      pointAtToRef(chain, angles, second.point, at2);
      const line = normalize([at2.x - at.x, at2.y - at.y, at2.z - at.z]);
      a = orthogonalTo(Math.abs(line[1]) < Math.abs(line[0]) ? [0, 1, 0] : [1, 0, 0], line);
      b = cross(line, a);
      const e2: Vec3 = [second.target[0] - at2.x, second.target[1] - at2.y, second.target[2] - at2.z];
      e.push(dot(e2, a), dot(e2, b));
      left = Math.max(left, hypot(e2[0], e2[1], e2[2]));
    }
    free.forEach((f, c) => {
      const row = angles[f.joint]!, keep = row[f.k]!;
      row[f.k] = keep + IK_STEP;
      pointAtToRef(chain, angles, first.point, moved);
      if (second) pointAtToRef(chain, angles, second.point, moved2);
      row[f.k] = keep;
      J[c]![0] = (moved.x - at.x) / IK_STEP; J[c]![1] = (moved.y - at.y) / IK_STEP; J[c]![2] = (moved.z - at.z) / IK_STEP;
      if (second) {
        const d: Vec3 = [(moved2.x - at2.x) / IK_STEP, (moved2.y - at2.y) / IK_STEP, (moved2.z - at2.z) / IK_STEP];
        J[c]![3] = dot(d, a!); J[c]![4] = dot(d, b!);
      }
    });
    // The step is J' (J J' + damping^2 I)^-1 e, and the posture's pull is projected off what J
    // sees, (I - J' (J J')^-1 J) p: a projector damped as the step is leaks a share of the pull
    // into the hand's place, and the solve settles that far from the target. A straight arm sees
    // no way along its own line, and J J' has no inverse there: the projector's is taken with
    // `IK_BLIND`, under which a way is not seen and the pull along it is left in.
    //
    // A freedom at an end of its range that the step would take past it has no part in the pass:
    // the step is found again without it. Left in and clamped after, the others move as though it
    // had moved, the posture's pull leaks into the tasks by its share, and the solve settles
    // short of a place the arm can reach.
    const stuck = free.map(() => false);
    let steps: number[] = [];
    for (let moving = n; ;) {
      const JJ = rows.map((r) => rows.map((c) => free.reduce((s, _, k) => s + J[k]![r]! * J[k]![c]!, 0)));
      const A = JJ.map((row, r) => row.map((v, c) => v + (r === c ? IK_DAMPING * IK_DAMPING : 0)));
      const y = solve(A, e);
      if (moving > rows.length) {
        const toward = free.map((f, k) => stuck[k] ? 0 : IK_POSTURE_PULL * (f.preferred - angles[f.joint]![f.k]!));
        const Jp = rows.map((r) => free.reduce((s, _, k) => s + J[k]![r]! * toward[k]!, 0));
        const z = solve(JJ.map((row, r) => row.map((v, c) => v + (r === c ? IK_BLIND * IK_BLIND : 0))), Jp);
        steps = free.map((_, k) => across(k, y) + toward[k]! - across(k, z));
      } else steps = free.map((_, k) => across(k, y));
      let more = false;
      for (let k = 0; k < n; k++) {
        if (stuck[k]) continue;
        const angle = angles[free[k]!.joint]![free[k]!.k]!;
        if ((angle <= least[k]! && steps[k]! < 0) || (angle >= most[k]! && steps[k]! > 0)) {
          stuck[k] = more = true;
          moving--;
          for (const r of rows) J[k]![r] = 0;
        }
      }
      if (!more) break;
    }
    // A pass turns no angle more than `IK_TURN`, the whole step scaled alike, so a target out of
    // reach draws the arm straight toward it rather than across the singularity at full stretch.
    const scale = Math.min(1, IK_TURN / Math.max(...steps.map(Math.abs)));
    let largest = 0;
    for (let k = 0; k < n; k++) {
      const f = free[k]!, row = angles[f.joint]!;
      const was = row[f.k]!;
      row[f.k] = Math.max(least[k]!, Math.min(most[k]!, was + scale * steps[k]!));
      largest = Math.max(largest, Math.abs(row[f.k]! - was));
    }
    // Done when the angles no longer move: a path differenced for its rates must not carry a
    // solve's unfinished drift along the posture's pull.
    still = largest < IK_TOLERANCE;
  }
  if (end) { end.passes = taken; end.still = still; }
  return left;
}

/**
 * The solver's numeric settings, which are not anatomy: passes at most, the largest change of an
 * angle it stops at (rad), the angle it differences by (rad), its damping (m), and how far short
 * of a half turn it keeps every angle (rad): there the half angle's tangent is 20, and a servo
 * that follows the angle a few degrees off reads it on the same side; and the least a place
 * moves for a radian, m, for the posture's pull to be kept off that way: at a decimetre a
 * radian, an arm's own, the pull's leak into the place is a part in a hundred million.
 */
const IK_PASSES = 200, IK_TOLERANCE = 1e-10, IK_STEP = 1e-7, IK_DAMPING = 0.01, IK_SHORT = 0.1, IK_BLIND = 1e-5;
/**
 * What shapes the path an arm takes to a place: the share of the way to the preferred angles each
 * pass asks in the null space, and the most any angle turns in one pass (rad). Set
 * (`docs/reference/human-and-strikes.md#ik`).
 */
const IK_POSTURE_PULL = 0.5, IK_TURN = 0.2;

