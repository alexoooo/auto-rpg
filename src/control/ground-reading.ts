import { Quaternion, Vector3 } from "../core/math/vector.ts";
import { uprightness } from "./ground.ts";
import { footStatesOf, soleMiddleToRef, withinSupport, type FootState } from "./support.ts";
import { centreOfToRef, massCentreToRef, partsOn, turnOfToRef } from "../core/bodies/read-motion.ts";
import { bellyOf, type BearingEndSpec } from "../core/bodies/spec/body.ts";
import type { Vec3 } from "../core/quantity.ts";
import { attachment, rootSegment, type ReadBody, type ReadSegment } from "../core/bodies/read-body.ts";
import type { Side } from "../core/bodies/bilateral.ts";

/** How a body lies: on its front, its back, or a side (the side that is down). */
export type Lie = "front" | "back" | Side;

/**
 * How far the root's belly points up, or down, for the body to be on its back, or its front: its
 * y, of 1. Between, it is on a side.
 */
const LIE_UP = 0.5;

/**
 * **How a body lies** by how far its root's belly (`bellyOf`) and its left (the reference pose's
 * -x) point up, of 1: the belly against up says back or front (`LIE_UP`), and between them the
 * side its left is under.
 */
export const lieBy = (belly: number, left: number): Lie => belly > LIE_UP ? "back" : belly < -LIE_UP ? "front" : left < 0 ? "left" : "right";

/**
 * How a body lies, by its root segment `root` and the way its belly faces in the reference pose
 * (`bellyOf`) (`lieBy`). `work` carries nothing between calls.
 */
export function lieOf(root: ReadSegment, belly: Vec3, work = { turn: new Quaternion(), way: new Vector3() }): Lie {
  const turn = turnOfToRef(root, work.turn), way = work.way;
  const up = way.set(belly[0], belly[1], belly[2]).applyRotationQuaternionToRef(turn, way).y;
  return lieBy(up, way.set(-1, 0, 0).applyRotationQuaternionToRef(turn, way).y);
}

/**
 * **A posture: what bears the body**, named only from its present physical readings. On the ends
 * its stance stands on (`BodySpec.ends`: a human's feet, a quadruped's paws) it stands; on its
 * trunk it lies, named by the side up (`Lie`). Between, it is named by the ends that bear it: on
 * its feet and hands, a crouch; on its shins (propped ends) upright, kneeling; on its shins and
 * hands, on all fours; on one shin and the other foot, half kneeling; on its trunk's base,
 * upright, with its feet, hands and thighs, sitting; on anything else, between.
 */
export type Position = "standing" | "crouch" | "half-kneel" | "kneeling" | "fours" | "sitting" | Lie | "between";

/** What a body on the ground knows this step; all fields are plain data written in place. */
export interface GroundReading {
  /** Segment loads in BodySpec.segments order, as shares of the whole body's weight. */
  readonly load: Float64Array;
  /** Sole tilt cosines, a foot's sole each (`footStatesOf`: left then right), none for a body without soles. */
  readonly sole: Float64Array;
  /** Whether each sole bears through loaded points in both its heel and toe halves. */
  readonly flat: Uint8Array;
  /** Each foot's share of body weight, as `sole`'s. */
  readonly footLoad: Float64Array;
  /**
   * The share of body weight the body and what it holds press this step against fixed solids that
   * bear none of it from below (a wall, a column, a tomb's side), as `load`'s: a solid any part bears
   * on this step (the floor, a tomb's top) is not one, however its other contacts face. None on an
   * open floor. Whether it touches one: `againstSolid`.
   */
  against: number;
  /** Whether the body bears on an end it stands on, and on nothing but those and its hands: a crouch's supports, on one end or all. Read every step. */
  onFeet: boolean;
  /** Sole corners in world coordinates, for the hand-back's support polygon. */
  readonly soles: readonly { readonly corners: readonly Vector3[] }[];
  readonly centre: Vector3;
  readonly velocity: Vector3;
  lie: Lie;
  height: number;
  upright: number;
  spin: number;
  raw: Position;
  position: Position;
  /** Whether `position` has been read since the reading was reset: `raw` the same `SETTLE_STEPS` readings running. */
  settled: boolean;
  side: Side | null;
}

/** A contact bears at three per cent of body weight; shallow wall contacts give no support. */
const BEARS = 0.03, GROUND_UP = 0.7;
/** A flat sole's normal stays within this cosine of vertical. */
const FLAT = 0.9;
/** Standing has at least this share of reference height; kneeling, and half kneeling on a foot not flat, keep the trunk near vertical. */
const STANDING = 0.85, KNEEL_UP = 0.83;
/** A sitting trunk raises its upper centre this far over its pelvis, metres. */
const SITTING = 0.15;
/**
 * Under this share of reference height a body on none of the postures above lies, though its trunk
 * bears nothing: face down on its arms or what it holds, on its side on its upper arm, on its
 * hands and thighs: a body this low reads as lying. Set between a lying body's height and one on
 * hands and knees.
 */
const LYING = 0.3;
/** Six consecutive readings settle a label; physical facts never wait for it. */
const SETTLE_STEPS = 6;
/** Quiet hand-back needs nearly all weight on the feet, small linear speed, and little spin. */
const HAND_BACK_LOAD = 0.9, SLOW = 0.3, SPIN = 1;
/** A body faster than this, m/s, or spinning faster than this, rad/s, is tumbling. */
const TUMBLING = 0.5, TUMBLING_SPIN = 1;

/**
 * **What bears a body**, by its spec's ends (`BodySpec.ends`) and marks, each a segment's place in
 * its spec's order: the ends it stands on (its feet and paws) and its hands (an end it bears on at
 * its point), each as the segments it bears on: a foot on its sole, and an end at its point on its
 * segment or the one it hangs from, a hand on its palm or its forearm, a paw on itself or its lower
 * leg; its shins (an end propped on a foot), each with the foot that is not its prop (`FootState`'s
 * place) and the segment it hangs from, a thigh; and its trunk, its root (the segment no joint
 * carries) first, then its middle (`Marks.middle`), the first of which is its upper trunk.
 */
function bearersOf(built: ReadBody, parts: readonly ReadSegment[], feet: readonly FootState[]) {
  const spec = built.spec, ends = spec.ends ?? [], at = (name: string) => parts.findIndex((part) => part.spec.name === name);
  const above = (name: string) => at(spec.joints.find((joint) => joint.child === name)?.parent ?? "");
  const on = (end: BearingEndSpec): number[] => end.kind === "end" || end.kind === "paw" ? [at(end.segment), above(end.segment)] : [at(end.segment)];
  const root = rootSegment(built), trunk = [parts.indexOf(root), ...spec.marks.middle.filter((name) => name !== root.spec.name).map(at)];
  return {
    stance: ends.flatMap((end) => end.kind === "foot" || end.kind === "paw" ? [on(end)] : []),
    hands: ends.flatMap((end) => end.kind === "end" ? [on(end)] : []),
    shins: ends.flatMap((end) => end.kind === "propped"
      ? [{ shin: at(end.segment), thigh: above(end.segment), other: feet.findIndex((foot) => foot.segment.spec.name !== end.prop) }] : []),
    trunk, root, upper: parts[trunk[1] ?? trunk[0]!]!,
  };
}

/** Read fixed support and body geometry once per step, on any body: what bears it by its spec's ends (`bearersOf`). Reset between periods of ground ownership. */
export function groundReading(built: ReadBody, dt: number) {
  if (!(dt > 0 && Number.isFinite(dt))) throw new Error("a ground reading needs a positive step time");
  const parts = built.spec.segments.map(s => built.segments.get(s.name)!);
  const feet = footStatesOf(built), indices = feet.map(f => parts.indexOf(f.segment));
  const on = partsOn(built), attached = attachment(built);
  const shapeIsBody = parts.map(p => p.rigid.owners.map(o => o.kind === "segment" || o.kind === "region"));
  const { stance, hands, shins, trunk, root, upper } = bearersOf(built, parts, feet), belly = bellyOf(built.spec);
  const low = uprightness(built);
  const feetUp = feet.map(f => Vector3.UpReadOnly.applyRotationQuaternionToRef(Quaternion.Inverse(f.segment.rest), new Vector3()));
  const reading: GroundReading = {
    load: new Float64Array(parts.length), sole: new Float64Array(feet.length), flat: new Uint8Array(feet.length), footLoad: new Float64Array(feet.length),
    soles: feet.map(f => ({ corners: f.corners })), against: 0, onFeet: false, centre: new Vector3(), velocity: new Vector3(),
    lie: "front", height: 0, upright: 0, spin: 0, raw: "between", position: "between", settled: false, side: null,
  };
  const state = { reading, candidate: "between" as Position, steps: 0 };
  const work = { vector: new Vector3(), upper: new Vector3(), lower: new Vector3(), turn: new Quaternion(), way: new Vector3(), knee: new Vector3() };
  const stanceAll = stance.flat(), handsAll = hands.flat(), thighs = shins.map((one) => one.thigh);
  /** The segments each posture bears on, and nothing else (`only`). */
  const allowed = {
    standing: new Set(stanceAll), crouch: new Set([...stanceAll, ...handsAll]),
    half: shins.map((one) => new Set([...stanceAll, ...handsAll, one.shin])),
    kneeling: new Set([...stanceAll, ...shins.map((one) => one.shin)]), fours: new Set([...stanceAll, ...shins.map((one) => one.shin), ...handsAll]),
    sitting: new Set([trunk[0]!, ...stanceAll, ...handsAll, ...thighs]),
  };
  const bears = (i: number) => i >= 0 && reading.load[i]! >= BEARS;
  /** Each segment's load through what it holds, as `load`'s: a hand on all fours bears on its shield or its club as on its palm. */
  const heldLoad = new Float64Array(parts.length);
  const bearsHolding = (i: number) => bears(i) || i >= 0 && heldLoad[i]! >= BEARS;
  /** Whether foot `f` is ahead of the shin `shin` the way the root faces (`work.turn`, the root's turn as the lie reads it). */
  const ahead = (f: number, shin: number): boolean => {
    centreOfToRef(parts[shin]!, work.knee);
    work.way.set(0, 0, 1).applyRotationQuaternionToRef(work.turn, work.way);
    const middle = feet[f]!.middle;
    return (middle.x - work.knee.x) * work.way.x + (middle.z - work.knee.z) * work.way.z > 0;
  };
  const isFlat = (flat: number) => flat === 1, shinBears = (one: { readonly shin: number }) => bears(one.shin);
  /** Whether an end bears: any of the segments it bears on (`bearersOf`). */
  const endBears = (on: readonly number[]) => on.some(bears);
  const only = (admitted: ReadonlySet<number>) => {
    for (let i = 0; i < parts.length; i++) if (bears(i) && !admitted.has(i)) return false;
    return true;
  };
  const classify = (): Position => {
    if (stance.length > 0 && stance.every(endBears)) {
      if (reading.flat.every(isFlat) && reading.height >= STANDING && only(allowed.standing)) return "standing";
      if (only(allowed.crouch)) return "crouch";
    }
    // On one shin and the other foot: its sole flat, or the foot ahead of the knee and the trunk upright as a tall kneel's.
    for (let k = 0; k < shins.length; k++) {
      const { shin, other } = shins[k]!;
      if (bears(shin) && only(allowed.half[k]!) && other >= 0
        && (reading.flat[other] || bears(indices[other]!) && reading.upright >= KNEEL_UP && ahead(other, shin))) {
        reading.side = feet[other]!.side;
        return "half-kneel";
      }
    }
    if (shins.length > 0 && shins.every(shinBears)) {
      if (reading.upright >= KNEEL_UP && only(allowed.kneeling)) return "kneeling";
      if (hands.every(side => side.some(bearsHolding)) && only(allowed.fours)) return "fours";
    }
    if (bears(trunk[0]!) && work.upper.y - work.lower.y >= SITTING && only(allowed.sitting)) return "sitting";
    if (trunk.some(bears) || reading.height < LYING) {
      if (reading.lie === "left" || reading.lie === "right") reading.side = reading.lie;
      return reading.lie;
    }
    return "between";
  };
  const fixed = (other: unknown) => other === null;
  /** This step's fixed solids that bear the body from below, and its contacts that do not face up: each one's solid and share of weight. */
  const bearing = new Set<number>(), side = { solids: [] as number[], shares: [] as number[] };
  return {
    state,
    reset() { state.steps = 0; state.candidate = "between"; reading.position = "between"; reading.settled = false; },
    read(): GroundReading {
      reading.load.fill(0); heldLoad.fill(0); reading.against = 0;
      bearing.clear(); side.solids.length = 0; side.shares.length = 0;
      // What is on the body bears it, and weighs; a part cut off is the ground's.
      const { segments: kept, mass } = on(), weight = mass * -built.physics.gravity[1];
      for (let i = 0; i < parts.length; i++) {
        if (!attached(parts[i]!)) continue;
        for (const contact of built.physics.contactsOf(parts[i]!.body, fixed)) {
          if (contact.fixed === null) continue;
          for (const pair of contact.pairs) {
            if (!(pair.impulse > 0 && weight > 0)) continue;
            if (-pair.normal[1] >= GROUND_UP) {
              (shapeIsBody[i]![pair.mine] ? reading.load : heldLoad)[i] += pair.impulse * -pair.normal[1] / (dt * weight);
              bearing.add(contact.fixed);
            } else { side.solids.push(contact.fixed); side.shares.push(pair.impulse / (dt * weight)); }
          }
        }
      }
      for (let k = 0; k < side.solids.length; k++) if (!bearing.has(side.solids[k]!)) reading.against += side.shares[k]!;
      for (let i = 0; i < feet.length; i++) {
        const foot = feet[i]!;
        soleMiddleToRef(foot, foot.middle);
        reading.sole[i] = feetUp[i]!.applyRotationQuaternionToRef(foot.segment.pose.rotation, work.vector).y;
        reading.footLoad[i] = reading.load[indices[i]!]!;
        reading.flat[i] = 0;
        if (reading.sole[i]! < FLAT || !bears(indices[i]!)) continue;
        const toe = foot.corners[foot.ahead[0]!]!, toeOther = foot.corners[foot.ahead[1]!]!;
        const heel = foot.corners[foot.ahead[2]!]!, heelOther = foot.corners[foot.ahead[3]!]!;
        // Project onto the sole's own length, so turning the body cannot swap heel and toe.
        work.vector.set(toe.x + toeOther.x - heel.x - heelOther.x, toe.y + toeOther.y - heel.y - heelOther.y,
          toe.z + toeOther.z - heel.z - heelOther.z);
        let front = false, back = false;
        for (const patch of built.physics.contactManifoldsOf(foot.segment.body, fixed)) {
          if (patch.fixed === null || patch.impulse <= 0 || -patch.normal[1] < GROUND_UP || !shapeIsBody[indices[i]!]![patch.mine]) continue;
          for (const point of patch.points) if (point.distance <= 0) {
            const along = (point.point[0] - foot.middle.x) * work.vector.x + (point.point[1] - foot.middle.y) * work.vector.y
              + (point.point[2] - foot.middle.z) * work.vector.z;
            front ||= along > 0; back ||= along < 0;
          }
        }
        reading.flat[i] = front && back ? 1 : 0;
      }
      reading.onFeet = stance.some(endBears) && only(allowed.crouch);
      massCentreToRef(kept, mass, reading.centre, work.vector, reading.velocity);
      reading.height = low.height() / low.standing;
      centreOfToRef(upper, work.upper); centreOfToRef(root, work.lower);
      work.upper.subtractToRef(work.lower, work.vector);
      const length = work.vector.length();
      reading.upright = length > 0 ? work.vector.y / length : 0;
      reading.spin = root.body.angularVelocityToRef(work.vector).length();
      reading.lie = lieOf(root, belly, work);
      reading.side = null;
      reading.raw = classify();
      if (state.candidate === reading.raw) state.steps = Math.min(SETTLE_STEPS, state.steps + 1);
      else { state.candidate = reading.raw; state.steps = 1; }
      if (state.steps >= SETTLE_STEPS) { reading.position = reading.raw; reading.settled = true; }
      return reading;
    },
  };
}

/** Whether the body or what it holds touches a fixed solid that does not bear it from below (`GroundReading.against`), as a contact bears (`BEARS`). */
export const againstSolid = (g: Pick<GroundReading, "against">): boolean => g.against >= BEARS;

/** Whether the body is tumbling: its centre of mass faster than `TUMBLING`, or its pelvis spinning faster than `TUMBLING_SPIN`. */
export function tumbling(g: GroundReading): boolean {
  return g.velocity.lengthSquared() > TUMBLING * TUMBLING || g.spin > TUMBLING_SPIN;
}

/** Quiet, flat support on its soles with the mass inside their inset outline is ready for the host. */
export function standReady(view: { readonly down: boolean; readonly ground: GroundReading | null }): boolean {
  return !view.down && view.ground?.position === "standing" && quietOnFeet(view.ground);
}

/**
 * Quiet on its feet at any height, down or not: every sole flat and together bearing nearly all the
 * weight, slow, little spin, and the centre of mass inside the soles' inset outline.
 */
export function quietOnFeet(g: GroundReading): boolean {
  let load = 0;
  for (let i = 0; i < g.flat.length; i++) {
    if (!g.flat[i]) return false;
    load += g.footLoad[i]!;
  }
  if (load < HAND_BACK_LOAD || g.velocity.lengthSquared() >= SLOW * SLOW || g.spin >= SPIN) return false;
  const [x, z] = withinSupport(g.soles, g.centre.x, g.centre.z);
  return x === g.centre.x && z === g.centre.z;
}
