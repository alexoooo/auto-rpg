import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BuiltBody } from "../../build/build-body.ts";
import { uprightness } from "../../control/ground.ts";
import { centreOfToRef, footStatesOf, massCentreToRef, massOf, soleMiddleToRef, withinSupport } from "../../control/support.ts";
import type { Side } from "../../spec/body.ts";
import { lieOf } from "../rise/staged.ts";
import type { Lie } from "../rise/stages.ts";

/** The body's contact configuration, named only from its present physical readings. */
type Position = "standing" | "crouch" | "half-kneel" | "kneeling" | "fours" | "sitting" | Lie | "between";

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
  side: Side | null;
}

/** A contact bears at three per cent of body weight; shallow wall contacts give no support. */
const BEARS = 0.03, GROUND_UP = 0.7;
/** A flat sole's normal stays within this cosine of vertical. */
const FLAT = 0.9;
/** Standing has at least this share of reference height; kneeling keeps its trunk near vertical. */
const STANDING = 0.85, KNEEL_UP = 0.83;
/** A sitting trunk raises its upper centre this far over its pelvis, metres. */
const SITTING = 0.15;
/** Six consecutive readings settle a label; physical facts never wait for it. */
const SETTLE_STEPS = 6;
/** Quiet hand-back needs nearly all weight on the feet, small linear speed, and little spin. */
const HAND_BACK_LOAD = 0.9, SLOW = 0.3, SPIN = 1;

/** Read fixed support and body geometry once per step. Reset between periods of ground ownership. */
export function groundReading(built: BuiltBody, dt: number) {
  if (!(dt > 0 && Number.isFinite(dt))) throw new Error("a ground reading needs a positive step time");
  const parts = built.spec.segments.map(s => built.segments.get(s.name)!);
  const feet = footStatesOf(built), indices = feet.map(f => parts.indexOf(f.segment));
  const mass = massOf(parts), weight = mass * -built.physics.gravity[1];
  const shapeIsBody = parts.map(p => p.rigid.owners.map(o => o.kind !== "held"));
  const low = uprightness(built), root = built.segments.get("lowerTrunk")!, upper = built.segments.get("upperTrunk")!;
  const feetUp = feet.map(f => Vector3.UpReadOnly.applyRotationQuaternionToRef(Quaternion.Inverse(f.segment.rest), new Vector3()));
  const reading: GroundReading = {
    load: new Float64Array(parts.length), sole: new Float64Array(2), flat: new Uint8Array(2), footLoad: new Float64Array(2),
    soles: feet.map(f => ({ corners: f.corners })), centre: new Vector3(), velocity: new Vector3(),
    lie: "front", height: 0, upright: 0, spin: 0, raw: "between", position: "between", side: null,
  };
  const state = { reading, candidate: "between" as Position, steps: 0 };
  const work = { vector: new Vector3(), upper: new Vector3(), lower: new Vector3(), turn: new Quaternion(), way: new Vector3() };
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
  const only = (admitted: ReadonlySet<number>) => {
    for (let i = 0; i < parts.length; i++) if (bears(i) && !admitted.has(i)) return false;
    return true;
  };
  const classify = (): Position => {
    if (bears(indices[0]!) && bears(indices[1]!)) {
      if (reading.flat[0] && reading.flat[1] && reading.height >= STANDING && only(allowed.standing)) return "standing";
      if (only(allowed.crouch)) return "crouch";
    }
    for (let k = 0; k < 2; k++) if (bears(shank[k]!) && reading.flat[1 - k] && only(allowed.half[k]!)) {
      reading.side = feet[1 - k]!.side;
      return "half-kneel";
    }
    if (bears(shank[0]!) && bears(shank[1]!)) {
      if (reading.upright >= KNEEL_UP && only(allowed.kneeling)) return "kneeling";
      if (hands.every(side => side.some(bears)) && only(allowed.fours)) return "fours";
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
    reset() { state.steps = 0; state.candidate = "between"; reading.position = "between"; },
    read(): GroundReading {
      reading.load.fill(0);
      for (let i = 0; i < parts.length; i++) {
        for (const contact of built.physics.contactsOf(parts[i]!.body, fixed)) {
          if (contact.fixed === null) continue;
          for (const pair of contact.pairs) if (shapeIsBody[i]![pair.mine] && -pair.normal[1] >= GROUND_UP && pair.impulse > 0 && weight > 0)
            reading.load[i] += pair.impulse * -pair.normal[1] / (dt * weight);
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
      if (state.steps >= SETTLE_STEPS) reading.position = reading.raw;
      return reading;
    },
  };
}

/** Quiet, flat two-foot support with the mass inside its inset outline is ready for the host. */
export function standReady(view: { readonly down: boolean; readonly ground: GroundReading | null }): boolean {
  const g = view.ground;
  if (!g || view.down || g.position !== "standing" || !g.flat[0] || !g.flat[1]
    || g.footLoad[0]! + g.footLoad[1]! < HAND_BACK_LOAD || g.velocity.lengthSquared() >= SLOW * SLOW || g.spin >= SPIN) return false;
  const [x, z] = withinSupport(g.soles, g.centre.x, g.centre.z);
  return x === g.centre.x && z === g.centre.z;
}
