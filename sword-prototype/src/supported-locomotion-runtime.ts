import type { LocomotionRequest } from "./supported-locomotion.ts";
import { SUPPORTED_LOCOMOTION_V1, type StandableSupportEvidence } from "./supported-locomotion-state.ts";

export const SUPPORTED_CARRIER_V1 = Object.freeze({
  STEP_HEIGHT_M: 0.18,
  MAX_STANDABLE_SLOPE_DEG: 35,
  REFUSAL_SLOPE_DEG: 50,
  ROOT_MAX_ACCELERATION_MPS2: 18,
  ROOT_MAX_ERROR_M: 0.32,
  ROOT_POSITION_GAIN_PER_S2: 42,
  ROOT_VELOCITY_DAMPING_PER_S: 11,
  RISING_MAX_ACCELERATION_MPS2: 48,
  RISING_DURATION_S: SUPPORTED_LOCOMOTION_V1.RISING_DURATION_S,
});

export interface HorizontalPoint { readonly x: number; readonly z: number }
export interface WorldPoint extends HorizontalPoint { readonly y: number }
export interface HorizontalMove extends HorizontalPoint { readonly yaw: number }

export interface FootprintProvenance {
  readonly profileId: string;
  readonly source: "fighter-bind-geometry" | "construct-bind-geometry" | "golem-bind-geometry";
  readonly measuredAt: string;
}

/** Navigation geometry is measured from the bind, never borrowed from combat perception. */
export interface LocomotionFootprint {
  readonly radiusM: number;
  readonly heightM: number;
  readonly stepHeightM: number;
  readonly maxSlopeDeg: number;
  readonly provenance: FootprintProvenance;
}

const positive = (value: number, field: string): number => {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${field} must be finite and positive`);
  return value;
};

export function deriveLocomotionFootprint(input: Readonly<{
  radiusM: number;
  heightM: number;
  provenance: FootprintProvenance;
}>): LocomotionFootprint {
  const provenance = input.provenance;
  if (!provenance.profileId || !provenance.measuredAt ||
      // `golem-bind-geometry` added 2026-09-04 by golem session 05: a golem's footprint is
      // measured from its own bind pose exactly as the other two are, and labelling it as a
      // construct's would be a provenance that names a body plan this tree no longer has.
      !["fighter-bind-geometry", "construct-bind-geometry", "golem-bind-geometry"]
        .includes(provenance.source)) {
    throw new Error("locomotion footprint requires bind-geometry profile provenance");
  }
  return Object.freeze({
    radiusM: positive(input.radiusM, "locomotion footprint radiusM"),
    heightM: positive(input.heightM, "locomotion footprint heightM"),
    stepHeightM: SUPPORTED_CARRIER_V1.STEP_HEIGHT_M,
    maxSlopeDeg: SUPPORTED_CARRIER_V1.MAX_STANDABLE_SLOPE_DEG,
    provenance: Object.freeze({ ...provenance }),
  });
}

export type QueryColliderCategory = "standable-world" | "wall" | "opponent" | "weapon" |
  "debris" | "owner-part";

export interface WorldQueryHit {
  readonly colliderId: string;
  readonly fraction: number;
  readonly point: WorldPoint;
  readonly upwardNormal: readonly [number, number, number];
}

export interface WorldQueryCollider {
  readonly id: string;
  readonly category: QueryColliderCategory;
  readonly ownerPartId: string | null;
  readonly upwardNormal: readonly [number, number, number];
  /** Earliest swept-footprint hit in 0..1, or null when this collider is clear. */
  sweep(from: WorldPoint, to: WorldPoint, footprint: LocomotionFootprint): WorldQueryHit | null;
  /** A current support point below this footprint, or null. */
  support(at: WorldPoint, footprint: LocomotionFootprint): WorldQueryHit | null;
}

const unitNormal = (normal: readonly [number, number, number]): boolean =>
  normal.every(Number.isFinite) && Math.abs(Math.hypot(...normal) - 1) <= 1e-6;

const slopeDegrees = (normal: readonly [number, number, number]): number =>
  Math.acos(Math.max(-1, Math.min(1, normal[1]))) * 180 / Math.PI;

/**
 * The registry is the only bridge between room collision and locomotion. A caller cannot turn an
 * arbitrary Havok hit into ground merely by labelling its contact point after the fact.
 */
export class StandableWorldRegistry {
  private readonly colliders = new Map<string, WorldQueryCollider>();

  register(collider: WorldQueryCollider): void {
    if (!collider.id || this.colliders.has(collider.id)) {
      throw new Error(`world query collider ID "${collider.id}" must be non-empty and unique`);
    }
    if (!unitNormal(collider.upwardNormal)) throw new Error(`world query collider "${collider.id}" has invalid normal`);
    this.colliders.set(collider.id, collider);
  }

  unregister(id: string): void {
    if (!this.colliders.delete(id)) throw new Error(`world query collider "${id}" is not registered`);
  }

  get size(): number { return this.colliders.size; }

  /**
   * Navigation sees static arena floor and walls only. Opponents are resolved from pair footprints;
   * weapons, debris and owner anatomy are deliberately absent from clearance authority.
   */
  allowedFraction(from: WorldPoint, to: WorldPoint, footprint: LocomotionFootprint,
    ownerPartIds: ReadonlySet<string>): number {
    let allowed = 1;
    for (const collider of this.colliders.values()) {
      if (collider.ownerPartId !== null && ownerPartIds.has(collider.ownerPartId)) continue;
      if (collider.category !== "standable-world" && collider.category !== "wall") continue;
      const hit = collider.sweep(from, to, footprint);
      if (!hit) continue;
      if (hit.colliderId !== collider.id || !Number.isFinite(hit.fraction) ||
          hit.fraction < 0 || hit.fraction > 1) {
        throw new Error(`world query collider "${collider.id}" returned an invalid sweep hit`);
      }
      allowed = Math.min(allowed, hit.fraction);
    }
    return allowed;
  }

  supportEvidence(at: WorldPoint, footprint: LocomotionFootprint,
    ownerPartIds: ReadonlySet<string>, supportBinding: string,
    safeBoundarySequence: number): readonly StandableSupportEvidence[] {
    const evidence: StandableSupportEvidence[] = [];
    for (const collider of this.colliders.values()) {
      if (collider.ownerPartId !== null && ownerPartIds.has(collider.ownerPartId)) continue;
      if (collider.category !== "standable-world") continue;
      const hit = collider.support(at, footprint);
      if (!hit || hit.colliderId !== collider.id || !unitNormal(hit.upwardNormal)) continue;
      if (slopeDegrees(hit.upwardNormal) > footprint.maxSlopeDeg) continue;
      // A provider names the plane below a terminal; it does not get to turn an airborne or
      // deeply buried terminal into current contact merely because their x/z projections overlap.
      // The footprint's authored step envelope is already the vertical tolerance used by
      // navigation, and using it symmetrically also tolerates the solver's shallow penetration.
      if (Math.abs(at.y - hit.point.y) > footprint.stepHeightM) continue;
      evidence.push(Object.freeze({
        safeBoundarySequence,
        supportBinding,
        contactedOwner: collider.id,
        category: "standable-world" as const,
        point: Object.freeze([hit.point.x, hit.point.y, hit.point.z] as const),
        upwardNormal: Object.freeze([...hit.upwardNormal] as [number, number, number]),
        freshness: "current" as const,
      }));
    }
    return Object.freeze(evidence);
  }
}

const clampMagnitude = (x: number, z: number, maximum: number): HorizontalPoint => {
  const length = Math.hypot(x, z);
  if (length <= maximum || length === 0) return { x, z };
  const scale = maximum / length;
  return { x: x * scale, z: z * scale };
};

const wrapYaw = (yaw: number): number => {
  let result = yaw;
  while (result > Math.PI) result -= Math.PI * 2;
  while (result <= -Math.PI) result += Math.PI * 2;
  return result;
};

export interface VirtualCarrierConfig {
  readonly maxSpeedMps: number;
  readonly maxAccelerationMps2: number;
  readonly maxYawSpeedRadS: number;
  readonly maxYawAccelerationRadS2: number;
}

export interface VirtualCarrierState extends WorldPoint {
  readonly yaw: number;
  readonly velocityX: number;
  readonly velocityZ: number;
  readonly yawVelocity: number;
}

export interface CarrierProposal {
  readonly prior: VirtualCarrierState;
  readonly next: VirtualCarrierState;
  readonly displacement: HorizontalMove;
  readonly footprint: LocomotionFootprint;
  readonly resistance: number;
  readonly ownerPartIds: ReadonlySet<string>;
}

/** This record intentionally has no PhysicsBody, shape, trigger, mesh, membership or collide mask. */
export class VirtualLocomotionCarrier {
  readonly footprint: LocomotionFootprint;
  readonly config: VirtualCarrierConfig;
  readonly ownerPartIds: ReadonlySet<string>;
  private current: VirtualCarrierState;

  constructor(initial: Readonly<{ position: WorldPoint; yaw: number }>, footprint: LocomotionFootprint,
    config: VirtualCarrierConfig, ownerPartIds: ReadonlySet<string>) {
    for (const [field, value] of Object.entries(config)) positive(value, `virtual carrier ${field}`);
    if (![initial.position.x, initial.position.y, initial.position.z, initial.yaw].every(Number.isFinite)) {
      throw new Error("virtual carrier initial transform must be finite");
    }
    this.footprint = footprint;
    this.config = Object.freeze({ ...config });
    this.ownerPartIds = new Set(ownerPartIds);
    this.current = Object.freeze({ ...initial.position, yaw: wrapYaw(initial.yaw),
      velocityX: 0, velocityZ: 0, yawVelocity: 0 });
  }

  get state(): VirtualCarrierState { return this.current; }

  /** Recovery re-anchors the bodyless carrier over the live fallen root; no solver transform is written. */
  reset(position: WorldPoint, yaw = this.current.yaw): void {
    if (![position.x, position.y, position.z, yaw].every(Number.isFinite)) {
      throw new Error("virtual carrier reset transform must be finite");
    }
    this.current = Object.freeze({ ...position, yaw: wrapYaw(yaw),
      velocityX: 0, velocityZ: 0, yawVelocity: 0 });
  }

  propose(request: LocomotionRequest, dt: number, resistance = 1): CarrierProposal {
    positive(dt, "virtual carrier dt");
    positive(resistance, "virtual carrier resistance");
    const local = clampMagnitude(request.localRight, request.localForward, 1);
    const sin = Math.sin(this.current.yaw);
    const cos = Math.cos(this.current.yaw);
    const wantedX = (local.x * cos + local.z * sin) * this.config.maxSpeedMps;
    const wantedZ = (local.z * cos - local.x * sin) * this.config.maxSpeedMps;
    const velocityDelta = clampMagnitude(wantedX - this.current.velocityX,
      wantedZ - this.current.velocityZ, this.config.maxAccelerationMps2 * dt);
    const velocityX = this.current.velocityX + velocityDelta.x;
    const velocityZ = this.current.velocityZ + velocityDelta.z;
    const wantedYawVelocity = request.yaw * this.config.maxYawSpeedRadS;
    const yawDelta = Math.max(-this.config.maxYawAccelerationRadS2 * dt,
      Math.min(this.config.maxYawAccelerationRadS2 * dt, wantedYawVelocity - this.current.yawVelocity));
    const yawVelocity = this.current.yawVelocity + yawDelta;
    const displacement = Object.freeze({ x: velocityX * dt, z: velocityZ * dt, yaw: yawVelocity * dt });
    return Object.freeze({ prior: this.current, footprint: this.footprint, resistance,
      ownerPartIds: this.ownerPartIds,
      displacement, next: Object.freeze({ x: this.current.x + displacement.x, y: this.current.y,
        z: this.current.z + displacement.z, yaw: wrapYaw(this.current.yaw + displacement.yaw),
        velocityX, velocityZ, yawVelocity }) });
  }

  commit(proposal: CarrierProposal, allowed: HorizontalMove): void {
    if (proposal.prior !== this.current) throw new Error("virtual carrier proposal is stale");
    const xFraction = proposal.displacement.x === 0 ? 0 :
      Math.max(0, Math.min(1, allowed.x / proposal.displacement.x));
    const zFraction = proposal.displacement.z === 0 ? 0 :
      Math.max(0, Math.min(1, allowed.z / proposal.displacement.z));
    this.current = Object.freeze({ x: this.current.x + allowed.x, y: this.current.y,
      z: this.current.z + allowed.z, yaw: wrapYaw(this.current.yaw + allowed.yaw),
      velocityX: proposal.next.velocityX * xFraction, velocityZ: proposal.next.velocityZ * zFraction,
      yawVelocity: proposal.next.yawVelocity });
  }
}

export interface PairAllowedMoves { readonly left: HorizontalMove; readonly right: HorizontalMove }

const moveScaled = (move: HorizontalMove, scale: number): HorizontalMove =>
  Object.freeze({ x: move.x * scale, z: move.z * scale, yaw: move.yaw });

const firstDiscContact = (px: number, pz: number, vx: number, vz: number, radius: number): number | null => {
  const c = px * px + pz * pz - radius * radius;
  if (c <= 0) return 0;
  const a = vx * vx + vz * vz;
  if (a <= 1e-18) return null;
  const b = 2 * (px * vx + pz * vz);
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const root = (-b - Math.sqrt(discriminant)) / (2 * a);
  return root >= 0 && root <= 1 ? root : null;
};

/**
 * World clipping happens first and independently. One unordered circle calculation then scales
 * both moves from the same contact time; resistance shares the remaining approach without making
 * either carrier an infinite-mass pusher.
 */
export function resolveCarrierPair(
  left: CarrierProposal,
  right: CarrierProposal,
  registry: StandableWorldRegistry,
): PairAllowedMoves {
  const worldLeft = registry.allowedFraction(left.prior, left.next, left.footprint,
    left.ownerPartIds);
  const worldRight = registry.allowedFraction(right.prior, right.next, right.footprint,
    right.ownerPartIds);
  let leftMove = moveScaled(left.displacement, worldLeft);
  let rightMove = moveScaled(right.displacement, worldRight);
  const dx = right.prior.x - left.prior.x;
  const dz = right.prior.z - left.prior.z;
  const required = left.footprint.radiusM + right.footprint.radiusM;
  const relativeX = rightMove.x - leftMove.x;
  const relativeZ = rightMove.z - leftMove.z;
  const contactAt = firstDiscContact(dx, dz, relativeX, relativeZ, required);
  if (contactAt !== null) {
    const contactX = dx + relativeX * contactAt;
    const contactZ = dz + relativeZ * contactAt;
    const contactLength = Math.hypot(contactX, contactZ);
    const nx = contactLength > 1e-9 ? contactX / contactLength : 1;
    const nz = contactLength > 1e-9 ? contactZ / contactLength : 0;
    const leftPrefix = moveScaled(leftMove, contactAt);
    const rightPrefix = moveScaled(rightMove, contactAt);
    const leftRemainder = moveScaled(leftMove, 1 - contactAt);
    const rightRemainder = moveScaled(rightMove, 1 - contactAt);
    const leftClosing = Math.max(0, leftRemainder.x * nx + leftRemainder.z * nz);
    const rightClosing = Math.max(0, -(rightRemainder.x * nx + rightRemainder.z * nz));
    const excess = leftClosing + rightClosing;
    const totalResistance = left.resistance + right.resistance;
    let leftReduction = Math.min(leftClosing, excess * right.resistance / totalResistance);
    let rightReduction = Math.min(rightClosing, excess - leftReduction);
    leftReduction = Math.min(leftClosing, leftReduction + Math.max(0, excess - leftReduction - rightReduction));
    rightReduction = Math.min(rightClosing, rightReduction + Math.max(0, excess - leftReduction - rightReduction));
    leftMove = Object.freeze({ x: leftPrefix.x + leftRemainder.x - nx * leftReduction,
      z: leftPrefix.z + leftRemainder.z - nz * leftReduction, yaw: leftMove.yaw });
    rightMove = Object.freeze({ x: rightPrefix.x + rightRemainder.x + nx * rightReduction,
      z: rightPrefix.z + rightRemainder.z + nz * rightReduction, yaw: rightMove.yaw });
  }
  return Object.freeze({ left: leftMove, right: rightMove });
}

export interface DynamicRootSample {
  readonly motionType: "dynamic" | "animated" | "static";
  readonly position: WorldPoint;
  readonly velocity: WorldPoint;
  readonly massKg: number;
  readonly released: boolean;
}

export interface RootMotorCommand {
  readonly enabled: boolean;
  readonly forceN: WorldPoint;
  readonly errorM: number;
  readonly reason: string | null;
}

/** A capped force command; applying it is the only adapter-specific operation. */
export function boundedRootMotorCommand(root: DynamicRootSample, target: WorldPoint,
  targetVelocity: WorldPoint): RootMotorCommand {
  if (root.released) return Object.freeze({ enabled: false, forceN: { x: 0, y: 0, z: 0 },
    errorM: 0, reason: "root topology was released" });
  if (root.motionType !== "dynamic") return Object.freeze({ enabled: false,
    forceN: { x: 0, y: 0, z: 0 }, errorM: 0, reason: "assisted physical root must remain DYNAMIC" });
  positive(root.massKg, "supported root massKg");
  const rawError = { x: target.x - root.position.x, y: target.y - root.position.y,
    z: target.z - root.position.z };
  const errorLength = Math.hypot(rawError.x, rawError.y, rawError.z);
  const errorScale = errorLength <= SUPPORTED_CARRIER_V1.ROOT_MAX_ERROR_M || errorLength === 0 ? 1 :
    SUPPORTED_CARRIER_V1.ROOT_MAX_ERROR_M / errorLength;
  const acceleration = {
    x: rawError.x * errorScale * SUPPORTED_CARRIER_V1.ROOT_POSITION_GAIN_PER_S2 +
      (targetVelocity.x - root.velocity.x) * SUPPORTED_CARRIER_V1.ROOT_VELOCITY_DAMPING_PER_S,
    y: rawError.y * errorScale * SUPPORTED_CARRIER_V1.ROOT_POSITION_GAIN_PER_S2 +
      (targetVelocity.y - root.velocity.y) * SUPPORTED_CARRIER_V1.ROOT_VELOCITY_DAMPING_PER_S,
    z: rawError.z * errorScale * SUPPORTED_CARRIER_V1.ROOT_POSITION_GAIN_PER_S2 +
      (targetVelocity.z - root.velocity.z) * SUPPORTED_CARRIER_V1.ROOT_VELOCITY_DAMPING_PER_S,
  };
  const limited = clamp3(acceleration, SUPPORTED_CARRIER_V1.ROOT_MAX_ACCELERATION_MPS2);
  return Object.freeze({ enabled: true, forceN: Object.freeze({ x: limited.x * root.massKg,
    y: limited.y * root.massKg, z: limited.z * root.massKg }), errorM: errorLength, reason: null });
}

export interface SupportedRootAdapter {
  sample(): DynamicRootSample;
  applyForce(forceN: WorldPoint): void;
  clearDrive(): void;
}

/** The lifecycle owner applies forces but never writes a root or limb transform. */
export class SupportedRootMotor {
  private disposed = false;
  readonly id: string;
  private readonly adapter: SupportedRootAdapter;
  private readonly census: SupportedRuntimeResourceCensus;
  constructor(id: string, adapter: SupportedRootAdapter,
    census: SupportedRuntimeResourceCensus) {
    this.id = id;
    this.adapter = adapter;
    this.census = census;
    census.create("root-motor", id);
  }

  drive(target: WorldPoint, targetVelocity: WorldPoint, supportState: "supported" | "staggered" |
    "fallen" | "rising"): RootMotorCommand {
    if (this.disposed) throw new Error(`supported root motor "${this.id}" is disposed`);
    if (supportState === "fallen") {
      this.adapter.clearDrive();
      return Object.freeze({ enabled: false, forceN: { x: 0, y: 0, z: 0 },
        errorM: 0, reason: "support state is fallen" });
    }
    const command = boundedRootMotorCommand(this.adapter.sample(), target, targetVelocity);
    if (command.enabled) this.adapter.applyForce(command.forceN);
    else this.adapter.clearDrive();
    return command;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.adapter.clearDrive();
    this.census.dispose("root-motor", this.id);
  }
}

const clamp3 = (value: WorldPoint, maximum: number): WorldPoint => {
  const length = Math.hypot(value.x, value.y, value.z);
  if (length <= maximum || length === 0) return value;
  const scale = maximum / length;
  return { x: value.x * scale, y: value.y * scale, z: value.z * scale };
};

export interface RisingFrame {
  readonly position: WorldPoint;
  readonly velocity: WorldPoint;
  readonly yaw: number;
  readonly complete: boolean;
}

export class RisingActuator {
  private elapsedS = 0;
  private active = true;
  readonly start: WorldPoint;
  readonly target: WorldPoint;
  readonly yaw: number;
  readonly footprint: LocomotionFootprint;
  constructor(start: WorldPoint, target: WorldPoint, yaw: number,
    footprint: LocomotionFootprint, registry: StandableWorldRegistry,
    ownerPartIds: ReadonlySet<string>) {
    this.start = Object.freeze({ ...start });
    this.target = Object.freeze({ ...target });
    this.yaw = yaw;
    this.footprint = footprint;
    if (registry.allowedFraction(start, target, footprint, ownerPartIds) < 1) {
      throw new Error("rising footprint sweep is obstructed");
    }
    const distance = Math.hypot(target.x - start.x, target.y - start.y, target.z - start.z);
    const peakAcceleration = 6 * distance /
      (SUPPORTED_CARRIER_V1.RISING_DURATION_S * SUPPORTED_CARRIER_V1.RISING_DURATION_S);
    if (peakAcceleration > SUPPORTED_CARRIER_V1.RISING_MAX_ACCELERATION_MPS2) {
      throw new Error(`rising target from (${this.start.x.toFixed(6)}, ${this.start.y.toFixed(6)}, ` +
        `${this.start.z.toFixed(6)}) to (${this.target.x.toFixed(6)}, ${this.target.y.toFixed(6)}, ` +
        `${this.target.z.toFixed(6)}) spans ${distance.toFixed(6)} m and requires ` +
        `${peakAcceleration.toFixed(6)} m/s^2, above the ` +
        `${SUPPORTED_CARRIER_V1.RISING_MAX_ACCELERATION_MPS2.toFixed(6)} m/s^2 acceleration-limited Hermite limit`);
    }
  }

  step(dt: number): RisingFrame {
    if (!this.active) throw new Error("rising actuator is not active");
    positive(dt, "rising dt");
    this.elapsedS = Math.min(SUPPORTED_CARRIER_V1.RISING_DURATION_S, this.elapsedS + dt);
    const t = this.elapsedS / SUPPORTED_CARRIER_V1.RISING_DURATION_S;
    const h = t * t * (3 - 2 * t);
    const dh = 6 * t * (1 - t) / SUPPORTED_CARRIER_V1.RISING_DURATION_S;
    const delta = { x: this.target.x - this.start.x, y: this.target.y - this.start.y,
      z: this.target.z - this.start.z };
    const complete = t === 1;
    if (complete) this.active = false;
    return Object.freeze({ position: Object.freeze({ x: this.start.x + delta.x * h,
      y: this.start.y + delta.y * h, z: this.start.z + delta.z * h }),
    velocity: Object.freeze({ x: delta.x * dh, y: delta.y * dh, z: delta.z * dh }),
    yaw: this.yaw, complete });
  }

  /** Aborting publishes no target transform; the adapter leaves live position and velocity alone. */
  abort(livePosition: WorldPoint, liveVelocity: WorldPoint): RisingFrame {
    this.active = false;
    return Object.freeze({ position: Object.freeze({ ...livePosition }),
      velocity: Object.freeze({ ...liveVelocity }), yaw: this.yaw, complete: false });
  }
}

export type SupportedRuntimeResourceKind = "query" | "root-motor" | "fist-trigger" | "observer";

/** Explicit IDs make lifecycle a fact, rather than an inference from Babylon private maps. */
export class SupportedRuntimeResourceCensus {
  private readonly created = new Map<SupportedRuntimeResourceKind, Set<string>>();
  private readonly disposed = new Map<SupportedRuntimeResourceKind, Set<string>>();

  create(kind: SupportedRuntimeResourceKind, id: string): void {
    if (!id) throw new Error("supported runtime resource ID must be non-empty");
    const made = this.created.get(kind) ?? new Set<string>();
    if (made.has(id)) throw new Error(`supported runtime ${kind} "${id}" was created twice`);
    made.add(id);
    this.created.set(kind, made);
  }

  dispose(kind: SupportedRuntimeResourceKind, id: string): void {
    if (!this.created.get(kind)?.has(id)) throw new Error(`supported runtime ${kind} "${id}" was never created`);
    const gone = this.disposed.get(kind) ?? new Set<string>();
    if (gone.has(id)) throw new Error(`supported runtime ${kind} "${id}" was disposed twice`);
    gone.add(id);
    this.disposed.set(kind, gone);
  }

  activeIds(kind: SupportedRuntimeResourceKind): readonly string[] {
    const gone = this.disposed.get(kind) ?? new Set<string>();
    return Object.freeze([...(this.created.get(kind) ?? [])].filter((id) => !gone.has(id)).sort());
  }

  get balanced(): boolean {
    return (["query", "root-motor", "fist-trigger", "observer"] as const)
      .every((kind) => this.activeIds(kind).length === 0);
  }
}

export interface HandKinematics { readonly position: WorldPoint; readonly velocity: WorldPoint }
export interface FistTriggerSample extends HandKinematics { readonly triggerId: string }

/** A sensor follower only: the integration adapter owns a non-solving trigger and routes this sample to Combat. */
export class FistTriggerFollower {
  private disposed = false;
  readonly id: string;
  private readonly census: SupportedRuntimeResourceCensus;
  constructor(id: string, census: SupportedRuntimeResourceCensus) {
    this.id = id;
    this.census = census;
    census.create("fist-trigger", id);
  }
  sample(hand: HandKinematics): FistTriggerSample {
    if (this.disposed) throw new Error(`fist trigger "${this.id}" is disposed`);
    return Object.freeze({ triggerId: this.id, position: Object.freeze({ ...hand.position }),
      velocity: Object.freeze({ ...hand.velocity }) });
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.census.dispose("fist-trigger", this.id);
  }
}
