import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { ColliderShape, EngineJoint, PhysicsWorld, SegmentBody } from "../engine/engine.ts";
import type { World } from "../world.ts";
import { frameOf, handShapeAt, type BodySpec, type DofSpec, type HandPose, type JointSpec, type SegmentFrame, type SegmentSpec, type ShapeSpec } from "../spec/body.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { cross, dot, normalize, orthogonalTo, sub } from "../spec/vec.ts";
import { hasProducts, principalOf, rigidOf, type Rigid } from "./rigid.ts";
import { rotationOfToRef } from "./joint-state.ts";
import { createHandPoses, type HandPoses } from "./hand-poses.ts";

/**
 * **`buildBody`: bodies and joints from a spec and an initial placement.**
 *
 * Each segment is a dynamic body whose node sits at the segment frame's origin, turned to its
 * frame (`frameOf`). Its mass, centre of mass and inertia are set from the spec explicitly, so its
 * colliders carry no mass. A segment that holds an item (`BodySpec.held`) is one body with it: its
 * mass properties are the two together (`rigidOf`), turned to their principal axes, and it has a
 * collider for each shape of both. Each joint is a generic joint at the joint's centre whose free
 * angular axes are the spec's freedoms, limited to their ranges; every other axis is locked, and
 * the two segments it joins do not collide with each other (`src/core/engine/engine.ts`).
 *
 * Placement may supply joint angles and a root rotation; otherwise the reference pose applies.
 * Forward kinematics aligns the anchors before construction, preserving anatomical reference
 * frames. A joint that disagrees with its bodies is cleared by flinging the body.
 *
 * Nothing here drives a joint: the muscles do (`src/core/muscle/driver.ts`). A segment has the
 * declared contact layers and point geometry, with the engine's default friction, and collides
 * with everything but its joint partners.
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
  /** Applied hand configuration, with pending requests kept in the body's pose state. */
  readonly handPose?: { applied: HandPose; requested: HandPose };
  /** A posable hand's configurations, made once: each pose's shape (`handShapeAt`), its rigid body and its collider. */
  readonly poses?: Readonly<Record<HandPose, HandConfiguration>>;
}

/** A hand in one pose: its first shape the pose's, the rest as held. */
interface HandConfiguration {
  readonly shape: ShapeSpec;
  readonly rigid: Rigid;
  readonly collider: ColliderShape;
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

export interface BuiltJoint extends JointKinematics {
  readonly parent: BuiltSegment;
  readonly child: BuiltSegment;
  readonly joint: EngineJoint;
}

export interface BuiltBody {
  readonly spec: BodySpec;
  /** The physics it was built in. */
  readonly physics: PhysicsWorld;
  readonly segments: ReadonlyMap<string, BuiltSegment>;
  readonly joints: ReadonlyMap<string, BuiltJoint>;
  readonly handPoses: HandPoses;
  dispose(): void;
}

/** The segment no joint carries: the root, whose frame is the body frame a goal is set in. */
export function rootSegment(built: BuiltBody): BuiltSegment {
  const carried = new Set([...built.joints.values()].map((joint) => joint.child));
  const roots = [...built.segments.values()].filter((segment) => !carried.has(segment));
  if (roots.length !== 1) throw new Error(`${built.spec.model} has ${roots.length} segments no joint carries, not one`);
  return roots[0]!;
}

interface Placement {
  /** Where the body frame's origin, between the soles, is put in the world. */
  readonly position: Vec3;
  /** Initial rotation of the body frame about its origin, xyzw; normalized during construction. */
  readonly rotation?: readonly [number, number, number, number];
  /** Initial angles by joint, in each freedom's declared sense; omitted joints start at zero. */
  readonly joints?: Readonly<Record<string, readonly number[]>>;
}
interface InitialPose { readonly position: Vector3; readonly rotation: Quaternion }

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

function buildSegment(body: BodySpec, spec: SegmentSpec, placement: Placement, world: World, pose?: InitialPose): BuiltSegment {
  const frame = frameOf(spec);
  const rigid = rigidOf(body, spec);
  const initial: HandPose = body.held?.some(held => held.segment === spec.name) ? "grip" : "open";
  const node = new TransformNode(`${body.model}.${spec.name}`, world.scene);
  node.position = v3(frame.origin).addInPlace(v3(placement.position));
  node.rotationQuaternion = Quaternion.RotationQuaternionFromAxis(v3(frame.x), v3(frame.y), v3(frame.z));
  const rest = node.rotationQuaternion.clone();
  if (pose) { node.position.copyFrom(pose.position); node.rotationQuaternion.copyFrom(pose.rotation); }
  const posed = (name: HandPose): HandConfiguration => {
    const shape = handShapeAt(body, spec, name);
    return { shape, rigid: { ...rigid, shapes: [shape, ...rigid.shapes.slice(1)] }, collider: colliderOf(frame, shape) };
  };
  const poses = spec.handPoses && { open: posed("open"), fist: posed("fist"), grip: posed("grip") };
  // A posed hand's collider is its initial pose's from the first step, as `handPose.applied` says.
  const shapes = poses ? poses[initial].rigid.shapes : rigid.shapes;
  const [xx, yy, zz] = rigid.tensor;
  const principal = hasProducts(rigid.tensor) ? principalOf(rigid.tensor) : null;
  const physics = world.physics.addBody(node, shapes.map((shape) => colliderOf(frame, shape)), {
    mass: rigid.mass,
    centre: local(frame, rigid.centre),
    moments: principal ? principal.moments : [xx, yy, zz],
    orientation: principal
      ? Quaternion.RotationQuaternionFromAxis(v3(principal.axes[0]), v3(principal.axes[1]), v3(principal.axes[2]))
      : Quaternion.Identity(),
  }, { materials: rigid.owners.map((owner, i) => {
    const surface = (() => {
      switch (owner.kind) {
        case "segment": return spec.surface;
        case "region": return owner.region.surface;
        case "held": return owner.held.item.surface;
        default: { const never: never = owner; throw new Error(`unknown material owner ${JSON.stringify(never)}`); }
      }
    })();
    const shape = shapes[i]!, point = surface?.point;
    const direction = point && normalize(point.direction.value);
    const piercing = point && shape.kind === "hull" && owner.kind !== "held" ? {
      direction: [dot(direction!, frame.x), dot(direction!, frame.y), dot(direction!, frame.z)] as Vec3,
      alignment: point.alignment.value,
      depth: Math.max(...shape.points.map(p => dot(p.value, direction!))) - Math.min(...shape.points.map(p => dot(p.value, direction!))) } : undefined;
    return { ...(surface?.layer ? { layer: { stiffness: surface.layer.stiffness.value,
      dampingRatio: surface.layer.dampingRatio.value, depth: surface.layer.depth.value } } : {}), ...(piercing ? { point: piercing } : {}) };
  }) });
  const handPose = spec.handPoses ? { applied: initial, requested: initial } : undefined;
  return { spec, frame, node, body: physics, rest, ...(handPose ? { handPose } : {}), ...(poses ? { poses } : {}),
    get rigid() { return poses && handPose ? poses[handPose.applied].rigid : rigid; } };
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

/** `spec`'s kinematics: its constraint's axes (`constraintAxes`), and each freedom's sense about its axis. */
export function jointKinematics(spec: JointSpec): JointKinematics {
  const { x, y, z, signs } = constraintAxes(spec.dofs);
  return { spec, dofs: spec.dofs.map((dof, k) => ({ spec: dof, sign: signs[k]! })), axes: { x, y, z } };
}

function buildJoint(spec: JointSpec, parent: BuiltSegment, child: BuiltSegment, world: World): BuiltJoint {
  const { dofs, axes } = jointKinematics(spec), { x, y, z } = axes;
  const centre = spec.centre.value;
  const inFrame = (frame: SegmentFrame) => frameRotation(localDirection(frame, x), localDirection(frame, y), localDirection(frame, z));
  const joint = world.physics.addJoint(parent.body, child.body, {
    anchorParent: local(parent.frame, centre),
    anchorChild: local(child.frame, centre),
    frameParent: inFrame(parent.frame),
    frameChild: inFrame(child.frame),
    limits: dofs.map(({ spec: { min, max }, sign }) => (sign > 0 ? [min.value, max.value] as const : [-max.value, -min.value] as const)),
  });
  return { spec, parent, child, joint, dofs, axes };
}

/** Compute a connected tree's initial pose before creating any physical segment or joint. */
function initialPoses(spec: BodySpec, placement: Placement): ReadonlyMap<string, InitialPose> | undefined {
  if (placement.position.length !== 3 || !Array.from(placement.position).every(Number.isFinite)) throw new Error("invalid body placement");
  if (!placement.rotation && !Object.keys(placement.joints ?? {}).length) return undefined;
  const components = placement.rotation ?? [0, 0, 0, 1];
  const lengthSquared = components.reduce((sum, v) => sum + v * v, 0);
  if (components.length !== 4 || !Array.from(components).every(Number.isFinite)
    || !(lengthSquared > 0) || !Number.isFinite(lengthSquared)) throw new Error("invalid initial body rotation");
  const rotation = new Quaternion(...components).normalize();
  const segments = new Map(spec.segments.map((s) => [s.name, s])), joints = new Map(spec.joints.map((j) => [j.name, j]));
  const parent = new Map(spec.joints.map((j) => [j.child, j]));
  if (segments.size !== spec.segments.length || joints.size !== spec.joints.length || parent.size !== spec.joints.length
    || spec.joints.some((j) => !segments.has(j.parent) || !segments.has(j.child))) throw new Error("initial pose requires a body tree");
  const roots = spec.segments.filter((s) => !parent.has(s.name));
  if (roots.length !== 1) throw new Error("initial pose requires one root");
  for (const [name, angles] of Object.entries(placement.joints ?? {})) {
    const joint = joints.get(name);
    if (!joint || !Array.isArray(angles) || angles.length !== joint.dofs.length
      || !angles.every((v, i) => Number.isFinite(v) && v >= joint.dofs[i]!.min.value && v <= joint.dofs[i]!.max.value)) throw new Error(`invalid initial angles for ${name}`);
  }
  const frames = new Map(spec.segments.map((s) => [s.name, frameOf(s)]));
  const poses = new Map<string, InitialPose>(), visiting = new Set<string>();
  const poseOf = (name: string): InitialPose => {
    const existing = poses.get(name); if (existing) return existing;
    if (visiting.has(name)) throw new Error("initial pose contains a joint cycle");
    visiting.add(name);
    const frame = frames.get(name)!, rest = frameRotation(frame.x, frame.y, frame.z), joint = parent.get(name);
    let position: Vector3, turn: Quaternion;
    if (!joint) {
      position = v3(frame.origin).applyRotationQuaternionToRef(rotation, new Vector3()).addInPlace(v3(placement.position));
      turn = rotation.multiply(rest);
    } else {
      const above = poseOf(joint.parent), parentFrame = frames.get(joint.parent)!;
      const carry = above.rotation.multiply(Quaternion.Inverse(frameRotation(parentFrame.x, parentFrame.y, parentFrame.z)));
      const axes = constraintAxes(joint.dofs), angles = placement.joints?.[joint.name] ?? joint.dofs.map(() => 0);
      const native = [0, 1, 2].map((i) => i < angles.length ? axes.signs[i]! * angles[i]! : 0);
      turn = carry.multiply(rotationOfToRef(axes, native[0]!, native[1]!, native[2]!, new Quaternion())).multiply(rest);
      position = v3(local(parentFrame, joint.centre.value)).applyRotationQuaternionToRef(above.rotation, new Vector3()).addInPlace(above.position);
      position.subtractInPlace(v3(local(frame, joint.centre.value)).applyRotationQuaternionToRef(turn, new Vector3()));
    }
    const result = { position, rotation: turn }; poses.set(name, result); visiting.delete(name); return result;
  };
  for (const segment of spec.segments) poseOf(segment.name);
  return poses;
}

/** Build `spec` at its declared initial pose, with coincident joint anchors before physics starts. */
export function buildBody(spec: BodySpec, world: World, placement: Placement): BuiltBody {
  const poses = initialPoses(spec, placement);
  const segments = new Map<string, BuiltSegment>();
  for (const segment of spec.segments) {
    if (segments.has(segment.name)) throw new Error(`${spec.model} names ${segment.name} twice`);
    segments.set(segment.name, buildSegment(spec, segment, placement, world, poses?.get(segment.name)));
  }
  for (const held of spec.held ?? []) if (!segments.has(held.segment)) throw new Error(`${spec.model} has no ${held.segment} to hold ${held.item.name}`);
  const joints = new Map<string, BuiltJoint>();
  for (const joint of spec.joints) {
    const parent = segments.get(joint.parent), child = segments.get(joint.child);
    if (!parent || !child) throw new Error(`${spec.model}'s ${joint.name} joins a segment it does not have`);
    joints.set(joint.name, buildJoint(joint, parent, child, world));
  }
  const handPoses = createHandPoses(spec, segments, world);
  return {
    spec, physics: world.physics, segments, joints,
    handPoses,
    dispose() {
      handPoses.dispose();
      // Removing a body removes its colliders and joints with it.
      for (const segment of segments.values()) {
        world.physics.removeBody(segment.body);
        segment.node.dispose();
      }
    },
  };
}
