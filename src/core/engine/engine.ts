import type { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Vec3 } from "../spec/quantity.ts";

/**
 * **What the core asks of a physics engine**, and nothing of any engine's own types. The core builds
 * bodies (`src/core/build/build-body.ts`) and steps them (`src/core/world.ts`) through these
 * interfaces alone; an engine is one module beside this one that implements them (`rapier.ts`) and
 * is named in `engines.ts`, so a candidate that passes the physics bench (`src/physics-bench/`) runs
 * under the core's tests by writing that module (`CORE_ENGINE=<name> npm test`).
 *
 * The contract, which an engine meets or converts to:
 * - **The step is fixed.** `PhysicsWorld.step` takes the world's step and nothing else, and after it
 *   every body's node holds its body's pose in `position` and `rotationQuaternion`, and everything
 *   that reads a pose reads those, never a world matrix, which Babylon caches per render id.
 * - **Bodies never sleep**: a sleeping body reads a perfect zero.
 * - **Mass is the spec's.** A body's colliders carry none; its mass properties are set whole.
 * - **Velocities are the centre of mass's**, not the node's.
 * - **Every contact's friction is `CONTACT_FRICTION`**, whichever two colliders meet, and no contact
 *   bounces: what the stance takes the ground to give (`GROUND_FRICTION`,
 *   `src/core/control/support.ts`).
 * - **A joint's freedom k is angular axis k of the joint's frame**, fixed in the parent, its angle
 *   measured as `jointAngles` reads it (`src/core/build/joint-state.ts`) and limited there; every
 *   other axis, linear and angular, is locked, and the two bodies it joins do not collide.
 * - **A motor is a velocity constraint bounded by a torque**: freedom k driven at a speed, with at
 *   most a ceiling of torque either way, or separate directional ceilings, as a hard constraint
 *   (no softness) the step enforces. Its delivered impulse includes every substep of the step.
 * - **A contact says whether the step pushed on it**: `contactsOf` names every body and every fixed
 *   collider a body is in contact with, and the impulse the solver gave the touch between them in
 *   the last step, which is 0 for two that are in contact and were not pushed apart. A blow is read
 *   in the step it lands: the step it is first pushed.
 * - Solver settings that exist for the solver are the engine module's, named and sourced there, and
 *   kept out of the body's numbers.
 */
/**
 * Every contact's friction coefficient: Rapier's default (`rapier-default-friction`), which every
 * table of the stance's record was measured on (`docs/reference/stance-tuning.md`).
 */
export const CONTACT_FRICTION = 0.5;

export interface PhysicsEngine {
  /** The engine's name, as `engines.ts` lists it. */
  readonly name: string;
  /** Installed solver artifact and adapter revision, for replay compatibility. */
  readonly revision: string;
  /** A world of this engine's, with the core's gravity. */
  createPhysics(options: PhysicsOptions): PhysicsWorld;
}

export interface PhysicsOptions {
  /** Steps a second. */
  readonly hz: number;
  /** Standard gravity, or none. */
  readonly gravity: boolean;
}

/** Mass properties as the spec gives them: kg, the centre in the body's frame, principal moments (kg m2) and their axes. */
export interface MassProperties {
  readonly mass: number;
  readonly centre: Vec3;
  readonly moments: Vec3;
  readonly orientation: Quaternion;
}

/** **A dynamic body with its node**: what the core reads of a body and does to it. */
export interface SegmentBody {
  readonly node: TransformNode;
  linearVelocityToRef(out: Vector3): Vector3;
  angularVelocityToRef(out: Vector3): Vector3;
  /** An impulse (N s, world) at a point (world). */
  applyImpulse(impulse: Vector3, at: Vector3): void;
  /** An angular impulse (N m s, world). */
  applyTorqueImpulse(impulse: Vector3): void;
  /** A force (N, world) at a point (world) through the next step and no longer: the solver integrates it as it does gravity. */
  applyForce(force: Vector3, at: Vector3): void;
  /** A moment (N m, world) through the next step and no longer. */
  applyTorque(torque: Vector3): void;
  /** The mass properties the core set. */
  readonly massProperties: MassProperties;
  setMassProperties(properties: MassProperties): void;
  /** The mass the engine holds, kg, read back from it: the core's, if the engine took it. */
  engineMass(): number;
  /** The vertices of the body's collider `k`, if it is a hull, in the body's frame, as the engine built them; otherwise null. */
  hullVertices(k: number): readonly Vec3[] | null;
  /** Hold the body still where it is, or let it go again. */
  setFixed(fixed: boolean): void;
  /**
   * How far `point` (world, m) is from the nearest of the body's shapes' surfaces, m: 0 inside
   * one. Where the body is now.
   */
  gapTo(point: Vec3): number;
}

/** A body's shape, in its own frame: what `PhysicsWorld.addBody` gives it colliders for. */
export type ColliderShape =
  | { readonly kind: "capsule"; readonly from: Vec3; readonly to: Vec3; readonly radius: number }
  | { readonly kind: "box"; readonly centre: Vec3; readonly size: Vec3 }
  | { readonly kind: "sphere"; readonly centre: Vec3; readonly radius: number }
  | { readonly kind: "hull"; readonly points: readonly Vec3[] };

/**
 * **A joint between two bodies**: the joint's frame, whose X, Y and Z are its constraint axes
 * (`BuiltJoint.axes`), set in each body's own frame at the joint's anchor, and each freedom's range.
 */
export interface JointFrames {
  readonly anchorParent: Vec3;
  readonly anchorChild: Vec3;
  /** The constraint axes in each body's frame. */
  readonly frameParent: Quaternion;
  readonly frameChild: Quaternion;
  /** Each freedom's range, rad, about its constraint axis: freedom k's is `limits[k]`. */
  readonly limits: readonly (readonly [number, number])[];
}

export interface EngineJoint {
  /**
   * Freedom k's motor: turn the child relative to the parent about the parent-fixed axis at `speed`
   * (rad/s), with at most `ceiling` (N m) either way.
   */
  setMotor(k: number, speed: number, ceiling: number): void;
  /** The same velocity motor, bounded separately in the child's negative and positive senses (nonnegative N m). */
  setMotorBounds(k: number, speed: number, negative: number, positive: number): void;
  /** Signed impulse delivered to the child over the entire last physics step, N m s; zero before stepping. */
  motorStepImpulse(k: number): number;
}

/** A registered rigid attachment; releasing it preserves both bodies and their velocities. */
export interface EngineGrip {
  readonly attached: boolean;
  /** The pair is excluded while attached, or after release until its shapes clear one another. */
  readonly collisionSuppressed: boolean;
  /** Join the declared local frames. The caller first establishes geometric reachability. */
  attach(): void;
  release(): void;
  /** Remove the slot as well as its attachment; invalidates snapshots with that slot. */
  dispose(): void;
}

/** One pair of shapes the solver pushed apart: this body's and the other's. */
export interface ContactPair {
  /** Which of this body's shapes, and which of the other's, in the order `addBody` was given them; a fixed collider is one shape, 0. */
  readonly mine: number;
  readonly theirs: number;
  /** Where they touch, world, m: the pair's solver contact points averaged. */
  readonly point: Vec3;
  /** The pair's normal, world, unit, from this body into the other. */
  readonly normal: Vec3;
  /** The impulse the solver pushed the pair apart with in the last step, N s. */
  readonly impulse: number;
}

/**
 * **A body's contact with another dynamic body or with a fixed collider**, as the last step left
 * it: one for each body and each fixed collider it is in contact with, whatever colliders met. Two
 * are in contact when the engine's narrow phase gives the solver a contact point between them:
 * touching, or about to within the solver's margin.
 */
export interface Contact {
  /** The body; null when it is a fixed collider. */
  readonly other: SegmentBody | null;
  /** The fixed collider, when `other` is null: a number that is that collider's for as long as it is in the world. */
  readonly fixed: number | null;
  /**
   * Where they touch, world, m: each pair of colliders' solver contact points averaged, and the
   * pairs the solver pushed on weighted by their impulse. Of a contact it did not push on, the
   * pairs' plain average.
   */
  readonly point: Vec3;
  /** The contact's normal, world, unit, from this body into the other: the pairs' weighted as the point is. */
  readonly normal: Vec3;
  /** The impulse the solver pushed them apart with in the last step, N s, along the normal; 0 if it pushed nothing. */
  readonly impulse: number;
  /** Each pair of shapes the solver pushed on, in this body's shapes' order, then the other's; none if it pushed nothing. */
  readonly pairs: readonly ContactPair[];
}

/** A narrow-phase manifold before contact points are averaged; a diagnostic/model reading. */
export interface ContactManifold {
  readonly other: SegmentBody | null;
  readonly fixed: number | null;
  readonly mine: number;
  readonly theirs: number;
  /** Unit normal from this body into the other. */
  readonly normal: Vec3;
  /** Solver points in world space, with signed gap: positive is separated/predicted contact. */
  readonly points: readonly { readonly point: Vec3; readonly distance: number }[];
  /** Sum of manifold normal impulses as stored by the narrow phase, not substep-integrated work. */
  readonly impulse: number;
}

/** Something fixed in the world: the ground, a wall. */
export interface FixedCollider {
  /** Take it out of the world; nothing once the world is disposed. */
  dispose(): void;
}

export interface PhysicsWorld {
  /** The engine's name. */
  readonly engine: string;
  readonly revision: string;
  readonly gravity: Vec3;
  /**
   * A dynamic body at its node's pose, its colliders massless: its mass is `mass`.
   * `ccd` requests continuous collision detection including moving colliders; false retains
   * the engine's default behavior against fixed colliders (`docs/reference/collision-ccd.md`).
   */
  addBody(node: TransformNode, shapes: readonly ColliderShape[], mass: MassProperties,
    options?: { readonly ccd?: boolean }): SegmentBody;
  addJoint(parent: SegmentBody, child: SegmentBody, frames: JointFrames): EngineJoint;
  /** Register a detached grip slot. Slots persist across release and snapshot restoration. */
  addGrip(parent: SegmentBody, child: SegmentBody, frames: Omit<JointFrames, "limits">): EngineGrip;
  /** A fixed box, centre and full size, world, turned `turn` about up (rad; 0 unturned). */
  addFixedBox(centre: Vec3, size: Vec3, turn?: number): FixedCollider;
  /** A fixed collider of any shape a body takes (`ColliderShape`), its coordinates world. */
  addFixedShape(shape: ColliderShape): FixedCollider;
  /**
   * Everything `body` is in contact with as the last step left it (`Contact`): first what the
   * solver pushed on, in the order its colliders met them, then what it did not. `wanted`, if
   * given, is asked of each body near it, and of something fixed (null), before the contact
   * between them is read: one it refuses is not read, and is not reported. Most of what is near
   * a segment is its own body's neighbouring segments, so a reader that wants none of them reads
   * a small part of what there is. What `wanted` throws, the read throws; `wanted` reads no
   * contacts itself.
   */
  contactsOf(body: SegmentBody, wanted?: (other: SegmentBody | null) => boolean): readonly Contact[];
  /** Unaveraged solver geometry. A predicted point or zero impulse is not proof of load-bearing contact. */
  contactManifoldsOf(body: SegmentBody, wanted?: (other: SegmentBody | null) => boolean): readonly ContactManifold[];
  /** One solver step of `dt`, then every body's node written from its body. */
  step(dt: number): void;
  /**
   * The world's whole physical state as it stands: every body's pose and velocity, every joint's
   * motor, the last step's contacts, a force asked for the next, and every body's node, which
   * before its first step is as it was built and not as the solver holds it. Opaque, the engine's own, and
   * good only for `load` on a world of this engine with the same bodies, anatomical joints,
   * registered grip slots and fixed colliders, made in the same order. Each grip's attached or
   * released state restores with the snapshot; registering or disposing a slot changes topology.
   */
  save(): Uint8Array;
  /**
   * Put the world where `bytes` (a `save`) left one, in place: every body, joint and fixed
   * collider it has stays the object it was, each node is as it was at the save, and the next
   * step is the step that followed the save. It throws, and changes nothing, if `bytes` is not a
   * save of a world with this one's bodies, joints and colliders. What the core set outside the
   * solver (`SegmentBody.massProperties`) is not in a save: a load between two worlds is between
   * two built from the same specs.
   */
  load(bytes: Uint8Array): void;
  /** Remove a body, its colliders and its joints; nothing once the world is disposed. */
  removeBody(body: SegmentBody): void;
  /** Free the world and everything in it; again is nothing. */
  dispose(): void;
}
