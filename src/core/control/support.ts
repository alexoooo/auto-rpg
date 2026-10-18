/**
 * The feet a stance stands on: each foot's sole, read in the world, the region the soles hold, and
 * the frame helpers that read a segment where it is now.
 */
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { CONTACT_FRICTION, type Contact } from "../engine/engine.ts";
import type { BuiltBody, BuiltJoint, BuiltSegment } from "../build/build-body.ts";
import type { Row } from "./bearing.ts";
import type { BearingSole } from "./contact-wrench.ts";
import { chainTo } from "./kinematics.ts";
import { swingLegOf, type SwingLeg } from "./swing-leg.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { SUPPORT_INSET } from "./stance-tuning.ts";
import { acos, atan2, cos, hypot } from "../math/real.ts";
import { wrap } from "../math/turn.ts";
import type { Side } from "../spec/body.ts";

/** Whether `contact` is the ground bearing a body: a fixed collider that pushed this step, its normal (from the body into it) more than `minUp` down. */
export const groundContact = (contact: Contact, minUp: number): boolean =>
  contact.fixed !== null && contact.impulse > 0 && contact.normal[1] < -minUp;

/** An end of a sole, front or heel. */
export type SoleEnd = "front" | "heel";

/** An end of a sole: its two corners, their middle, and their line's direction, level, unit; world, as last read. */
interface SoleEdge {
  readonly corners: Vector3[];
  readonly middle: Vector3;
  readonly axis: Vector3;
}

/** What of a foot a stance keeps from one step to the next. */
export interface FootMemory {
  /** The stance leg's channels, the chain's freedoms in order. */
  channels: number[];
  /**
   * The end of its sole the foot bears on, the other lifted: its ankle held short of that end's
   * stop, the leg pivots about that edge. Null, the sole is flat.
   */
  rolled: SoleEnd | null;
}

/** A foot as the stance reads it. */
export interface FootState {
  readonly side: Side;
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
  /** The leg as a pendulum about its hip (`swingSeconds`, `withinReach`). */
  readonly leg: SwingLeg;
  /** The sole's width across the foot, m. */
  readonly width: number;
  /** Half the sole's length, m. */
  readonly reach: number;
  /**
   * The sole's corners in order ahead of the ankle, in the reference pose: the front edge's two,
   * then the heel's. The foot's own, whichever way it is turned.
   */
  readonly ahead: readonly number[];
  /** The sole's two ends, world, as last read: the front edge (`ahead`'s first two corners) and the heel's. */
  readonly ends: { readonly front: SoleEdge; readonly heel: SoleEdge };
  /** How far the heel's edge stands over the front edge, m, as last read. */
  heel: number;
  /** `heel` in the reference pose, the foot flat on the ground, m. */
  readonly flat: number;
  /** How far the sole's middle stands over its lowest corner in the reference pose, m: over the ground, the foot flat on it. */
  readonly stand: number;
  /** The ankle's centre's height over the sole's middle in the reference pose, m. */
  readonly ankle: number;
  /**
   * The pelvis's heading less the way the foot faces (`facingOf`), rad, at its hip's rotation
   * stops, least then most: the headings the pelvis can face over the foot where it is planted.
   */
  readonly turns: readonly [number, number];
}

/**
 * `built`'s two feet as a stance reads them, left then right, each read as the body stands now.
 * What is a foot's own (its sole, its ends' corners, its heel's height flat) is the
 * reference pose's, whatever pose the body is in.
 */
export function footStatesOf(built: BuiltBody): FootState[] {
  const feet = (["left", "right"] as const).map((side) => {
    const segment = built.segments.get(`foot.${side}`);
    if (!segment) throw new Error(`${built.spec.model} has no ${side} foot`);
    const corners = soleCorners(segment), sole = soleOf(segment, corners), chain = chainTo(built, segment);
    const ahead = aheadOf(corners, chain[2]!.spec.centre.value);
    return { turns: turnsOf(chain[0]!), side, segment, chain, sole, memory: { channels: [] as number[], rolled: null }, corners: sole.map(() => new Vector3()), lengths: lengthsOf(chain),
      straight: -referenceBendOf(chain), leg: swingLegOf(chain),
      width: Math.max(...sole.map((q) => q.x)) - Math.min(...sole.map((q) => q.x)),
      // The rectangle's sides from one corner: the nearer two of the other three.
      reach: [1, 2, 3].map((k) => Vector3.Distance(sole[0]!, sole[k]!)).sort((a, b) => a - b)[1]! / 2,
      ahead, middle: new Vector3(), ends: { front: soleEdge(), heel: soleEdge() }, heel: 0,
      flat: (corners[ahead[2]!]![1] + corners[ahead[3]!]![1]) / 2 - (corners[ahead[0]!]![1] + corners[ahead[1]!]![1]) * 0.5,
      stand: corners.reduce((sum, q) => sum + q[1], 0) / corners.length - Math.min(...corners.map((q) => q[1])),
      ankle: chain[2]!.spec.centre.value[1] - corners.reduce((sum, q) => sum + q[1], 0) / corners.length };
  });
  for (const foot of feet) {
    soleMiddleToRef(foot, foot.middle);
    edgeOf(foot);
  }
  return feet;
}

/**
 * The pelvis's heading less a foot's at `hip`'s rotation stops, least then most: the hip's freedom
 * whose axis stands nearest up turns the thigh, and the foot under it, about up by its angle times
 * the axis's upward part, so the pelvis turns the other way over a planted foot.
 */
function turnsOf(hip: BuiltJoint): [number, number] {
  const dof = hip.dofs.reduce((best, d) => Math.abs(d.spec.axis.value[1]) > Math.abs(best.spec.axis.value[1]) ? d : best);
  const up = dof.spec.axis.value[1], a = -up * dof.spec.min.value, b = -up * dof.spec.max.value;
  return [Math.min(a, b), Math.max(a, b)];
}

/** The way `foot` faces, rad about up, as a heading is counted: 0 as in the reference pose, growing to the right. */
function facingOf(foot: FootState): number {
  const forward = scratch.forward.set(0, 0, 1).applyRotationQuaternionToRef(turnOfToRef(foot.segment, scratch.b), scratch.forward);
  return atan2(forward.x, forward.z);
}

/**
 * The heading a step lands facing, its foot turned no further than the pelvis can turn over
 * `bearer` planted where it is: `heading`, or the nearest heading within the bearer's `turns` of
 * the way it faces. A foot landed past that leaves the feet turned too far apart for any heading of
 * the pelvis to serve both, its hips at their stops, and the next step cannot turn it further.
 */
export function landingHeading(bearer: FootState, heading: number): number {
  const off = wrap(facingOf(bearer) - heading), lo = off + bearer.turns[0], hi = off + bearer.turns[1];
  return lo > 0 ? heading + lo : hi < 0 ? heading + hi : heading;
}

/**
 * The centre of mass's height over the middle of `built`'s soles in the reference pose, m: the
 * height a body stands at whatever posture it was built in, from which the stance's height is
 * asked (`STANCE_LOWER`).
 */
export function standingHeight(built: BuiltBody): number {
  let mass = 0, moment = 0;
  for (const segment of built.segments.values()) {
    mass += segment.rigid.mass;
    moment += segment.rigid.mass * segment.rigid.centre[1];
  }
  let sole = 0, count = 0;
  for (const side of ["left", "right"] as const) {
    const foot = built.segments.get(`foot.${side}`);
    if (!foot) throw new Error(`${built.spec.model} has no ${side} foot`);
    for (const corner of soleCorners(foot)) {
      sole += corner[1];
      count += 1;
    }
  }
  return moment / mass - sole / count;
}

/** `foot`'s leg's length, hip to ankle, with its knee bent by `bend` rad from straight (null, straight), m. */
export function legLength(foot: FootState, bend: number | null): number {
  const [a, b] = foot.lengths;
  return bend === null ? a + b : Math.sqrt(a * a + b * b + 2 * a * b * cos(bend));
}

/** How far apart `feet`'s soles' middles stand across the ground, m, read now. */
export function restWidth(feet: readonly FootState[]): number {
  const a = soleMiddleToRef(feet[0]!, new Vector3()), b = soleMiddleToRef(feet[1]!, new Vector3());
  return hypot(b.x - a.x, b.z - a.z);
}

/** The ground under `foot`'s sole as last read, m: its lowest corner's height, which is the ground's while the sole bears on it. */
function groundOf(foot: FootState): number {
  let low = Infinity;
  for (const corner of foot.corners) low = Math.min(low, corner.y);
  return low;
}

/** The height `foot`'s sole's middle lands at, m: flat on the ground under `bearer`'s sole. */
export function landingHeight(bearer: FootState, foot: FootState): number {
  return groundOf(bearer) + foot.stand;
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
  return nearestWithin(drawnOutline(soles, inset), x, z);
}

/**
 * The point (x, z) if it lies within what `soles` hold together, each sole's outline drawn in toward
 * its own middle by `inset`, else that outline's nearest point to it: where a pivot may be put while
 * two soles bear at once, on either sole's own middle or between them. (`withinSupport` draws the
 * whole in toward its middle: the region a centre of mass is held in, which neither sole's middle
 * is in.)
 */
export function withinSoles(soles: readonly Sole[], x: number, z: number, inset: number): [number, number] {
  return nearestWithin(outline(soles.flatMap((sole) => drawnOutline([sole], inset))), x, z);
}

/** The point (x, z) if it lies inside the anticlockwise outline `drawn`, else the outline's nearest point to it; one point is its own nearest. */
function nearestWithin(drawn: readonly (readonly [number, number])[], x: number, z: number): [number, number] {
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

const scratch = { a: new Quaternion(), b: new Quaternion(), forward: new Vector3() };

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

/** The mass of `parts`, kg: their rigid bodies' masses summed in order. */
export const massOf = (parts: readonly BuiltSegment[]): number => parts.reduce((sum, part) => sum + part.rigid.mass, 0);

/**
 * The centre of mass of `parts`, whose masses sum to `mass` (`massOf`), into `centre`, and its
 * velocity into `velocity` when asked (a body's linear velocity is its centre of mass's); `work`
 * carries nothing between calls.
 */
export function massCentreToRef(parts: readonly BuiltSegment[], mass: number, centre: Vector3, work: Vector3, velocity?: Vector3): void {
  centre.setAll(0); velocity?.setAll(0);
  for (const part of parts) {
    centre.addInPlace(centreOfToRef(part, work).scaleInPlace(part.rigid.mass));
    if (velocity) velocity.addInPlace(part.body.linearVelocityToRef(work).scaleInPlace(part.rigid.mass));
  }
  centre.scaleInPlace(1 / mass); velocity?.scaleInPlace(1 / mass);
}

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
  // Rolled, the centre of pressure is on the edge the foot bears on: kept within the margin's band of it.
  const edge = rolledEdge(foot);
  if (edge) return { kind: "sole", middle: edge.middle, along: along.normalize(), length: (1 - keep) * foot.reach, width: keep * foot.width / 2 };
  return { kind: "sole", middle: foot.middle, along: along.normalize(), length: keep * foot.reach, width: keep * foot.width / 2 };
}

/**
 * The rows of a task at the edge `foot` bears on, rolled (`LimbWork.rows`): of the foot's spin, the
 * part about the level normal to the edge and the part about up; and the edge's middle's velocity.
 * Its turn about the edge is left free.
 */
export function rolledRows(foot: FootState): Row[] {
  const w = Vector3.Cross(rolledEdge(foot)!.axis, Vector3.UpReadOnly);
  return [[[0, w.x], [1, w.y], [2, w.z]], [[1, 1]], [[3, 1]], [[4, 1]], [[5, 1]]];
}

/** The sole a foot bears on, for the region the stance holds: the edge it is rolled onto, if it is. */
export function bearingOf(foot: FootState): Sole {
  const edge = rolledEdge(foot);
  return edge ? { corners: edge.corners } : foot;
}

/** An end of a sole with nothing read into it yet. */
function soleEdge(): SoleEdge {
  return { corners: [new Vector3(), new Vector3()], middle: new Vector3(), axis: new Vector3() };
}

/** The end of its sole `foot` bears on, rolled, or null flat (`FootMemory.rolled`). */
export function rolledEdge(foot: FootState): SoleEdge | null {
  return foot.memory.rolled === null ? null : foot.ends[foot.memory.rolled];
}

/**
 * The end of `foot`'s sole the point (`x`, `z`), world, is past: beyond its front edge or its heel's
 * edge, out from the sole's middle; null over the sole.
 */
export function endPast(foot: FootState, x: number, z: number): SoleEnd | null {
  for (const end of ENDS) {
    const edge = foot.ends[end].middle, ox = edge.x - foot.middle.x, oz = edge.z - foot.middle.z;
    if ((x - edge.x) * ox + (z - edge.z) * oz >= 0) return end;
  }
  return null;
}
const ENDS: readonly SoleEnd[] = ["front", "heel"];

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
 * `foot`'s two ends, read into it from its corners (`soleMiddleToRef` reads them): each's two
 * corners, their middle and their line's direction, level; and how far the heel's stand over the front's.
 */
function edgeOf(foot: FootState): void {
  const [front, other, back, last] = foot.ahead;
  endToRef(foot.corners[front!]!, foot.corners[other!]!, foot.ends.front);
  endToRef(foot.corners[back!]!, foot.corners[last!]!, foot.ends.heel);
  foot.heel = foot.ends.heel.middle.y - foot.ends.front.middle.y;
}

/** The end of a sole whose corners are `a` and `b`, into `out`. */
function endToRef(a: Vector3, b: Vector3, out: SoleEdge): void {
  out.corners[0]!.copyFrom(a);
  out.corners[1]!.copyFrom(b);
  out.middle.copyFrom(a).addInPlace(b).scaleInPlace(0.5);
  out.axis.set(b.x - a.x, 0, b.z - a.z).normalize();
}

/**
 * The friction the stance takes the ground to give, the coefficient: the floor's own
 * (`CONTACT_FRICTION`, `src/core/engine/engine.ts`). A sole that grips better
 * (`SurfaceSpec.friction`) leaves the stance that much more margin.
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
