import bind from "../../../assets/skeleton/bind.json" with { type: "json" };
import bones from "../../../assets/skeleton/bones.json" with { type: "json" };
import { derive, sourced, type Quantity, type Vec3 } from "../spec/quantity.ts";
import { add, midpoint, normalize, scale, sub } from "../spec/vec.ts";
import type { Extents } from "./envelope.ts";
import type { FittedSegment, HandFigure, HumanFigure, LimbFigure } from "./figure.ts";
import { HUMAN_HASTE } from "./attributes.ts";
import { dividedTrunk } from "./landmarks.ts";
import type { BodySpec, ForceVelocitySpec, MuscleSpec, Side } from "../spec/body.ts";

/**
 * **The crypt skeleton as a human figure, fitted to its bones.** Its art is Blender Studio's
 * realistic human skeleton (`public/assets/skeleton/README.md`), whose pieces ride the parts whose
 * places `assets/skeleton/bind.json` holds (the fist build: each part's position and turn, body
 * frame at x1, and its box in its own frame). Its reference pose is that bind: standing, the
 * elbows bent at a right angle with the forearms forward and the fists thumb up, so each piece of
 * the art rides its segment exactly (`src/render/skeleton-skin.ts`).
 *
 * - **Joint centres** are the parts' ends, along each part's y: the thigh's top the hip, its bottom
 *   the knee, the shank's bottom the ankle; the upper arm's top the shoulder, its bottom the elbow;
 *   the forearm and its roll ring the forearm, whose far end is the wrist; the wrist link the palm,
 *   whose far end is the knuckles; and the fist the fingers, whose far side ends the hand's line. The
 *   fist box is a cube, so the little finger's knuckle, where a grip ends (`grip.ts`), is its
 *   half-width from the middle one toward the little finger. The neck's bottom is the cervicale and
 *   the head box's top the vertex. The trunk is divided at de Leva's trunk landmarks.
 * - **The body is its bones** (`skeleton-bones`, `scripts/skeleton/bone-fit.mjs`): each segment's
 *   centre of mass and inertia are its bones' solid's (`HumanFigure.fitted`), with men's share of
 *   the mass, which the walk carries (`docs/art/skeleton.md#the-body-fitted-to-the-bones`); its
 *   collider the low-polygon hull of its bones (the trunk's the ribcage with the
 *   shoulder girdle, the lumbar spine and the pelvis; the head's the skull and the neck), but a
 *   shank, a capsule as wide as its bones (`HULLED`); a foot the box on its bones, running from
 *   their back to their front at their middle; a hand, open or closed, the hull of the closed hand
 *   the art always shows, and for a grip a capsule as wide as its bones.
 * - **It weighs 15 kg** (`owner-skeleton-body`), and its muscle is that mass's at men's shares.
 * - **What the bones do not give** is a placeholder (`skeleton-placeholders`): men's tables for its
 *   muscle and joints, the Warrior's hit points and balance, and the fists thumb up, which the
 *   bind's guard shows but no number states.
 *
 * Posture angles are measured from a body's reference pose, so a posture written for the humans
 * (`GUARD`) bends the skeleton's elbows past its stop from here. A posture written from each
 * freedom's own zero (`DofSpec.bind`; a rise's stages, `src/core/recovery/rise/stages.ts`) is the same
 * shape on both.
 */
export const SKELETON_MODEL = "crypt-skeleton";

interface BindPart {
  readonly build: string;
  readonly id: string;
  readonly position: readonly number[];
  readonly rotation: readonly number[];
  readonly min: readonly number[];
  readonly max: readonly number[];
}
const PARTS = bind as readonly BindPart[];
const BUILD = "fist/fist", PREFIX = "left.golem.";

interface Part {
  readonly key: string;
  readonly position: Quantity<Vec3>;
  /** The part's turn, x, y, z, w. */
  readonly rotation: readonly Quantity<number>[];
  readonly min: readonly Quantity<number>[];
  readonly max: readonly Quantity<number>[];
}

const leaf = (i: number, field: string, k: number, unit: "m" | "1"): Quantity<number> =>
  sourced(PARTS[i]![field as "position"]![k]!, unit, "skeleton-bind", `/${i}/${field}/${k}`);

function part(key: string): Part {
  const i = PARTS.findIndex((p) => p.build === BUILD && p.id === PREFIX + key);
  if (i < 0) throw new Error(`the skeleton's bind has no ${key}`);
  const [x, y, z] = [0, 1, 2].map((k) => leaf(i, "position", k, "m"));
  return {
    key,
    position: derive("m", `${key}'s position`, [x!, y!, z!], (a, b, c) => [a, b, c]),
    rotation: [0, 1, 2, 3].map((k) => leaf(i, "rotation", k, "1")),
    min: [0, 1, 2].map((k) => leaf(i, "min", k, "m")),
    max: [0, 1, 2].map((k) => leaf(i, "max", k, "m")),
  };
}

/** `v` turned by the unit quaternion (x, y, z, w): v + 2w (q x v) + 2 q x (q x v). */
function turn(q: readonly number[], v: Vec3): Vec3 {
  const [x, y, z, w] = q as [number, number, number, number];
  const cx = y * v[2] - z * v[1], cy = z * v[0] - x * v[2], cz = x * v[1] - y * v[0];
  return [
    v[0] + 2 * (w * cx + y * cz - z * cy),
    v[1] + 2 * (w * cy + z * cx - x * cz),
    v[2] + 2 * (w * cz + x * cy - y * cx),
  ];
}

/** A part's end along its own y: +1 the end its y points to, -1 the other. */
function end(p: Part, sign: 1 | -1, what: string): Quantity<Vec3> {
  return derive("m", `${what}: ${p.key}'s ${sign > 0 ? "+y" : "-y"} end, its position plus its turn of its box's ${sign > 0 ? "max" : "min"} y`,
    [p.position, p.rotation[0]!, p.rotation[1]!, p.rotation[2]!, p.rotation[3]!, sign > 0 ? p.max[1]! : p.min[1]!], (position, x, y, z, w, length) =>
      add(position, turn([x, y, z, w], [0, length, 0])));
}

/** A number of the bones' measure, at its JSON pointer. */
const measured = <V extends number | Vec3>(value: V, unit: "m" | "m2", where: string): Quantity<V> =>
  sourced(value, unit, "skeleton-bones", where);
const vector = (v: readonly number[]): Vec3 => [v[0]!, v[1]!, v[2]!];
const corners = (points: readonly (readonly number[])[], at: string) => points.map((p, i) => measured(vector(p), "m", `${at}/${i}`));

type SegmentFile = { readonly centroid: readonly number[]; readonly hull: readonly (readonly number[])[];
  readonly spread: { readonly diagonal: readonly number[]; readonly off: readonly number[] } };
const SEGMENTS = bones.segments as Readonly<Record<string, SegmentFile>>;

/**
 * The segments whose collider is their bones' hull in place of the body plan's capsule. A hand's
 * and a shank's stay capsules as wide as their bones: a grip seats against the one, and a knee
 * bears on the other's end (`src/core/recovery/rise/stages.ts`).
 */
const HULLED = new Set(["head", ...(["left", "right"] as const).flatMap((side) => ["upperArm", "forearm", "thigh"].map((row) => `${row}.${side}`))]);

function fittedSegment(name: string): FittedSegment {
  const file = SEGMENTS[name];
  if (!file) throw new Error(`the skeleton's bones have no ${name}`);
  const at = `/segments/${name}`;
  return {
    centroid: measured(vector(file.centroid), "m", `${at}/centroid`),
    spread: { diagonal: measured(vector(file.spread.diagonal), "m2", `${at}/spread/diagonal`), off: measured(vector(file.spread.off), "m2", `${at}/spread/off`) },
    ...(HULLED.has(name) && { hull: corners(file.hull, `${at}/hull`) }),
  };
}

/** A foot's bones' extents, body frame. */
function footExtents(side: Side): Extents {
  const { min, max } = bones.feet[side], at = `/feet/${side}`;
  const axis = (k: 0 | 1 | 2) => ({ min: measured(min[k]!, "m", `${at}/min/${k}`), max: measured(max[k]!, "m", `${at}/max/${k}`) });
  return { x: axis(0), y: axis(1), z: axis(2) };
}

/** A hand's measure: the closed hand's hull, open or a fist, where it bears and where it strikes. */
function hand(side: Side): HandFigure {
  const file = bones.hands[side], at = `/hands/${side}`, hull = corners(file.hull, `${at}/hull`);
  return { palm: { hull, centre: measured(vector(file.palm), "m", `${at}/palm`) }, fist: { hull, strike: measured(vector(file.strike), "m", `${at}/strike`) } };
}

const placeholder = <V extends number | Vec3>(value: V, unit: "HP" | "1" | "%", where: string): Quantity<V> =>
  sourced(value, unit, "skeleton-placeholders", where);

function limb(side: Side, feet: Extents): LimbFigure {
  const legs = side === "left" ? "L" : "R", arm = side === "right" ? "primary" : "secondary";
  const thigh = part(`legs.thigh${legs}`), shin = part(`legs.shin${legs}`);
  const upperArm = part(`${arm}.upperArm`), rollRing = part(`${arm}.rollRing`), wrist = part(`${arm}.wrist`), fist = part(`${arm}.fist`);
  const WJC = end(rollRing, -1, "WJC"), MET3 = end(wrist, -1, "MET3");
  // Thumb up: toward the thumb on the right hand, toward the little finger (down) on the left.
  const handRight = placeholder<Vec3>(side === "right" ? [0, 1, 0] : [0, -1, 0], "1", `the ${side} fist thumb up, as the bind's guard holds it`);
  const footEnd = (front: boolean, what: string) => derive("m", `${what}: the foot bones' box, its middle across and up, its ${front ? "front" : "back"}`,
    [feet.x.min, feet.x.max, feet.y.min, feet.y.max, front ? feet.z.max : feet.z.min],
    (x0, x1, y0, y1, z) => [(x0 + x1) / 2, (y0 + y1) / 2, z]);
  return {
    HJC: end(thigh, 1, "HJC"),
    KJC: end(thigh, -1, "KJC"),
    AJC: end(shin, -1, "AJC"),
    SJC: end(upperArm, 1, "SJC"),
    EJC: end(upperArm, -1, "EJC"),
    WJC,
    MET3,
    DAC3: derive("m", `DAC3: ${fist.key}'s far side, its centre on along the hand's line by half its box`,
      [fist.position, fist.max[1]!, WJC, MET3], (at, half, w, k) => add(at, scale(normalize(sub(k, w)), half))),
    HEEL: footEnd(false, "HEEL"),
    TTIP: footEnd(true, "TTIP"),
    handRight,
    little: side === "right"
      ? derive("m", `the little finger's knuckle: ${fist.key}'s half-width from the middle knuckle, against the hand's right`,
        [MET3, handRight, fist.max[0]!], (k, r, half) => sub(k, scale(r, half)))
      : derive("m", `the little finger's knuckle: ${fist.key}'s half-width from the middle knuckle, along the hand's right`,
        [MET3, handRight, fist.max[0]!], (k, r, half) => add(k, scale(r, half))),
  };
}

/** **The crypt skeleton's figure**, at x1: the bind and the bones are authored at the game's size. */
export function skeletonFigure(): HumanFigure {
  const neck = part("head.neck"), head = part("head.head");
  const CERV = end(neck, -1, "CERV"), VERT = end(head, 1, "VERT");
  const feet = { left: footExtents("left"), right: footExtents("right") };
  const limbs = { left: limb("left", feet.left), right: limb("right", feet.right) };
  const MIDH = derive("m", "MIDH: between the hip joint centres", [limbs.left.HJC, limbs.right.HJC], (l, r) => midpoint(l, r));
  const trunk = dividedTrunk("male", VERT, CERV, MIDH);
  const fitted = Object.fromEntries(Object.keys(SEGMENTS).map((name) => [name, fittedSegment(name)]));
  const trunkHull = (name: string) => corners(SEGMENTS[name]!.hull, `/segments/${name}/hull`);
  return {
    model: SKELETON_MODEL, substance: "bone", sex: "male",
    mass: sourced(15, "kg", "owner-skeleton-body", "the skeleton's mass"),
    stature: derive("m", "the vertex's height over the soles", [VERT], (v) => v[1]),
    trunk, limbs,
    hulls: { upper: trunkHull("upperTrunk"), middle: trunkHull("middleTrunk"), lower: trunkHull("lowerTrunk") },
    feet,
    hands: { left: hand("left"), right: hand("right") },
    fitted,
    hp: placeholder(6, "HP", "the Warrior's hit points"),
    balance: placeholder(0, "%", "the Warrior's balance"), haste: HUMAN_HASTE,
  };
}

/** How a motor's torque falls with speed: Hill's a / T0 so large the curve is the straight line 1 - w / w0 within a thousandth. */
const MOTOR_CURVATURE = sourced(1000, "1", "owner-skeleton-motor", "the motor's torque falling in a straight line with speed");
/** A motor holds no more torque while it is turned back than at rest. */
const MOTOR_ECCENTRIC_CEILING = sourced(1, "1", "owner-skeleton-motor", "no more torque turned back than at rest");

/**
 * **The skeleton's joints as motors** (`owner-skeleton-motor`): each freedom of `spec` pushes as
 * hard and as fast either way, at its stronger side's peak and its more powerful side's speed; its
 * torque falls in a straight line with speed, as an electric motor's does, where a muscle's falls
 * along Hill's hyperbola; it holds no more turned back than at rest; and it has no tendon.
 *
 * A side's motor gives the muscle's peak power (`samePower`). Kept at the muscle's unloaded speed,
 * the straight line would give over twice that power and fall off far more slowly with speed, and
 * the stance rocks on it.
 */
export function skeletonMotors(spec: BodySpec): BodySpec {
  const joints = spec.joints.map((joint) => ({ ...joint, dofs: joint.dofs.map((dof) => {
    const { peakPositive, peakNegative, speedPositive, speedNegative } = dof.muscle;
    const peak = derive("N m", "the stronger side's peak, either way", [peakPositive, peakNegative], Math.max);
    const speed: ForceVelocitySpec = {
      unloadedSpeed: derive("rad/s", "the more powerful side's motor speed, either way",
        [samePower(speedPositive), samePower(speedNegative)], Math.max),
      curvature: MOTOR_CURVATURE, eccentricCeiling: MOTOR_ECCENTRIC_CEILING, eccentricSlopeRatio: speedPositive.eccentricSlopeRatio,
    };
    const muscle: MuscleSpec = { peakPositive: peak, peakNegative: peak, speedPositive: speed, speedNegative: speed };
    return { ...dof, muscle };
  }) }));
  return { ...spec, joints };
}

/**
 * The unloaded speed at which a straight line gives the peak power of `curve`'s Hill curve, rad/s.
 * Hill's power over T0 w0 is r (1 - r) / (1 + r / k), greatest at r = sqrt(k^2 + k) - k; a straight
 * line's is a quarter at half its unloaded speed.
 */
function samePower(curve: ForceVelocitySpec): Quantity<number> {
  return derive("rad/s", "a straight line's unloaded speed for Hill's peak power", [curve.unloadedSpeed, curve.curvature], (w0, k) => {
    const r = Math.sqrt(k * k + k) - k;
    return 4 * w0 * r * (1 - r) / (1 + r / k);
  });
}
