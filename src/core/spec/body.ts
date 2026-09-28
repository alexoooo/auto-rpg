import type { Quantity, Vec3 } from "./quantity.ts";
import { cross, normalize, orthogonalTo, sub } from "./vec.ts";

/**
 * **What a body is built from**, and nothing else: `buildBody` (stage 1's builder) reads a
 * `BodySpec` and makes the bodies and joints it states. Every number in it is a `Quantity`, so it
 * says where it came from.
 *
 * **The body frame.** Metres; +x is the body's right, +y is up, +z is forward, with the soles on
 * y = 0 and the body in its reference pose (a rigged model's bind pose). In Babylon's left-handed
 * world that is a body standing at the origin facing +z. Every position and axis in a spec is in
 * this frame, in the reference pose.
 *
 * Contact surfaces and damageable parts join the spec with the rulebook (stage 5 of
 * `docs/plans/2026-09-28-core-foundation.md`), when a rule first reads them.
 */
export interface BodySpec {
  /** The family's name, `human`; a spec never spreads another family's spec. */
  readonly family: string;
  /** Which body of the family, such as `workshop-fighter`. */
  readonly model: string;
  /** Whole-body mass: the segments' masses sum to it. */
  readonly mass: Quantity<number>;
  readonly stature: Quantity<number>;
  readonly segments: readonly SegmentSpec[];
  /** Each joint names a parent and a child segment; together they form a tree over the segments. */
  readonly joints: readonly JointSpec[];
}

/**
 * One rigid segment.
 *
 * Its **frame** follows from its two ends and its right (`frameOf`): y along the segment from
 * `proximal` to `distal`, x its right made square to y, z = x cross y. Inertia is stated about the
 * centre of mass along those axes, which are the axes a segment table's radii of gyration are
 * about: x transverse, y longitudinal, z sagittal.
 */
export interface SegmentSpec {
  readonly name: string;
  readonly proximal: Quantity<Vec3>;
  readonly distal: Quantity<Vec3>;
  /**
   * The segment's own right, when the reference pose has turned it away from the body's: the
   * direction the body's right would have across this segment in the anatomical position. Absent,
   * it is the body's right. A hand held thumb up has its own.
   */
  readonly right?: Quantity<Vec3>;
  readonly mass: Quantity<number>;
  /** In the body frame. */
  readonly centreOfMass: Quantity<Vec3>;
  /** Principal moments about the centre of mass, kg m2, about the segment frame's x, y and z. */
  readonly inertia: Quantity<Vec3>;
  /**
   * What the segment collides as. It carries no mass: the mass, centre of mass and inertia above
   * are set on the body explicitly, so a shape can be sized for contact without moving them.
   */
  readonly shape: ShapeSpec;
}

/** A collision shape in the body frame; a box's edges lie along its segment's frame. */
export type ShapeSpec =
  | { readonly kind: "capsule"; readonly from: Quantity<Vec3>; readonly to: Quantity<Vec3>; readonly radius: Quantity<number> }
  | { readonly kind: "box"; readonly centre: Quantity<Vec3>; readonly size: Quantity<Vec3> }
  | { readonly kind: "sphere"; readonly centre: Quantity<Vec3>; readonly radius: Quantity<number> };

/** A joint between two segments, at `centre` in the body frame. */
export interface JointSpec {
  readonly name: string;
  readonly parent: string;
  readonly child: string;
  readonly centre: Quantity<Vec3>;
  /** One to three rotational freedoms, their axes mutually square; every other freedom is locked. */
  readonly dofs: readonly DofSpec[];
}

/**
 * One rotational freedom. The angle is 0 in the reference pose; a positive angle turns the child
 * about `axis` in the sense the motion `positive` names (flexion, abduction, ...), and `negative`
 * names the opposite one.
 */
export interface DofSpec {
  readonly positive: string;
  readonly negative: string;
  /** Unit axis, body frame. */
  readonly axis: Quantity<Vec3>;
  /** Range of motion from the reference pose, radians. */
  readonly min: Quantity<number>;
  readonly max: Quantity<number>;
  readonly muscle: MuscleSpec;
}

/**
 * The muscles acting on one freedom, lumped: what the joint can do, not which muscle does it.
 * Stage 2 of the plan turns this into a torque ceiling at a speed.
 */
export interface MuscleSpec {
  /** Peak isometric torque toward positive and toward negative angles, N m, as magnitudes. */
  readonly peakPositive: Quantity<number>;
  readonly peakNegative: Quantity<number>;
  /** Unloaded shortening speed, rad/s: the speed at which a concentric torque falls to zero. */
  readonly maxVelocity: Quantity<number>;
  /** Hill's a/F0: the concentric curve's curvature. */
  readonly curvature: Quantity<number>;
  /** The eccentric ceiling as a multiple of isometric torque. */
  readonly eccentric: Quantity<number>;
}

export interface SegmentFrame {
  readonly origin: Vec3;
  readonly x: Vec3;
  readonly y: Vec3;
  readonly z: Vec3;
}

const BODY_RIGHT: Vec3 = [1, 0, 0];

/**
 * A segment's frame from its ends: origin at `proximal`, y toward `distal`, x `right` made square
 * to y, and z = x cross y. A segment that runs along its right has no such frame, and is refused
 * rather than given another.
 */
export function segmentFrame(proximal: Vec3, distal: Vec3, right: Vec3 = BODY_RIGHT): SegmentFrame {
  const y = normalize(sub(distal, proximal));
  const x = orthogonalTo(right, y);
  return { origin: proximal, x, y, z: cross(x, y) };
}

/** A segment's frame, reference pose. */
export const frameOf = (segment: SegmentSpec): SegmentFrame =>
  segmentFrame(segment.proximal.value, segment.distal.value, segment.right?.value);
