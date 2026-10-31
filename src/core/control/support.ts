/**
 * The feet a stance stands on: each foot's sole, read in the world, the region the soles hold, and
 * the frame helpers that read a segment where it is now.
 */
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Row } from "./bearing.ts";
import type { AnkleHold, BearingSole } from "./contact-wrench.ts";
import { chainTo } from "./kinematics.ts";
import { swingLegOf, type SwingLeg } from "./swing-leg.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { turnOfToRef, massOf } from "../read-motion.ts";
import { SUPPORT_INSET } from "./stance-tuning.ts";
import { CONTACT_FRICTION, STANDARD_GRAVITY } from "../spec/constants.ts";
import { acos, asin, atan2, cos, hypot } from "../math/real.ts";
import { wrap } from "../math/turn.ts";
import { segmentOf, type BodySpec, type MuscleSpec, type Side } from "../spec/body.ts";
import type { ReadBody, ReadJoint, ReadSegment, ReadContact } from "../read-body.ts";
import { dot } from "../spec/vec.ts";

/** Whether `contact` is the ground bearing a body: a fixed collider that pushed this step, its normal (from the body into it) more than `minUp` down. */
export const groundContact = (contact: ReadContact, minUp: number): boolean =>
  contact.fixed !== null && contact.impulse > 0 && contact.normal[1] < -minUp;

/**
 * How near the ground a point is, m, to be on it rather than in the air: a tolerance on a reading
 * (`docs/reference/rising.md#stages`). A limb's point within it bears, and a corner of a sole props
 * what it hangs from (the rise); an end of a sole over the ground by more is in the air, and the
 * foot bears on the other end alone (`standingOn`, `bearingOf`, `bearingSole`): a sole flat on the
 * ground reads its ends within a few millimetres of it, a shoe's sole gives 6 mm (`SHOE_SOLE`), and
 * a sole driven into the ground sinks unevenly; one that has landed on its toes or its heel, the
 * other end still in the air, holds nothing with it until it comes down. A leg reaching behind
 * lands its toes first, the heel 0.1 m up.
 */
export const DOWN = 0.03;

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
  /**
   * The hip joint's centre from the body's centre of mass, world, as last read
   * (`StanceControl.read`): where the leg hangs from, which a step's reach is planned from
   * (`withinReach`) as the body carries it, the trunk leaning or a held weight ahead moving the
   * centre off the hips.
   */
  readonly hip: Vector3;
  /**
   * The ground's height under the sole, m: its lowest corner's (`lowestCorner`) where the ground
   * last pressed it (`StanceReading.touching`, the stance's `read`), or the ground a rising body
   * is given. A foot in the air keeps the ground it left.
   */
  ground: number;
  /**
   * How long the ground has not pressed the sole, s (`StanceReading.touching`, the stance's
   * `command`): 0 while it does. A sole of a stance on both feet that the ground has not pressed
   * for longer than the height's constant, or that has risen off its ground (`soleHeight`,
   * `DOWN`), has left it (`holding`): a landed sole that bounces is pressed again within both,
   * and one the body has tipped off is not.
   */
  lifted: number;
}

/** The height of the lowest of `foot`'s sole's corners, m. */
export function lowestCorner(foot: FootState): number {
  let lowest = Infinity;
  for (const corner of foot.corners) if (corner.y < lowest) lowest = corner.y;
  return lowest;
}

/** How high `foot`'s sole's lowest corner is over the ground it last stood on, m (`FootMemory.ground`): 0 while the ground presses it. */
export const soleHeight = (foot: FootState): number => lowestCorner(foot) - foot.memory.ground;

/**
 * A foot as the stance reads it. What it reads from its sole (`SoleFit`) is its sole's to its toes'
 * tips while those, read with the foot, are within `DOWN` of the ground, and its box's, heel to
 * ball, once they are bent further (`fitSole`).
 */
export interface FootState {
  readonly side: Side;
  readonly segment: ReadSegment;
  /**
   * What it reads from its sole with its toes, and without (the same for a foot without toes), and
   * the most bend of its toes, rad, at which it reads them: their tips, read with the foot, are
   * then no more than `DOWN` over the ball.
   */
  readonly fits: { readonly flat: SoleFit; readonly bent: SoleFit; readonly within: number };
  /** Whether the fit with its toes is the one read now. */
  toesFlat: boolean;
  readonly chain: ReadJoint[];
  /** The sole's corners, in the segment's own frame. */
  sole: readonly Vector3[];
  /**
   * The most moment the ankle holds about itself each way, N m (`ankleStrength`): the plantar
   * flexors' toward the toes, the dorsiflexors' toward the heel, the lesser of the invertors' and the
   * evertors' lengthening to a side; a way the ankle has no freedom named for is unbounded. What a
   * bearing sole's wrench may load the ankle with (`BearingSole.hold`).
   */
  ankleHold: AnkleHold;
  /**
   * The regions of the sole the stance plans in, in the segment's own frame: from under the ankle,
   * as far each way as the hold that way reaches at the load on the foot, no further than the
   * sole's edge drawn toward the ankle by `SUPPORT_INSET` (`holdOf`). Toward the toes the plantar
   * flexors hold the whole sole; toward the heel the dorsiflexors hold a few centimetres at the
   * whole weight, twice that at half, and the invertors and evertors a few across. Six points at
   * the whole weight (the front edge's two corners, the heel's two, then the two ends of the line
   * under the ankle across it), the same six at half the weight, and then the ankle's centre.
   */
  hold: readonly Vector3[];
  /** How far `hold` reaches from under the ankle toward the toes and the heel, and to each side, m, at the whole weight. */
  holdReach: { readonly toe: number; readonly heel: number; readonly side: number };
  readonly memory: FootMemory;
  /** The sole's corners and middle, world, as last read (the reading's `soles`). */
  readonly corners: Vector3[];
  readonly middle: Vector3;
  /**
   * `hold` where the foot is now, world, as last read: its points, the middle of the line under
   * the ankle (`under`), the ankle's centre, and the regions the stance bears on (`bearingOf`),
   * at the whole weight (`full`) and at half (`half`): the whole, flat; its toe half, landed on the
   * toes; its heel half, landed on the heel.
   */
  readonly held: { readonly points: Vector3[]; readonly under: Vector3; readonly ankle: Vector3; readonly full: HeldRegions; readonly half: HeldRegions };
  /** The thigh's and the shank's lengths, hip to knee and knee to ankle, in the reference pose. */
  readonly lengths: readonly [number, number];
  /** The knee's flexion, rad, at which the leg is straight: less its bend in the reference pose. */
  readonly straight: number;
  /** The leg as a pendulum about its hip (`swingSeconds`, `withinReach`). */
  readonly leg: SwingLeg;
  /** The sole's width across the foot, m. */
  width: number;
  /** Half the sole's length, m. */
  reach: number;
  /**
   * The sole's corners in order ahead of the ankle, in the reference pose: the front edge's two,
   * then the heel's. The foot's own, whichever way it is turned.
   */
  ahead: readonly number[];
  /** The sole's two ends, world, as last read: the front edge (`ahead`'s first two corners) and the heel's. */
  readonly ends: { readonly front: SoleEdge; readonly heel: SoleEdge };
  /** How far the heel's edge stands over the front edge, m, as last read. */
  heel: number;
  /** `heel` in the reference pose, the foot flat on the ground, m. */
  flat: number;
  /** How far the sole's middle stands over its lowest corner in the reference pose, m: over the ground, the foot flat on it. */
  stand: number;
  /** The ankle's centre's height over the sole's middle in the reference pose, m. */
  ankle: number;
  /** The ankle's centre behind the sole's middle along the foot in the reference pose, m: the heel is shorter than the toes. */
  back: number;
  /**
   * The pelvis's heading less the way the foot faces (`facingOf`), rad, at its hip's rotation
   * stops, least then most: the headings the pelvis can face over the foot where it is planted.
   */
  readonly turns: readonly [number, number];
}

/** What of a foot is read from its sole, reference pose (`soleFit`). */
type SoleFit = Pick<FootState, "sole" | "ankleHold" | "hold" | "holdReach" | "width" | "reach" | "ahead" | "flat" | "stand" | "ankle" | "back">;

/** The regions a foot's ankle holds at one load: the whole, and its toe and heel halves from under the ankle (`FootState.held`). */
interface HeldRegions {
  readonly all: Sole;
  readonly toe: Sole;
  readonly heel: Sole;
}

/**
 * `built`'s two feet as a stance reads them, left then right, each read as the body stands now.
 * What is a foot's own (its sole, its ends' corners, its heel's height flat) is the
 * reference pose's, whatever pose the body is in.
 */
/** What a body of `spec` lacks for the stance to stand it, a sentence, or null where it has a left and a right foot, each with a box sole. */
export function soleRefusal(spec: BodySpec): string | null {
  return (["left", "right"] as const).every((side) => segmentOf(spec, `foot.${side}`)?.shape.kind === "box") ? null : "needs a left and a right foot, each with a box sole";
}

export function footStatesOf(built: ReadBody, inset = SUPPORT_INSET): FootState[] {
  const weight = massOf([...built.segments.values()]) * STANDARD_GRAVITY.value;
  const feet = (["left", "right"] as const).map((side): FootState => {
    const segment = built.segments.get(`foot.${side}`);
    if (!segment) throw new Error(`${built.spec.model} has no ${side} foot`);
    const chain = chainTo(built, segment), flat = soleFit(segment, chain, weight, inset, true);
    const toes = segment.spec.toes?.length.value, within = toes === undefined ? Infinity : asin(Math.min(DOWN / toes, 1));
    const fits = { flat, bent: toes === undefined ? flat : soleFit(segment, chain, weight, inset, false), within };
    const held = flat.hold.map(() => new Vector3());
    const regions = (o: number): HeldRegions => ({ all: { corners: held.slice(o, o + 4) }, toe: { corners: [held[o]!, held[o + 1]!, held[o + 4]!, held[o + 5]!] }, heel: { corners: [held[o + 2]!, held[o + 3]!, held[o + 4]!, held[o + 5]!] } });
    return { ...flat, fits, toesFlat: true, turns: turnsOf(chain[0]!), side, segment, chain,
      memory: { channels: [] as number[], rolled: null, hip: new Vector3(), ground: 0, lifted: 0 },
      corners: flat.sole.map(() => new Vector3()), lengths: lengthsOf(chain),
      held: { points: held, under: new Vector3(), ankle: held[12]!, full: regions(0), half: regions(6) },
      straight: -referenceBendOf(chain), leg: swingLegOf(chain), middle: new Vector3(), ends: { front: soleEdge(), heel: soleEdge() }, heel: 0 };
  });
  for (const foot of feet) {
    soleMiddleToRef(foot, foot.middle);
    edgeOf(foot);
    heldOf(foot);
    foot.memory.ground = Math.min(...foot.corners.map((q) => q.y));
  }
  return feet;
}

/**
 * What a stance reads from the sole of `segment`, a foot on `chain` (`soleCorners`, its toes flat
 * or not), reference pose: the sole, what its ankle holds over it at `weight` drawn in by `inset`
 * (`holdOf`), and its measures.
 */
function soleFit(segment: ReadSegment, chain: readonly ReadJoint[], weight: number, inset: number, toesFlat: boolean): SoleFit {
  const corners = soleCorners(segment, toesFlat), sole = soleOf(segment, corners);
  const ankle = chain[2]!.spec.centre.value, ahead = aheadOf(corners, ankle), [mx, mz] = ankleToMiddle(corners, ankle);
  const { points, reach: holdReach, hold: ankleHold } = holdOf(corners, ahead, ankle, chain[2]!, weight, inset);
  return { sole, hold: soleOf(segment, points), holdReach, ankleHold, ahead,
    width: Math.max(...sole.map((q) => q.x)) - Math.min(...sole.map((q) => q.x)),
    // The rectangle's sides from one corner: the nearer two of the other three.
    reach: [1, 2, 3].map((k) => Vector3.Distance(sole[0]!, sole[k]!)).sort((a, b) => a - b)[1]! / 2,
    flat: (corners[ahead[2]!]![1] + corners[ahead[3]!]![1]) / 2 - (corners[ahead[0]!]![1] + corners[ahead[1]!]![1]) * 0.5,
    stand: corners.reduce((sum, q) => sum + q[1], 0) / corners.length - Math.min(...corners.map((q) => q[1])),
    ankle: ankle[1] - corners.reduce((sum, q) => sum + q[1], 0) / corners.length, back: hypot(mx, mz) };
}

/** `foot` read with the fit (`FootState.fits`) of its toes now: with them, or bent past `within`, without. */
function fitSole(foot: FootState): void {
  const flat = (foot.segment.toes?.bend ?? 0) <= foot.fits.within;
  if (flat === foot.toesFlat) return;
  Object.assign(foot, flat ? foot.fits.flat : foot.fits.bent);
  foot.toesFlat = flat;
}

/**
 * What an ankle's muscles toward `sense` hold against a load that pushes the other way, N m: their
 * isometric peak, and across the sole (`across`) that times their lengthening ceiling
 * (`MuscleSpec`'s speed, `eccentricCeiling`). Across, a load that pushes the sole onto its edge
 * lengthens the invertors or evertors holding it, and they resist up to that ceiling of their peak
 * (Thelen 2003). Along it, a sole held past its peak tips onto its toes or its heel, which the
 * stance reads and plans on (`bearingEnd`). Measured: `docs/reference/stance-tuning.md#ankle-hold`.
 */
function ankleStrength(muscle: MuscleSpec, sense: "peakPositive" | "peakNegative", across: boolean): number {
  const curve = sense === "peakPositive" ? muscle.speedPositive : muscle.speedNegative;
  return muscle[sense].value * (across ? curve.eccentricCeiling.value : 1);
}

/**
 * What a sole's ankle holds (`FootState.ankleHold`), how far (`FootState.holdReach`) and the regions
 * of the sole the stance plans in (`FootState.hold`): the sole's `corners` (body frame, reference
 * pose), in order `ahead` of the `ankle`'s centre, its edges drawn toward the ankle by `inset`,
 * cut to what the hold reaches at the body's `weight` and at half of it. The centre of pressure
 * a distance d from under the ankle along the ground loads the ankle with the load on the foot
 * times d (the ankle's height above the ground borne by friction left out of the region; the
 * share counts it): the dorsiflexors hold it toward the heel, the plantar flexors toward the
 * toes, the invertors and evertors across. An ankle without a freedom named for the way holds the
 * drawn edge there. A centre of pressure at an edge only holds the capture point where it is,
 * the sole about to roll; drawn in, the ankle has the rest to bring it back. The hold is the
 * ankle's strength each way (`ankleStrength`).
 */
function holdOf(corners: readonly Vec3[], ahead: readonly number[], ankle: Vec3, joint: ReadJoint, weight: number, inset: number): { points: Vec3[]; reach: FootState["holdReach"]; hold: AnkleHold } {
  const mid = (a: Vec3, b: Vec3): Vec3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const front = mid(corners[ahead[0]!]!, corners[ahead[1]!]!), heel = mid(corners[ahead[2]!]!, corners[ahead[3]!]!);
  const fx = front[0] - heel[0], fz = front[2] - heel[2], along = hypot(fx, fz), ux = fx / along, uz = fz / along;
  const ground = corners.reduce((sum, q) => sum + q[1], 0) / corners.length, ax = ankle[0], az = ankle[2];
  const toeEdge = (front[0] - ax) * ux + (front[2] - az) * uz, heelEdge = (ax - heel[0]) * ux + (az - heel[2]) * uz;
  const halfWidth = hypot(corners[ahead[0]!]![0] - corners[ahead[1]!]![0], corners[ahead[0]!]![2] - corners[ahead[1]!]![2]) / 2;
  const strength = (name: string, sense: "peakPositive" | "peakNegative"): number => {
    const dof = joint.dofs.find((d) => d.spec.positive === name);
    return dof ? ankleStrength(dof.spec.muscle, sense, name === "inversion") : Infinity;
  };
  // Dorsiflexion (toes up) presses the heel into the ground, plantar flexion the toes; inversion and eversion each press a side.
  const hold: AnkleHold = { toe: strength("dorsiflexion", "peakNegative"), heel: strength("dorsiflexion", "peakPositive"),
    side: Math.min(strength("inversion", "peakPositive"), strength("inversion", "peakNegative")) };
  const at = (d: number, w: number): Vec3 => [ax + d * ux - w * uz, ground, az + d * uz + w * ux];
  const drawn = 1 - inset;
  const reachAt = (load: number): FootState["holdReach"] => ({ toe: Math.min(drawn * toeEdge, hold.toe / load), heel: Math.min(drawn * heelEdge, hold.heel / load), side: Math.min(drawn * halfWidth, hold.side / load) });
  const region = (load: number): Vec3[] => {
    const { toe, heel, side } = reachAt(load);
    return [at(toe, side), at(toe, -side), at(-heel, -side), at(-heel, side), at(0, -side), at(0, side)];
  };
  return { points: [...region(weight), ...region(weight / 2), [ankle[0], ankle[1], ankle[2]]], reach: reachAt(weight), hold };
}

/**
 * The pelvis's heading less a foot's at `hip`'s rotation stops, least then most: the hip's freedom
 * whose axis stands nearest up turns the thigh, and the foot under it, about up by its angle times
 * the axis's upward part, so the pelvis turns the other way over a planted foot.
 */
function turnsOf(hip: ReadJoint): [number, number] {
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
export function standingHeight(built: ReadBody): number {
  let mass = 0, moment = 0;
  for (const segment of built.segments.values()) {
    mass += segment.rigid.mass;
    moment += segment.rigid.mass * segment.rigid.centre[1];
  }
  let sole = 0, count = 0;
  for (const side of ["left", "right"] as const) {
    const foot = built.segments.get(`foot.${side}`);
    if (!foot) throw new Error(`${built.spec.model} has no ${side} foot`);
    for (const corner of soleCorners(foot, true)) {
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
    heldOf(foot);
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
 * The pivot a pendulum's capture point at (`fx`, `fz`) falls about toward a target: the point
 * (x, z) that brings it there, if the outline of `soles`' corners drawn in by `inset` holds it;
 * else the farthest point from the capture point toward (x, z) that the outline holds, the push
 * toward the target as hard as the outline gives and no other way; else, the capture point outside
 * the outline and the pivot asked beyond it, the outline's point nearest the line between them.
 * The outline's point nearest the pivot alone pushes another way: a pivot asked far outside, as
 * a target out of reach in the time left asks, is a little across of its line, and the nearest
 * point of the outline to it is a corner.
 */
export function pivotWithin(soles: readonly Sole[], fx: number, fz: number, x: number, z: number, inset = SUPPORT_INSET): [number, number] {
  const drawn = drawnOutline(soles, inset);
  if (drawn.length === 1) return [drawn[0]![0], drawn[0]![1]];
  // The line from the capture point (s = 0) to the pivot asked (s = 1), cut to the inside of each edge.
  const dx = x - fx, dz = z - fz;
  let s0 = 0, s1 = 1;
  for (let k = 0; k < drawn.length && s0 <= s1; k++) {
    const [ax, az] = drawn[k]!, [bx, bz] = drawn[(k + 1) % drawn.length]!;
    const outAt = (bz - az) * (fx - ax) + (ax - bx) * (fz - az), outBy = (bz - az) * dx + (ax - bx) * dz;
    if (outBy === 0) { if (outAt > 0) s1 = -1; continue; }
    const s = -outAt / outBy;
    if (outBy > 0) s1 = Math.min(s1, s); else s0 = Math.max(s0, s);
  }
  if (s0 <= s1) return [fx + s1 * dx, fz + s1 * dz];
  // The line misses the outline: of the outline's points nearest its ends, and its corners nearest the line, the nearest.
  let best = nearestWithin(drawn, fx, fz), far = hypot(fx - best[0], fz - best[1]);
  const atPivot = nearestWithin(drawn, x, z), farPivot = hypot(x - atPivot[0], z - atPivot[1]);
  if (farPivot < far) { best = atPivot; far = farPivot; }
  const length = dx * dx + dz * dz;
  for (const [cx, cz] of drawn) {
    const t = length === 0 ? 0 : Math.min(1, Math.max(0, ((cx - fx) * dx + (cz - fz) * dz) / length));
    const d = hypot(cx - fx - t * dx, cz - fz - t * dz);
    if (d < far) { best = [cx, cz]; far = d; }
  }
  return best;
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
  fitSole(foot);
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

const scratch = { b: new Quaternion(), forward: new Vector3() };

/**
 * How far a swinging `foot`'s sole's middle keeps from the bearing sole's middle across the bearing
 * sole, m: a sole's width (the two half-widths) and the swing's `clearance`. With `clearAlong`,
 * the box about the bearing sole that the swing's path bows round (`swingBowToRef`) and a
 * recovery's landing is kept off (`clearOfBearer`).
 */
export const clearAcross = (foot: FootState, clearance: number): number => foot.width + clearance;

/** How far a swinging `foot`'s sole's middle keeps from `bearer`'s sole's middle along the bearing sole, m: the two soles' half-lengths and the swing's `clearance` (`clearAcross`). */
export const clearAlong = (bearer: FootState, foot: FootState, clearance: number): number => bearer.reach + foot.reach + clearance;

/**
 * `foot`'s sole as it bears (`BearingSole`), its wrench within what its ankle holds
 * (`FootState.ankleHold`): flat, the sole, its centre of pressure kept to `keep` of its half-length
 * and half-width; landed on an end (`landedOn`), the other a little in the air, the sole from under
 * the ankle to the hold's reach toward that end, kept to `keep` of its length; otherwise on an end
 * (`bearingEnd`), rolled onto it or pitched steeply onto it, the band of the sole's margin at that
 * edge. A foot landed on its toes bears on them alone, and its ankle's torque decides whether the
 * heel comes down: asked a centre of pressure halfway from under the ankle to the toes, the ankle
 * gives half the moment the toes' push makes about it, and the heel comes down under the other half.
 */
export function bearingSole(foot: FootState, keep: number): BearingSole {
  const along = foot.ends.front.middle.subtract(foot.ends.heel.middle);
  along.y = 0;
  along.normalize();
  const { ankle } = foot.held, hold = foot.ankleHold, width = keep * foot.width / 2;
  const landed = foot.memory.rolled === null ? landedOn(foot) : null;
  if (landed !== null) {
    const reach = landed === "front" ? foot.holdReach.toe / 2 : -foot.holdReach.heel / 2, under = foot.held.under;
    return { kind: "sole", middle: new Vector3(under.x + along.x * reach, under.y, under.z + along.z * reach), along, length: keep * Math.abs(reach), width, ankle, hold };
  }
  const end = bearingEnd(foot);
  if (end !== null) return { kind: "sole", middle: foot.ends[end].middle, along, length: (1 - keep) * foot.reach, width, ankle, hold };
  return { kind: "sole", middle: foot.middle, along, length: keep * foot.reach, width, ankle, hold };
}

/**
 * The end of its sole `foot` stands on, as last read, the other in the air: the one whose edge is
 * not more than `DOWN` over the ground (`FootMemory.ground`) while the other's is. Null, both
 * ends are at the ground, however unevenly the sole has sunk into it, or both are in the air.
 */
function standingOn(foot: FootState): SoleEnd | null {
  const front = foot.ends.front.middle.y - foot.memory.ground > DOWN, heel = foot.ends.heel.middle.y - foot.memory.ground > DOWN;
  return front === heel ? null : front ? "heel" : "front";
}

/**
 * The end of its sole `foot` has landed on, as last read (`standingOn`), the other a little in the
 * air: no higher over the edge than the sole's half-length, the sole pitched within 30 degrees of
 * the ground. A leg reaching behind lands its toes first; one reaching ahead, its heel. Null, the
 * sole is flat, or pitched further: a foot standing on its toes with its sole upright, as a kneeling
 * leg's does, is a hinge on its edge and nothing of the sole is near the ground.
 */
function landedOn(foot: FootState): SoleEnd | null {
  const end = standingOn(foot);
  return end !== null && Math.abs(foot.heel - foot.flat) <= foot.reach ? end : null;
}

/** The end of its sole `foot` bears on, the other in the air: the one it is rolled onto (`FootMemory.rolled`) or stands on (`standingOn`); null, the sole is flat. */
export function bearingEnd(foot: FootState): SoleEnd | null {
  return foot.memory.rolled ?? standingOn(foot);
}

/**
 * The dorsiflexion from here that lays `foot`'s sole flat, rad: the sole's pitch about its across
 * axis as last read, from how far the heel stands over the front edge (`heel`) against the sole's
 * length. Positive, the heel is up; negative, the toes are.
 */
export function soleFlatTurn(foot: FootState): number {
  const sine = (foot.heel - foot.flat) / (2 * foot.reach);
  return asin(sine < -1 ? -1 : sine > 1 ? 1 : sine);
}

/**
 * The rows of a task at the edge `foot` bears on (`LimbWork.rows`): of the foot's spin, the part
 * about the level normal to the edge and the part about up; and the edge's middle's velocity. Its
 * turn about the edge is left free: the foot is a hinge on the ground there.
 */
export function rolledRows(foot: FootState): Row[] {
  const w = Vector3.Cross(bearingEdge(foot)!.axis, Vector3.UpReadOnly);
  return [[[0, w.x], [1, w.y], [2, w.z]], [[1, 1]], [[3, 1]], [[4, 1]], [[5, 1]]];
}

/**
 * What of its sole a foot bears on, for the region the stance holds, bearing the whole weight:
 * landed on an end (`landedOn`), the half of what its ankle holds from under the ankle to that end;
 * otherwise on an end (`bearingEnd`), that edge; flat, all of what its ankle holds
 * (`FootState.held`).
 */
export function bearingOf(foot: FootState): Sole {
  return heldRegion(foot, foot.held.full);
}

/** `bearingOf`'s region of `foot` among `regions`, the ones at one load. */
function heldRegion(foot: FootState, regions: HeldRegions): Sole {
  const landed = foot.memory.rolled === null ? landedOn(foot) : null;
  if (landed !== null) return landed === "front" ? regions.toe : regions.heel;
  const end = bearingEnd(foot);
  return end === null ? regions.all : foot.ends[end];
}

/**
 * The regions `feet`'s ankles hold the centre of pressure in, for `withinSupport`: one foot's, what
 * it bears on at the whole weight (`bearingOf`); two feet's, each one's at the whole weight and,
 * between them, what the two hold bearing half each. An ankle's hold is a moment, so a foot
 * bearing half the weight holds the centre of pressure twice as far from under its ankle, and the
 * centre of pressure of both is midway between theirs: the pair holds every point midway between
 * a point of one's half-weight region and a point of the other's. The hull of the three is within
 * what the pair holds with the weight shared any way; `between` is a scratch, read before the
 * next call.
 */
export function heldBy(feet: readonly FootState[]): readonly Sole[] {
  if (feet.length < 2) return feet.map(bearingOf);
  const [first, second] = feet as [FootState, FootState];
  const a = heldRegion(first, first.held.half).corners, b = heldRegion(second, second.held.half).corners, { corners } = between;
  for (let i = 0; i < 4; i++) {
    const q = a[i % a.length]!;
    for (let j = 0; j < 4; j++) {
      const r = b[j % b.length]!;
      corners[4 * i + j]!.set((q.x + r.x) / 2, (q.y + r.y) / 2, (q.z + r.z) / 2);
    }
  }
  return [bearingOf(first), bearingOf(second), between];
}

/** What two feet hold between them (`heldBy`), as last asked. */
const between: Sole = { corners: Array.from({ length: 16 }, () => new Vector3()) };

/** An end of a sole with nothing read into it yet. */
function soleEdge(): SoleEdge {
  return { corners: [new Vector3(), new Vector3()], middle: new Vector3(), axis: new Vector3() };
}

/** The edge of its sole `foot` bears on (`bearingEnd`), or null flat. */
export function bearingEdge(foot: FootState): SoleEdge | null {
  const end = bearingEnd(foot);
  return end === null ? null : foot.ends[end];
}

/** The edge of its sole `foot` is rolled onto (`FootMemory.rolled`), or null. */
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

/** From the `ankle`'s centre to a sole's `corners`' middle across the ground (body frame, reference pose), (x, z), m. */
function ankleToMiddle(corners: readonly Vec3[], ankle: Vec3): [number, number] {
  const middle = (k: 0 | 2) => corners.reduce((sum, q) => sum + q[k], 0) / corners.length;
  return [middle(0) - ankle[0], middle(2) - ankle[2]];
}

/**
 * A sole's `corners` (body frame, reference pose) in order ahead of the `ankle`'s centre (the
 * same) across the ground, farthest first: ahead is from the ankle to the corners' middle.
 */
function aheadOf(corners: readonly Vec3[], ankle: Vec3): number[] {
  const [fx, fz] = ankleToMiddle(corners, ankle);
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

/** `foot`'s held regions (`FootState.hold`) where the foot is now, into its `held` points and the point under the ankle. */
function heldOf(foot: FootState): void {
  const turn = foot.segment.node.rotationQuaternion!, at = foot.segment.node.position, { points, under } = foot.held;
  foot.hold.forEach((point, k) => { point.applyRotationQuaternionToRef(turn, points[k]!).addInPlace(at); });
  under.copyFrom(points[4]!).addInPlace(points[5]!).scaleInPlace(0.5);
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
function referenceBendOf(chain: readonly ReadJoint[]): number {
  const [hip, knee, ankle] = chain.map((joint) => joint.spec.centre.value);
  const t = [knee![0] - hip![0], knee![1] - hip![1], knee![2] - hip![2]], h = [ankle![0] - knee![0], ankle![1] - knee![1], ankle![2] - knee![2]];
  const dot = t[0]! * h[0]! + t[1]! * h[1]! + t[2]! * h[2]!;
  return acos(Math.max(-1, Math.min(1, dot / (hypot(t[0]!, t[1]!, t[2]!) * hypot(h[0]!, h[1]!, h[2]!)))));
}

/** The thigh's and the shank's lengths in the reference pose: hip to knee, and knee to ankle. */
function lengthsOf(chain: readonly ReadJoint[]): [number, number] {
  const [hip, knee, ankle] = chain.map((joint) => joint.spec.centre.value);
  const distance = (p: Vec3, q: Vec3) => hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  return [distance(hip!, knee!), distance(knee!, ankle!)];
}

/**
 * The corners of `foot`'s sole, body frame, reference pose: the four corners of its box lowest
 * there, its front ones carried out to its toes' tips (`ToesSpec`) under `toesFlat`. Flat toes
 * bear the foot as its sole does; bent, it turns about the ball, the box's front.
 */
function soleCorners(foot: ReadSegment, toesFlat: boolean): Vec3[] {
  const shape = foot.spec.shape;
  if (shape.kind !== "box") throw new Error(`${foot.spec.name} is a ${shape.kind}; a stance reads a box's sole`);
  const { x, y, z } = foot.frame, centre = shape.centre.value, size = shape.size.value;
  const toes = toesFlat ? foot.spec.toes?.length.value ?? 0 : 0;
  const corners: Vec3[] = [];
  for (const sx of [-0.5, 0.5]) for (const sy of [-0.5, 0.5]) for (const sz of [-0.5, 0.5]) {
    const at = (k: number) => centre[k]! + sx * size[0] * x[k]! + (sy * size[1] + (sy > 0 ? toes : 0)) * y[k]! + sz * size[2] * z[k]!;
    corners.push([at(0), at(1), at(2)]);
  }
  corners.sort((a, b) => a[1] - b[1]);
  return corners.slice(0, 4);
}

/** `foot`'s sole's `corners` (`soleCorners`) in the segment's own frame. */
function soleOf(foot: ReadSegment, corners: readonly Vec3[]): Vector3[] {
  const { origin, x, y, z } = foot.frame;
  return corners.map((q) => {
    const o = [q[0] - origin[0], q[1] - origin[1], q[2] - origin[2]];
    return new Vector3(dot(o, x), dot(o, y), dot(o, z));
  });
}
