import type { SegmentSpec, ShapeSpec } from "../spec/body.ts";
import { segmentFrame } from "../spec/body.ts";
import { square } from "../math/real.ts";
import { capsuleRadius } from "../spec/geometry.ts";
import { derive, si, type Quantity, type Vec3 } from "../spec/quantity.ts";
import { add, distance, dot, lerp, normalize, scale, sub } from "../spec/vec.ts";
import type { Extents } from "./envelope.ts";
import type { HumanFigure } from "./figure.ts";
import { SIDES, type Side } from "./landmarks.ts";
import { DE_LEVA_1996, type DeLevaRow, type DeLevaSegment } from "./tables/de-leva-1996.ts";
import { SEGMENT_DENSITY, type DensitySegment } from "./tables/densities.ts";

/**
 * **A human figure's sixteen segments** (`figure.ts`), at x1: the head, three trunk segments, and
 * on each side the upper arm, forearm, hand, thigh, shank and foot.
 *
 * - **Where.** Each segment runs between two of de Leva's landmarks (`landmarks.ts`), taken at the
 *   figure's scale. A trunk segment's proximal end is its cranial one.
 * - **Mass.** de Leva's share of the figure's body mass for its sex. His printed shares sum to 100.00
 *   for men and 99.99 for women; they are normalised to sum to one, so the segments sum to the body.
 * - **Centre of mass and inertia.** de Leva's centre-of-mass position and radii of gyration, as
 *   fractions of this segment's own length. The inertia is about the segment frame's axes, which
 *   are his: x transverse, y longitudinal, z sagittal.
 * - **Shape.** The head and the limbs are capsules as long as the segment that hold its mass at
 *   Dempster's density. A trunk segment is the convex hull of its stretch of the figure (a workshop
 *   model's clothed envelope), not a box on its extents, whose corners stand out of the body where
 *   a driven upper arm passes. A foot is a box on its extents (the boot). A shape carries no mass
 *   (`SegmentSpec.shape`).
 *
 * A foot runs from the figure's heel to its toe.
 *
 * **A hand's knuckles** (`SegmentSpec.points`) are the head of its third metacarpal: where a
 * clenched fist strikes, and where a fist's speed is read. The hand segment runs on to the
 * fingertip, de Leva's alternative row, an open hand's length; a fist read at the fingertip reads
 * any turn of the wrist over more than twice the lever. Its `little` is the little finger's
 * knuckle, the head of its first bone, where a grip ends (`grip.ts`), when the figure has one.
 *
 * **A hand's right.** A hand's frame takes its own right (`SegmentSpec.right`, the figure's
 * `handRight`): across its knuckles toward the thumb on the right hand, toward the little finger
 * on the left, as the body's right runs across a hand in the anatomical position. Its two
 * transverse radii differ by a fifth in de Leva's table, so which way they lie matters.
 */
type Shape =
  | { readonly kind: "capsule"; readonly density: DensitySegment }
  | { readonly kind: "hull"; readonly points: readonly Quantity<Vec3>[] }
  | { readonly kind: "box in the body frame"; readonly extents: Extents };

interface Plan {
  readonly name: string;
  readonly row: DeLevaSegment;
  readonly proximal: Quantity<Vec3>;
  readonly distal: Quantity<Vec3>;
  /** de Leva's row runs from its origin to its end; the head's runs from the top down. */
  readonly origin: Quantity<Vec3>;
  readonly end: Quantity<Vec3>;
  readonly shape: Shape;
  readonly right?: Quantity<Vec3>;
  readonly points?: { readonly [name: string]: Quantity<Vec3> };
}

/** A segment's name: the row's, and the side for a limb. */
export const segmentName = (row: DeLevaSegment, side?: Side): string => side ? `${row}.${side}` : row;

/**
 * **The segment tree**: each segment's parent, the segment it is jointed to on the way to the
 * lower trunk, which is the root. The arms hang from the upper trunk, as de Leva's rows meet at
 * SJC; the legs from the lower trunk, at HJC.
 */
export const HUMAN_PARENTS: ReadonlyMap<string, string> = new Map([
  ["head", "upperTrunk"],
  ["upperTrunk", "middleTrunk"],
  ["middleTrunk", "lowerTrunk"],
  ...SIDES.flatMap((side): [string, string][] => [
    [segmentName("upperArm", side), "upperTrunk"],
    [segmentName("forearm", side), segmentName("upperArm", side)],
    [segmentName("hand", side), segmentName("forearm", side)],
    [segmentName("thigh", side), "lowerTrunk"],
    [segmentName("shank", side), segmentName("thigh", side)],
    [segmentName("foot", side), segmentName("shank", side)],
  ]),
]);

/** The figure's points at x1: at its scale, or as they are when it has none. */
const atScale = (figure: HumanFigure) => (point: Quantity<Vec3>): Quantity<Vec3> =>
  figure.scale ? derive("m", "at the fit scale", [point, figure.scale], (p, s) => scale(p, s)) : point;

const lengthAtScale = (figure: HumanFigure) => (length: Quantity<number>): Quantity<number> =>
  figure.scale ? derive("m", "at the fit scale", [length, figure.scale], (l, s) => l * s) : length;

function plans(figure: HumanFigure): Plan[] {
  const { VERT, CERV, XYPH, OMPH, MIDH } = figure.trunk;
  const plan = (name: string, row: DeLevaSegment, proximal: Quantity<Vec3>, distal: Quantity<Vec3>, shape: Shape,
    origin = proximal, end = distal, right?: Quantity<Vec3>, points?: Plan["points"]): Plan =>
    ({ name, row, proximal, distal, origin, end, shape, right, points });
  const out: Plan[] = [
    plan("head", "head", CERV, VERT, { kind: "capsule", density: "head" }, VERT, CERV),
    plan("upperTrunk", "upperTrunk", CERV, XYPH, { kind: "hull", points: figure.hulls.upper }),
    plan("middleTrunk", "middleTrunk", XYPH, OMPH, { kind: "hull", points: figure.hulls.middle }),
    plan("lowerTrunk", "lowerTrunk", OMPH, MIDH, { kind: "hull", points: figure.hulls.lower }),
  ];
  for (const side of SIDES) {
    const { SJC, EJC, WJC, DAC3, MET3, HJC, KJC, AJC, HEEL, TTIP, handRight, little } = figure.limbs[side];
    out.push(
      plan(segmentName("upperArm", side), "upperArm", SJC, EJC, { kind: "capsule", density: "upperArm" }),
      plan(segmentName("forearm", side), "forearm", EJC, WJC, { kind: "capsule", density: "forearm" }),
      plan(segmentName("hand", side), "hand", WJC, DAC3, { kind: "capsule", density: "hand" }, WJC, DAC3, handRight,
        little ? { knuckles: MET3, little } : { knuckles: MET3 }),
      plan(segmentName("thigh", side), "thigh", HJC, KJC, { kind: "capsule", density: "thigh" }),
      plan(segmentName("shank", side), "shank", KJC, AJC, { kind: "capsule", density: "shank" }),
      plan(segmentName("foot", side), "foot", HEEL, TTIP, { kind: "box in the body frame", extents: figure.feet[side] }),
    );
  }
  return out;
}

function shapeOf(figure: HumanFigure, plan: Plan, proximal: Quantity<Vec3>, distal: Quantity<Vec3>, mass: Quantity<number>): ShapeSpec {
  const shape = plan.shape;
  switch (shape.kind) {
    case "capsule": {
      const radius = derive("m", "the capsule as long as the segment that holds its mass at its density",
        [mass, si(SEGMENT_DENSITY[shape.density]), proximal, distal],
        (m, density, p, d) => capsuleRadius(m / density, distance(p, d)));
      return {
        kind: "capsule", radius,
        from: derive("m", "the proximal end, in by the radius", [proximal, distal, radius], (p, d, r) => add(p, scale(normalize(sub(d, p)), r))),
        to: derive("m", "the distal end, in by the radius", [proximal, distal, radius], (p, d, r) => add(d, scale(normalize(sub(p, d)), r))),
      };
    }
    case "hull":
      return { kind: "hull", points: shape.points.map(atScale(figure)) };
    case "box in the body frame": {
      const { x, y, z } = shape.extents;
      const ends = [x.min, x.max, y.min, y.max, z.min, z.max].map(lengthAtScale(figure));
      return {
        kind: "box",
        centre: derive("m", "the middle of the envelope's extents", ends,
          (x0, x1, y0, y1, z0, z1) => [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2]),
        // The box's edges lie along the segment frame; the extents are the body frame's, so each
        // edge is the envelope's width along it. The foot's frame lies along the body's.
        size: derive("m", "the envelope's widths along the segment frame's axes", [proximal, distal, ...ends],
          (p, d, x0, x1, y0, y1, z0, z1) => {
            const frame = segmentFrame(p, d);
            const widths: Vec3 = [x1 - x0, y1 - y0, z1 - z0];
            const along = (axis: Vec3) => dot(axis.map(Math.abs) as unknown as Vec3, widths);
            return [along(frame.x), along(frame.y), along(frame.z)];
          }),
      };
    }
    default: {
      const never: never = shape;
      throw new Error(`unknown shape ${JSON.stringify(never)}`);
    }
  }
}

/** The figure's segments at x1, head first, then the trunk, then each side's limbs. */
export function humanSegments(figure: HumanFigure): SegmentSpec[] {
  const table = DE_LEVA_1996[figure.sex];
  const all = plans(figure);
  const shares = all.map((plan) => table[plan.row].mass);
  const body = figure.mass, atFit = atScale(figure);
  return all.map((plan, i) => {
    const row: DeLevaRow = table[plan.row];
    const proximal = atFit(plan.proximal), distal = atFit(plan.distal);
    const origin = atFit(plan.origin), end = atFit(plan.end);
    const mass = derive("kg", "de Leva's share of the body's mass, the printed shares normalised to sum to one",
      [body, shares[i]!, ...shares], (m, share, ...every) => m * share / every.reduce((a, b) => a + b, 0));
    const centreOfMass = derive("m", "de Leva's centre of mass, along the row from its origin", [origin, end, si(row.centreOfMass)],
      (o, e, fraction) => lerp(o, e, fraction));
    const inertia = derive("kg m2", "m (r L)^2 about the transverse, longitudinal and sagittal axes",
      [mass, proximal, distal, si(row.radiusTransverse), si(row.radiusLongitudinal), si(row.radiusSagittal)],
      (m, p, d, transverse, longitudinal, sagittal) => {
        const l = distance(p, d);
        return [m * square(transverse * l), m * square(longitudinal * l), m * square(sagittal * l)];
      });
    const segment: SegmentSpec = { name: plan.name, proximal, distal, mass, centreOfMass, inertia, shape: shapeOf(figure, plan, proximal, distal, mass) };
    const points = plan.points && Object.fromEntries(Object.entries(plan.points).map(([name, point]) => [name, atFit(point)]));
    return { ...segment, ...(plan.right && { right: plan.right }), ...(points && { points }) };
  });
}
