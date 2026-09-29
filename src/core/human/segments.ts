import type { SegmentSpec, ShapeSpec } from "../spec/body.ts";
import { segmentFrame } from "../spec/body.ts";
import { capsuleRadius } from "../spec/geometry.ts";
import { derive, si, type Quantity, type Vec3 } from "../spec/quantity.ts";
import { add, distance, dot, lerp, normalize, scale, sub } from "../spec/vec.ts";
import { workshopEnvelope, type Extents } from "./envelope.ts";
import { limbLandmarks, rigSuffix, SIDES, trunkLandmarks, type Side } from "./landmarks.ts";
import { bodyMass, FIT_SCALE, WORKSHOP_SEX } from "./model.ts";
import { rigPoint, type WorkshopModel } from "./rig.ts";
import { DE_LEVA_1996, type DeLevaRow, type DeLevaSegment } from "./tables/de-leva-1996.ts";
import { SEGMENT_DENSITY, type DensitySegment } from "./tables/densities.ts";

/**
 * **A workshop model's sixteen segments**, at x1: the head, three trunk segments, and on each side
 * the upper arm, forearm, hand, thigh, shank and foot.
 *
 * - **Where.** Each segment runs between two of de Leva's landmarks (`landmarks.ts`), taken at the
 *   fit scale. A trunk segment's proximal end is its cranial one.
 * - **Mass.** de Leva's share of the model's body mass for its sex. His printed shares sum to 100.00
 *   for men and 99.99 for women; they are normalised to sum to one, so the segments sum to the body.
 * - **Centre of mass and inertia.** de Leva's centre-of-mass position and radii of gyration, as
 *   fractions of this segment's own length. The inertia is about the segment frame's axes, which
 *   are his: x transverse, y longitudinal, z sagittal.
 * - **Shape.** The head and the limbs are capsules as long as the segment that hold its mass at
 *   Dempster's density. A trunk segment is the convex hull of its stretch of the clothed envelope;
 *   a foot is a box on the boot. A shape carries no mass (`SegmentSpec.shape`). The trunk was a box
 *   on the same stretch's extents until its corners stood out of the body: an upper arm driving a
 *   straight met the middle trunk's front upper corner 7-13 mm deep while 11-23 mm clear of the
 *   clothed surface (the lab routine, Node stand, self-contact off).
 *
 * The rig's feet end in a boot, so the foot runs from the boot's heel to its toe, at the height of
 * the rig's ball.
 *
 * **A hand's knuckles** (`SegmentSpec.points`) are the head of its third metacarpal: where a
 * clenched fist strikes, and where a fist's speed is read. The hand segment runs on to the
 * fingertip, de Leva's alternative row, an open hand's length; a fist read at the fingertip reads
 * any turn of the wrist over more than twice the lever. Its `little` is the little finger's
 * knuckle, the head of its first bone, where a grip ends (`grip.ts`).
 *
 * **A hand's right.** The rig holds each hand thumb up, a quarter turn from the anatomical
 * position's palm forward, so a hand's frame takes its own right (`SegmentSpec.right`): across its
 * knuckles toward the thumb on the right hand, toward the little finger on the left, as the body's
 * right runs across a hand in the anatomical position. Its two transverse radii differ by a fifth
 * in de Leva's table, so which way they lie matters.
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

const atFit = (point: Quantity<Vec3>): Quantity<Vec3> =>
  derive("m", "at the fit scale", [point, FIT_SCALE], (p, s) => scale(p, s));

const lengthAtFit = (length: Quantity<number>): Quantity<number> =>
  derive("m", "at the fit scale", [length, FIT_SCALE], (l, s) => l * s);

function plans(model: WorkshopModel): Plan[] {
  const envelope = workshopEnvelope(model);
  const trunk = trunkLandmarks(model);
  const { VERT, CERV, XYPH, OMPH, MIDH } = trunk;
  const plan = (name: string, row: DeLevaSegment, proximal: Quantity<Vec3>, distal: Quantity<Vec3>, shape: Shape,
    origin = proximal, end = distal, right?: Quantity<Vec3>, points?: Plan["points"]): Plan =>
    ({ name, row, proximal, distal, origin, end, shape, right, points });
  const out: Plan[] = [
    plan("head", "head", CERV, VERT, { kind: "capsule", density: "head" }, VERT, CERV),
    plan("upperTrunk", "upperTrunk", CERV, XYPH, { kind: "hull", points: envelope.trunk.upper }),
    plan("middleTrunk", "middleTrunk", XYPH, OMPH, { kind: "hull", points: envelope.trunk.middle }),
    plan("lowerTrunk", "lowerTrunk", OMPH, MIDH, { kind: "hull", points: envelope.trunk.lower }),
  ];
  for (const side of SIDES) {
    const { SJC, EJC, WJC, DAC3, MET3, HJC, KJC, AJC } = limbLandmarks(model, side);
    const foot = envelope.feet[side];
    const ball = rigPoint(model, `ball${rigSuffix(side)}`, "tail");
    const HEEL = derive("m", "the boot's heel: across, the footprint's middle; its back; the ball's height",
      [foot.x.min, foot.x.max, foot.z.min, ball], (left, right, back, b) => [(left + right) / 2, b[1], back]);
    const TTIP = derive("m", "the boot's toe: across, the footprint's middle; its front; the ball's height",
      [foot.x.min, foot.x.max, foot.z.max, ball], (left, right, front, b) => [(left + right) / 2, b[1], front]);
    out.push(
      plan(segmentName("upperArm", side), "upperArm", SJC, EJC, { kind: "capsule", density: "upperArm" }),
      plan(segmentName("forearm", side), "forearm", EJC, WJC, { kind: "capsule", density: "forearm" }),
      plan(segmentName("hand", side), "hand", WJC, DAC3, { kind: "capsule", density: "hand" }, WJC, DAC3, handRight(model, side),
        { knuckles: MET3, little: rigPoint(model, `pinky_01${rigSuffix(side)}`, "head") }),
      plan(segmentName("thigh", side), "thigh", HJC, KJC, { kind: "capsule", density: "thigh" }),
      plan(segmentName("shank", side), "shank", KJC, AJC, { kind: "capsule", density: "shank" }),
      plan(segmentName("foot", side), "foot", HEEL, TTIP, { kind: "box in the body frame", extents: foot }),
    );
  }
  return out;
}

/** A hand's right in the anatomical position: across its knuckles, thumb side on the right hand. */
function handRight(model: WorkshopModel, side: Side): Quantity<Vec3> {
  const index = rigPoint(model, `index_01${rigSuffix(side)}`, "head");
  const little = rigPoint(model, `pinky_01${rigSuffix(side)}`, "head");
  return side === "right"
    ? derive("1", "from the little finger's knuckle to the index finger's", [little, index], (l, i) => normalize(sub(i, l)))
    : derive("1", "from the index finger's knuckle to the little finger's", [index, little], (i, l) => normalize(sub(l, i)));
}

function shapeOf(plan: Plan, proximal: Quantity<Vec3>, distal: Quantity<Vec3>, mass: Quantity<number>): ShapeSpec {
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
      return { kind: "hull", points: shape.points.map(atFit) };
    case "box in the body frame": {
      const { x, y, z } = shape.extents;
      const ends = [x.min, x.max, y.min, y.max, z.min, z.max].map(lengthAtFit);
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

/** The model's segments at x1, head first, then the trunk, then each side's limbs. */
export function humanSegments(model: WorkshopModel): SegmentSpec[] {
  const table = DE_LEVA_1996[WORKSHOP_SEX[model]];
  const all = plans(model);
  const shares = all.map((plan) => table[plan.row].mass);
  const body = bodyMass(model);
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
        return [m * (transverse * l) ** 2, m * (longitudinal * l) ** 2, m * (sagittal * l) ** 2];
      });
    const segment: SegmentSpec = { name: plan.name, proximal, distal, mass, centreOfMass, inertia, shape: shapeOf(plan, proximal, distal, mass) };
    const points = plan.points && Object.fromEntries(Object.entries(plan.points).map(([name, point]) => [name, atFit(point)]));
    return { ...segment, ...(plan.right && { right: plan.right }), ...(points && { points }) };
  });
}
