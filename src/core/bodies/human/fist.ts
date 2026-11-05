import { Quaternion, Vector3 } from "../../math/vector.ts";
import type { WorkshopModel } from "./rig.ts";
import { deepFreeze } from "../../world/state.ts";

/**
 * **The fist, built from the hand's own geometry.** Each finger bone's
 * own axes are no guide to one: from the index to the pinky the bones' x axes fan through 30
 * degrees, so fingers curled about their own axes sweep sideways across each other.
 *
 * So the fist is built in the hand bone's frame. The palm's plane holds the wrist-to-middle-knuckle
 * line (`forward`) and the knuckle line; `palmar` is its normal on the side the relaxed fingers
 * curl toward, and every finger flexes about the one axis across them, `forward x palmar`. Each
 * phalanx is first swung into its finger's flexion plane (the fingers close side by side, none
 * bending sideways), then turned to its absolute angle from `forward`: the knuckle's, the
 * knuckle's and the middle joint's, then all three. The thumb's phalanges are aimed at directions
 * given in the palm's axes (`forward`, `palmar`, and `radial` toward the thumb, so a left hand
 * mirrors a right one) and keep their own twist, swung the least way there.
 *
 * Authoring supplies its real-number functions so the asset and renderer use identical arithmetic.
 * Everything here is pure: rest transforms in, each bone's turn out, applied on its rest local
 * rotation (`rest * turn`), as `skin.ts` composes a grip.
 */

/** A bone's rest transform relative to its parent, as the asset authors it. */
export interface RestBone {
  readonly parent: string;
  readonly rotation: { readonly x: number; readonly y: number; readonly z: number; readonly w: number };
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
}

/** Joint angles of a finger's fist, degrees: knuckle (MCP), middle joint (PIP), end joint (DIP). */
interface FingerFist {
  readonly mcp: number;
  readonly pip: number;
  readonly dip: number;
}

/** A direction in the palm's axes. */
interface PalmDirection {
  readonly forward: number;
  readonly palmar: number;
  readonly radial: number;
}

export interface FistPose {
  readonly fingers: Readonly<Record<"index" | "middle" | "ring" | "pinky", FingerFist>>;
  /** Each thumb phalanx's direction, proximal first. */
  readonly thumb: readonly [PalmDirection, PalmDirection, PalmDirection];
}

/**
 * **The fist**, built by `fistTurns` from each hand's geometry: finger angles are the joints' flexion
 * from a straight finger, degrees, and the thumb's phalanges point along the palm's axes. Fitted
 * on the skin by `scripts/lab/fist-fit.mjs` (its header gives the rule), one pose for both
 * hands: every knuckle at one angle, each middle joint as far closed as it goes, the thumb across
 * the index and middle fingers. The fit leaves no part deeper in another than 2 mm or than the
 * relaxed hand already is, except the thumb's first phalanx in the ball of the thumb.
 */
export const FIST: Readonly<Record<WorkshopModel, FistPose>> = deepFreeze({
  "workshop-fighter": {
    fingers: {
      index: { mcp: 65, pip: 85, dip: 55.3 },
      middle: { mcp: 65, pip: 95, dip: 61.8 },
      ring: { mcp: 65, pip: 80, dip: 52 },
      pinky: { mcp: 65, pip: 75, dip: 48.8 },
    },
    thumb: [
      { forward: 0.439, palmar: 0.714, radial: 0.546 },
      { forward: 0.522, palmar: 0.691, radial: -0.501 },
      { forward: 0.688, palmar: 0.007, radial: -0.726 },
    ],
  },
  "workshop-rogue": {
    fingers: {
      index: { mcp: 65, pip: 80, dip: 52 },
      middle: { mcp: 65, pip: 95, dip: 61.8 },
      ring: { mcp: 65, pip: 75, dip: 48.8 },
      pinky: { mcp: 65, pip: 65, dip: 42.3 },
    },
    thumb: [
      { forward: 0.429, palmar: 0.766, radial: 0.479 },
      { forward: 0.492, palmar: 0.691, radial: -0.53 },
      { forward: 0.844, palmar: -0.152, radial: -0.514 },
    ],
  },
});

const FINGERS = ["index", "middle", "ring", "pinky"] as const;
const UP = new Vector3(0, 1, 0);

/** The palm's axes in the hand bone's frame. */
interface PalmFrame {
  readonly forward: Vector3;
  readonly palmar: Vector3;
  readonly radial: Vector3;
  /** The flexion axis, `forward x palmar`: turning `forward` about it by +90 degrees gives `palmar`. */
  readonly flexion: Vector3;
}

/** Degrees to radians: a numeric setting for the authored pose's angle unit. */
const DEG = Math.PI / 180;

/** Rest orientation (in the hand's frame) and head position of every bone under `hand`. */
type CoreRestBone = { readonly parent: string; readonly rotation: Quaternion; readonly position: Vector3 };
function handSpace(bones: ReadonlyMap<string, CoreRestBone>, hand: string) {
  const orientation = new Map<string, Quaternion>([[hand, Quaternion.Identity()]]);
  const head = new Map<string, Vector3>([[hand, new Vector3()]]);
  const resolve = (name: string): void => {
    if (orientation.has(name)) return;
    const bone = bones.get(name)!;
    resolve(bone.parent);
    const parent = orientation.get(bone.parent)!;
    orientation.set(name, parent.multiply(bone.rotation));
    head.set(name, head.get(bone.parent)!.add(turned(bone.position, parent)));
  };
  for (const name of bones.keys()) if (name !== hand) resolve(name);
  return { orientation, head };
}

/** The palm's frame of `side`'s hand (`"r"` or `"l"`). */
function palmFrame(bones: ReadonlyMap<string, CoreRestBone>, side: "r" | "l"): PalmFrame {
  const { orientation, head } = handSpace(bones, `hand_${side}`);
  const knuckle = (finger: string) => head.get(`${finger}_01_${side}`)!;
  const forward = knuckle("middle").normalizeToRef(new Vector3());
  const across = knuckle("index").subtract(knuckle("pinky"));
  let palmar = Vector3.Cross(forward, across).normalize();
  // The relaxed fingers curl palmar: the end phalanx points further toward the palm than the first.
  const toward = (name: string) => Vector3.Dot(turned(UP, orientation.get(name)!), palmar);
  if (toward(`middle_03_${side}`) < toward(`middle_01_${side}`)) palmar = palmar.scale(-1);
  const flexion = Vector3.Cross(forward, palmar).normalize();
  const radial = Vector3.Dot(flexion, across) > 0 ? flexion : flexion.scale(-1);
  return { forward, palmar, radial, flexion };
}

/** The rotation taking unit `from` to unit `to` the shortest way. */
type AuthoringMath = { readonly atan2: (y: number, x: number) => number; readonly sin: (angle: number) => number; readonly cos: (angle: number) => number };

const turned = (v: Vector3, q: Quaternion): Vector3 => v.applyRotationQuaternionToRef(q, new Vector3());

function axisTurn(axis: Vector3, angle: number, math: AuthoringMath): Quaternion {
  const w = math.cos(angle / 2), byLength = math.sin(angle / 2) / axis.length();
  return new Quaternion(axis.x * byLength, axis.y * byLength, axis.z * byLength, w);
}

function swing(from: Vector3, to: Vector3, math: AuthoringMath): Quaternion {
  const axis = Vector3.Cross(from, to), sin = axis.length(), cos = Vector3.Dot(from, to);
  if (sin < 1e-9) return Quaternion.Identity();
  return axisTurn(axis.scaleInPlace(1 / sin), math.atan2(sin, cos), math);
}

/**
 * Each finger and thumb bone's turn in `pose`, on its rest local rotation. `bones` holds the rest
 * transforms of `hand_{side}` and every bone under it.
 */
export function fistTurns(given: ReadonlyMap<string, RestBone>, side: "r" | "l", pose: FistPose, math: AuthoringMath): Map<string, Quaternion> {
  const bones = new Map<string, CoreRestBone>([...given].map(([name, bone]) => [name, { parent: bone.parent, rotation: new Quaternion(bone.rotation.x, bone.rotation.y, bone.rotation.z, bone.rotation.w), position: new Vector3(bone.position.x, bone.position.y, bone.position.z) }]));
  const { orientation } = handSpace(bones, `hand_${side}`);
  const palm = palmFrame(bones, side);
  const target = new Map<string, Quaternion>([[`hand_${side}`, Quaternion.Identity()]]);
  const direction = (q: Quaternion) => turned(UP, q);

  for (const finger of FINGERS) {
    const names = [1, 2, 3].map((joint) => `${finger}_0${joint}_${side}`);
    const { mcp, pip, dip } = pose.fingers[finger];
    const angles = [mcp, mcp + pip, mcp + pip + dip];
    names.forEach((name, k) => {
      // Close the splay: swing the phalanx into the flexion plane, keeping its twist.
      const splayed = direction(orientation.get(name)!);
      const inPlane = splayed.subtract(palm.flexion.scale(Vector3.Dot(splayed, palm.flexion))).normalize();
      const rest = swing(splayed, inPlane, math).multiply(orientation.get(name)!);
      const d = direction(rest);
      const now = math.atan2(Vector3.Dot(d, palm.palmar), Vector3.Dot(d, palm.forward));
      target.set(name, axisTurn(palm.flexion, angles[k]! * DEG - now, math).multiply(rest));
    });
  }
  pose.thumb.forEach((aim, k) => {
    const name = `thumb_0${k + 1}_${side}`, rest = orientation.get(name)!;
    const to = palm.forward.scale(aim.forward).addInPlace(palm.palmar.scale(aim.palmar))
      .addInPlace(palm.radial.scale(aim.radial)).normalize();
    target.set(name, swing(direction(rest), to, math).multiply(rest));
  });

  const turns = new Map<string, Quaternion>();
  for (const [name, achieved] of target) {
    if (name === `hand_${side}`) continue;
    const bone = bones.get(name)!;
    const local = Quaternion.Inverse(target.get(bone.parent)!).multiply(achieved);
    turns.set(name, Quaternion.Inverse(bone.rotation).multiply(local));
  }
  return turns;
}
