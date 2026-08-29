import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody.js";
import type { Physics6DoFConstraint } from "@babylonjs/core/Physics/v2/physicsConstraint.js";
import type { PhysicsShape } from "@babylonjs/core/Physics/v2/physicsShape.js";

import type { AttachmentFrame, ConstructBlueprint, JointSpec, ModuleSpec, PartSpec, SocketSpec } from "./blueprint.ts";
import type { ConstructModuleVisual, ConstructPartVisual } from "./render.ts";
import { COLLIDES, LAYER } from "../physics.ts";

export interface WorldAttachmentFrame {
  readonly position: Vector3;
  readonly rotation: Quaternion;
  readonly axis: Vector3;
  readonly perpendicular: Vector3;
}

const rotate = (value: readonly [number, number, number], rotation: Quaternion): Vector3 =>
  Vector3.FromArray(value).rotateByQuaternionToRef(rotation, new Vector3());

const stablePerpendicular = (axis: Vector3): Vector3 => {
  const reference = Math.abs(axis.y) < 0.8 ? Vector3.Up() : Vector3.Right();
  return Vector3.Cross(axis, reference).normalize();
};

export function liveAttachmentFrame(
  node: TransformNode,
  frame: AttachmentFrame,
  attachmentAxis: readonly [number, number, number],
): WorldAttachmentFrame {
  const bodyRotation = node.rotationQuaternion ?? Quaternion.Identity();
  const localRotation = Quaternion.FromArray(frame.rotation);
  const rotation = bodyRotation.multiply(localRotation).normalize();
  const position = node.position.add(rotate(frame.positionM, bodyRotation));
  const localAxis = Vector3.FromArray(attachmentAxis);
  const axis = localAxis.rotateByQuaternionToRef(rotation, new Vector3()).normalize();
  const perpendicular = stablePerpendicular(localAxis)
    .rotateByQuaternionToRef(rotation, new Vector3()).normalize();
  return Object.freeze({ position, rotation, axis, perpendicular });
}

export class ConstructPart {
  readonly id: string;
  readonly spec: PartSpec;
  readonly node: TransformNode;
  readonly body: PhysicsBody;
  readonly shape: PhysicsShape;
  readonly visual: ConstructPartVisual;
  readonly leafShapes: readonly PhysicsShape[];
  private ownerAttached = true;

  constructor(
    spec: PartSpec,
    node: TransformNode,
    body: PhysicsBody,
    shape: PhysicsShape,
    visual: ConstructPartVisual,
    leafShapes: readonly PhysicsShape[],
  ) {
    this.id = spec.id;
    this.spec = spec;
    this.node = node;
    this.body = body;
    this.shape = shape;
    this.visual = visual;
    this.leafShapes = Object.freeze([...leafShapes]);
  }

  get attached(): boolean { return this.ownerAttached; }

  detachAsDebris(): void {
    // Every v1 primitive is one leaf. Keeping this operation on the leaf is deliberate:
    // a future compound may not replace it with a write to its ignored container.
    this.shape.filterMembershipMask = LAYER.DEBRIS;
    this.shape.filterCollideMask = COLLIDES.DEBRIS;
    for (const leaf of this.leafShapes) {
      leaf.filterMembershipMask = LAYER.DEBRIS;
      leaf.filterCollideMask = COLLIDES.DEBRIS;
    }
    this.ownerAttached = false;
  }

  dispose(): void {
    this.body.dispose();
    this.shape.dispose();
    for (let index = this.leafShapes.length - 1; index >= 0; index -= 1) this.leafShapes[index].dispose();
    this.visual.dispose();
    this.node.dispose(false, false);
  }
}

export class ConstructJoint {
  private released = false;
  readonly spec: JointSpec;
  readonly parent: ConstructPart;
  readonly child: ConstructPart;
  readonly constraint: Physics6DoFConstraint;

  constructor(
    spec: JointSpec,
    parent: ConstructPart,
    child: ConstructPart,
    constraint: Physics6DoFConstraint,
  ) {
    this.spec = spec;
    this.parent = parent;
    this.child = child;
    this.constraint = constraint;
  }

  get id(): string { return this.spec.id; }
  get attached(): boolean { return !this.released; }

  liveFrames(): Readonly<{ parent: WorldAttachmentFrame; child: WorldAttachmentFrame }> {
    const axisId = this.spec.angularAxes[0].id;
    const axis = axisId === "x" ? [1, 0, 0] as const : axisId === "y" ? [0, 1, 0] as const : [0, 0, 1] as const;
    return Object.freeze({
      parent: liveAttachmentFrame(this.parent.node, this.spec.parentFrame, axis),
      child: liveAttachmentFrame(this.child.node, this.spec.childFrame, axis),
    });
  }

  dispose(): void {
    if (this.released) return;
    this.released = true;
    this.constraint.dispose();
  }
}

export interface ConstructSocketRuntime {
  readonly spec: SocketSpec;
  readonly part: ConstructPart;
  liveFrame(): WorldAttachmentFrame;
}

export class ConstructModule {
  readonly id: string;
  readonly spec: ModuleSpec;
  readonly socket: ConstructSocketRuntime;
  readonly visual: ConstructModuleVisual;
  readonly leafShapes: readonly PhysicsShape[];
  private readonly ownerShape: PhysicsShape | null;

  constructor(spec: ModuleSpec, socket: ConstructSocketRuntime, visual: ConstructModuleVisual,
    leafShapes: readonly PhysicsShape[] = [], ownerShape: PhysicsShape | null = null) {
    this.id = spec.id;
    this.spec = spec;
    this.socket = socket;
    this.visual = visual;
    this.leafShapes = Object.freeze([...leafShapes]);
    this.ownerShape = ownerShape;
  }

  get root(): TransformNode { return this.visual.root; }

  detachAsDebris(): void {
    for (const leaf of this.leafShapes) {
      leaf.filterMembershipMask = LAYER.DEBRIS;
      leaf.filterCollideMask = COLLIDES.DEBRIS;
    }
  }

  /** A destroyed mounted mechanism is absent, not an invisible authoritative collider. */
  disable(): void {
    this.visual.root.setEnabled(false);
    for (const leaf of this.leafShapes) {
      leaf.filterMembershipMask = 0;
      leaf.filterCollideMask = 0;
    }
  }

  dispose(): void {
    if (this.ownerShape) for (let index = this.leafShapes.length - 1; index >= 0; index -= 1) {
      this.ownerShape.removeChild(this.ownerShape.getNumChildren() - 1);
      this.leafShapes[index].dispose();
    }
    this.visual.dispose();
  }
}

export class ConstructRuntime {
  readonly blueprint: ConstructBlueprint;
  readonly parts: ReadonlyMap<string, ConstructPart>;
  readonly joints: ReadonlyMap<string, ConstructJoint>;
  readonly sockets: ReadonlyMap<string, ConstructSocketRuntime>;
  readonly modules: ReadonlyMap<string, ConstructModule>;
  readonly partOrder: readonly string[];
  private disposed = false;

  constructor(
    blueprint: ConstructBlueprint,
    builtParts: readonly ConstructPart[],
    builtJoints: readonly ConstructJoint[],
    builtModules: readonly ConstructModule[],
  ) {
    this.blueprint = blueprint;
    this.partOrder = Object.freeze(builtParts.map((part) => part.id));
    this.parts = new Map(builtParts.map((part) => [part.id, part]));
    this.joints = new Map(builtJoints.map((joint) => [joint.id, joint]));
    this.sockets = new Map(blueprint.sockets.map((spec) => {
      const part = this.parts.get(spec.part);
      if (!part) throw new Error(`socket "${spec.id}" lost part "${spec.part}" during compilation`);
      return [spec.id, Object.freeze({
        spec,
        part,
        liveFrame: () => liveAttachmentFrame(part.node, spec.frame, [1, 0, 0]),
      })];
    }));
    this.modules = new Map(builtModules.map((module) => {
      const socket = this.sockets.get(module.spec.socket);
      if (!socket) throw new Error(`module "${module.id}" lost socket "${module.spec.socket}" during compilation`);
      const rebound = new ConstructModule(module.spec, socket, module.visual, module.leafShapes, module.socket.part.shape);
      return [rebound.id, rebound];
    }));
  }

  part(id: string): ConstructPart {
    const found = this.parts.get(id);
    if (!found) throw new Error(`construct "${this.blueprint.id}" has no runtime part "${id}"`);
    return found;
  }

  joint(id: string): ConstructJoint {
    const found = this.joints.get(id);
    if (!found) throw new Error(`construct "${this.blueprint.id}" has no runtime joint "${id}"`);
    return found;
  }

  /** A severed subtree leaves the side layer as one atomic runtime fact before the next step. */
  detachSubtree(rootPartId: string): readonly string[] {
    if (rootPartId === this.blueprint.rootPart) {
      throw new Error(`construct "${this.blueprint.id}" cannot detach root part "${rootPartId}"`);
    }
    this.part(rootPartId);
    const detached = new Set<string>([rootPartId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const joint of this.joints.values()) {
        if (detached.has(joint.spec.parentPart) && !detached.has(joint.spec.childPart)) {
          detached.add(joint.spec.childPart);
          changed = true;
        }
      }
    }
    for (const joint of this.joints.values()) {
      if (detached.has(joint.spec.childPart) && !detached.has(joint.spec.parentPart)) joint.dispose();
    }
    const ordered = this.partOrder.filter((id) => detached.has(id));
    for (const id of ordered) this.part(id).detachAsDebris();
    for (const module of this.modules.values()) if (detached.has(module.socket.part.id)) module.detachAsDebris();
    return Object.freeze(ordered);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const joints = [...this.joints.values()];
    for (let index = joints.length - 1; index >= 0; index -= 1) joints[index].dispose();
    const modules = [...this.modules.values()];
    for (let index = modules.length - 1; index >= 0; index -= 1) modules[index].dispose();
    const parts = [...this.parts.values()];
    for (let index = parts.length - 1; index >= 0; index -= 1) parts[index].dispose();
  }
}

/** The compiler uses the same reverse-order owner before publication and on every failed build. */
export class ConstructBuildTransaction {
  readonly parts: ConstructPart[] = [];
  readonly joints: ConstructJoint[] = [];
  readonly modules: ConstructModule[] = [];
  private finished = false;

  ownPart(part: ConstructPart): ConstructPart {
    this.parts.push(part);
    return part;
  }

  ownJoint(joint: ConstructJoint): ConstructJoint {
    this.joints.push(joint);
    return joint;
  }

  ownModule(module: ConstructModule): ConstructModule {
    this.modules.push(module);
    return module;
  }

  publish(blueprint: ConstructBlueprint): ConstructRuntime {
    const runtime = new ConstructRuntime(blueprint, this.parts, this.joints, this.modules);
    this.finished = true;
    return runtime;
  }

  rollback(): void {
    if (this.finished) return;
    for (let index = this.joints.length - 1; index >= 0; index -= 1) this.joints[index].dispose();
    for (let index = this.modules.length - 1; index >= 0; index -= 1) this.modules[index].dispose();
    for (let index = this.parts.length - 1; index >= 0; index -= 1) this.parts[index].dispose();
    this.joints.length = 0;
    this.modules.length = 0;
    this.parts.length = 0;
  }
}
