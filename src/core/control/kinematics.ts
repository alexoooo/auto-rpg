import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { jointKinematics, type BuiltBody, type BuiltJoint, type BuiltSegment, type JointKinematics } from "../build/build-body.ts";
import { motionAxesToRef, rotationOfToRef, turningToRef } from "../build/joint-state.ts";
import type { BodySpec } from "../spec/body.ts";
import type { Vec3 } from "../spec/quantity.ts";
import type { Pose } from "./motor.ts";
import { linearWork, solve3To, solveLinearTo, type LinearWork } from "../math/flat.ts";
import { hypot } from "../math/real.ts";
import { spinBetweenToRef } from "../math/turn.ts";
import { channelName } from "../muscle/driver.ts";

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

/** The joints from `spec`'s root out to its segment `segment`, root first, as `chainTo` walks a built body's: what a pose is solved in before the body is built. */
export function specChainTo(spec: BodySpec, segment: string): JointKinematics[] {
  const byChild = new Map(spec.joints.map((joint) => [joint.child, joint]));
  const chain: JointKinematics[] = [];
  for (let joint = byChild.get(segment); joint; joint = byChild.get(joint.parent)) chain.unshift(jointKinematics(joint));
  return chain;
}

/**
 * `pose` as a placement's angles by joint (`buildBody`): each joint a channel of `pose` names
 * (`channelName`), its freedoms at the pose's angles read within their ranges, a freedom it does
 * not name at zero. A body built so stands in the pose from its first step.
 */
export function poseAngles(spec: BodySpec, pose: Pose): Record<string, number[]> {
  const angles: Record<string, number[]> = {};
  for (const joint of spec.joints) {
    const kinematics = jointKinematics(joint), named = joint.dofs.map((_, k) => pose[channelName(kinematics, k)]);
    if (named.every((angle) => angle === undefined)) continue;
    angles[joint.name] = joint.dofs.map((dof, k) => Math.min(dof.max.value, Math.max(dof.min.value, named[k] ?? 0)));
  }
  return angles;
}

const scratch = { a: new Quaternion(), b: new Quaternion(), d: new Quaternion(), v: new Vector3(), at: new Vector3() };

/** `joint`'s rotation at `angles` (each freedom's, its own sense), body frame: `jointAngles` undone. */
export function rotationAtToRef(joint: JointKinematics, angles: readonly number[], out: Quaternion): Quaternion {
  return rotationOfToRef(joint.axes, engineAngle(joint, angles, 0), engineAngle(joint, angles, 1), engineAngle(joint, angles, 2), out);
}

/** Freedom `k` of `joint` at `angles` in the engine's sense, a locked one at zero. */
function engineAngle(joint: JointKinematics, angles: readonly number[], k: number): number {
  return k < joint.dofs.length ? joint.dofs[k]!.sign * angles[k]! : 0;
}

/**
 * Where `point` (body frame, reference pose, on the chain's last segment) is in the root's frame
 * with the chain's joints at `angles` (by joint, in the chain's order).
 */
export function pointAtToRef(chain: readonly JointKinematics[], angles: readonly (readonly number[])[], point: Vec3, out: Vector3): Vector3 {
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
 * What a walk of a chain leaves (`walkTo`): the turn of everything before each joint; each
 * joint's centre as the chain stands; the turn of the chain's last segment; and, for each freedom
 * asked for, its spin: the axis, root's frame, that everything beyond its joint turns about for a
 * unit of its rate. Grown to the longest chain walked in it: a walk writes every entry it or its
 * reader reads.
 */
interface ChainWalk {
  readonly before: Quaternion[];
  readonly centre: Vector3[];
  readonly last: Quaternion;
  readonly spin: Vector3[];
  readonly axes: [number, number, number][];
  readonly turning: number[][];
}

function chainWalk(): ChainWalk {
  return { before: [], centre: [], last: new Quaternion(), spin: [], axes: [], turning: [] };
}

/**
 * Walk `chain` at `angles`, into `walk`. A freedom's spin is its joint's axes (`motionAxesToRef`,
 * which leans a two-freedom joint's as its lock asks) summed by what each freedom's speed is for a
 * unit of this one's rate (`turningToRef`), turned by everything before the joint.
 */
function walkTo(walk: ChainWalk, chain: readonly JointKinematics[], angles: readonly (readonly number[])[], free: readonly ReachFreedom[]): void {
  const { before, centre, last, spin, axes, turning } = walk;
  last.copyFromFloats(0, 0, 0, 1);
  for (let j = 0; j < chain.length; j++) {
    const joint = chain[j]!, at = (centre[j] ??= new Vector3()), c = joint.spec.centre.value;
    (before[j] ??= new Quaternion()).copyFrom(last);
    if (j === 0) at.set(c[0], c[1], c[2]);
    else {
      const from = chain[j - 1]!.spec.centre.value;
      scratch.v.set(c[0] - from[0], c[1] - from[1], c[2] - from[2]).applyRotationQuaternionToRef(last, scratch.v);
      at.copyFrom(centre[j - 1]!).addInPlace(scratch.v);
    }
    last.multiplyInPlace(rotationAtToRef(joint, angles[j]!, scratch.b));
  }
  let read = -1;
  for (let c = 0; c < free.length; c++) {
    const f = free[c]!, joint = chain[f.joint]!;
    if (f.joint !== read) {
      motionAxesToRef(joint, angles[f.joint]!, axes);
      turningToRef(joint, angles[f.joint]!, turning);
      read = f.joint;
    }
    let x = 0, y = 0, z = 0;
    for (let i = 0; i < joint.dofs.length; i++) {
      const axis = axes[i]!, share = turning[i]![f.k]!;
      x += axis[0] * share; y += axis[1] * share; z += axis[2] * share;
    }
    (spin[c] ??= new Vector3()).set(x, y, z).applyRotationQuaternionToRef(before[f.joint]!, spin[c]!);
  }
}

/** Where `point` of the last segment of the chain walked into `walk` is, root's frame: `pointAtToRef`'s answer, by the walk's sums. */
function walkedPointToRef(walk: ChainWalk, chain: readonly JointKinematics[], point: Vec3, out: Vector3): Vector3 {
  const end = chain.length - 1, c = chain[end]!.spec.centre.value;
  scratch.v.set(point[0] - c[0], point[1] - c[1], point[2] - c[2]).applyRotationQuaternionToRef(walk.last, scratch.v);
  return out.copyFrom(walk.centre[end]!).addInPlace(scratch.v);
}

/** How a point at `at` moves for a unit of the walked chain's freedom `c` of joint `joint`: its spin crossed with the arm from the joint's centre, into `out` from `from` on. */
function walkedColumn(walk: ChainWalk, c: number, joint: number, at: Vector3, out: number[] | Float64Array, from: number): void {
  const w = walk.spin[c]!, centre = walk.centre[joint]!, x = at.x - centre.x, y = at.y - centre.y, z = at.z - centre.z;
  out[from] = w.y * z - w.z * y; out[from + 1] = w.z * x - w.x * z; out[from + 2] = w.x * y - w.y * x;
}

/**
 * How `point` (body frame, reference pose, on the chain's last segment) moves for a unit of each
 * of `free`, with the chain at `angles`: `out[c]` is freedom c's column, m/rad, root's frame. One
 * walk of the chain, no differences: the column of freedom k of joint j is w x (p - c_j), p the
 * point as the chain stands, c_j the joint's centre, w the freedom's spin (`walkTo`).
 */
export function reachJacobianTo(out: number[][], chain: readonly JointKinematics[], angles: readonly (readonly number[])[],
  free: readonly ReachFreedom[], point: Vec3): number[][] {
  const walk = chainWalk();
  walkTo(walk, chain, angles, free);
  const at = walkedPointToRef(walk, chain, point, scratch.at);
  out.length = free.length;
  for (let c = 0; c < free.length; c++) walkedColumn(walk, c, free[c]!.joint, at, (out[c] ??= []), 0);
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

/** Segment turn since reference, in the root frame, with a positional lever for angular rows. */
export interface ReachOrientation { readonly target: Quaternion; readonly lever: number }

/** The rows a reach of `tasks` tasks asks: one point's three, and a second point's two more. */
function rowsOf(tasks: number): number {
  return tasks === 1 ? 3 : 5;
}

/**
 * What `solveReach` works in, for up to `freedoms` freedoms: the walk of the chain; each freedom's
 * column of J (`stride` entries, the most rows a reach asks), range, whether it is stuck, its step
 * and the posture's pull on it; the tasks' errors; J J' and the system a pass solves (rows by rows,
 * end to end); J times the pull; the two answers; the line from the first point to the second, a
 * direction square to it, and the second point's column. A solve writes every entry it reads.
 */
export interface ReachWork {
  readonly freedoms: number;
  readonly stride: number;
  readonly walk: ChainWalk;
  readonly J: Float64Array;
  readonly least: Float64Array;
  readonly most: Float64Array;
  readonly stuck: Uint8Array;
  readonly steps: Float64Array;
  readonly toward: Float64Array;
  readonly e: Float64Array;
  readonly JJ: Float64Array;
  readonly A: Float64Array;
  readonly Jp: Float64Array;
  readonly y: Float64Array;
  readonly z: Float64Array;
  readonly line: Float64Array;
  readonly square: Float64Array;
  readonly column: Float64Array;
  readonly linear: LinearWork;
  readonly at: Vector3;
  readonly at2: Vector3;
}

export function reachWork(freedoms: number): ReachWork {
  const stride = 6;
  return {
    freedoms, stride, walk: chainWalk(), J: new Float64Array(freedoms * stride), least: new Float64Array(freedoms), most: new Float64Array(freedoms),
    stuck: new Uint8Array(freedoms), steps: new Float64Array(freedoms), toward: new Float64Array(freedoms), e: new Float64Array(stride),
    JJ: new Float64Array(stride * stride), A: new Float64Array(stride * stride), Jp: new Float64Array(stride), y: new Float64Array(stride), z: new Float64Array(stride),
    line: new Float64Array(3), square: new Float64Array(3), column: new Float64Array(3), linear: linearWork(stride), at: new Vector3(), at2: new Vector3(),
  };
}

/**
 * The angles that carry out `tasks`, moving only `free` and holding every other angle in
 * `angles` as given; `angles` is the start and is overwritten with the answer. Returns the
 * greatest distance left over the tasks, m, and says in `end`, if given, how it ended. It works
 * in `work`, made for at least as many freedoms as `free`.
 *
 * One point with an independent orientation asks six rows, with angular errors scaled by its lever.
 * One point alone asks three rows. Two are two points of one rigid body, which
 * can be asked five things, not six: the first point's place, and the second's error taken across
 * the line between the two points as they lie (two rows, along two directions square to it), the
 * distance along that line being the body's own.
 *
 * Damped least squares: each pass moves the free angles by J+ e, J's pseudo-inverse damped by
 * `IK_DAMPING` so a straight arm does not fling, plus the null space's share of a pull toward the
 * preferred angles, so a redundant arm settles its swing where the posture asks rather than
 * wherever it began; then clamps each to its range. J is the kinematics' own derivative, in
 * closed form (`reachJacobianTo`): read by differences its noise is a thousand times what the
 * solve stops at, and a solve at its place never stops.
 * Where the free angles do not outnumber the rows there is no null space, and no pull.
 *
 * A range that reaches a half turn is taken `IK_SHORT` short of it: a joint's angles read within
 * a half turn (`rotationOfToRef`), so a limit at one or beyond never acts, and an angle there
 * has no rotation.
 */
export function solveReach(chain: readonly JointKinematics[], angles: number[][], free: readonly ReachFreedom[], tasks: readonly ReachTask[],
  end?: ReachEnd, work: ReachWork = reachWork(free.length), orientation?: ReachOrientation): number {
  if (tasks.length !== 1 && tasks.length !== 2) throw new Error(`a reach is one task or two, not ${tasks.length}`);
  if (orientation && (tasks.length !== 1 || !(orientation.lever > 0))) throw new Error("an oriented reach needs one point and a positive lever");
  const n = free.length;
  if (n > work.freedoms) throw new Error(`a reach of ${n} freedoms in a work made for ${work.freedoms}`);
  const [first, second] = tasks as readonly [ReachTask, ReachTask?];
  const rows = orientation ? 6 : rowsOf(tasks.length), { stride, walk, J, least, most, stuck, steps, toward, e, JJ, A, Jp, y, z, line, square, column, at, at2 } = work;
  // Each freedom's range, kept short of the half turn its joint's measure reads within.
  for (let k = 0; k < n; k++) {
    least[k] = Math.max(free[k]!.min, IK_SHORT - Math.PI);
    most[k] = Math.min(free[k]!.max, Math.PI - IK_SHORT);
  }
  let left = Infinity, taken = 0, still = false;
  while (taken < IK_PASSES && !still) {
    taken++;
    walkTo(walk, chain, angles, free);
    walkedPointToRef(walk, chain, first.point, at);
    e[0] = first.target[0] - at.x; e[1] = first.target[1] - at.y; e[2] = first.target[2] - at.z;
    left = hypot(e[0]!, e[1]!, e[2]!);
    // The second point's two directions, a and b: square to the line from the first point to it, as they lie.
    let ax = 0, ay = 0, az = 0, bx = 0, by = 0, bz = 0;
    if (second) {
      walkedPointToRef(walk, chain, second.point, at2);
      unitTo(at2.x - at.x, at2.y - at.y, at2.z - at.z, line);
      const lx = line[0]!, ly = line[1]!, lz = line[2]!;
      // The axis the line leans least toward, less its part along the line.
      const flat = Math.abs(ly) < Math.abs(lx), px = flat ? 0 : 1, py = flat ? 1 : 0, pz = 0, along = px * lx + py * ly + pz * lz;
      unitTo(px - lx * along, py - ly * along, pz - lz * along, square);
      ax = square[0]!; ay = square[1]!; az = square[2]!;
      bx = ly * az - lz * ay; by = lz * ax - lx * az; bz = lx * ay - ly * ax;
      const ex = second.target[0] - at2.x, ey = second.target[1] - at2.y, ez = second.target[2] - at2.z;
      e[3] = ex * ax + ey * ay + ez * az; e[4] = ex * bx + ey * by + ez * bz;
      left = Math.max(left, hypot(ex, ey, ez));
    }
    if (orientation) {
      spinBetweenToRef(walk.last, orientation.target, 1, at2);
      e[3] = at2.x * orientation.lever; e[4] = at2.y * orientation.lever; e[5] = at2.z * orientation.lever;
      left = Math.max(left, hypot(e[3]!, e[4]!, e[5]!));
    }
    for (let c = 0; c < n; c++) {
      walkedColumn(walk, c, free[c]!.joint, at, J, c * stride);
      if (second) {
        walkedColumn(walk, c, free[c]!.joint, at2, column, 0);
        J[c * stride + 3] = column[0]! * ax + column[1]! * ay + column[2]! * az;
        J[c * stride + 4] = column[0]! * bx + column[1]! * by + column[2]! * bz;
      }
      if (orientation) {
        const spin = walk.spin[c]!;
        J[c * stride + 3] = spin.x * orientation.lever;
        J[c * stride + 4] = spin.y * orientation.lever;
        J[c * stride + 5] = spin.z * orientation.lever;
      }
    }
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
    stuck.fill(0, 0, n);
    for (let moving = n; ;) {
      for (let r = 0; r < rows; r++) for (let c = 0; c < rows; c++) {
        let sum = 0;
        for (let k = 0; k < n; k++) sum = sum + J[k * stride + r]! * J[k * stride + c]!;
        JJ[r * rows + c] = sum;
        A[r * rows + c] = sum + (r === c ? IK_DAMPING * IK_DAMPING : 0);
      }
      solveTo(work, rows, A, e, y);
      if (moving > rows) {
        for (let k = 0; k < n; k++) toward[k] = stuck[k] ? 0 : IK_POSTURE_PULL * (free[k]!.preferred - angles[free[k]!.joint]![free[k]!.k]!);
        for (let r = 0; r < rows; r++) {
          let sum = 0;
          for (let k = 0; k < n; k++) sum = sum + J[k * stride + r]! * toward[k]!;
          Jp[r] = sum;
        }
        for (let r = 0; r < rows; r++) for (let c = 0; c < rows; c++) A[r * rows + c] = JJ[r * rows + c]! + (r === c ? IK_BLIND * IK_BLIND : 0);
        solveTo(work, rows, A, Jp, z);
        for (let k = 0; k < n; k++) steps[k] = across(J, stride, k, y, rows) + toward[k]! - across(J, stride, k, z, rows);
      } else for (let k = 0; k < n; k++) steps[k] = across(J, stride, k, y, rows);
      let more = false;
      for (let k = 0; k < n; k++) {
        if (stuck[k]) continue;
        const angle = angles[free[k]!.joint]![free[k]!.k]!;
        if ((angle <= least[k]! && steps[k]! < 0) || (angle >= most[k]! && steps[k]! > 0)) {
          stuck[k] = 1;
          more = true;
          moving--;
          for (let r = 0; r < rows; r++) J[k * stride + r] = 0;
        }
      }
      if (!more) break;
    }
    // A pass turns no angle more than `IK_TURN`, the whole step scaled alike, so a target out of
    // reach draws the arm straight toward it rather than across the singularity at full stretch.
    let biggest = -Infinity;
    for (let k = 0; k < n; k++) biggest = Math.max(biggest, Math.abs(steps[k]!));
    const scale = Math.min(1, IK_TURN / biggest);
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

/** `(x, y, z)` scaled to a unit, into `out`: `normalize`'s arithmetic (`src/core/spec/vec.ts`). */
function unitTo(x: number, y: number, z: number, out: Float64Array): void {
  const length = hypot(x, y, z);
  if (!(length > 0)) throw new Error("cannot normalize a zero vector");
  const s = 1 / length;
  out[0] = x * s; out[1] = y * s; out[2] = z * s;
}

/** Freedom `k`'s column of `J` against `x`, summed in the rows' order. */
function across(J: Float64Array, stride: number, k: number, x: Float64Array, rows: number): number {
  let sum = J[k * stride]! * x[0]!;
  for (let r = 1; r < rows; r++) sum += J[k * stride + r]! * x[r]!;
  return sum;
}

/** `A x = y` of `rows` rows (`A` its rows end to end), into `x`: Cramer's rule for three (`solve3To`), elimination for more. */
function solveTo(work: ReachWork, rows: number, A: Float64Array, y: Float64Array, x: Float64Array): void {
  if (rows === 3) solve3To(A, y, x);
  else solveLinearTo(work.linear, A, y, rows, x);
}

/**
 * The solver's numeric settings, which are not anatomy: passes at most, the largest change of an
 * angle it stops at (rad), its damping (m), and how far short
 * of a half turn it keeps every angle (rad): there the half angle's tangent is 20, and a servo
 * that follows the angle a few degrees off reads it on the same side; and the least a place
 * moves for a radian, m, for the posture's pull to be kept off that way: at a decimetre a
 * radian, an arm's own, the pull's leak into the place is a part in a hundred million.
 */
const IK_PASSES = 200, IK_TOLERANCE = 1e-10, IK_DAMPING = 0.01, IK_SHORT = 0.1, IK_BLIND = 1e-5;
/**
 * What shapes the path an arm takes to a place: the share of the way to the preferred angles each
 * pass asks in the null space, and the most any angle turns in one pass (rad). Set
 * (`docs/reference/human-and-strikes.md#ik`).
 */
const IK_POSTURE_PULL = 0.5, IK_TURN = 0.2;
