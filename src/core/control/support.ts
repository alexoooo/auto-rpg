/**
 * The feet a stance stands on: each foot's sole, read in the world, the region the soles hold, and
 * the frame helpers that read a segment where it is now.
 */
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { CONTACT_FRICTION } from "../engine/engine.ts";
import type { BuiltBody, BuiltJoint, BuiltSegment } from "../build/build-body.ts";
import type { BearingSole } from "./contact-wrench.ts";
import { chainTo } from "./kinematics.ts";
import type { Vec3 } from "../spec/quantity.ts";
import type { Foot } from "./stance.ts";
import { SUPPORT_INSET } from "./stance-tuning.ts";
import { acos, hypot } from "../math/real.ts";

/** What of a foot a stance keeps from one step to the next. */
export interface FootMemory {
  /** The stance leg's channels, the chain's freedoms in order. */
  channels: number[];
  /**
   * Whether the foot bears on its sole's front edge, its heel lifted: its ankle held short of its
   * dorsiflexion stop, the leg pivots about that edge.
   */
  rolled: boolean;
}

/** A foot as the stance reads it. */
export interface FootState {
  readonly side: Foot;
  readonly segment: BuiltSegment;
  readonly chain: BuiltJoint[];
  /** The sole's corners, in the segment's own frame. */
  readonly sole: readonly Vector3[];
  readonly memory: FootMemory;
  /** The sole's corners and middle, world, as last read (the reading's `soles`). */
  readonly corners: Vector3[];
  readonly middle: Vector3;
  /** The thigh's and the shank's lengths, hip to knee and knee to ankle, in the reference pose. */
  readonly lengths: readonly [number, number];
  /** The knee's flexion, rad, at which the leg is straight: less its bend in the reference pose. */
  readonly straight: number;
  /** The sole's width across the foot, m. */
  readonly width: number;
  /** Half the sole's length, m. */
  readonly reach: number;
  /** The sole's front edge (the two corners farthest ahead of the ankle), world, as last read. */
  readonly toe: Vector3[];
  /** The front edge's middle, and its line's direction, level, unit; world, as last read. */
  readonly edge: Vector3;
  readonly edgeAxis: Vector3;
  /** How far the heel's edge stands over the front edge, m, as last read. */
  heel: number;
  /** `heel` as the body was built, flat on the ground, m. */
  readonly flat: number;
}

/** `built`'s two feet as a stance reads them, left then right, each read as the body stands built. */
export function footStatesOf(built: BuiltBody): FootState[] {
  const feet = (["left", "right"] as const).map((side) => {
    const segment = built.segments.get(`foot.${side}`);
    if (!segment) throw new Error(`${built.spec.model} has no ${side} foot`);
    const sole = soleOf(segment), chain = chainTo(built, segment);
    return { side, segment, chain, sole, memory: { channels: [] as number[], rolled: false }, corners: sole.map(() => new Vector3()), lengths: lengthsOf(chain),
      straight: -referenceBendOf(chain),
      width: Math.max(...sole.map((q) => q.x)) - Math.min(...sole.map((q) => q.x)),
      // The rectangle's sides from one corner: the nearer two of the other three.
      reach: [1, 2, 3].map((k) => Vector3.Distance(sole[0]!, sole[k]!)).sort((a, b) => a - b)[1]! / 2,
      middle: new Vector3(), toe: [new Vector3(), new Vector3()], edge: new Vector3(), edgeAxis: new Vector3(), heel: 0, flat: 0 };
  });
  for (const foot of feet) {
    soleMiddleToRef(foot, foot.middle);
    edgeOf(foot);
    foot.flat = foot.heel;
  }
  return feet;
}

/** How far apart `feet`'s soles' middles stand across the ground, m, read now. */
export function restWidth(feet: readonly FootState[]): number {
  const a = soleMiddleToRef(feet[0]!, new Vector3()), b = soleMiddleToRef(feet[1]!, new Vector3());
  return hypot(b.x - a.x, b.z - a.z);
}

/** Each of `feet`'s soles read into it, and the middle of `stance`'s into `out`. */
export function readSupport(feet: readonly FootState[], stance: readonly FootState[], out: Vector3): void {
  for (const foot of feet) {
    soleMiddleToRef(foot, foot.middle);
    edgeOf(foot);
  }
  out.setAll(0);
  for (const foot of stance) out.addInPlace(foot.middle);
  if (stance.length) out.scaleInPlace(1 / stance.length);
}

/**
 * The point (x, z) if it lies inside the outline of `soles`' corners (world, the ground level, y
 * up) drawn in by `inset`, else the outline's nearest point to it.
 */
export function withinSupport(soles: readonly Sole[], x: number, z: number, inset = SUPPORT_INSET): [number, number] {
  const drawn = drawnOutline(soles, inset);
  let best: [number, number] = [x, z], far = 0;
  for (let k = 0; k < drawn.length; k++) {
    const [ax, az] = drawn[k]!, [bx, bz] = drawn[(k + 1) % drawn.length]!;
    if ((bz - az) * (x - ax) + (ax - bx) * (z - az) <= 0) continue;
    // Outside this edge: the nearest point of the outline is on an edge the point is outside of.
    const ex = bx - ax, ez = bz - az, t = Math.min(1, Math.max(0, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez)));
    const px = ax + t * ex, pz = az + t * ez, d = hypot(x - px, z - pz);
    if (far === 0 || d < far) { best = [px, pz]; far = d; }
  }
  return best;
}

/** A stance sole: its corners, world, the ground level, y up. */
type Sole = { readonly corners: readonly Vector3[] };

/** The middle of `foot`'s sole's corners, world, now. */
export function soleMiddleToRef(foot: FootState, out: Vector3): Vector3 {
  const turn = foot.segment.node.rotationQuaternion!, at = foot.segment.node.position;
  out.setAll(0);
  foot.sole.forEach((corner, k) => { out.addInPlace(corner.applyRotationQuaternionToRef(turn, foot.corners[k]!).addInPlace(at)); });
  return out.scaleInPlace(1 / foot.sole.length);
}

/** The convex hull of `soles`' corners (x, z), drawn toward its vertices' middle by `inset`, anticlockwise. */
function drawnOutline(soles: readonly Sole[], inset: number): [number, number][] {
  const hull = outline(soles.flatMap((sole) => sole.corners.map((q): [number, number] => [q.x, q.z])));
  const mx = hull.reduce((sum, q) => sum + q[0], 0) / hull.length, mz = hull.reduce((sum, q) => sum + q[1], 0) / hull.length;
  return hull.map(([px, pz]): [number, number] => [mx + (1 - inset) * (px - mx), mz + (1 - inset) * (pz - mz)]);
}

/** The convex hull of `points` (x, z), anticlockwise, by the monotone chain. */
function outline(points: [number, number][]): [number, number][] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const turn = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const chain = (from: [number, number][]) => {
    const out: [number, number][] = [];
    for (const q of from) {
      while (out.length >= 2 && turn(out[out.length - 2]!, out[out.length - 1]!, q) <= 0) out.pop();
      out.push(q);
    }
    return out.slice(0, -1);
  };
  return [...chain(sorted), ...chain([...sorted].reverse())];
}

const scratch = { a: new Quaternion(), b: new Quaternion() };

/** `segment`'s turn since its reference pose, node times rest^-1. */
export function turnOfToRef(segment: BuiltSegment, out: Quaternion): Quaternion {
  Quaternion.InverseToRef(segment.rest, scratch.a);
  return segment.node.rotationQuaternion!.multiplyToRef(scratch.a, out);
}

/** `point` (body frame, reference pose, on `segment`) where it is now, world. */
export function pointOfToRef(segment: BuiltSegment, point: Vec3, out: Vector3): Vector3 {
  const origin = segment.frame.origin;
  return out.set(point[0] - origin[0], point[1] - origin[1], point[2] - origin[2])
    .applyRotationQuaternionToRef(turnOfToRef(segment, scratch.b), out).addInPlace(segment.node.position);
}

export const centreOfToRef = (segment: BuiltSegment, out: Vector3): Vector3 => pointOfToRef(segment, segment.rigid.centre, out);

/** `foot`'s point `at` (world): its velocity into `linear`, and the foot's spin into `angular`. */
export function footMotionToRef(foot: FootState, at: Vector3, linear: Vector3, angular: Vector3): void {
  const body = foot.segment.body, c = centreOfToRef(foot.segment, new Vector3());
  body.linearVelocityToRef(linear);
  body.angularVelocityToRef(angular);
  linear.addInPlace(Vector3.Cross(angular, at.subtract(c)));
}

/** `foot`'s sole as it bears (`BearingSole`), its centre of pressure kept to `keep` of its half-length and half-width. */
export function bearingSole(foot: FootState, keep: number): BearingSole {
  const [a, ...rest] = foot.corners, near = rest.map((q) => Vector3.Distance(a!, q)).map((d, k) => [d, k] as const).sort((p, q) => p[0] - q[0]);
  // The corner a long side away from the first: the middle of the three distances.
  const other = rest[near[1]![1]]!, along = other.subtract(a!);
  along.y = 0;
  // Rolled, the centre of pressure is on the front edge: kept within the margin's band of it.
  if (foot.memory.rolled) return { kind: "sole", middle: foot.edge, along: along.normalize(), length: (1 - keep) * foot.reach, width: keep * foot.width / 2 };
  return { kind: "sole", middle: foot.middle, along: along.normalize(), length: keep * foot.reach, width: keep * foot.width / 2 };
}

/** The sole a foot bears on, for the region the stance holds: its front edge when rolled. */
export function bearingOf(foot: FootState): Sole {
  return foot.memory.rolled ? { corners: foot.toe } : foot;
}

const edgeScratch = { ankle: new Vector3() };

/**
 * `foot`'s front edge, read into it from its corners (`soleMiddleToRef` reads them): the two
 * farthest ahead of the ankle, their middle, their line's direction, level, and how far the heel's
 * two stand over them.
 */
function edgeOf(foot: FootState): void {
  const ankle = foot.chain[2]!, at = pointOfToRef(ankle.parent, ankle.spec.centre.value, edgeScratch.ankle);
  const fx = foot.middle.x - at.x, fz = foot.middle.z - at.z;
  const order = foot.corners.map((q, k) => [(q.x - at.x) * fx + (q.z - at.z) * fz, k] as const).sort((a, b) => b[0] - a[0]);
  const a = foot.corners[order[0]![1]]!, b = foot.corners[order[1]![1]]!;
  foot.toe[0]!.copyFrom(a);
  foot.toe[1]!.copyFrom(b);
  foot.edge.copyFrom(a).addInPlace(b).scaleInPlace(0.5);
  foot.edgeAxis.set(b.x - a.x, 0, b.z - a.z).normalize();
  foot.heel = (foot.corners[order[2]![1]]!.y + foot.corners[order[3]![1]]!.y) / 2 - foot.edge.y;
}

/**
 * The friction the stance takes the ground to give, the coefficient: every collider's, which the
 * engine combines by their average (`CONTACT_FRICTION`, `src/core/engine/engine.ts`).
 */
export const GROUND_FRICTION = CONTACT_FRICTION;

/** The knee's bend in the reference pose, rad: the shank's line (knee to ankle) from the thigh's (hip to knee). */
function referenceBendOf(chain: readonly BuiltJoint[]): number {
  const [hip, knee, ankle] = chain.map((joint) => joint.spec.centre.value);
  const t = [knee![0] - hip![0], knee![1] - hip![1], knee![2] - hip![2]], h = [ankle![0] - knee![0], ankle![1] - knee![1], ankle![2] - knee![2]];
  const dot = t[0]! * h[0]! + t[1]! * h[1]! + t[2]! * h[2]!;
  return acos(Math.max(-1, Math.min(1, dot / (hypot(t[0]!, t[1]!, t[2]!) * hypot(h[0]!, h[1]!, h[2]!)))));
}

/** The thigh's and the shank's lengths in the reference pose: hip to knee, and knee to ankle. */
function lengthsOf(chain: readonly BuiltJoint[]): [number, number] {
  const [hip, knee, ankle] = chain.map((joint) => joint.spec.centre.value);
  const distance = (p: Vec3, q: Vec3) => hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  return [distance(hip!, knee!), distance(knee!, ankle!)];
}

/**
 * The corners of `foot`'s sole, in the segment's own frame: the four corners of its box lowest in
 * the reference pose.
 */
function soleOf(foot: BuiltSegment): Vector3[] {
  const shape = foot.spec.shape;
  if (shape.kind !== "box") throw new Error(`${foot.spec.name} is a ${shape.kind}; a stance reads a box's sole`);
  const { origin, x, y, z } = foot.frame, centre = shape.centre.value, size = shape.size.value;
  const corners: Vec3[] = [];
  for (const sx of [-0.5, 0.5]) for (const sy of [-0.5, 0.5]) for (const sz of [-0.5, 0.5]) {
    const at = (k: number) => centre[k]! + sx * size[0] * x[k]! + sy * size[1] * y[k]! + sz * size[2] * z[k]!;
    corners.push([at(0), at(1), at(2)]);
  }
  corners.sort((a, b) => a[1] - b[1]);
  const dot = (a: readonly number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
  return corners.slice(0, 4).map((q) => {
    const o = [q[0] - origin[0], q[1] - origin[1], q[2] - origin[2]];
    return new Vector3(dot(o, x), dot(o, y), dot(o, z));
  });
}
