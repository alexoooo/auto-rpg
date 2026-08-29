import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody.js";
import { Physics6DoFConstraint } from "@babylonjs/core/Physics/v2/physicsConstraint.js";
import type { Physics6DoFLimit } from "@babylonjs/core/Physics/v2/physicsConstraint.js";
import {
  PhysicsConstraintAxis,
  PhysicsConstraintAxisLimitMode,
  PhysicsMotionType,
} from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import {
  PhysicsShapeBox,
  PhysicsShapeCapsule,
  PhysicsShapeContainer,
  PhysicsShapeCylinder,
  PhysicsShapeSphere,
  type PhysicsShape,
} from "@babylonjs/core/Physics/v2/physicsShape.js";
import type { Scene } from "@babylonjs/core/scene.js";

import {
  validateBlueprint,
  type AttachmentFrame,
  type ConstructBlueprint,
  type JointSpec,
  type PartSpec,
  type PrimitiveShape,
} from "./blueprint.ts";
import {
  constructMaterials,
  hasConstructMaterials,
  type ConstructFaction,
  type ConstructMaterialPalette,
} from "./materials.ts";
import { buildConstructModuleVisual, buildConstructPartVisual } from "./render.ts";
import {
  ConstructBuildTransaction,
  ConstructJoint,
  ConstructModule,
  ConstructPart,
  liveAttachmentFrame,
  type ConstructRuntime,
} from "./runtime.ts";
import { layersFor } from "../physics.ts";

export interface ConstructWorldTransform {
  readonly position: Vector3;
  readonly rotation: Quaternion;
}

export interface ConstructPartBuildContext {
  readonly scene: Scene;
  readonly part: PartSpec;
  readonly transform: ConstructWorldTransform;
  readonly faction: ConstructFaction;
  readonly palette: ConstructMaterialPalette;
  readonly partIndex: number;
}

export type ConstructPartFactory = (context: ConstructPartBuildContext) => ConstructPart;

export interface CompileConstructOptions {
  readonly faction: ConstructFaction;
  readonly origin?: Vector3;
  readonly rotation?: Quaternion;
  readonly facing?: number;
  readonly palette?: ConstructMaterialPalette;
  readonly partFactory?: ConstructPartFactory;
}

const EPSILON_M = 1e-7;
const EPSILON_DOT = 1e-7;

const lexical = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;

const vector = (value: readonly [number, number, number]): Vector3 => Vector3.FromArray(value);
const quaternion = (value: readonly [number, number, number, number]): Quaternion => Quaternion.FromArray(value);

const rotated = (value: readonly [number, number, number], rotation: Quaternion): Vector3 =>
  vector(value).rotateByQuaternionToRef(rotation, new Vector3());

const composeFrame = (parent: ConstructWorldTransform, frame: AttachmentFrame): ConstructWorldTransform => {
  const frameRotation = quaternion(frame.rotation);
  return Object.freeze({
    position: parent.position.add(rotated(frame.positionM, parent.rotation)),
    rotation: parent.rotation.multiply(frameRotation).normalize(),
  });
};

const childFromFrames = (
  parent: ConstructWorldTransform,
  parentFrame: AttachmentFrame,
  childFrame: AttachmentFrame,
): ConstructWorldTransform => {
  const attachment = composeFrame(parent, parentFrame);
  const childFrameRotation = quaternion(childFrame.rotation);
  const rotation = attachment.rotation.multiply(Quaternion.Inverse(childFrameRotation)).normalize();
  return Object.freeze({
    position: attachment.position.subtract(rotated(childFrame.positionM, rotation)),
    rotation,
  });
};

const basis = (rotation: Quaternion): readonly Vector3[] => [
  Vector3.Right().rotateByQuaternionToRef(rotation, new Vector3()),
  Vector3.Up().rotateByQuaternionToRef(rotation, new Vector3()),
  Vector3.Forward().rotateByQuaternionToRef(rotation, new Vector3()),
];

const validateCoincidentFrames = (
  joint: JointSpec,
  parent: ConstructWorldTransform,
  child: ConstructWorldTransform,
): void => {
  const left = composeFrame(parent, joint.parentFrame);
  const right = composeFrame(child, joint.childFrame);
  const originError = Vector3.Distance(left.position, right.position);
  if (originError > EPSILON_M) {
    throw new Error(`joint "${joint.id}" attachment origins differ by ${originError} m`);
  }
  const leftBasis = basis(left.rotation);
  const rightBasis = basis(right.rotation);
  for (let index = 0; index < 3; index += 1) {
    const agreement = Vector3.Dot(leftBasis[index], rightBasis[index]);
    if (1 - agreement > EPSILON_DOT) {
      throw new Error(`joint "${joint.id}" attachment orientation basis ${index} differs by ${1 - agreement}`);
    }
  }
};

/** Root first, then each parent's children by stable part ID; input array order is never authority. */
export function topologicalConstructPartOrder(blueprintValue: unknown): readonly string[] {
  const blueprint = validateBlueprint(blueprintValue);
  const children = new Map<string, string[]>();
  for (const joint of blueprint.joints) {
    const list = children.get(joint.parentPart) ?? [];
    list.push(joint.childPart);
    children.set(joint.parentPart, list);
  }
  for (const list of children.values()) list.sort(lexical);
  const order: string[] = [];
  const visit = (id: string): void => {
    order.push(id);
    for (const child of children.get(id) ?? []) visit(child);
  };
  visit(blueprint.rootPart);
  return Object.freeze(order);
}

export function resolveConstructBindTransforms(
  blueprintValue: unknown,
  origin = Vector3.Zero(),
  rotation = Quaternion.Identity(),
): ReadonlyMap<string, ConstructWorldTransform> {
  const blueprint = validateBlueprint(blueprintValue);
  const order = topologicalConstructPartOrder(blueprint);
  const parentJoint = new Map(blueprint.joints.map((joint) => [joint.childPart, joint]));
  const transforms = new Map<string, ConstructWorldTransform>();
  transforms.set(blueprint.rootPart, Object.freeze({ position: origin.clone(), rotation: rotation.clone().normalize() }));
  for (const id of order.slice(1)) {
    const joint = parentJoint.get(id);
    if (!joint) throw new Error(`part "${id}" lost its parent joint during bind resolution`);
    const parent = transforms.get(joint.parentPart);
    if (!parent) throw new Error(`joint "${joint.id}" parent "${joint.parentPart}" was not resolved first`);
    const child = childFromFrames(parent, joint.parentFrame, joint.childFrame);
    validateCoincidentFrames(joint, parent, child);
    transforms.set(id, child);
  }
  return transforms;
}

const localDirection = (worldDirection: Vector3, rotation: Quaternion): Vector3 =>
  worldDirection.rotateByQuaternionToRef(Quaternion.Inverse(rotation), new Vector3());

const supportRadius = (
  shape: PrimitiveShape,
  rotation: Quaternion,
  worldDirection: Vector3,
  clearanceM: number,
): number => {
  const direction = localDirection(worldDirection, rotation);
  switch (shape.kind) {
    case "box":
      return Math.abs(direction.x) * (shape.sizeM[0] / 2 + clearanceM) +
        Math.abs(direction.y) * (shape.sizeM[1] / 2 + clearanceM) +
        Math.abs(direction.z) * (shape.sizeM[2] / 2 + clearanceM);
    case "sphere": return shape.radiusM + clearanceM;
    case "cylinder":
      return Math.abs(direction.y) * (shape.lengthM / 2 + clearanceM) +
        Math.hypot(direction.x, direction.z) * (shape.radiusM + clearanceM);
    case "capsule": {
      const halfSegment = Math.max(0, shape.lengthM / 2 - shape.radiusM);
      return Math.abs(direction.y) * halfSegment + shape.radiusM + clearanceM;
    }
  }
};

/** Root height that places the lowest bind-pose collider on y=0, independent of body names. */
export function groundedConstructOriginY(blueprintValue: unknown, facing = 0): number {
  const blueprint = validateBlueprint(blueprintValue);
  const rotation = Quaternion.FromEulerAngles(0, facing, 0);
  const transforms = resolveConstructBindTransforms(blueprint, Vector3.Zero(), rotation);
  let lowest = Number.POSITIVE_INFINITY;
  for (const part of blueprint.parts) {
    const transform = transforms.get(part.id) as ConstructWorldTransform;
    lowest = Math.min(lowest, transform.position.y - supportRadius(part.shape, transform.rotation, Vector3.Down(), 0));
  }
  const sockets = new Map(blueprint.sockets.map((socket) => [socket.id, socket]));
  for (const module of blueprint.modules) {
    const socket = sockets.get(module.socket) as import("./blueprint.ts").SocketSpec;
    const owner = transforms.get(socket.part) as ConstructWorldTransform;
    const socketTransform = composeFrame(owner, socket.frame);
    for (const primitive of module.geometry) {
      const transform = composeFrame(socketTransform, primitive.frame);
      lowest = Math.min(lowest, transform.position.y - supportRadius(primitive.shape, transform.rotation, Vector3.Down(), 0));
    }
  }
  if (!Number.isFinite(lowest)) throw new Error(`construct "${blueprint.id}" has no collider support`);
  return -lowest + 0.002;
}

interface OrientedBounds {
  readonly centre: Vector3;
  readonly axes: readonly [Vector3, Vector3, Vector3];
  readonly half: readonly [number, number, number];
}

const shapeDimensions = (shape: PrimitiveShape): readonly [number, number, number] => {
  switch (shape.kind) {
    case "box": return shape.sizeM;
    case "sphere": return [shape.radiusM * 2, shape.radiusM * 2, shape.radiusM * 2];
    case "cylinder": return [shape.radiusM * 2, shape.lengthM, shape.radiusM * 2];
    case "capsule": return [shape.radiusM * 2, Math.max(shape.lengthM, shape.radiusM * 2), shape.radiusM * 2];
  }
};

const orientedBounds = (
  part: PartSpec,
  transform: ConstructWorldTransform,
  clearanceM: number,
): OrientedBounds => {
  const size = shapeDimensions(part.shape);
  const axes = basis(transform.rotation) as readonly [Vector3, Vector3, Vector3];
  return {
    centre: transform.position,
    axes,
    half: [size[0] / 2 + clearanceM, size[1] / 2 + clearanceM, size[2] / 2 + clearanceM],
  };
};

/** The full 15-axis OBB separating-axis test; world AABBs would reject valid rotated neighbours. */
const orientedBoundsOverlap = (left: OrientedBounds, right: OrientedBounds): boolean => {
  const rotation = Array.from({ length: 3 }, (_, row) =>
    Array.from({ length: 3 }, (_, column) => Vector3.Dot(left.axes[row], right.axes[column])));
  const absolute = rotation.map((row) => row.map((value) => Math.abs(value) + 1e-9));
  const delta = right.centre.subtract(left.centre);
  const translated = left.axes.map((axis) => Vector3.Dot(delta, axis));
  for (let row = 0; row < 3; row += 1) {
    const rightRadius = right.half[0] * absolute[row][0] + right.half[1] * absolute[row][1] +
      right.half[2] * absolute[row][2];
    if (Math.abs(translated[row]) > left.half[row] + rightRadius) return false;
  }
  for (let column = 0; column < 3; column += 1) {
    const leftRadius = left.half[0] * absolute[0][column] + left.half[1] * absolute[1][column] +
      left.half[2] * absolute[2][column];
    const projected = Math.abs(translated[0] * rotation[0][column] + translated[1] * rotation[1][column] +
      translated[2] * rotation[2][column]);
    if (projected > leftRadius + right.half[column]) return false;
  }
  for (let row = 0; row < 3; row += 1) for (let column = 0; column < 3; column += 1) {
    const leftRadius = left.half[(row + 1) % 3] * absolute[(row + 2) % 3][column] +
      left.half[(row + 2) % 3] * absolute[(row + 1) % 3][column];
    const rightRadius = right.half[(column + 1) % 3] * absolute[row][(column + 2) % 3] +
      right.half[(column + 2) % 3] * absolute[row][(column + 1) % 3];
    const projected = Math.abs(
      translated[(row + 2) % 3] * rotation[(row + 1) % 3][column] -
      translated[(row + 1) % 3] * rotation[(row + 2) % 3][column],
    );
    if (projected > leftRadius + rightRadius) return false;
  }
  return true;
};

const validateVisualClearance = (
  blueprint: ConstructBlueprint,
  transforms: ReadonlyMap<string, ConstructWorldTransform>,
): void => {
  const parts = new Map(blueprint.parts.map((part) => [part.id, part]));
  const adjacent = new Set(blueprint.joints.flatMap((joint) => [
    `${joint.parentPart}\0${joint.childPart}`,
    `${joint.childPart}\0${joint.parentPart}`,
  ]));

  for (const joint of blueprint.joints) {
    for (const [partId, frame] of [
      [joint.parentPart, joint.parentFrame],
      [joint.childPart, joint.childFrame],
    ] as const) {
      const part = parts.get(partId);
      const transform = transforms.get(partId);
      if (!part || !transform) continue;
      const centreToPlane = composeFrame(transform, frame).position.subtract(transform.position);
      const distance = centreToPlane.length();
      if (distance <= EPSILON_M) continue;
      const direction = centreToPlane.scale(1 / distance);
      const colliderRadius = supportRadius(part.shape, transform.rotation, direction, 0);
      const gap = distance - colliderRadius;
      if (gap > EPSILON_M && part.shell.visualClearanceM > gap + EPSILON_M) {
        throw new Error(
          `part "${part.id}" visual clearance crosses joint "${joint.id}" attachment plane on part "${partId}"`,
        );
      }
    }
  }

  for (let leftIndex = 0; leftIndex < blueprint.parts.length; leftIndex += 1) {
    const left = blueprint.parts[leftIndex];
    const leftTransform = transforms.get(left.id);
    if (!leftTransform) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < blueprint.parts.length; rightIndex += 1) {
      const right = blueprint.parts[rightIndex];
      if (adjacent.has(`${left.id}\0${right.id}`)) continue;
      const rightTransform = transforms.get(right.id);
      if (!rightTransform) continue;
      if (Vector3.Distance(leftTransform.position, rightTransform.position) <= EPSILON_M) {
        throw new Error(`parts "${left.id}" and "${right.id}" share an oriented neighbour plane`);
      }
      const collidersOverlap = orientedBoundsOverlap(
        orientedBounds(left, leftTransform, 0), orientedBounds(right, rightTransform, 0),
      );
      const visualsOverlap = orientedBoundsOverlap(
        orientedBounds(left, leftTransform, left.shell.visualClearanceM),
        orientedBounds(right, rightTransform, right.shell.visualClearanceM),
      );
      if (!collidersOverlap && visualsOverlap) {
        throw new Error(
          `parts "${left.id}" and "${right.id}" visual shells cross their oriented neighbour plane`,
        );
      }
    }
  }
};

const makeShape = (scene: Scene, shape: PrimitiveShape): PhysicsShape => {
  switch (shape.kind) {
    case "box":
      return new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), vector(shape.sizeM), scene);
    case "sphere":
      return new PhysicsShapeSphere(Vector3.Zero(), shape.radiusM, scene);
    case "cylinder":
      return new PhysicsShapeCylinder(
        new Vector3(0, -shape.lengthM / 2, 0), new Vector3(0, shape.lengthM / 2, 0), shape.radiusM, scene,
      );
    case "capsule": {
      const halfSegment = Math.max(0, shape.lengthM / 2 - shape.radiusM);
      return new PhysicsShapeCapsule(
        new Vector3(0, -halfSegment, 0), new Vector3(0, halfSegment, 0), shape.radiusM, scene,
      );
    }
  }
};

export const defaultConstructPartFactory: ConstructPartFactory = (context) => {
  const node = new TransformNode(`construct.${context.part.id}.body`, context.scene);
  node.position.copyFrom(context.transform.position);
  node.rotationQuaternion = context.transform.rotation.clone();
  let shape: PhysicsShapeContainer | null = null;
  let leaf: PhysicsShape | null = null;
  let body: PhysicsBody | null = null;
  let visual: ReturnType<typeof buildConstructPartVisual> | null = null;
  try {
    leaf = makeShape(context.scene, context.part.shape);
    shape = new PhysicsShapeContainer(context.scene);
    shape.addChild(leaf);
    const layers = layersFor(context.faction);
    // V1 uses the prototype's existing per-side body category. That category gives every intact
    // owner part the same self-exemption and still meets world, debris and the opposing side;
    // allocating a per-part bit would promise an exclusion vocabulary the 32-bit filter cannot hold.
    shape.filterMembershipMask = layers.arm;
    shape.filterCollideMask = layers.armCollides;
    shape.material = { friction: context.part.friction, restitution: context.part.restitution };
    leaf.filterMembershipMask = layers.arm;
    leaf.filterCollideMask = layers.armCollides;
    leaf.material = shape.material;
    body = new PhysicsBody(node, PhysicsMotionType.DYNAMIC, false, context.scene);
    body.shape = shape;
    body.setMassProperties({ mass: context.part.massKg, centerOfMass: vector(context.part.centreOfMassM) });
    visual = buildConstructPartVisual(context.scene, node, context.part, context.palette);
    return new ConstructPart(context.part, node, body, shape, visual, [leaf]);
  } catch (error) {
    body?.dispose();
    shape?.dispose();
    leaf?.dispose();
    visual?.dispose();
    node.dispose(false, false);
    throw error;
  }
};

const locked = (axis: PhysicsConstraintAxis): Physics6DoFLimit => ({ axis, minLimit: 0, maxLimit: 0 });

const buildJoint = (
  scene: Scene,
  spec: JointSpec,
  parent: ConstructPart,
  child: ConstructPart,
): ConstructJoint => {
  const frameAxis = Vector3.Right();
  const framePerpendicular = Vector3.Up();
  const parentRotation = quaternion(spec.parentFrame.rotation);
  const childRotation = quaternion(spec.childFrame.rotation);
  const limits: Physics6DoFLimit[] = [
    locked(PhysicsConstraintAxis.LINEAR_X),
    locked(PhysicsConstraintAxis.LINEAR_Y),
    locked(PhysicsConstraintAxis.LINEAR_Z),
    ...(["x", "y", "z"] as const).map((id, index): Physics6DoFLimit => {
      const configured = spec.angularAxes.find((axis) => axis.id === id);
      const axis = [PhysicsConstraintAxis.ANGULAR_X, PhysicsConstraintAxis.ANGULAR_Y,
        PhysicsConstraintAxis.ANGULAR_Z][index];
      return configured ? { axis, minLimit: configured.minRad, maxLimit: configured.maxRad,
        damping: configured.damping } : locked(axis);
    }),
  ];
  const constraint = new Physics6DoFConstraint({
    pivotA: vector(spec.parentFrame.positionM),
    pivotB: vector(spec.childFrame.positionM),
    axisA: frameAxis.rotateByQuaternionToRef(parentRotation, new Vector3()),
    axisB: frameAxis.rotateByQuaternionToRef(childRotation, new Vector3()),
    perpAxisA: framePerpendicular.rotateByQuaternionToRef(parentRotation, new Vector3()),
    perpAxisB: framePerpendicular.rotateByQuaternionToRef(childRotation, new Vector3()),
    collision: false,
  }, limits, scene);
  try {
    parent.body.addConstraint(child.body, constraint);
    for (const axis of [
      PhysicsConstraintAxis.LINEAR_X,
      PhysicsConstraintAxis.LINEAR_Y,
      PhysicsConstraintAxis.LINEAR_Z,
    ]) constraint.setAxisMode(axis, PhysicsConstraintAxisLimitMode.LOCKED);
    for (const [id, axis] of [["x", PhysicsConstraintAxis.ANGULAR_X], ["y", PhysicsConstraintAxis.ANGULAR_Y],
      ["z", PhysicsConstraintAxis.ANGULAR_Z]] as const) {
      constraint.setAxisMode(axis, spec.angularAxes.some((configured) => configured.id === id)
        ? PhysicsConstraintAxisLimitMode.LIMITED : PhysicsConstraintAxisLimitMode.LOCKED);
    }
    return new ConstructJoint(spec, parent, child, constraint);
  } catch (error) {
    constraint.dispose();
    throw error;
  }
};

export function compileConstruct(
  scene: Scene,
  blueprintValue: unknown,
  options: CompileConstructOptions,
): ConstructRuntime {
  if (!scene.getPhysicsEngine()) {
    throw new Error("construct compilation requires physics to be attached before its first body");
  }
  if (options.rotation !== undefined && options.facing !== undefined) {
    throw new Error("construct compilation accepts either rotation or facing, not both");
  }
  const blueprint = validateBlueprint(blueprintValue);
  const rotation = options.rotation?.clone() ?? Quaternion.FromEulerAngles(0, options.facing ?? 0, 0);
  const transforms = resolveConstructBindTransforms(blueprint, options.origin ?? Vector3.Zero(), rotation);
  validateVisualClearance(blueprint, transforms);
  const order = topologicalConstructPartOrder(blueprint);
  const specs = new Map(blueprint.parts.map((part) => [part.id, part]));
  const ownsNewPalette = options.palette === undefined && !hasConstructMaterials(scene, options.faction);
  const palette = options.palette ?? constructMaterials(scene, options.faction);
  const factory = options.partFactory ?? defaultConstructPartFactory;
  const transaction = new ConstructBuildTransaction();
  try {
    for (let partIndex = 0; partIndex < order.length; partIndex += 1) {
      const id = order[partIndex];
      const part = specs.get(id);
      const transform = transforms.get(id);
      if (!part || !transform) throw new Error(`part "${id}" was lost after construct validation`);
      transaction.ownPart(factory({ scene, part, transform, faction: options.faction, palette, partIndex }));
    }
    const runtimeParts = new Map(transaction.parts.map((part) => [part.id, part]));
    const socketSpecs = new Map(blueprint.sockets.map((socket) => [socket.id, socket]));
    const massState = new Map(blueprint.parts.map((part) => [part.id, {
      mass: part.massKg, moment: vector(part.centreOfMassM).scale(part.massKg),
    }]));
    for (const module of blueprint.modules) {
      const socketSpec = socketSpecs.get(module.socket);
      if (!socketSpec) throw new Error(`module "${module.id}" lost socket "${module.socket}" after validation`);
      const owner = runtimeParts.get(socketSpec.part);
      if (!owner) throw new Error(`socket "${socketSpec.id}" lost part "${socketSpec.part}" after compilation`);
      const socket = Object.freeze({
        spec: socketSpec,
        part: owner,
        liveFrame: () => liveAttachmentFrame(owner.node, socketSpec.frame, [1, 0, 0]),
      });
      const visual = buildConstructModuleVisual(scene, owner.node, socketSpec.frame, module, palette);
      const leaves: PhysicsShape[] = [];
      try {
        const socketRotation = quaternion(socketSpec.frame.rotation);
        for (const piece of module.geometry) {
          const leaf = makeShape(scene, piece.shape);
          const layers = layersFor(options.faction);
          leaf.filterMembershipMask = layers.arm;
          leaf.filterCollideMask = layers.armCollides;
          leaf.material = { friction: owner.spec.friction, restitution: owner.spec.restitution };
          const localPosition = vector(socketSpec.frame.positionM).add(rotated(piece.frame.positionM, socketRotation));
          const localRotation = socketRotation.multiply(quaternion(piece.frame.rotation)).normalize();
          owner.shape.addChild(leaf, localPosition, localRotation);
          leaves.push(leaf);
        }
        const prior = massState.get(owner.id) as { mass: number; moment: Vector3 };
        const totalMass = prior.mass + module.massKg;
        const moment = prior.moment.add(vector(socketSpec.frame.positionM).scale(module.massKg));
        const centre = moment.scale(1 / totalMass);
        owner.body.setMassProperties({ mass: totalMass, centerOfMass: centre });
        massState.set(owner.id, { mass: totalMass, moment });
        transaction.ownModule(new ConstructModule(module, socket, visual, leaves, owner.shape));
      } catch (error) {
        for (let index = leaves.length - 1; index >= 0; index -= 1) {
          owner.shape.removeChild(owner.shape.getNumChildren() - 1);
          leaves[index].dispose();
        }
        visual.dispose();
        throw error;
      }
    }
    const orderedJoints = [...blueprint.joints].sort((a, b) =>
      order.indexOf(a.childPart) - order.indexOf(b.childPart) || lexical(a.id, b.id));
    for (const spec of orderedJoints) {
      const parent = runtimeParts.get(spec.parentPart);
      const child = runtimeParts.get(spec.childPart);
      if (!parent || !child) throw new Error(`joint "${spec.id}" lost a compiled body`);
      transaction.ownJoint(buildJoint(scene, spec, parent, child));
    }
    return transaction.publish(blueprint);
  } catch (error) {
    transaction.rollback();
    if (ownsNewPalette) palette.dispose();
    throw error;
  }
}
