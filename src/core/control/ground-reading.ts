import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { uprightness } from "./ground.ts";
import { footStatesOf, soleMiddleToRef, soleRefusal, withinSupport } from "./support.ts";
import { centreOfToRef, massCentreToRef, massOf, turnOfToRef } from "../read-motion.ts";
import { segmentOf, type BodySpec, type Side } from "../spec/body.ts";
import type { ReadBody, ReadSegment } from "../read-body.ts";

/** How a body lies: on its front, its back, or a side (the side that is down). */
export type Lie = "front" | "back" | "left" | "right";

/**
 * How far the pelvis's forward points up, or down, for the body to be on its back, or its front:
 * its y, of 1 (`docs/reference/rising.md#stages`). Between, it is on a side.
 */
const LIE_UP = 0.5;

/**
 * **How a body lies** by how far its root's forward (the reference pose's +z) and its left (the
 * reference pose's -x) point up, of 1: forward against up says back or front (`LIE_UP`), and
 * between them the side its left is under.
 */
export const lieBy = (forward: number, left: number): Lie => forward > LIE_UP ? "back" : forward < -LIE_UP ? "front" : left < 0 ? "left" : "right";

/**
 * How a body lies, by its root segment `root` (`lieBy`). `work` carries nothing between calls.
 */
export function lieOf(root: ReadSegment, work = { turn: new Quaternion(), way: new Vector3() }): Lie {
  const turn = turnOfToRef(root, work.turn), way = work.way;
  const forward = way.set(0, 0, 1).applyRotationQuaternionToRef(turn, way).y;
  return lieBy(forward, way.set(-1, 0, 0).applyRotationQuaternionToRef(turn, way).y);
}

/** The body's contact configuration, named only from its present physical readings. */
export type Position = "standing" | "crouch" | "half-kneel" | "kneeling" | "fours" | "sitting" | Lie | "between";

/** What a body on the ground knows this step; all fields are plain data written in place. */
export interface GroundReading {
  /** Segment loads in BodySpec.segments order, as shares of the whole body's weight. */
  readonly load: Float64Array;
  /** Sole tilt cosines, left then right. */
  readonly sole: Float64Array;
  /** Whether each sole bears through loaded points in both its heel and toe halves. */
  readonly flat: Uint8Array;
  /** The two feet's shares of body weight, left then right. */
  readonly footLoad: Float64Array;
  /** Whether the body bears on a foot, and on nothing but its feet and hands: a crouch's supports, on one foot or both. Read every step. */
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
/** Six consecutive readings settle a label; physical facts never wait for it. */
const SETTLE_STEPS = 6;
/** Quiet hand-back needs nearly all weight on the feet, small linear speed, and little spin. */
const HAND_BACK_LOAD = 0.9, SLOW = 0.3, SPIN = 1;
/** A body faster than this, m/s, or spinning faster than this, rad/s, is tumbling. */
const TUMBLING = 0.5, TUMBLING_SPIN = 1;

/** The segments a ground reading tells how a body lies by, beside its feet: a human's trunk, thighs, shanks, forearms and hands. */
const LYING_ON: readonly string[] = Object.freeze(["lowerTrunk", "middleTrunk", "upperTrunk", "thigh.left", "thigh.right", "shank.left", "shank.right",
  "forearm.left", "forearm.right", "hand.left", "hand.right"]);

/** What a ground reading (`groundReading`) lacks of a body of `spec`, a sentence, or null where it reads it: soles to stand on, and the segments it tells how the body lies by (`LYING_ON`). */
export function groundRefusal(spec: BodySpec): string | null {
  const soles = soleRefusal(spec);
  if (soles) return soles;
  const lacks = LYING_ON.filter((name) => !segmentOf(spec, name));
  return lacks.length ? `needs ${lacks.join(", ")} to tell how it lies` : null;
}

/** Read fixed support and body geometry once per step. Reset between periods of ground ownership. It refuses a body it cannot read (`groundRefusal`). */
export function groundReading(built: ReadBody, dt: number) {
  if (!(dt > 0 && Number.isFinite(dt))) throw new Error("a ground reading needs a positive step time");
  const refused = groundRefusal(built.spec);
  if (refused) throw new Error(`${built.spec.model}: the ground reading ${refused}`);
  const parts = built.spec.segments.map(s => built.segments.get(s.name)!);
  const feet = footStatesOf(built), indices = feet.map(f => parts.indexOf(f.segment));
  const mass = massOf(parts), weight = mass * -built.physics.gravity[1];
  const shapeIsBody = parts.map(p => p.rigid.owners.map(o => o.kind === "segment" || o.kind === "region"));
  const low = uprightness(built), root = built.segments.get("lowerTrunk")!, upper = built.segments.get("upperTrunk")!;
  const feetUp = feet.map(f => Vector3.UpReadOnly.applyRotationQuaternionToRef(Quaternion.Inverse(f.segment.rest), new Vector3()));
  const reading: GroundReading = {
    load: new Float64Array(parts.length), sole: new Float64Array(2), flat: new Uint8Array(2), footLoad: new Float64Array(2),
    soles: feet.map(f => ({ corners: f.corners })), onFeet: false, centre: new Vector3(), velocity: new Vector3(),
    lie: "front", height: 0, upright: 0, spin: 0, raw: "between", position: "between", settled: false, side: null,
  };
  const state = { reading, candidate: "between" as Position, steps: 0 };
  const work = { vector: new Vector3(), upper: new Vector3(), lower: new Vector3(), turn: new Quaternion(), way: new Vector3(), knee: new Vector3() };
  const index = (name: string) => parts.findIndex(p => p.spec.name === name);
  const trunk = [index("lowerTrunk"), index("middleTrunk"), index("upperTrunk")];
  const shank = [index("shank.left"), index("shank.right")];
  const hands = [[index("hand.left"), index("forearm.left")], [index("hand.right"), index("forearm.right")]];
  const handsBoth = [...hands[0]!, ...hands[1]!], thighs = [index("thigh.left"), index("thigh.right")];
  const allowed = {
    standing: new Set(indices), crouch: new Set([...indices, ...handsBoth]),
    half: shank.map(s => new Set([...indices, ...handsBoth, s])),
    kneeling: new Set([...indices, ...shank]), fours: new Set([...indices, ...shank, ...handsBoth]),
    sitting: new Set([trunk[0]!, ...indices, ...handsBoth, ...thighs]),
  };
  const bears = (i: number) => i >= 0 && reading.load[i]! >= BEARS;
  /** Each segment's load through what it holds, as `load`'s: a hand on all fours bears on its shield or its club as on its palm. */
  const heldLoad = new Float64Array(parts.length);
  const bearsHolding = (i: number) => bears(i) || i >= 0 && heldLoad[i]! >= BEARS;
  /** Whether foot `f` is ahead of shank `s` the way the pelvis faces (`work.turn`, the root's turn as the lie reads it). */
  const ahead = (f: number, s: number): boolean => {
    centreOfToRef(parts[shank[s]!]!, work.knee);
    work.way.set(0, 0, 1).applyRotationQuaternionToRef(work.turn, work.way);
    const middle = feet[f]!.middle;
    return (middle.x - work.knee.x) * work.way.x + (middle.z - work.knee.z) * work.way.z > 0;
  };
  const only = (admitted: ReadonlySet<number>) => {
    for (let i = 0; i < parts.length; i++) if (bears(i) && !admitted.has(i)) return false;
    return true;
  };
  const classify = (): Position => {
    if (bears(indices[0]!) && bears(indices[1]!)) {
      if (reading.flat[0] && reading.flat[1] && reading.height >= STANDING && only(allowed.standing)) return "standing";
      if (only(allowed.crouch)) return "crouch";
    }
    // On one shin and the other foot: its sole flat, or the foot ahead of the knee and the trunk upright as a tall kneel's.
    for (let k = 0; k < 2; k++) if (bears(shank[k]!) && only(allowed.half[k]!)
      && (reading.flat[1 - k] || bears(indices[1 - k]!) && reading.upright >= KNEEL_UP && ahead(1 - k, k))) {
      reading.side = feet[1 - k]!.side;
      return "half-kneel";
    }
    if (bears(shank[0]!) && bears(shank[1]!)) {
      if (reading.upright >= KNEEL_UP && only(allowed.kneeling)) return "kneeling";
      if (hands.every(side => side.some(bearsHolding)) && only(allowed.fours)) return "fours";
    }
    if (bears(trunk[0]!) && work.upper.y - work.lower.y >= SITTING && only(allowed.sitting)) return "sitting";
    if (trunk.some(bears)) {
      if (reading.lie === "left" || reading.lie === "right") reading.side = reading.lie;
      return reading.lie;
    }
    return "between";
  };
  const fixed = (other: unknown) => other === null;
  return {
    state,
    reset() { state.steps = 0; state.candidate = "between"; reading.position = "between"; reading.settled = false; },
    read(): GroundReading {
      reading.load.fill(0); heldLoad.fill(0);
      for (let i = 0; i < parts.length; i++) {
        for (const contact of built.physics.contactsOf(parts[i]!.body, fixed)) {
          if (contact.fixed === null) continue;
          for (const pair of contact.pairs) if (-pair.normal[1] >= GROUND_UP && pair.impulse > 0 && weight > 0)
            (shapeIsBody[i]![pair.mine] ? reading.load : heldLoad)[i] += pair.impulse * -pair.normal[1] / (dt * weight);
        }
      }
      for (let i = 0; i < feet.length; i++) {
        const foot = feet[i]!;
        soleMiddleToRef(foot, foot.middle);
        reading.sole[i] = feetUp[i]!.applyRotationQuaternionToRef(foot.segment.node.rotationQuaternion!, work.vector).y;
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
      reading.onFeet = (bears(indices[0]!) || bears(indices[1]!)) && only(allowed.crouch);
      massCentreToRef(parts, mass, reading.centre, work.vector, reading.velocity);
      reading.height = low.height() / low.standing;
      centreOfToRef(upper, work.upper); centreOfToRef(root, work.lower);
      work.upper.subtractToRef(work.lower, work.vector);
      const length = work.vector.length();
      reading.upright = length > 0 ? work.vector.y / length : 0;
      reading.spin = root.body.angularVelocityToRef(work.vector).length();
      reading.lie = lieOf(root, work);
      reading.side = null;
      reading.raw = classify();
      if (state.candidate === reading.raw) state.steps = Math.min(SETTLE_STEPS, state.steps + 1);
      else { state.candidate = reading.raw; state.steps = 1; }
      if (state.steps >= SETTLE_STEPS) { reading.position = reading.raw; reading.settled = true; }
      return reading;
    },
  };
}

/** Whether the body is tumbling: its centre of mass faster than `TUMBLING`, or its pelvis spinning faster than `TUMBLING_SPIN`. */
export function tumbling(g: GroundReading): boolean {
  return g.velocity.lengthSquared() > TUMBLING * TUMBLING || g.spin > TUMBLING_SPIN;
}

/** Quiet, flat two-foot support with the mass inside its inset outline is ready for the host. */
export function standReady(view: { readonly down: boolean; readonly ground: GroundReading | null }): boolean {
  return !view.down && view.ground?.position === "standing" && quietOnFeet(view.ground);
}

/**
 * Quiet on both feet at any height, down or not: both soles flat and bearing nearly all the weight,
 * slow, little spin, and the centre of mass inside the soles' inset outline.
 */
export function quietOnFeet(g: GroundReading): boolean {
  if (!g.flat[0] || !g.flat[1]
    || g.footLoad[0]! + g.footLoad[1]! < HAND_BACK_LOAD || g.velocity.lengthSquared() >= SLOW * SLOW || g.spin >= SPIN) return false;
  const [x, z] = withinSupport(g.soles, g.centre.x, g.centre.z);
  return x === g.centre.x && z === g.centre.z;
}
