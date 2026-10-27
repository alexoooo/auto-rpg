import type { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { ColliderShape, Contact, ContactManifold, MassProperties } from "./engine/engine.ts";
import type { Rigid } from "./build/rigid.ts";
import type { BodySpec, DofSpec, HandPose, JointSpec, SegmentFrame, SegmentSpec, ShapeSpec } from "./spec/body.ts";
import type { Vec3 } from "./spec/quantity.ts";

/**
 * A contact's friction coefficient where neither collider names its own: Rapier's default (`rapier-default-friction`), which every
 * table of the stance's record was measured on (`docs/reference/stance-tuning.md`).
 */
export const CONTACT_FRICTION = 0.5;

/**
 * **A built body as its mind reads it**: the spec it was built from, each segment's pose and
 * motion, its joints' frames, what it touches and what its hands are set to. Every member reads;
 * none moves a body, sets a motor or reaches the engine. A mind, the skills and motor control
 * (`OwnBody`, `src/core/mind/mind.ts`) are given this and never the built body
 * (`BuiltBody`, `src/core/build/build-body.ts`), which extends it with what acts.
 */
export interface ReadBody {
  readonly spec: BodySpec;
  readonly physics: ReadPhysics;
  readonly segments: ReadonlyMap<string, ReadSegment>;
  readonly joints: ReadonlyMap<string, ReadJoint>;
  readonly handPoses: ReadHandPoses;
}

/** Which body another is, in a contact: an identity to compare and its node's name, and nothing to act on. */
export interface BodyRef {
  /** Stable within its world and its snapshots (`SegmentBody.id`). */
  readonly id: number;
  readonly node: { readonly name: string };
}

/**
 * Whether `other`, a contact's other side as a mind reads it, is `body`: the same engine body by
 * its id, which every view of it keeps. A contact never hands a mind the engine body itself.
 */
export const isBody = (other: BodyRef | null, body: { readonly id: number }): boolean => other !== null && other.id === body.id;

/** A segment's node as read: its name, and its pose, world, as the last step left it. */
interface ReadNode {
  readonly name: string;
  readonly position: Vector3;
  readonly rotationQuaternion: Quaternion | null;
}

/** A segment's rigid body as read: its motion and its mass properties. */
export interface ReadSegmentBody extends BodyRef {
  readonly node: ReadNode;
  linearVelocityToRef(out: Vector3): Vector3;
  angularVelocityToRef(out: Vector3): Vector3;
  readonly massProperties: MassProperties;
}

/** A hand in one pose: its first shape the pose's, the rest as held. */
export interface HandConfiguration {
  readonly shape: ShapeSpec;
  readonly rigid: Rigid;
  readonly collider: ColliderShape;
}

export interface ReadSegment {
  readonly spec: SegmentSpec;
  /** The segment frame in the body frame, reference pose. */
  readonly frame: SegmentFrame;
  readonly node: ReadNode;
  readonly body: ReadSegmentBody;
  /** The node's rotation in the reference pose, from which a joint reads its angles. */
  readonly rest: Quaternion;
  /**
   * Its rigid body: the segment and what it holds (`rigid.ts`), whose mass properties the body has;
   * its shapes are as they are now, a hand's in its pose (`poses`) and a foot's toes as they lie.
   */
  readonly rigid: Rigid;
  /** Applied hand configuration, with pending requests kept in the body's pose state. */
  readonly handPose?: { readonly applied: HandPose; readonly requested: HandPose };
  /** A posable hand's configurations, made once: each pose's shape (`handShapeAt`), its rigid body and its collider. */
  readonly poses?: Readonly<Record<HandPose, HandConfiguration>>;
  /** A foot's toes now (`ToesState`, `src/core/build/toes.ts`): their bend, rad, 0 flat. */
  readonly toes?: { readonly bend: number };
}

/** A spec freedom as the joint has it: its angular axis is the freedom's index, and its sense may be flipped. */
export interface BuiltDof {
  readonly spec: DofSpec;
  /** +1 when the constraint axis turns the child in the freedom's positive sense, else -1. */
  readonly sign: 1 | -1;
}

/**
 * **What turns a joint**, read from its spec alone (`jointKinematics`), so that a pose can be
 * solved for a body before it is built: its freedoms as the constraint has them, and the
 * constraint's axes.
 */
export interface JointKinematics {
  readonly spec: JointSpec;
  readonly dofs: readonly BuiltDof[];
  /**
   * The constraint's X, Y and Z, body frame, reference pose: X is the first freedom's axis, and
   * the engine measures the joint's angles about these (`jointAngles`).
   */
  readonly axes: { readonly x: Vec3; readonly y: Vec3; readonly z: Vec3 };
}

export interface ReadJoint extends JointKinematics {
  readonly parent: ReadSegment;
  readonly child: ReadSegment;
}

/** The segment no joint carries: the root, whose frame is the body frame a goal is set in. */
export function rootSegment<S extends ReadSegment>(body: { readonly spec: BodySpec; readonly segments: ReadonlyMap<string, S>; readonly joints: ReadonlyMap<string, ReadJoint> }): S {
  const carried = new Set<ReadSegment>([...body.joints.values()].map((joint) => joint.child));
  const roots = [...body.segments.values()].filter((segment) => !carried.has(segment));
  if (roots.length !== 1) throw new Error(`${body.spec.model} has ${roots.length} segments no joint carries, not one`);
  return roots[0]!;
}

/** A contact as read: the other body by its identity alone. */
export interface ReadContact extends Omit<Contact, "other"> {
  readonly other: BodyRef | null;
}

/** A narrow-phase manifold as read: the other body by its identity alone. */
export interface ReadManifold extends Omit<ContactManifold, "other"> {
  readonly other: BodyRef | null;
}

/** What a body reads of the physics it is in: gravity, and its own segments' contacts (`PhysicsWorld.contactsOf`). */
export interface ReadPhysics {
  readonly gravity: Vec3;
  contactsOf(body: ReadSegmentBody, wanted?: (other: BodyRef | null) => boolean): readonly ReadContact[];
  contactManifoldsOf(body: ReadSegmentBody, wanted?: (other: BodyRef | null) => boolean): readonly ReadManifold[];
}

/** Each posable hand's configurations, and the pose each has and was asked (`HandPoses`). */
interface ReadHandPoses {
  readonly model: readonly { readonly hand: "left" | "right"; readonly segment: string; readonly poses: readonly HandPose[] }[];
  readonly state: Readonly<Record<string, { readonly applied: HandPose; readonly requested: HandPose }>>;
}
