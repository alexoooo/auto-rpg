import { frameOf, segmentFrame, type BodySpec, type HeldSpec, type ItemShape, type SegmentFrame, type SegmentSpec, type ShapeSpec } from "../spec/body.ts";
import { derive, type Quantity, type Vec3 } from "../spec/quantity.ts";
import { add, cross, dot, scale, sub } from "../spec/vec.ts";

/**
 * **A segment's rigid body**: the segment and whatever it holds (`BodySpec.held`), as the solver
 * moves them. A segment that holds nothing is its own numbers, untouched. One that holds an item
 * has the two masses, their joint centre of mass, and their inertia about it: each piece's
 * principal moments turned into the segment frame, plus its mass at its centre's offset,
 * m (|d|^2 E - d d'). A held item's inertia is not along the segment's axes, so the tensor has
 * products; the solver takes principal moments, and `principalOf` finds them.
 */

/** A symmetric inertia's entries, kg m2: xx, yy, zz, xy, xz, yz. */
type Tensor = readonly [number, number, number, number, number, number];

/** Whose a rigid body's shape is: its segment's own, or an item it holds. */
type ShapeOwner =
  | { readonly kind: "segment" }
  | { readonly kind: "held"; readonly held: HeldSpec };

export interface Rigid {
  readonly mass: number;
  /** The centre of mass, body frame, reference pose. */
  readonly centre: Vec3;
  /** The inertia about the centre of mass, in the segment frame. */
  readonly tensor: Tensor;
  /** What it collides as: the segment's shape, then each held item's, placed in the body frame. */
  readonly shapes: readonly ShapeSpec[];
  /** Whose each of `shapes` is, in their order. */
  readonly owners: readonly ShapeOwner[];
}

/** Where `held`'s item frame lies in the body frame, reference pose. */
export const heldFrame = (held: HeldSpec): SegmentFrame =>
  segmentFrame(held.origin.value, add(held.origin.value, held.along.value), held.across.value);

const placed = (frame: SegmentFrame, p: Vec3): Vec3 =>
  add(frame.origin, add(scale(frame.x, p[0]), add(scale(frame.y, p[1]), scale(frame.z, p[2]))));

/** `point`, in `held`'s item frame, in the body frame, reference pose. */
export function heldPoint(held: HeldSpec, point: Quantity<Vec3>): Quantity<Vec3> {
  return derive("m", "an item's point, placed in the body frame by its holding", [point, held.origin, held.along, held.across],
    (p, origin, along, across) => placed(segmentFrame(origin, add(origin, along), across), p));
}

function placedShape(held: HeldSpec, shape: ItemShape): ShapeSpec {
  switch (shape.kind) {
    case "capsule": return { kind: "capsule", from: heldPoint(held, shape.from), to: heldPoint(held, shape.to), radius: shape.radius };
    case "sphere": return { kind: "sphere", centre: heldPoint(held, shape.centre), radius: shape.radius };
    case "hull": return { kind: "hull", points: shape.points.map((p) => heldPoint(held, p)) };
    default: {
      const never: never = shape;
      throw new Error(`unknown item shape ${JSON.stringify(never)}`);
    }
  }
}

/** What `segment` of `spec` holds. */
const heldBy = (spec: BodySpec, segment: string): readonly HeldSpec[] =>
  (spec.held ?? []).filter((held) => held.segment === segment);

/** `segment`'s rigid body in `spec`. */
export function rigidOf(spec: BodySpec, segment: SegmentSpec): Rigid {
  const holding = heldBy(spec, segment.name);
  const [ix, iy, iz] = segment.inertia.value;
  if (holding.length === 0) {
    return { mass: segment.mass.value, centre: segment.centreOfMass.value, tensor: [ix, iy, iz, 0, 0, 0], shapes: [segment.shape], owners: [{ kind: "segment" }] };
  }
  const own = frameOf(segment);
  const pieces = [
    { mass: segment.mass.value, centre: segment.centreOfMass.value, moments: segment.inertia.value, frame: own },
    ...holding.map((held) => {
      const frame = heldFrame(held);
      return { mass: held.item.mass.value, centre: placed(frame, held.item.centreOfMass.value), moments: held.item.inertia.value, frame };
    }),
  ];
  const mass = pieces.reduce((sum, p) => sum + p.mass, 0);
  const centre = scale(pieces.reduce((sum: Vec3, p) => add(sum, scale(p.centre, p.mass)), [0, 0, 0]), 1 / mass);
  // Into the segment frame.
  const inOwn = (v: Vec3): Vec3 => [dot(v, own.x), dot(v, own.y), dot(v, own.z)];
  const t = [0, 0, 0, 0, 0, 0];
  const addOuter = (k: number, a: Vec3, b: Vec3) => {
    t[0]! += k * a[0] * b[0]; t[1]! += k * a[1] * b[1]; t[2]! += k * a[2] * b[2];
    t[3]! += k * a[0] * b[1]; t[4]! += k * a[0] * b[2]; t[5]! += k * a[1] * b[2];
  };
  for (const piece of pieces) {
    [piece.frame.x, piece.frame.y, piece.frame.z].forEach((axis, k) => { const a = inOwn(axis); addOuter(piece.moments[k]!, a, a); });
    const d = inOwn(sub(piece.centre, centre)), dd = dot(d, d);
    t[0]! += piece.mass * dd; t[1]! += piece.mass * dd; t[2]! += piece.mass * dd;
    addOuter(-piece.mass, d, d);
  }
  return {
    mass, centre, tensor: t as unknown as Tensor,
    shapes: [segment.shape, ...holding.flatMap((held) => held.item.shapes.map((shape) => placedShape(held, shape)))],
    owners: [{ kind: "segment" }, ...holding.flatMap((held) => held.item.shapes.map((): ShapeOwner => ({ kind: "held", held })))],
  };
}

/** Whether `tensor` has products: its axes are not principal. */
export const hasProducts = (tensor: Tensor): boolean => tensor[3] !== 0 || tensor[4] !== 0 || tensor[5] !== 0;

/**
 * `tensor`'s principal moments and their axes, in the tensor's frame, by Jacobi's rotations: the
 * axes are right-handed (z = x cross y) and the tensor is the sum of each moment times its axis's
 * outer product. It sweeps until the products are rounding beside the moments, 64 times at most:
 * a numeric setting.
 */
export function principalOf(tensor: Tensor): { readonly moments: Vec3; readonly axes: readonly [Vec3, Vec3, Vec3] } {
  const a = [[tensor[0], tensor[3], tensor[4]], [tensor[3], tensor[1], tensor[5]], [tensor[4], tensor[5], tensor[2]]];
  const v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const scaleOf = Math.abs(tensor[0]) + Math.abs(tensor[1]) + Math.abs(tensor[2]);
  for (let sweep = 0; sweep < 64; sweep++) {
    if (Math.abs(a[0]![1]!) + Math.abs(a[0]![2]!) + Math.abs(a[1]![2]!) <= Number.EPSILON * scaleOf) break;
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]] as const) {
      const apq = a[p]![q]!;
      if (apq === 0) continue;
      const theta = (a[q]![q]! - a[p]![p]!) / (2 * apq);
      const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < 3; k++) { const kp = a[k]![p]!, kq = a[k]![q]!; a[k]![p] = c * kp - s * kq; a[k]![q] = s * kp + c * kq; }
      for (let k = 0; k < 3; k++) { const pk = a[p]![k]!, qk = a[q]![k]!; a[p]![k] = c * pk - s * qk; a[q]![k] = s * pk + c * qk; }
      for (let k = 0; k < 3; k++) { const kp = v[k]![p]!, kq = v[k]![q]!; v[k]![p] = c * kp - s * kq; v[k]![q] = s * kp + c * kq; }
    }
  }
  const column = (j: number): Vec3 => [v[0]![j]!, v[1]![j]!, v[2]![j]!];
  const x = column(0), y = column(1);
  return { moments: [a[0]![0]!, a[1]![1]!, a[2]![2]!], axes: [x, y, cross(x, y)] };
}
