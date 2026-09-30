import bind from "../../../assets/skeleton/bind.json" with { type: "json" };
import { derive, sourced, type Quantity, type Vec3 } from "../spec/quantity.ts";
import { add, midpoint, normalize, scale, sub } from "../spec/vec.ts";
import type { Extent, Extents, TrunkSegment } from "./envelope.ts";
import type { HumanFigure, LimbFigure } from "./figure.ts";
import { dividedTrunk, type Side } from "./landmarks.ts";

/**
 * **The crypt skeleton as a human figure.** Its shape is its art's: Blender Studio's realistic
 * human skeleton (`public/assets/skeleton/README.md`), fitted onto a set of box parts whose places
 * `assets/skeleton/bind.json` holds (the fist build: each part's position and turn, body frame at
 * x1, and its box in its own frame). Its reference pose is that bind: standing, the
 * elbows bent at a right angle with the forearms forward and the fists thumb up, so each piece of
 * the art rides its segment exactly (`src/render/skeleton-skin.ts`).
 *
 * - **Joint centres** are the parts' ends, along each part's y: the thigh's top the hip, its bottom
 *   the knee, the shank's bottom the ankle; the upper arm's top the shoulder, its bottom the elbow;
 *   the forearm and its roll ring the forearm, whose far end is the wrist; the wrist link the palm,
 *   whose far end is the knuckles; and the fist the fingers, whose far side ends the hand. The fist
 *   is a cube, so the little finger's knuckle, where a grip ends (`grip.ts`), is its half-width from
 *   the middle one toward the little finger. The neck's bottom is the cervicale and the head box's
 *   top the vertex.
 * - **The trunk** is the bind's trunk boxes (the core and the pelvis), sliced at de Leva's trunk
 *   landmarks: each segment the hull of the boxes' corners within its span.
 * - **The feet** are the foot boxes; a foot runs from its box's back to its front, at its middle.
 * - **What the art does not give** is a placeholder (`skeleton-placeholders`): a typical man in the
 *   skeleton's shape, with men's tables, the typical man's mass and the Warrior's hit points; and
 *   the fists thumb up, which the bind's guard shows but no number states.
 *
 * Posture angles are measured from a body's reference pose, so a posture written for the humans
 * (`GUARD`) bends the skeleton's elbows past its stop from here.
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

/** A box part's corner, body frame: its turn is none, which the bind's boxes hold (checked below). */
function unturned(p: Part): Part {
  const [x, y, z, w] = p.rotation.map((q) => q.value);
  if (x !== 0 || y !== 0 || z !== 0 || w !== 1) throw new Error(`${p.key} is turned in the bind; its box is not the body frame's`);
  return p;
}

function boxExtents(p: Part, what: string): Extents {
  const axis = (k: 0 | 1 | 2, name: string): Extent => ({
    min: derive("m", `${what}: ${p.key}'s ${name} min, its position plus its box's`, [p.position, p.min[k]!], (at, m) => at[k] + m),
    max: derive("m", `${what}: ${p.key}'s ${name} max, its position plus its box's`, [p.position, p.max[k]!], (at, m) => at[k] + m),
  });
  unturned(p);
  return { x: axis(0, "x"), y: axis(1, "y"), z: axis(2, "z") };
}

/** The corners of the trunk boxes that lie between `below` and `above` (either may be absent: unbounded). */
function slice(boxes: readonly Part[], name: TrunkSegment, below?: Quantity<Vec3>, above?: Quantity<Vec3>): Quantity<Vec3>[] {
  const corners: Quantity<Vec3>[] = [];
  for (const box of boxes.map(unturned)) {
    const bounds = [below, above].filter((q): q is Quantity<Vec3> => q !== undefined);
    const bottom = box.position.value[1] + box.min[1]!.value, top = box.position.value[1] + box.max[1]!.value;
    const lo = Math.max(bottom, below?.value[1] ?? -Infinity), hi = Math.min(top, above?.value[1] ?? Infinity);
    if (!(hi > lo)) continue;
    for (const height of ["low", "high"] as const) {
      for (const [sx, sz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]] as const) {
        corners.push(derive("m", `the ${name} trunk's corner: ${box.key}'s box, ${sx < 0 ? "left" : "right"} ${sz < 0 ? "back" : "front"}, `
          + `${height === "low" ? "at its bottom or the segment's lower landmark, whichever is higher" : "at its top or the segment's upper landmark, whichever is lower"}`,
        [box.position, box.min[0]!, box.max[0]!, box.min[1]!, box.max[1]!, box.min[2]!, box.max[2]!, ...bounds],
        (at, x0, x1, y0, y1, z0, z1, ...landmarks) => {
          const lower = below ? landmarks[0]![1] : -Infinity, upper = above ? landmarks[landmarks.length - 1]![1] : Infinity;
          const y = height === "low" ? Math.max(at[1] + y0, lower) : Math.min(at[1] + y1, upper);
          return [at[0] + (sx < 0 ? x0 : x1), y, at[2] + (sz < 0 ? z0 : z1)];
        }));
      }
    }
  }
  if (corners.length === 0) throw new Error(`the skeleton's ${name} trunk holds no box`);
  return corners;
}

const placeholder = <V extends number | Vec3>(value: V, unit: "kg" | "m" | "HP" | "1", where: string): Quantity<V> =>
  sourced(value, unit, "skeleton-placeholders", where);

function limb(side: Side): LimbFigure {
  const legs = side === "left" ? "L" : "R", arm = side === "right" ? "primary" : "secondary";
  const thigh = part(`legs.thigh${legs}`), shin = part(`legs.shin${legs}`), foot = unturned(part(`legs.foot${legs}`));
  const upperArm = part(`${arm}.upperArm`), rollRing = part(`${arm}.rollRing`), wrist = part(`${arm}.wrist`), fist = part(`${arm}.fist`);
  const WJC = end(rollRing, -1, "WJC"), MET3 = end(wrist, -1, "MET3");
  // Thumb up: toward the thumb on the right hand, toward the little finger (down) on the left.
  const handRight = placeholder<Vec3>(side === "right" ? [0, 1, 0] : [0, -1, 0], "1", `the ${side} fist thumb up, as the bind's guard holds it`);
  const footEnd = (sign: 1 | -1, what: string) => derive("m", `${what}: ${foot.key}'s box, its middle across and up, its ${sign > 0 ? "front" : "back"}`,
    [foot.position, foot.min[0]!, foot.max[0]!, foot.min[1]!, foot.max[1]!, sign > 0 ? foot.max[2]! : foot.min[2]!],
    (at, x0, x1, y0, y1, z) => [at[0] + (x0 + x1) / 2, at[1] + (y0 + y1) / 2, at[2] + z]);
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
    HEEL: footEnd(-1, "HEEL"),
    TTIP: footEnd(1, "TTIP"),
    handRight,
    little: side === "right"
      ? derive("m", `the little finger's knuckle: ${fist.key}'s half-width from the middle knuckle, against the hand's right`,
        [MET3, handRight, fist.max[0]!], (k, r, half) => sub(k, scale(r, half)))
      : derive("m", `the little finger's knuckle: ${fist.key}'s half-width from the middle knuckle, along the hand's right`,
        [MET3, handRight, fist.max[0]!], (k, r, half) => add(k, scale(r, half))),
  };
}

/** **The crypt skeleton's figure**, at x1: the bind is authored at the game's size. */
export function skeletonFigure(): HumanFigure {
  const neck = part("head.neck"), head = part("head.head");
  const CERV = end(neck, -1, "CERV"), VERT = end(head, 1, "VERT");
  const limbs = { left: limb("left"), right: limb("right") };
  const MIDH = derive("m", "MIDH: between the hip joint centres", [limbs.left.HJC, limbs.right.HJC], (l, r) => midpoint(l, r));
  const trunk = dividedTrunk("male", VERT, CERV, MIDH);
  const boxes = [part("trunk.core"), part("legs.pelvis")];
  return {
    family: "skeleton", model: SKELETON_MODEL, sex: "male",
    mass: placeholder(79, "kg", "the typical man's mass"),
    stature: derive("m", "the vertex's height over the soles", [VERT], (v) => v[1]),
    trunk, limbs,
    hulls: {
      upper: slice(boxes, "upper", trunk.XYPH),
      middle: slice(boxes, "middle", trunk.OMPH, trunk.XYPH),
      lower: slice(boxes, "lower", undefined, trunk.OMPH),
    },
    feet: { left: boxExtents(part("legs.footL"), "the left foot"), right: boxExtents(part("legs.footR"), "the right foot") },
    hp: placeholder(6, "HP", "the Warrior's hit points"),
  };
}
