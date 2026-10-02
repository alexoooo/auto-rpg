/**
 * The feet a stance stands on: each foot's sole, read in the world, the region the soles hold, and
 * the frame helpers that read a segment where it is now.
 */
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { CONTACT_FRICTION } from "../engine/engine.ts";
import type { BuiltBody, BuiltJoint, BuiltSegment } from "../build/build-body.ts";
import type { Row } from "./bearing.ts";
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
  /**
   * The sole's corners in order ahead of the ankle, in the reference pose: the front edge's two,
   * then the heel's. The foot's own, whichever way it is turned.
   */
  readonly ahead: readonly number[];
  /** The sole's front edge (`ahead`'s first two corners), world, as last read. */
  readonly toe: Vector3[];
  /** The front edge's middle, and its line's direction, level, unit; world, as last read. */
  readonly edge: Vector3;
  readonly edgeAxis: Vector3;
  /** How far the heel's edge stands over the front edge, m, as last read. */
  heel: number;
  /** `heel` in the reference pose, the foot flat on the ground, m. */
  readonly flat: number;
}

/**
 * `built`'s two feet as a stance reads them, left then right, each read as the body stands now.
 * What is a foot's own (its sole, its front edge's corners, its heel's height flat) is the
 * reference pose's, whatever pose the body is in.
 */
export function footStatesOf(built: BuiltBody): FootState[] {
  const feet = (["left", "right"] as const).map((side) => {
    const segment = built.segments.get(`foot.${side}`);
    if (!segment) throw new Error(`${built.spec.model} has no ${side} foot`);
    const corners = soleCorners(segment), sole = soleOf(segment, corners), chain = chainTo(built, segment);
    const ahead = aheadOf(corners, chain[2]!.spec.centre.value);
    return { side, segment, chain, sole, memory: { channels: [] as number[], rolled: false }, corners: sole.map(() => new Vector3()), lengths: lengthsOf(chain),
      straight: -referenceBendOf(chain),
      width: Math.max(...sole.map((q) => q.x)) - Math.min(...sole.map((q) => q.x)),
      // The rectangle's sides from one corner: the nearer two of the other three.
      reach: [1, 2, 3].map((k) => Vector3.Distance(sole[0]!, sole[k]!)).sort((a, b) => a - b)[1]! / 2,
      ahead, middle: new Vector3(), toe: [new Vector3(), new Vector3()], edge: new Vector3(), edgeAxis: new Vector3(), heel: 0,
      flat: (corners[ahead[2]!]![1] + corners[ahead[3]!]![1]) / 2 - (corners[ahead[0]!]![1] + corners[ahead[1]!]![1]) * 0.5 };
  });
  for (const foot of feet) {
    soleMiddleToRef(foot, foot.middle);
    edgeOf(foot);
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
 * up) drawn in by `inset`, else the outline's nearest point to it. Corners that are all one point
 * have no inside: the nearest is that point.
 */
export function withinSupport(soles: readonly Sole[], x: number, z: number, inset = SUPPORT_INSET): [number, number] {
  const drawn = drawnOutline(soles, inset);
  if (drawn.length === 1) return [drawn[0]![0], drawn[0]![1]];
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
  // Points that are all one are their own hull: the chain gives none of them, or the one twice.
  const first = sorted[0], last = sorted[sorted.length - 1];
  if (first && last && first[0] === last[0] && first[1] === last[1]) return [first];
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

/** `segment`'s point `at` (world): its velocity into `linear`, and the segment's spin into `angular`. */
export function motionAtToRef(segment: BuiltSegment, at: Vector3, linear: Vector3, angular: Vector3): void {
  const body = segment.body, c = centreOfToRef(segment, new Vector3());
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

/**
 * The rows of a task at the front edge of `foot`, rolled (`LimbWork.rows`): of the foot's spin, the
 * part about the level normal to the edge and the part about up; and the edge's middle's velocity.
 * Its turn about the edge is left free.
 */
export function rolledRows(foot: FootState): Row[] {
  const w = Vector3.Cross(foot.edgeAxis, Vector3.UpReadOnly);
  return [[[0, w.x], [1, w.y], [2, w.z]], [[1, 1]], [[3, 1]], [[4, 1]], [[5, 1]]];
}

/** The sole a foot bears on, for the region the stance holds: its front edge when rolled. */
export function bearingOf(foot: FootState): Sole {
  return foot.memory.rolled ? { corners: foot.toe } : foot;
}

/**
 * A sole's `corners` (body frame, reference pose) in order ahead of the `ankle`'s centre (the
 * same) across the ground, farthest first: ahead is from the ankle to the corners' middle.
 */
function aheadOf(corners: readonly Vec3[], ankle: Vec3): number[] {
  const middle = (k: 0 | 2) => corners.reduce((sum, q) => sum + q[k], 0) / corners.length;
  const fx = middle(0) - ankle[0], fz = middle(2) - ankle[2];
  return corners.map((q, k) => [(q[0] - ankle[0]) * fx + (q[2] - ankle[2]) * fz, k] as const).sort((a, b) => b[0] - a[0]).map(([, k]) => k);
}

/**
 * `foot`'s front edge, read into it from its corners (`soleMiddleToRef` reads them): its two
 * corners, their middle, their line's direction, level, and how far the heel's two stand over them.
 */
function edgeOf(foot: FootState): void {
  const [front, other, back, last] = foot.ahead;
  const a = foot.corners[front!]!, b = foot.corners[other!]!;
  foot.toe[0]!.copyFrom(a);
  foot.toe[1]!.copyFrom(b);
  foot.edge.copyFrom(a).addInPlace(b).scaleInPlace(0.5);
  foot.edgeAxis.set(b.x - a.x, 0, b.z - a.z).normalize();
  foot.heel = (foot.corners[back!]!.y + foot.corners[last!]!.y) / 2 - foot.edge.y;
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

/** The corners of `foot`'s sole, body frame, reference pose: the four corners of its box lowest there. */
function soleCorners(foot: BuiltSegment): Vec3[] {
  const shape = foot.spec.shape;
  if (shape.kind !== "box") throw new Error(`${foot.spec.name} is a ${shape.kind}; a stance reads a box's sole`);
  const { x, y, z } = foot.frame, centre = shape.centre.value, size = shape.size.value;
  const corners: Vec3[] = [];
  for (const sx of [-0.5, 0.5]) for (const sy of [-0.5, 0.5]) for (const sz of [-0.5, 0.5]) {
    const at = (k: number) => centre[k]! + sx * size[0] * x[k]! + sy * size[1] * y[k]! + sz * size[2] * z[k]!;
    corners.push([at(0), at(1), at(2)]);
  }
  corners.sort((a, b) => a[1] - b[1]);
  return corners.slice(0, 4);
}

/** `foot`'s sole's `corners` (`soleCorners`) in the segment's own frame. */
function soleOf(foot: BuiltSegment, corners: readonly Vec3[]): Vector3[] {
  const { origin, x, y, z } = foot.frame;
  const dot = (a: readonly number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
  return corners.map((q) => {
    const o = [q[0] - origin[0], q[1] - origin[1], q[2] - origin[2]];
    return new Vector3(dot(o, x), dot(o, y), dot(o, z));
  });
}
