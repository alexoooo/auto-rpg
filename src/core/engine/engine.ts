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
 *   most a ceiling of torque either way, as a hard constraint (no softness) the step enforces.
 * - **A contact is one the step pushed on**: `contactsOf` names another body only if the solver
 *   gave the touch between them an impulse in the last step, so a blow is read in the step it lands.
 * - Solver settings that exist for the solver are the engine module's, named and sourced there, and
 *   kept out of the body's numbers.
 */
/** Every contact's friction coefficient: Rapier's default, which the stance was measured on. */
export const CONTACT_FRICTION = 0.5;

export interface PhysicsEngine {
  /** The engine's name, as `engines.ts` lists it. */
  readonly name: string;
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
  /** The mass properties the core set. */
  readonly massProperties: MassProperties;
  setMassProperties(properties: MassProperties): void;
  /** The mass the engine holds, kg, read back from it: the core's, if the engine took it. */
  engineMass(): number;
  /** The vertices of the body's collider `k`, if it is a hull, in the body's frame, as the engine built them; otherwise null. */
  hullVertices(k: number): readonly Vec3[] | null;
  /** Hold the body still where it is, or let it go again. */
  setFixed(fixed: boolean): void;
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
}

/**
 * **A body's touch with another dynamic body**, as the last step left it: one for each body it
 * touched, whatever colliders met.
 */
export interface Contact {
  readonly other: SegmentBody;
  /**
   * Where they touch, world, m: each touching pair of colliders' solver contact points averaged,
   * and the pairs weighted by their impulse.
   */
  readonly point: Vec3;
  /** The touch's normal, world, unit, from this body into the other. */
  readonly normal: Vec3;
  /** The impulse the solver pushed them apart with in the last step, N s, along the normal. */
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
  readonly gravity: Vec3;
  /** A dynamic body at its node's pose, its colliders massless: its mass is `mass`. */
  addBody(node: TransformNode, shapes: readonly ColliderShape[], mass: MassProperties): SegmentBody;
  addJoint(parent: SegmentBody, child: SegmentBody, frames: JointFrames): EngineJoint;
  /** A fixed box, centre and full size, world, turned `turn` about up (rad; 0 unturned). */
  addFixedBox(centre: Vec3, size: Vec3, turn?: number): FixedCollider;
  /** A fixed collider of any shape a body takes (`ColliderShape`), its coordinates world. */
  addFixedShape(shape: ColliderShape): FixedCollider;
  /** Every other dynamic body `body` touched in the last step (`Contact`); fixed colliders are not bodies. */
  contactsOf(body: SegmentBody): readonly Contact[];
  /** One solver step of `dt`, then every body's node written from its body. */
  step(dt: number): void;
  /** Remove a body, its colliders and its joints; nothing once the world is disposed. */
  removeBody(body: SegmentBody): void;
  /** Free the world and everything in it; again is nothing. */
  dispose(): void;
}
