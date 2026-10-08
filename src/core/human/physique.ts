import { derive, sourced, type Quantity, type Vec3 } from "../spec/quantity.ts";
import { add, dot, normalize, scale, sub } from "../spec/vec.ts";
import type { Extent, Extents, TrunkSegment } from "./envelope.ts";
import type { HandFigure, HumanFigure } from "./figure.ts";
import { SIDES } from "./landmarks.ts";

/**
 * **A physique**: how a body differs from its model's figure, each attribute a factor on what it
 * changes, absent where it changes nothing. Each changes one thing, so a skill that fails on one
 * says which change failed it:
 *
 * - `size`: every length, and the mass at the same density. The muscle is a share of that mass,
 *   so torque goes as size cubed with it (`peakTorque`); joint speeds are unchanged (`jointSpeed`).
 * - `weight`: the mass alone, a load the same muscles carry. Every segment is as long and as dense
 *   as before, and broader across its long axis by the factor's square root.
 * - `strength`: every peak torque.
 * - `speed`: every muscle's unloaded speed of shortening.
 *
 * Any positive factor builds a body; which factors a character or a run takes is theirs. Past
 * about x1.3 of weight, segments that share no joint meet in the reference pose
 * (`docs/reference/competencies.md#physiques`).
 */
export interface Physique {
  readonly size?: number;
  readonly weight?: number;
  readonly strength?: number;
  readonly speed?: number;
}

/** A physique's attributes, in the order a physique is written. */
export const PHYSIQUE_ATTRIBUTES: readonly (keyof Physique)[] = Object.freeze(["size", "weight", "strength", "speed"]);

/** One attribute's factor as a quantity of the owner's physique decision, or null where it is absent. */
function factor(physique: Physique, attribute: keyof Physique): Quantity<number> | null {
  const value = physique[attribute];
  if (value === undefined) return null;
  if (!(Number.isFinite(value) && value > 0)) throw new Error(`a physique's ${attribute} must be a positive factor: ${value}`);
  return sourced(value, "1", "owner-physique", attribute);
}

/**
 * **A figure with a physique**: `figure` resized by `size`, made heavier by `weight`, and carrying
 * `strength` and `speed` for the muscle (`HumanFigure`). Without a physique, `figure` itself.
 *
 * Weight broadens each segment about the line along it through its surface's centroid: a trunk
 * segment's hull, each hand's two hulls (with the points on them where a palm bears and a fist
 * strikes), and a foot's box across and up from its sole. A limb's capsule holds its mass at its
 * density already (`segments.ts`). A figure whose limbs are capped by the room beside its trunk
 * (`HumanFigure.widest`, the crypt skeleton's) takes no weight: that room is derived from the
 * trunk the weight would broaden, and the figure would have to derive it again.
 */
export function physiqueFigure(figure: HumanFigure, physique?: Physique): HumanFigure {
  if (!physique) return figure;
  const size = factor(physique, "size"), weight = factor(physique, "weight");
  if (weight && figure.widest) throw new Error(`${figure.model} takes no weight: its limbs are capped by the room beside its trunk`);
  const strength = factor(physique, "strength"), speed = factor(physique, "speed");
  const breadth = weight && derive("1", "the square root of the weight: the breadth of a segment as long and as dense", [weight],
    (w) => Math.sqrt(w));
  const sized = figure.muscled ?? figure.mass;
  const muscled = size ? derive("kg", "the muscled mass times the size cubed", [sized, size], (m, s) => m * s * s * s) : sized;
  const mass = size || weight ? derive("kg", "the mass times the size cubed and the weight", [figure.mass, size ?? one, weight ?? one],
    (m, s, w) => m * s * s * s * w) : figure.mass;
  const widest = figure.widest && Object.fromEntries(Object.entries(figure.widest).map(([row, room]) => [row,
    size ? derive("m", "the widest room times the size", [room!, size], (r, s) => r * s) : room]));
  const { CERV, XYPH, OMPH, MIDH } = figure.trunk;
  const trunkAxis: Record<TrunkSegment, readonly [Quantity<Vec3>, Quantity<Vec3>]> = { upper: [CERV, XYPH], middle: [XYPH, OMPH], lower: [OMPH, MIDH] };
  const trunkHull = (segment: TrunkSegment) => broadHull(figure.hulls[segment], trunkAxis[segment], breadth!).corners;
  return {
    ...figure,
    ...(size && { scale: figure.scale ? derive("1", "the fit scale times the size", [figure.scale, size], (f, s) => f * s) : size,
      stature: derive("m", "the stature times the size", [figure.stature, size], (h, s) => h * s) }),
    mass, ...((size || weight) && { muscled }),
    ...(breadth && {
      breadth: figure.breadth ? derive("1", "the breadth times the weight's", [figure.breadth, breadth], (a, b) => a * b) : breadth,
      hulls: { upper: trunkHull("upper"), middle: trunkHull("middle"), lower: trunkHull("lower") },
      feet: Object.fromEntries(SIDES.map((side) => [side, broadFoot(figure.feet[side], breadth)])) as HumanFigure["feet"],
      ...(figure.hands && { hands: Object.fromEntries(SIDES.map((side) =>
        [side, broadHand(figure.hands![side], [figure.limbs[side].WJC, figure.limbs[side].DAC3], breadth)])) as HumanFigure["hands"] }),
    }),
    ...(widest && { widest }),
    ...(strength && { strength: figure.strength ? derive("1", "the strength times the physique's", [figure.strength, strength], (a, b) => a * b) : strength }),
    ...(speed && { speed: figure.speed ? derive("1", "the speed times the physique's", [figure.speed, speed], (a, b) => a * b) : speed }),
  };
}

/** The factor that changes nothing, for an attribute a physique leaves out. */
const one = sourced(1, "1", "owner-physique", "an attribute left out");

/**
 * `points` broadened by `breadth` about the line along `axis` (proximal to distal) through their
 * centroid, and the same map, which carries a point on their surface to the broadened surface.
 */
function broadHull(points: readonly Quantity<Vec3>[], [proximal, distal]: readonly [Quantity<Vec3>, Quantity<Vec3>], breadth: Quantity<number>) {
  const centroid = derive("m", "the mean of the hull's corners", points, (...corners: Vec3[]) =>
    scale(corners.reduce((sum, c) => add(sum, c), [0, 0, 0] as Vec3), 1 / corners.length));
  const map = (point: Quantity<Vec3>) => derive("m", "broadened about the line along the segment through the hull's centroid",
    [point, centroid, proximal, distal, breadth], (p, c, a, b, k) => {
      const along = normalize(sub(b, a)), offset = sub(p, c), axial = scale(along, dot(offset, along));
      return add(add(c, axial), scale(sub(offset, axial), k));
    });
  return { corners: points.map(map), map };
}

/** A foot's box broadened by `breadth` across, about its middle, and up from its sole; as long as before. */
function broadFoot(foot: Extents, breadth: Quantity<number>): Extents {
  const across = (low: Quantity<number>, high: Quantity<number>, end: "min" | "max") => derive("m",
    `the ${end} across, broadened about the middle`, [low, high, breadth], (l, h, k) => (l + h) / 2 + (end === "min" ? l - h : h - l) / 2 * k);
  const x: Extent = { min: across(foot.x.min, foot.x.max, "min"), max: across(foot.x.min, foot.x.max, "max") };
  const y: Extent = { min: foot.y.min, max: derive("m", "the top, broadened up from the sole", [foot.y.min, foot.y.max, breadth], (l, h, k) => l + (h - l) * k) };
  return { x, y, z: foot.z };
}

/** A hand's hulls broadened by `breadth` along `axis`, with the point each pose bears or strikes at. */
function broadHand(hand: HandFigure, axis: readonly [Quantity<Vec3>, Quantity<Vec3>], breadth: Quantity<number>): HandFigure {
  const palm = broadHull(hand.palm.hull, axis, breadth), fist = broadHull(hand.fist.hull, axis, breadth);
  return { palm: { hull: palm.corners, centre: palm.map(hand.palm.centre) }, fist: { hull: fist.corners, strike: fist.map(hand.fist.strike) } };
}
