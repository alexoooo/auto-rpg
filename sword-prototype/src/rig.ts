import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector.js";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate.js";
import { Physics6DoFConstraint } from "@babylonjs/core/Physics/v2/physicsConstraint.js";
import type { Physics6DoFLimit } from "@babylonjs/core/Physics/v2/physicsConstraint.js";
import {
  PhysicsShapeType,
  PhysicsConstraintAxis,
  PhysicsConstraintAxisLimitMode,
  PhysicsMotionType,
} from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import type { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody.js";
import type { PhysicsShape } from "@babylonjs/core/Physics/v2/physicsShape.js";
import type { Material } from "@babylonjs/core/Materials/material.js";
import type { Scene } from "@babylonjs/core/scene.js";

/** A visible mesh and the rigid body that drives it, kept together. */
export interface Part {
  readonly name: string;
  readonly mesh: Mesh;
  readonly body: PhysicsBody;
  readonly shape: PhysicsShape;
}

export interface PartOptions {
  name: string;
  position: Vector3;
  rotation?: Quaternion;
  mass: number;
  layer: number;
  collidesWith: number;
  material?: Material;
  friction?: number;
  restitution?: number;
  motionType?: PhysicsMotionType;
  /** Control frames exist for the solver, not for the eye. */
  visible?: boolean;
  /** Where the body balances, in its own local space. */
  centerOfMass?: Vector3;
}

function finish(
  scene: Scene,
  mesh: Mesh,
  shapeType: PhysicsShapeType,
  opts: PartOptions,
): Part {
  mesh.position.copyFrom(opts.position);
  if (opts.visible === false) mesh.isVisible = false;
  mesh.rotationQuaternion = opts.rotation ? opts.rotation.clone() : Quaternion.Identity();
  if (opts.material) mesh.material = opts.material;

  const aggregate = new PhysicsAggregate(
    mesh,
    shapeType,
    {
      mass: opts.mass,
      friction: opts.friction ?? 0.6,
      restitution: opts.restitution ?? 0.05,
    },
    scene,
  );

  aggregate.shape.filterMembershipMask = opts.layer;
  aggregate.shape.filterCollideMask = opts.collidesWith;

  if (opts.motionType !== undefined) aggregate.body.setMotionType(opts.motionType);
  if (opts.centerOfMass) {
    const props = aggregate.body.getMassProperties();
    aggregate.body.setMassProperties({ ...props, centerOfMass: opts.centerOfMass });
  }

  return { name: opts.name, mesh, body: aggregate.body, shape: aggregate.shape };
}

/** A limb segment. `height` is the full tip-to-tip length, along local Y. */
export function capsulePart(
  scene: Scene,
  opts: PartOptions & { height: number; radius: number },
): Part {
  const mesh = MeshBuilder.CreateCapsule(
    opts.name,
    { height: opts.height, radius: opts.radius, tessellation: 12, subdivisions: 1 },
    scene,
  );
  return finish(scene, mesh, PhysicsShapeType.CAPSULE, opts);
}

/** A control frame or a small round thing. */
export function spherePart(
  scene: Scene,
  opts: PartOptions & { diameter: number },
): Part {
  const mesh = MeshBuilder.CreateSphere(
    opts.name,
    { diameter: opts.diameter, segments: 6 },
    scene,
  );
  return finish(scene, mesh, PhysicsShapeType.SPHERE, opts);
}

export function boxPart(
  scene: Scene,
  opts: PartOptions & { size: Vector3 },
): Part {
  const mesh = MeshBuilder.CreateBox(
    opts.name,
    { width: opts.size.x, height: opts.size.y, depth: opts.size.z },
    scene,
  );
  return finish(scene, mesh, PhysicsShapeType.BOX, opts);
}

/**
 * A wheel, a roller or a drum: `height` is the length along local Y and the shape is a
 * cylinder about that same axis.
 *
 * The fourth primitive here, added 2026-09-04 for the golem's wheel locomotion module. A sphere
 * rolls in every direction and a capsule's ends are hemispheres, so neither is a wheel: what a
 * wheel needs is a flat-ended disc whose contact with the floor is a line across its tread and
 * whose inertia is a disc's about one axis. Babylon derives the cylinder's own axis from the
 * mesh's **local** bounding box, so a wheel is built by rotating the *mesh* to lay the axle
 * across the body -- exactly as `capsulePart`'s limbs run along their own local Y.
 */
export function cylinderPart(
  scene: Scene,
  opts: PartOptions & { height: number; diameter: number; tessellation?: number },
): Part {
  const mesh = MeshBuilder.CreateCylinder(
    opts.name,
    { height: opts.height, diameter: opts.diameter, tessellation: opts.tessellation ?? 24 },
    scene,
  );
  return finish(scene, mesh, PhysicsShapeType.CYLINDER, opts);
}

const LINEAR = [
  PhysicsConstraintAxis.LINEAR_X,
  PhysicsConstraintAxis.LINEAR_Y,
  PhysicsConstraintAxis.LINEAR_Z,
];
const ANGULAR = [
  PhysicsConstraintAxis.ANGULAR_X,
  PhysicsConstraintAxis.ANGULAR_Y,
  PhysicsConstraintAxis.ANGULAR_Z,
];

const locked = (axis: PhysicsConstraintAxis): Physics6DoFLimit => ({
  axis,
  minLimit: 0,
  maxLimit: 0,
});

/**
 * A joint with every axis locked except the angular ones named in `swing`.
 *
 * Everything in the rig goes through one constraint type on purpose: a hinge is
 * a ball joint with two axes pinned, and having a single code path means a joint
 * that misbehaves is tuned rather than rebuilt as a different class.
 */
export function joint(
  scene: Scene,
  parent: Part,
  child: Part,
  opts: {
    pivotParent: Vector3;
    pivotChild: Vector3;
    axisParent?: Vector3;
    axisChild?: Vector3;
    perpParent?: Vector3;
    perpChild?: Vector3;
    swing: Partial<Record<"x" | "y" | "z", { min: number; max: number }>>;
    stiffness?: number;
    damping?: number;
  },
): Physics6DoFConstraint {
  const limits: Physics6DoFLimit[] = LINEAR.map(locked);

  const byName = { x: ANGULAR[0], y: ANGULAR[1], z: ANGULAR[2] } as const;
  for (const key of ["x", "y", "z"] as const) {
    const range = opts.swing[key];
    if (!range) {
      limits.push(locked(byName[key]));
      continue;
    }
    limits.push({
      axis: byName[key],
      minLimit: range.min,
      maxLimit: range.max,
      ...(opts.stiffness !== undefined ? { stiffness: opts.stiffness } : {}),
      ...(opts.damping !== undefined ? { damping: opts.damping } : {}),
    });
  }

  const constraint = new Physics6DoFConstraint(
    {
      pivotA: opts.pivotParent,
      pivotB: opts.pivotChild,
      axisA: opts.axisParent ?? new Vector3(1, 0, 0),
      axisB: opts.axisChild ?? new Vector3(1, 0, 0),
      perpAxisA: opts.perpParent ?? new Vector3(0, 1, 0),
      perpAxisB: opts.perpChild ?? new Vector3(0, 1, 0),
      // Adjacent limbs overlap at the joint by design; letting them collide
      // there is a permanent source of jitter and nothing else.
      collision: false,
    },
    limits,
    scene,
  );

  parent.body.addConstraint(child.body, constraint);
  for (const axis of [...LINEAR, ...ANGULAR]) {
    const range = limits.find((limit) => limit.axis === axis);
    if (range && range.minLimit === 0 && range.maxLimit === 0) {
      constraint.setAxisMode(axis, PhysicsConstraintAxisLimitMode.LOCKED);
    }
  }
  return constraint;
}
