import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { ColliderShape, CoreJoint, PhysicsWorld, SegmentBody } from "../engine/engine.ts";
import type { World } from "../world.ts";
import { frameOf, type BodySpec, type DofSpec, type JointSpec, type SegmentFrame, type SegmentSpec, type ShapeSpec } from "../spec/body.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { cross, dot, normalize, orthogonalTo, sub } from "../spec/vec.ts";
import { hasProducts, principalOf, rigidOf, type Rigid } from "./rigid.ts";

/**
 * **`buildBody`: bodies and joints from a spec, and from nothing else.**
 *
 * Each segment is a dynamic body whose node sits at the segment frame's origin, turned to its
 * frame (`frameOf`). Its mass, centre of mass and inertia are set from the spec explicitly, so its
 * colliders carry no mass. A segment that holds an item (`BodySpec.held`) is one body with it: its
 * mass properties are the two together (`rigidOf`), turned to their principal axes, and it has a
 * collider for each shape of both. Each joint is a generic joint at the joint's centre whose free
 * angular axes are the spec's freedoms, limited to their ranges; every other axis is locked, and
 * the two segments it joins do not collide with each other (`src/core/engine/engine.ts`).
 *
 * The body is built in its reference pose, where every joint's angle is zero, so no joint disagrees
 * with its bodies at construction (H09).
 *
 * Nothing here drives a joint: the muscles do (stage 2 of the plan). Collision layers against other
 * bodies, and contact materials, join when the spec states contact; until then a segment has the
 * engine's default material and collides with everything but its joint partners.
 */

export interface BuiltSegment {
  readonly spec: SegmentSpec;
  /** The segment frame in the body frame, reference pose. */
  readonly frame: SegmentFrame;
  readonly node: TransformNode;
  readonly body: SegmentBody;
  /** The node's rotation in the reference pose, from which a joint reads its angles. */
  readonly rest: Quaternion;
  /** Its rigid body: the segment and what it holds (`rigid.ts`), whose mass properties the body has. */
  readonly rigid: Rigid;
}

/** A spec freedom as the joint has it: its angular axis is the freedom's index, and its sense may be flipped. */
export interface BuiltDof {
  readonly spec: DofSpec;
  /** +1 when the constraint axis turns the child in the freedom's positive sense, else -1. */
  readonly sign: 1 | -1;
}

export interface BuiltJoint {
  readonly spec: JointSpec;
  readonly parent: BuiltSegment;
  readonly child: BuiltSegment;
  readonly joint: CoreJoint;
  readonly dofs: readonly BuiltDof[];
  /**
   * The constraint's X, Y and Z, body frame, reference pose: X is the first freedom's axis, and
   * the engine measures the joint's angles about these (`jointAngles`).
   */
  readonly axes: { readonly x: Vec3; readonly y: Vec3; readonly z: Vec3 };
}

export interface BuiltBody {
  readonly spec: BodySpec;
  /** The physics it was built in. */
  readonly physics: PhysicsWorld;
  readonly segments: ReadonlyMap<string, BuiltSegment>;
  readonly joints: ReadonlyMap<string, BuiltJoint>;
  dispose(): void;
}

export interface Placement {
  /** Where the body frame's origin, between the soles, is put in the world. */
  readonly position: Vec3;
}

const v3 = (v: Vec3): Vector3 => new Vector3(v[0], v[1], v[2]);

/** `point`, body frame, in `frame`'s coordinates. */
function local(frame: SegmentFrame, point: Vec3): Vec3 {
  const d = sub(point, frame.origin);
  return [dot(d, frame.x), dot(d, frame.y), dot(d, frame.z)];
}

/** `direction`, body frame, in `frame`'s coordinates. */
const localDirection = (frame: SegmentFrame, direction: Vec3): Vec3 =>
  [dot(direction, frame.x), dot(direction, frame.y), dot(direction, frame.z)];

function colliderOf(frame: SegmentFrame, spec: ShapeSpec): ColliderShape {
  switch (spec.kind) {
    case "capsule":
      return { kind: "capsule", from: local(frame, spec.from.value), to: local(frame, spec.to.value), radius: spec.radius.value };
    case "box":
      return { kind: "box", centre: local(frame, spec.centre.value), size: spec.size.value };
    case "sphere":
      return { kind: "sphere", centre: local(frame, spec.centre.value), radius: spec.radius.value };
    case "hull":
      return { kind: "hull", points: spec.points.map((p) => local(frame, p.value)) };
    default: {
      const never: never = spec;
      throw new Error(`unknown shape ${JSON.stringify(never)}`);
    }
  }
}

function buildSegment(body: BodySpec, spec: SegmentSpec, placement: Placement, world: World): BuiltSegment {
  const frame = frameOf(spec);
  const rigid = rigidOf(body, spec);
  const node = new TransformNode(`${body.model}.${spec.name}`, world.scene);
  node.position = v3(frame.origin).addInPlace(v3(placement.position));
  node.rotationQuaternion = Quaternion.RotationQuaternionFromAxis(v3(frame.x), v3(frame.y), v3(frame.z));
  const [xx, yy, zz] = rigid.tensor;
  const principal = hasProducts(rigid.tensor) ? principalOf(rigid.tensor) : null;
  const physics = world.physics.addBody(node, rigid.shapes.map((shape) => colliderOf(frame, shape)), {
    mass: rigid.mass,
    centre: local(frame, rigid.centre),
    moments: principal ? principal.moments : [xx, yy, zz],
    orientation: principal
      ? Quaternion.RotationQuaternionFromAxis(v3(principal.axes[0]), v3(principal.axes[1]), v3(principal.axes[2]))
      : Quaternion.Identity(),
  });
  return { spec, frame, node, body: physics, rest: node.rotationQuaternion.clone(), rigid };
}

/**
 * The constraint frame for a joint's freedoms: X is the first freedom's axis, Y the second's (or
 * any square to X), and Z whatever the engine completes them with. `sign` says whether each
 * freedom's axis runs with its constraint axis or against it.
 *
 * The engine's Z is X cross Y in Babylon's components; `tests/core-build.test.mjs` drives each
 * axis both ways round and reads the turn back.
 */
function constraintAxes(dofs: readonly DofSpec[]): { readonly x: Vec3; readonly y: Vec3; readonly z: Vec3; readonly signs: readonly (1 | -1)[] } {
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
  return { x, y, z, signs };
}

/** The rotation taking a frame's own x, y and z onto `x`, `y` and `z`, given in that frame. */
const frameRotation = (x: Vec3, y: Vec3, z: Vec3): Quaternion => Quaternion.RotationQuaternionFromAxis(v3(x), v3(y), v3(z));

function buildJoint(spec: JointSpec, parent: BuiltSegment, child: BuiltSegment, world: World): BuiltJoint {
  const { x, y, z, signs } = constraintAxes(spec.dofs);
  const dofs: BuiltDof[] = spec.dofs.map((dof, k) => ({ spec: dof, sign: signs[k]! }));
  const centre = spec.centre.value;
  const inFrame = (frame: SegmentFrame) => frameRotation(localDirection(frame, x), localDirection(frame, y), localDirection(frame, z));
  const joint = world.physics.addJoint(parent.body, child.body, {
    anchorParent: local(parent.frame, centre),
    anchorChild: local(child.frame, centre),
    frameParent: inFrame(parent.frame),
    frameChild: inFrame(child.frame),
    limits: dofs.map(({ spec: { min, max }, sign }) => (sign > 0 ? [min.value, max.value] as const : [-max.value, -min.value] as const)),
  });
  return { spec, parent, child, joint, dofs, axes: { x, y, z } };
}

/** Build `spec` in its reference pose at `placement`, in `world`. */
export function buildBody(spec: BodySpec, world: World, placement: Placement): BuiltBody {
  const segments = new Map<string, BuiltSegment>();
  for (const segment of spec.segments) {
    if (segments.has(segment.name)) throw new Error(`${spec.model} names ${segment.name} twice`);
    segments.set(segment.name, buildSegment(spec, segment, placement, world));
  }
  for (const held of spec.held ?? []) if (!segments.has(held.segment)) throw new Error(`${spec.model} has no ${held.segment} to hold ${held.item.name}`);
  const joints = new Map<string, BuiltJoint>();
  for (const joint of spec.joints) {
    const parent = segments.get(joint.parent), child = segments.get(joint.child);
    if (!parent || !child) throw new Error(`${spec.model}'s ${joint.name} joins a segment it does not have`);
    joints.set(joint.name, buildJoint(joint, parent, child, world));
  }
  return {
    spec, physics: world.physics, segments, joints,
    dispose() {
      // Removing a body removes its colliders and joints with it.
      for (const segment of segments.values()) {
        world.physics.removeBody(segment.body);
        segment.node.dispose();
      }
    },
  };
}
