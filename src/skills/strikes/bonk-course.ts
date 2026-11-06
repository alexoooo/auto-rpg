import type { Refused } from "../../core/refusal.ts";
import { Quaternion, Vector3 } from "../../core/math/vector.ts";
import { acos, atan2 } from "../../core/math/real.ts";
import { turnAboutToRef } from "../../core/math/turn.ts";
import { anglesOf } from "../../core/bodies/build/joint-state.ts";
import { rigidPoints } from "../../core/bodies/build/rigid.ts";
import { frameOf, type BodySpec } from "../../core/bodies/spec/body.ts";
import type { Pose } from "../../core/bodies/spec/pose.ts";
import type { Vec3 } from "../../core/bodies/spec/quantity.ts";
import { deepFreeze } from "../../core/world/state.ts";
import { channelName } from "../../core/bodies/muscle/driver.ts";
import { effectorFreedoms } from "../../control/effectors.ts";
import { pointAtToRef, poseAngles, rotationAtToRef, solveReach, specChainTo } from "../../control/kinematics.ts";
import { scalarPathToRef } from "../../control/point-path.ts";

/** Physical form, timing and settling contract of a descending held bonk, in SI units and radians. */
export const BONK_LIMITS = deepFreeze({
  chamberAbove: .25, descent: Math.PI / 4, sweep: [Math.PI / 4, 150 * Math.PI / 180] as const,
  prepare: 1, chamberNear: .05, still: .3, settledAngle: 10 * Math.PI / 180, chamberHold: .1,
  stroke: .5, swellError: .1, handError: .05, backward: .05, angleError: 15 * Math.PI / 180,
  excessTurn: 15 * Math.PI / 180, wristReversal: 15 * Math.PI / 180, tilt: Math.PI / 6,
  return: 1, guardHold: .2, after: .5, repetitions: 10, repetitionSeconds: 30,
  recoil: .05, collision: .15,
});

/** A technique's fixed joint bias and durations; the arc's two angles are measured from intended contact. */
export type BonkTechnique = {
  readonly posture: Pose;
  readonly windup: number;
  readonly follow: number;
  readonly prepareSeconds: number;
  readonly strokeSeconds: number;
  readonly returnSeconds: number;
};
export type BonkTurn = readonly [number, number, number, number];
export type BonkFrame = { readonly origin: Vec3; readonly at: Vec3; readonly turn: BonkTurn };
export type BonkPhase = "prepare" | "stroke" | "return";

/** A course's frozen world frame and construction inputs; angles use the body's joint convention. */
export type BonkCourse = {
  readonly effector: string;
  readonly frame: BonkFrame;
  readonly target: Vec3;
  readonly technique: BonkTechnique;
  readonly guard: readonly (readonly number[])[];
  readonly contact: readonly (readonly number[])[];
  readonly chamber: readonly (readonly number[])[];
  readonly follow: readonly (readonly number[])[];
  readonly axis: Vec3;
  readonly pivot: Vec3;
};
export interface BonkPose {
  readonly hand: Vec3;
  readonly swell: Vec3;
  readonly shaft: Vec3;
  readonly club: BonkTurn;
  readonly chest: BonkTurn;
  readonly chestAt: Vec3;
  readonly joints: readonly (readonly number[])[];
}

/** Numerical construction settings: geometric target closure and samples checking joint representability. */
const COURSE_SOLVER = Object.freeze({ target: .001, samples: 96 });
const tuple = (v: Vector3): Vec3 => [v.x, v.y, v.z];
const turnTuple = (q: Quaternion): BonkTurn => [q.x, q.y, q.z, q.w];
const magnitude = (v: Vec3): number => Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
const apart = (a: Vec3, b: Vec3): number => magnitude([a[0] - b[0], a[1] - b[1], a[2] - b[2]]);
const copy = (angles: readonly (readonly number[])[]): number[][] => angles.map(one => [...one]);

/** Whether a technique declares finite, positive timings and one bounded overhead arc. */
export function validBonkTechnique(technique: BonkTechnique): boolean {
  return !!technique && typeof technique === "object" && !!technique.posture && typeof technique.posture === "object"
    && !Array.isArray(technique.posture)
    && Object.values(technique.posture).every(Number.isFinite)
    && [technique.windup, technique.follow, technique.prepareSeconds, technique.strokeSeconds, technique.returnSeconds].every(value => Number.isFinite(value) && value > 0)
    && technique.windup + technique.follow <= BONK_LIMITS.sweep[1]
    && technique.prepareSeconds + BONK_LIMITS.chamberHold <= BONK_LIMITS.prepare
    && technique.strokeSeconds <= BONK_LIMITS.stroke && technique.returnSeconds + BONK_LIMITS.guardHold <= BONK_LIMITS.return;
}

/** Kinematic construction and reading of a rigid arm arc; the wrist and elbow stay fixed through its stroke. */
export function bonkModel(spec: BodySpec, effector: string) {
  const segment = spec.segments.find(one => one.name === effector), description = spec.effectors?.find(one => one.segment === effector);
  if (!segment || !description) return { refused: `no bonk effector ${effector}` };
  const points = rigidPoints(spec, segment), swell = points.get("swell"), shaftFrom = points.get("swellFrom"), shaftTo = points.get("swellTo");
  if (!swell || !shaftFrom || !shaftTo) return { refused: `${effector} needs declared swell and shaft points` };
  const chain = specChainTo(spec, effector), free = effectorFreedoms(chain, description.base);
  if (!free) return { refused: `${effector} has no arm chain` };
  const base = free[0]!.joint, wrist = chain.length - 1;
  if (chain[base]!.dofs.length !== 3 || base >= wrist) return { refused: `${effector} needs a three-axis arm base and a wrist` };
  const movable = free.filter(one => one.joint !== wrist), handPoint = frameOf(segment).origin;
  const chest = chain.findIndex(one => one.spec.child === description.base);
  const chestPoint = frameOf(spec.segments.find(one => one.name === description.base)!).origin;
  const p = new Vector3(), q = new Quaternion(), axis = new Vector3(), delta = new Quaternion(), before = new Quaternion(), inverse = new Quaternion();
  const angleWork: [number, number, number] = [0, 0, 0], scalar: [number, number, number] = [0, 0, 0];
  const chainTurn = (angles: readonly (readonly number[])[], through: number): Quaternion => {
    const result = Quaternion.Identity();
    for (let j = 0; j <= through; j++) result.multiplyInPlace(rotationAtToRef(chain[j]!, angles[j]!, q));
    return result;
  };
  const worldPoint = (frame: BonkFrame, point: Vec3): Vec3 => {
    q.copyFromFloats(...frame.turn);
    return tuple(p.set(point[0] - frame.origin[0], point[1] - frame.origin[1], point[2] - frame.origin[2])
      .applyRotationQuaternionToRef(q, p).addInPlaceFromFloats(...frame.at));
  };
  const localPoint = (frame: BonkFrame, point: Vec3): Vec3 => {
    Quaternion.InverseToRef(q.copyFromFloats(...frame.turn), inverse);
    return tuple(p.set(point[0] - frame.at[0], point[1] - frame.at[1], point[2] - frame.at[2])
      .applyRotationQuaternionToRef(inverse, p).addInPlaceFromFloats(...frame.origin));
  };
  function rotated(contact: readonly (readonly number[])[], direction: Vec3, radians: number): number[][] {
    const result = copy(contact), parent = chainTurn(contact, base - 1);
    before.copyFrom(parent); Quaternion.InverseToRef(before, inverse);
    turnAboutToRef(axis.set(...direction), radians, delta);
    inverse.multiplyToRef(delta, before); before.multiplyInPlace(parent);
    before.multiplyInPlace(rotationAtToRef(chain[base]!, contact[base]!, q));
    anglesOf(before, chain[base]!.axes, angleWork);
    result[base] = chain[base]!.dofs.map((dof, k) => angleWork[k]! * dof.sign);
    return result;
  }
  function pose(course: BonkCourse, joints: readonly (readonly number[])[]): BonkPose {
    const at = (point: Vec3) => worldPoint(course.frame, tuple(pointAtToRef(chain, joints, point, p)));
    const hand = at(handPoint), head = at(swell!.value), a = at(shaftFrom!.value), b = at(shaftTo!.value);
    const unit = apart(a, b), world = new Quaternion(...course.frame.turn);
    return { hand, swell: head, shaft: [(b[0] - a[0]) / unit, (b[1] - a[1]) / unit, (b[2] - a[2]) / unit],
      club: turnTuple(world.multiply(chainTurn(joints, chain.length - 1)).normalize()),
      chest: turnTuple(world.multiply(chainTurn(joints, chest)).normalize()),
      chestAt: worldPoint(course.frame, chest < 0 ? chestPoint : tuple(pointAtToRef(chain.slice(0, chest + 1), joints.slice(0, chest + 1), chestPoint, p))), joints };
  }
  const strokeJoints = (course: BonkCourse, progress: number): number[][] =>
    rotated(course.contact, course.axis, course.technique.windup - (course.technique.windup + course.technique.follow) * Math.max(0, Math.min(1, progress)));
  const sampler = (course: BonkCourse, phase: BonkPhase, time: number, returning?: readonly (readonly number[])[]): BonkPose => {
    const seconds = phase === "prepare" ? course.technique.prepareSeconds : phase === "stroke" ? course.technique.strokeSeconds : course.technique.returnSeconds;
    scalarPathToRef(0, 0, 1, Math.max(0, time), seconds, scalar);
    const u = scalar[0];
    const from = phase === "prepare" ? course.guard : returning ?? course.follow, to = phase === "prepare" ? course.chamber : course.guard;
    return pose(course, phase === "stroke" ? strokeJoints(course, u) : from.map((one, j) => one.map((v, k) => v + (to[j]![k]! - v) * u)));
  };
  function shape(course: BonkCourse): { readonly failures: readonly string[]; readonly chamberAbove: number; readonly descent: number; readonly sweep: number } {
    const chamber = pose(course, course.chamber), contact = pose(course, course.contact), end = pose(course, course.follow);
    const pivot = worldPoint(course.frame, course.pivot), radial = new Vector3(contact.swell[0] - pivot[0], contact.swell[1] - pivot[1], contact.swell[2] - pivot[2]);
    axis.set(...course.axis).applyRotationQuaternionToRef(new Quaternion(...course.frame.turn), axis);
    const tangent = Vector3.Cross(radial, axis).normalize(), descent = acos(Math.max(-1, Math.min(1, Math.sqrt(tangent.x * tangent.x + tangent.z * tangent.z))));
    const above = chamber.swell[1] - course.target[1], total = course.technique.windup + course.technique.follow;
    const dot = contact.shaft[0] * axis.x + contact.shaft[1] * axis.y + contact.shaft[2] * axis.z;
    const sweep = total * Math.sqrt(Math.max(0, 1 - dot * dot));
    const failures: string[] = [];
    if (above < BONK_LIMITS.chamberAbove) failures.push("chamber is not high enough above intended contact");
    if (tangent.y >= 0 || descent < BONK_LIMITS.descent) failures.push("contact tangent does not descend steeply enough");
    if (sweep < BONK_LIMITS.sweep[0] || sweep > BONK_LIMITS.sweep[1]) failures.push("shaft sweep is outside the bonk range");
    if (total >= Math.PI || !(total > 0) || !(course.technique.windup > 0) || !(course.technique.follow > 0)) failures.push("stroke is not one simple arc through contact");
    if (apart(contact.swell, course.target) > COURSE_SOLVER.target) failures.push("declared course does not pass through intended contact");
    for (let i = 0; i <= COURSE_SOLVER.samples; i++) {
      const joints = strokeJoints(course, i / COURSE_SOLVER.samples);
      if (joints.some((one, j) => one.some((angle, k) => angle < chain[j]!.dofs[k]!.spec.min.value || angle > chain[j]!.dofs[k]!.spec.max.value))) {
        failures.push("stroke exceeds a joint range"); break;
      }
    }
    // The rigid rotation has one fixed axis and a span below a half turn, so no point can loop or repeat a windup.
    if (apart(chamber.swell, end.swell) === 0) failures.push("stroke has no travel");
    return { failures, chamberAbove: above, descent, sweep };
  }
  return {
    channels: chain.map(joint => joint.dofs.map((_, k) => channelName(joint, k))),
    wrist,
    /** A course from declared posture and observed entry frame and aim, never from a fitted trajectory. */
    make(frame: BonkFrame, guard: Pose, target: Vec3, technique: BonkTechnique): BonkCourse | Refused {
      if (!validBonkTechnique(technique)) return { refused: "invalid bonk technique" };
      if (![...frame.origin, ...frame.at, ...frame.turn, ...target, ...Object.values(guard)].every(Number.isFinite)) return { refused: "nonfinite bonk construction input" };
      if (frame.turn.every(value => value === 0)) return { refused: "bonk frame has no rotation" };
      const channels = new Set(chain.flatMap(joint => joint.dofs.map((_, k) => channelName(joint, k))));
      const unknown = Object.keys(technique.posture).find(channel => !channels.has(channel));
      if (unknown) return { refused: `bonk posture has no arm or trunk channel ${unknown}` };
      const initial = poseAngles(spec, guard), biased = poseAngles(spec, { ...guard, ...technique.posture });
      const home = chain.map(joint => initial[joint.spec.name] ?? joint.dofs.map(() => 0));
      const contact = chain.map(joint => biased[joint.spec.name] ?? joint.dofs.map(() => 0));
      const point = localPoint(frame, target);
      const freedoms = movable.map(one => ({ ...one, preferred: contact[one.joint]![one.k]! }));
      const residual = solveReach(chain, contact, freedoms, [{ point: swell!.value, target: point }]);
      if (residual > COURSE_SOLVER.target) return { refused: `bonk contact is unreachable by ${residual} m` };
      const pivot = base === 0 ? chain[base]!.spec.centre.value
        : tuple(pointAtToRef(chain.slice(0, base), contact.slice(0, base), chain[base]!.spec.centre.value, p));
      const radial = p.set(point[0] - pivot[0], point[1] - pivot[1], point[2] - pivot[2]);
      // The plane contains world up, so its descending tangent is defined independently of body heading or lean.
      Quaternion.InverseToRef(q.copyFromFloats(...frame.turn), inverse);
      const up = new Vector3(0, 1, 0).applyRotationQuaternionToRef(inverse, new Vector3());
      const around = Vector3.Cross(radial, up).normalize();
      if (!(around.length() > 0)) return { refused: "bonk has no descending arc plane" };
      const direction = tuple(around);
      const course = deepFreeze({ effector,
        frame: { origin: [...frame.origin] as Vec3, at: [...frame.at] as Vec3, turn: [...frame.turn] as BonkTurn }, target: [...target] as Vec3,
        technique: { ...technique, posture: { ...technique.posture } }, guard: home, contact,
        chamber: rotated(contact, direction, technique.windup), follow: rotated(contact, direction, -technique.follow), axis: direction, pivot: [...pivot] as Vec3 });
      const checked = shape(course);
      return checked.failures.length ? { refused: checked.failures.join("; ") } : course;
    },
    pose,
    sample: sampler,
    shape,
    /** Swell travel along the declared circular arc, m. */
    length(course: BonkCourse): number {
      const contact = pose(course, course.contact), pivot = worldPoint(course.frame, course.pivot);
      return apart(contact.swell, pivot) * (course.technique.windup + course.technique.follow);
    },
    /** Nearest point on the simple swell arc; ties choose the earlier progress. */
    nearest(course: BonkCourse, point: Vec3): { readonly progress: number; readonly distance: number; readonly pose: BonkPose } {
      const contact = pose(course, course.contact), pivot = worldPoint(course.frame, course.pivot);
      const normal = new Vector3(...course.axis).applyRotationQuaternionToRef(new Quaternion(...course.frame.turn), new Vector3());
      const radial = new Vector3(contact.swell[0] - pivot[0], contact.swell[1] - pivot[1], contact.swell[2] - pivot[2]);
      const axial = Vector3.Dot(radial, normal);
      const centre: Vec3 = [pivot[0] + axial * normal.x, pivot[1] + axial * normal.y, pivot[2] + axial * normal.z];
      const along = radial.subtract(normal.scale(axial)).normalize(), across = Vector3.Cross(normal, along);
      const from = new Vector3(point[0] - centre[0], point[1] - centre[1], point[2] - centre[2]);
      const x = Vector3.Dot(from, along), y = Vector3.Dot(from, across);
      const total = course.technique.windup + course.technique.follow;
      const interior = x === 0 && y === 0 ? 0 : Math.max(0, Math.min(1, (course.technique.windup - atan2(y, x)) / total));
      const candidates = [...new Set([0, interior, 1])].sort((a, b) => a - b).map(progress => {
        const at = pose(course, strokeJoints(course, progress));
        return { progress, distance: apart(at.swell, point), pose: at };
      });
      return candidates.reduce((a, b) => b.distance < a.distance ? b : a);
    },
  };
}

export type BonkModel = Exclude<ReturnType<typeof bonkModel>, Refused>;
