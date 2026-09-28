import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody.js";
import { Physics6DoFConstraint, type Physics6DoFLimit } from "@babylonjs/core/Physics/v2/physicsConstraint.js";
import { PhysicsShapeBox, PhysicsShapeCapsule, PhysicsShapeSphere, type PhysicsShape } from "@babylonjs/core/Physics/v2/physicsShape.js";
import { PhysicsConstraintAxis, PhysicsMotionType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { segmentFrame, type BodySpec, type DofSpec, type JointSpec, type SegmentFrame, type SegmentSpec, type ShapeSpec } from "../spec/body.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { cross, dot, normalize, orthogonalTo, sub } from "../spec/vec.ts";

/**
 * **`buildBody`: Havok bodies and joints from a spec, and from nothing else.**
 *
 * Each segment is a dynamic body whose node sits at the segment frame's origin, turned to its
 * frame (`segmentFrame`). Its mass, centre of mass and inertia are set from the spec explicitly,
 * so the collision shape carries no mass. Each joint is a 6-DoF constraint at the joint's centre
 * whose free angular axes are the spec's freedoms, limited to their ranges; every other axis is
 * locked, and the two segments it joins do not collide with each other.
 *
 * The body is built in its reference pose, where every joint's angle is zero, so no constraint
 * disagrees with its bodies at construction (H09).
 *
 * Nothing here drives a joint: the muscles do (stage 2 of the plan). Collision layers against
 * other bodies, and contact materials, join when the spec states contact (stage 5); until then a
 * segment has the engine's default material and collides with everything but its joint partners.
 */

export interface BuiltSegment {
  readonly spec: SegmentSpec;
  /** The segment frame in the body frame, reference pose. */
  readonly frame: SegmentFrame;
  readonly node: TransformNode;
  readonly body: PhysicsBody;
  readonly shape: PhysicsShape;
}

/** A spec freedom as the constraint has it: which angular axis, and whether its sense is flipped. */
export interface BuiltDof {
  readonly spec: DofSpec;
  readonly axis: PhysicsConstraintAxis;
  /** +1 when the constraint axis turns the child in the freedom's positive sense, else -1. */
  readonly sign: 1 | -1;
}

export interface BuiltJoint {
  readonly spec: JointSpec;
  readonly parent: BuiltSegment;
  readonly child: BuiltSegment;
  readonly constraint: Physics6DoFConstraint;
  readonly dofs: readonly BuiltDof[];
}

export interface BuiltBody {
  readonly spec: BodySpec;
  readonly segments: ReadonlyMap<string, BuiltSegment>;
  readonly joints: ReadonlyMap<string, BuiltJoint>;
  dispose(): void;
}

export interface Placement {
  /** Where the body frame's origin, between the soles, is put in the world. */
  readonly position: Vec3;
}

const LINEAR = [PhysicsConstraintAxis.LINEAR_X, PhysicsConstraintAxis.LINEAR_Y, PhysicsConstraintAxis.LINEAR_Z] as const;
const ANGULAR = [PhysicsConstraintAxis.ANGULAR_X, PhysicsConstraintAxis.ANGULAR_Y, PhysicsConstraintAxis.ANGULAR_Z] as const;

const v3 = (v: Vec3): Vector3 => new Vector3(v[0], v[1], v[2]);

/** `point`, body frame, in `frame`'s coordinates. */
function local(frame: SegmentFrame, point: Vec3): Vec3 {
  const d = sub(point, frame.origin);
  return [dot(d, frame.x), dot(d, frame.y), dot(d, frame.z)];
}

/** `direction`, body frame, in `frame`'s coordinates. */
const localDirection = (frame: SegmentFrame, direction: Vec3): Vec3 =>
  [dot(direction, frame.x), dot(direction, frame.y), dot(direction, frame.z)];

function makeShape(frame: SegmentFrame, spec: ShapeSpec, scene: Scene): PhysicsShape {
  switch (spec.kind) {
    case "capsule":
      return new PhysicsShapeCapsule(v3(local(frame, spec.from.value)), v3(local(frame, spec.to.value)), spec.radius.value, scene);
    case "box":
      return new PhysicsShapeBox(v3(local(frame, spec.centre.value)), Quaternion.Identity(), v3(spec.size.value), scene);
    case "sphere":
      return new PhysicsShapeSphere(v3(local(frame, spec.centre.value)), spec.radius.value, scene);
    default: {
      const never: never = spec;
      throw new Error(`unknown shape ${JSON.stringify(never)}`);
    }
  }
}

function buildSegment(spec: SegmentSpec, model: string, placement: Placement, scene: Scene): BuiltSegment {
  const frame = segmentFrame(spec.proximal.value, spec.distal.value);
  const node = new TransformNode(`${model}.${spec.name}`, scene);
  node.position = v3(frame.origin).addInPlace(v3(placement.position));
  node.rotationQuaternion = Quaternion.RotationQuaternionFromAxis(v3(frame.x), v3(frame.y), v3(frame.z));
  const body = new PhysicsBody(node, PhysicsMotionType.DYNAMIC, false, scene);
  const shape = makeShape(frame, spec.shape, scene);
  body.shape = shape;
  body.setMassProperties({
    mass: spec.mass.value,
    centerOfMass: v3(local(frame, spec.centreOfMass.value)),
    inertia: v3(spec.inertia.value),
    inertiaOrientation: Quaternion.Identity(),
  });
  return { spec, frame, node, body, shape };
}

/**
 * The constraint frame for a joint's freedoms: X is the first freedom's axis, Y the second's (or
 * any square to X), and Z whatever the engine completes them with. `sign` says whether each
 * freedom's axis runs with its constraint axis or against it.
 *
 * The engine's Z is X cross Y in Babylon's components; `tests/core-build.test.mjs` drives each
 * axis both ways round and reads the turn back.
 */
function constraintAxes(dofs: readonly DofSpec[]): { readonly x: Vec3; readonly y: Vec3; readonly signs: readonly (1 | -1)[] } {
  if (dofs.length < 1 || dofs.length > 3) throw new Error(`a joint has one to three freedoms, not ${dofs.length}`);
  const x = normalize(dofs[0]!.axis.value);
  const y = dofs[1] ? normalize(dofs[1].axis.value) : orthogonalTo(Math.abs(x[1]) < Math.abs(x[0]) ? [0, 1, 0] : [1, 0, 0], x);
  const z = cross(x, y);
  const along = [x, y, z];
  const signs = dofs.map((dof, k) => {
    const alignment = dot(normalize(dof.axis.value), along[k]!);
    if (Math.abs(Math.abs(alignment) - 1) > 1e-9) throw new Error(`freedom ${dof.positive}'s axis is not square to the others`);
    return alignment > 0 ? 1 : -1;
  });
  return { x, y, signs };
}

function buildJoint(spec: JointSpec, parent: BuiltSegment, child: BuiltSegment, scene: Scene): BuiltJoint {
  const { x, y, signs } = constraintAxes(spec.dofs);
  const limits: Physics6DoFLimit[] = LINEAR.map((axis) => ({ axis, minLimit: 0, maxLimit: 0 }));
  const dofs: BuiltDof[] = spec.dofs.map((dof, k) => ({ spec: dof, axis: ANGULAR[k]!, sign: signs[k]! }));
  ANGULAR.forEach((axis, k) => {
    const dof = dofs[k];
    if (!dof) { limits.push({ axis, minLimit: 0, maxLimit: 0 }); return; }
    const { min, max } = dof.spec;
    limits.push(dof.sign > 0
      ? { axis, minLimit: min.value, maxLimit: max.value }
      : { axis, minLimit: -max.value, maxLimit: -min.value });
  });
  const centre = spec.centre.value;
  const constraint = new Physics6DoFConstraint({
    pivotA: v3(local(parent.frame, centre)),
    pivotB: v3(local(child.frame, centre)),
    axisA: v3(localDirection(parent.frame, x)),
    axisB: v3(localDirection(child.frame, x)),
    perpAxisA: v3(localDirection(parent.frame, y)),
    perpAxisB: v3(localDirection(child.frame, y)),
    collision: false,
  }, limits, scene);
  parent.body.addConstraint(child.body, constraint);
  return { spec, parent, child, constraint, dofs };
}

/** Build `spec` in its reference pose at `placement`. */
export function buildBody(spec: BodySpec, scene: Scene, placement: Placement): BuiltBody {
  const segments = new Map<string, BuiltSegment>();
  for (const segment of spec.segments) {
    if (segments.has(segment.name)) throw new Error(`${spec.model} names ${segment.name} twice`);
    segments.set(segment.name, buildSegment(segment, spec.model, placement, scene));
  }
  const joints = new Map<string, BuiltJoint>();
  for (const joint of spec.joints) {
    const parent = segments.get(joint.parent), child = segments.get(joint.child);
    if (!parent || !child) throw new Error(`${spec.model}'s ${joint.name} joins a segment it does not have`);
    joints.set(joint.name, buildJoint(joint, parent, child, scene));
  }
  return {
    spec, segments, joints,
    dispose() {
      for (const joint of joints.values()) joint.constraint.dispose();
      for (const segment of segments.values()) {
        segment.body.dispose();
        segment.shape.dispose();
        segment.node.dispose();
      }
    },
  };
}
