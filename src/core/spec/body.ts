import type { Quantity, Vec3 } from "./quantity.ts";
import { cross, normalize, orthogonalTo, sub } from "./vec.ts";

/** One side of a bilateral body: a hand, a foot, a limb, a corner of a bout. */
export type Side = "left" | "right";

/**
 * **What a body is built from**, and nothing else: `buildBody` reads a
 * `BodySpec` and makes the bodies and joints it states. Every number in it is a `Quantity`, so it
 * says where it came from.
 *
 * **The body frame.** Metres; +x is the body's right, +y is up, +z is forward, with the soles on
 * y = 0 and the body in its reference pose (a rigged model's bind pose). In Babylon's left-handed
 * world that is a body standing at the origin facing +z. Every position and axis in a spec is in
 * this frame, in the reference pose.
 *
 * What the rulebook wounds is `wounds`: the body's hit points, and which segments kill when they
 * are emptied or lost and which never come off. What else a fight's rules read of the character is
 * `attributes`. What a blow reads of a segment, or of an item, is its `surface`. What a body and
 * an item are made of is `substance`: no rule of a fight reads it, and a sound does
 * (`src/audio/cues.ts`).
 *
 * **What a body holds is not its anatomy.** A segment states the body's own numbers; an item held
 * in it (`held`) is stated beside it, and the builder makes the two one rigid body
 * (`src/core/build/rigid.ts`). What reads the anatomy -- the wounds' split, a segment table's
 * check -- reads the segment; what reads the rigid body -- the solver, the dynamics, the centre of
 * mass -- reads both.
 */
export interface BodySpec {
  /** Which body it is, such as `workshop-fighter`; a spec never spreads another family's spec. */
  readonly model: string;
  /** Whole-body mass: the segments' masses sum to it. */
  readonly mass: Quantity<number>;
  readonly stature: Quantity<number>;
  readonly segments: readonly SegmentSpec[];
  /** Named controllable endpoints; the chain below `base` belongs to the effector. */
  readonly effectors?: readonly EffectorSpec[];
  /** Each joint names a parent and a child segment; together they form a tree over the segments. */
  readonly joints: readonly JointSpec[];
  readonly wounds: WoundSpec;
  readonly attributes: AttributeSpec;
  /** What its segments are made of, where they meet the world. */
  readonly substance: Substance;
  /** Items held rigidly in a segment, such as a club in a hand; absent, nothing. */
  readonly held?: readonly HeldSpec[];
  /** When the body is down: the rule every fight, page and mind reads it by (`uprightness`, `src/core/control/ground.ts`). */
  readonly down: DownSpec;
}

/**
 * **When a body is down**, by kind:
 *
 * - `asked`: its centre of mass is more than `fallen`, m, under the height its mind asks it to
 *   hold over its lowest point: a body that stands, and can be asked to crouch or kneel.
 * - `low`: `root`'s up has tipped under `up` (the cosine of its tilt), or its centre of mass is
 *   under `height` of its standing height: a body that keeps low to the ground and asks no height.
 */
export type DownSpec =
  | { readonly kind: "asked"; readonly fallen: Quantity<number> }
  | { readonly kind: "low"; readonly root: string; readonly height: Quantity<number>; readonly up: Quantity<number> };

/**
 * **A controllable endpoint**: `segment`'s `point`, moved by the chain from `base` out to it.
 * `support`: a foot the body stands on, flat on its sole.
 */
interface EffectorSpec {
  readonly segment: string;
  readonly base: string;
  readonly point: string;
  readonly support?: "sole";
}

/** What a thing is made of, where it meets another: a body's flesh or bone, an item's wood, the world's stone. */
export type Substance = "flesh" | "bone" | "wood" | "stone";

/**
 * **An item held rigidly in a segment**, as a club is in a closed hand: it moves with the segment
 * as one rigid body. `origin`, `along` and `across` place the item's frame in the body frame, in
 * the reference pose, as a segment's ends and right place its frame (`segmentFrame`): y along
 * `along`, x `across` made square to it, z = x cross y.
 */
export interface HeldSpec {
  /** The segment that holds it. */
  readonly segment: string;
  readonly item: ItemSpec;
  readonly origin: Quantity<Vec3>;
  readonly along: Quantity<Vec3>;
  readonly across: Quantity<Vec3>;
}

/**
 * **A rigid item, in its own frame**: metres, with its origin and axes its own, such as a club's
 * butt with y up its haft. Held (`HeldSpec`), its frame is placed in the body frame.
 */
export interface ItemSpec {
  readonly name: string;
  readonly mass: Quantity<number>;
  /** In the item frame. */
  readonly centreOfMass: Quantity<Vec3>;
  /** Principal moments about the centre of mass, kg m2, about the item frame's x, y and z. */
  readonly inertia: Quantity<Vec3>;
  /** What it collides as, in the item frame. A box is not one: its edges would need a frame of their own. */
  readonly shapes: readonly ItemShape[];
  /** Named points, in the item frame: where a reading is taken on it, such as where a club strikes. */
  readonly points: { readonly [name: string]: Quantity<Vec3> };
  /** The point of `points` a blow with the item is brought to its target by: where it strikes. */
  readonly aim?: string;
  /** The two points of `points` between which the item stops a blow: a parry puts a threat's line across them. */
  readonly cover?: readonly [string, string];
  /** Absent, the item is rigid: it takes no share of a blow. */
  readonly surface?: SurfaceSpec;
  /** What it is made of. */
  readonly substance: Substance;
  /**
   * For an item a hand closes on: the radius it is held at, with the item frame's origin at the end
   * of the grip and y along it (`src/core/human/grip.ts`).
   */
  readonly grip?: Quantity<number>;
}

export type ItemShape = Exclude<ShapeSpec, { readonly kind: "box" }>;

/**
 * **What the rulebook wounds** (`src/core/rules/pool.ts`): one pool of hit points for the body,
 * split over its segments by the rulebook's rule.
 */
export interface WoundSpec {
  /** The body's hit points, in the rulebook's unit (`Rulebook.unit`: one is 100 J of blunt blow). */
  readonly hp: Quantity<number>;
  /** Segments whose emptying, or loss, kills the body: a head. */
  readonly vital: readonly string[];
  /** Segments that never come off: a trunk. */
  readonly whole: readonly string[];
}

/**
 * **What a fight's rules read of a character beyond its anatomy and its wounds.** Each is the
 * owner's number for that character.
 */
export interface AttributeSpec {
  /**
   * How far the character may be held up beyond what its legs give: the most force its assist
   * gives it, per cent of its own weight, with the moment the rulebook gives each per cent
   * (`Rulebook.balance`, `Assist`). At 0 nothing holds it up that its muscles do not.
   */
  readonly balance: Quantity<number>;
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
  /**
   * Named points the segment carries, in the body frame: where a reading or a goal is taken on it
   * rather than at its ends. A hand's `knuckles` is where a fist strikes.
   */
  readonly points?: { readonly [name: string]: Quantity<Vec3> };
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
  /** Coarse hand envelopes in the same reference frame; articulation retains the stated mass properties. */
  readonly handPoses?: Readonly<Record<HandPose, ShapeSpec>>;
  readonly surface: SurfaceSpec;
}

/** A rigid hand's contact configuration, independent of its controller. */
export type HandPose = "open" | "fist" | "grip";

/** Compound equipment retains its qualified hand envelope; separate pose requests use the declared envelopes. */
export function handShapeAt(body: BodySpec, segment: SegmentSpec, pose: HandPose): ShapeSpec {
  return pose === "grip" && body.held?.some(item => item.segment === segment.name)
    ? segment.shape : segment.handPoses?.[pose] ?? segment.shape;
}

/**
 * **What a blow reads of a surface** (`src/core/rules/share.ts`): how stiff it is under a blunt
 * load pressed into it, N/m. The softer of two surfaces that meet takes the more of a blow.
 */
interface SurfaceSpec {
  readonly stiffness: Quantity<number>;
}

/**
 * A collision shape in the body frame; a box's edges lie along its segment's frame, and a hull is
 * the convex hull of its points.
 */
export type ShapeSpec =
  | { readonly kind: "capsule"; readonly from: Quantity<Vec3>; readonly to: Quantity<Vec3>; readonly radius: Quantity<number> }
  | { readonly kind: "box"; readonly centre: Quantity<Vec3>; readonly size: Quantity<Vec3> }
  | { readonly kind: "sphere"; readonly centre: Quantity<Vec3>; readonly radius: Quantity<number> }
  | { readonly kind: "hull"; readonly points: readonly Quantity<Vec3>[] };

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
  /**
   * The reference pose's angle from the freedom's own zero (a human's, the anatomical position), in
   * the positive sense, rad: a posture written from that zero is the same shape on bodies whose
   * reference poses differ, and is this much less from the reference pose.
   */
  readonly bind: Quantity<number>;
  readonly muscle: MuscleSpec;
}

/**
 * The muscles acting on one freedom, lumped: what the joint can do, not which muscle does it. The
 * muscle actuator (`src/core/muscle/driver.ts`) makes it a torque ceiling at a speed.
 */
export interface MuscleSpec {
  /** Peak isometric torque toward positive and toward negative angles, N m, as magnitudes. */
  readonly peakPositive: Quantity<number>;
  readonly peakNegative: Quantity<number>;
  /** How the torque toward positive, and toward negative, falls with speed and rises when stretched. */
  readonly speedPositive: ForceVelocitySpec;
  readonly speedNegative: ForceVelocitySpec;
}

/** A force-velocity curve's inputs; `src/core/muscle/force-velocity.ts` says what each does. */
export interface ForceVelocitySpec {
  /** The joint speed at which the muscles hold no torque, rad/s. */
  readonly unloadedSpeed: Quantity<number>;
  /** Hill's a / T0. */
  readonly curvature: Quantity<number>;
  /** Torque at fast lengthening over the isometric peak. */
  readonly eccentricCeiling: Quantity<number>;
  /** The lengthening branch's slope at rest over the shortening branch's. */
  readonly eccentricSlopeRatio: Quantity<number>;
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
