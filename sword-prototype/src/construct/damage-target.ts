import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody.js";

import type { ModulePrimitiveSpec, PrimitiveShape } from "./blueprint.ts";
import type { ConstructJoint, ConstructModule, ConstructRuntime } from "./runtime.ts";
import type { Limb } from "../fighter.ts";
import type { LiveConstructState } from "./live-state.ts";

const SURFACE_SLOP_M = 0.035;
const JOINT_TARGET_RADIUS_M = 0.12;

const primitiveSurfaceDistance = (point: Vector3, shape: PrimitiveShape): number => {
  if (shape.kind === "sphere") return Math.abs(point.length() - shape.radiusM);
  if (shape.kind === "box") {
    const half = Vector3.FromArray(shape.sizeM).scaleInPlace(0.5);
    const q = new Vector3(Math.abs(point.x) - half.x, Math.abs(point.y) - half.y,
      Math.abs(point.z) - half.z);
    const outside = Math.hypot(Math.max(q.x, 0), Math.max(q.y, 0), Math.max(q.z, 0));
    const inside = Math.min(Math.max(q.x, q.y, q.z), 0);
    return Math.abs(outside + inside);
  }
  if (shape.kind === "cylinder") {
    const radial = Math.hypot(point.x, point.z) - shape.radiusM;
    const axial = Math.abs(point.y) - shape.lengthM * 0.5;
    const outside = Math.hypot(Math.max(radial, 0), Math.max(axial, 0));
    const inside = Math.min(Math.max(radial, axial), 0);
    return Math.abs(outside + inside);
  }
  const halfSegment = Math.max(0, shape.lengthM * 0.5 - shape.radiusM);
  const segmentY = Math.max(-halfSegment, Math.min(halfSegment, point.y));
  return Math.abs(Math.hypot(point.x, point.y - segmentY, point.z) - shape.radiusM);
};

export function distanceToModulePrimitive(pointInModule: Vector3, primitive: ModulePrimitiveSpec): number {
  // Kept below as explicit quaternion/matrix work rather than renderer bounds:
  // the blueprint primitive is collision authority even when its shell changes.
  const rotation = Matrix.Compose(Vector3.One(), Quaternion.FromArray(primitive.frame.rotation),
    Vector3.FromArray(primitive.frame.positionM));
  const local = Vector3.TransformCoordinates(pointInModule, Matrix.Invert(rotation));
  return primitiveSurfaceDistance(local, primitive.shape);
}

const moduleDistance = (module: ConstructModule, point: Vector3): number => {
  const local = Vector3.TransformCoordinates(point, Matrix.Invert(module.root.computeWorldMatrix(true)));
  return Math.min(...module.spec.geometry.map((piece) => distanceToModulePrimitive(local, piece)));
};

export interface ModulePrimitiveContact {
  readonly module: ConstructModule;
  readonly primitive: ModulePrimitiveSpec;
  readonly distanceM: number;
  /** An exact primitive tie is never evidence that the smaller sharp surface won. */
  readonly ambiguous: boolean;
}

/**
 * Babylon identifies only the compound owner body in a collision event. Resolve
 * the leaf explicitly from its blueprint geometry and contact point; never guess
 * from a visual mesh name or declaration order.
 */
export function modulePrimitiveAtContact(
  runtime: ConstructRuntime,
  body: PhysicsBody,
  point: Vector3,
  toleranceM = SURFACE_SLOP_M,
): ModulePrimitiveContact | null {
  const candidates = [...runtime.modules.values()]
    .filter((module) => module.socket.part.body === body && module.socket.part.attached)
    .flatMap((module) => {
      const local = Vector3.TransformCoordinates(point, Matrix.Invert(module.root.computeWorldMatrix(true)));
      return module.spec.geometry.map((primitive) => Object.freeze({ module, primitive,
        distanceM: distanceToModulePrimitive(local, primitive) }));
    })
    .filter(({ distanceM }) => distanceM <= toleranceM)
    .sort((left, right) => left.distanceM - right.distanceM || left.module.id.localeCompare(right.module.id) ||
      left.primitive.id.localeCompare(right.primitive.id));
  const winner = candidates[0];
  if (!winner) return null;
  // A compound leaf overlap is a blueprint fault, not permission to award the most damaging
  // candidate by declaration or lexical accident. Callers can still use the contact for a
  // physical block, but edged scoring must fail closed when the hit primitive is ambiguous.
  const ambiguous = candidates.slice(1).some((candidate) =>
    candidate.module.id === winner.module.id && Math.abs(candidate.distanceM - winner.distanceM) <= 1e-9);
  return Object.freeze({ ...winner, ambiguous });
}

export function moduleAtContact(
  runtime: ConstructRuntime,
  body: PhysicsBody,
  point: Vector3,
  toleranceM = SURFACE_SLOP_M,
): ConstructModule | null {
  return modulePrimitiveAtContact(runtime, body, point, toleranceM)?.module ?? null;
}

/** Bearings have no separate Havok body, so their attachment frame is their hit volume. */
export function jointAtContact(
  runtime: ConstructRuntime,
  body: PhysicsBody,
  point: Vector3,
  radiusM = JOINT_TARGET_RADIUS_M,
): ConstructJoint | null {
  const candidates = [...runtime.joints.values()]
    .filter((joint) => joint.attached && (joint.parent.body === body || joint.child.body === body))
    .map((joint) => ({ joint, distance: Vector3.Distance(joint.liveFrames().parent.position, point) }))
    .filter(({ distance }) => distance <= radiusM)
    .sort((left, right) => left.distance - right.distance || left.joint.id.localeCompare(right.joint.id));
  return candidates[0]?.joint ?? null;
}

class ModuleDamageTarget implements Limb {
  readonly key: string;
  readonly label: string;
  readonly part;
  readonly attachment = null;
  readonly maxHealth: number;
  readonly vitalityWeight = 0;
  readonly fatal = false;
  lastHitAt = -999;
  private readonly module: ConstructModule;
  private readonly state: LiveConstructState;

  constructor(module: ConstructModule, state: LiveConstructState) {
    this.module = module;
    this.state = state;
    this.key = module.id;
    this.label = module.id.replaceAll("-", " ");
    this.maxHealth = module.spec.health;
    this.part = { name: module.id, mesh: module.visual.meshes[0], body: module.socket.part.body,
      shape: module.socket.part.shape };
  }

  get health(): number { return this.state.moduleHealth(this.module.id); }
  set health(_value: number) { /* Construct combat writes through LiveConstructState.applyDamage. */ }
  get severed(): boolean { return !this.state.moduleAvailable(this.module.id); }
  set severed(_value: boolean) { /* Derived from installed module state. */ }
}

class JointDamageTarget implements Limb {
  readonly key: string;
  readonly label: string;
  readonly part;
  readonly attachment = null;
  readonly maxHealth: number;
  readonly vitalityWeight = 0;
  readonly fatal = false;
  lastHitAt = -999;
  private readonly joint: ConstructJoint;
  private readonly state: LiveConstructState;

  constructor(joint: ConstructJoint, state: LiveConstructState) {
    this.joint = joint;
    this.state = state;
    this.key = joint.id;
    this.label = joint.id.replaceAll("-", " ");
    this.maxHealth = joint.spec.health;
    this.part = { name: joint.id, mesh: joint.parent.visual.meshes[0], body: joint.parent.body,
      shape: joint.parent.shape };
  }

  get health(): number { return this.state.jointIntegrity(this.joint.id); }
  set health(_value: number) { /* Construct combat writes through LiveConstructState.applyDamage. */ }
  get severed(): boolean { return this.state.jointIntegrity(this.joint.id) <= 0; }
  set severed(_value: boolean) { /* Derived from joint integrity. */ }
}

/** Contact target resolver and armour write seam for one compiled construct. */
export class ConstructDamageTargets {
  private readonly runtime: ConstructRuntime;
  private readonly state: LiveConstructState;
  private readonly partByBody: ReadonlyMap<PhysicsBody, Limb>;
  private readonly moduleTargets = new Map<string, ModuleDamageTarget>();
  private readonly moduleTargetSet = new Set<Limb>();
  private readonly jointTargets = new Map<string, JointDamageTarget>();
  private readonly jointTargetSet = new Set<Limb>();

  constructor(runtime: ConstructRuntime, state: LiveConstructState, partByBody: ReadonlyMap<PhysicsBody, Limb>) {
    this.runtime = runtime;
    this.state = state;
    this.partByBody = partByBody;
    for (const module of runtime.modules.values()) {
      const target = new ModuleDamageTarget(module, state);
      this.moduleTargets.set(module.id, target);
      this.moduleTargetSet.add(target);
    }
    for (const joint of runtime.joints.values()) {
      const target = new JointDamageTarget(joint, state);
      this.jointTargets.set(joint.id, target);
      this.jointTargetSet.add(target);
    }
  }

  targetFor(body: PhysicsBody, point: Vector3): Limb | undefined {
    const module = moduleAtContact(this.runtime, body, point);
    if (module && this.state.moduleAvailable(module.id)) return this.moduleTargets.get(module.id);
    const joint = jointAtContact(this.runtime, body, point);
    if (joint && this.state.jointIntegrity(joint.id) > 0) return this.jointTargets.get(joint.id);
    return this.partByBody.get(body);
  }

  describe(target: Limb): Readonly<{
    targetKind: "part" | "module" | "joint";
    targetId: string;
    remaining: number;
    maximum: number;
  }> {
    if (this.moduleTargetSet.has(target)) return Object.freeze({
      targetKind: "module", targetId: target.key,
      remaining: this.state.moduleHealth(target.key), maximum: target.maxHealth,
    });
    if (this.jointTargetSet.has(target)) return Object.freeze({
      targetKind: "joint", targetId: target.key,
      remaining: this.state.jointIntegrity(target.key), maximum: target.maxHealth,
    });
    if (this.partByBody.get(target.part.body) === target) return Object.freeze({
      targetKind: "part", targetId: target.key,
      remaining: this.state.partHealth(target.key), maximum: target.maxHealth,
    });
    throw new Error(`construct damage target "${target.key}" is not owned by this construct`);
  }

  applyDamage(target: Limb, rawDamage: number): number {
    if (this.moduleTargetSet.has(target)) return this.state.damageModule(target.key, rawDamage).applied;
    if (this.jointTargetSet.has(target)) return this.state.damageJoint(target.key, rawDamage).applied;
    const result = this.state.damagePart(target.key, rawDamage);
    target.health = this.state.partHealth(target.key);
    return result.applied;
  }
}
