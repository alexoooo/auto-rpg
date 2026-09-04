import {
  StagedSupportedLocomotionPort,
  type LocomotionRequest,
  type LocomotionResolution,
  type SupportedLocomotionPort,
  type SupportedLocomotionPortSnapshot,
  type SupportedLocomotionSample,
} from "./supported-locomotion.ts";
import {
  StandableWorldRegistry,
  SUPPORTED_CARRIER_V1,
  RisingActuator,
  SupportedRootMotor,
  SupportedRuntimeResourceCensus,
  VirtualLocomotionCarrier,
  resolveCarrierPair,
  type CarrierProposal,
  type HorizontalMove,
  type LocomotionFootprint,
  type SupportedRootAdapter,
  type VirtualCarrierConfig,
  type WorldQueryCollider,
  type WorldPoint,
} from "./supported-locomotion-runtime.ts";
import type { StabilityEvent } from "./supported-locomotion-state.ts";
import { initialSupportedLocomotionState, stepSupportedLocomotionState,
  SUPPORTED_LOCOMOTION_V1, type StabilityAuthority, type SupportState,
  type SupportedLocomotionState } from "./supported-locomotion-state.ts";
/**
 * The scheduler seam, moved here on 2026-09-04 when `src/construct/` and `src/forge/` were
 * deleted with the golem plan set's first session.
 *
 * Five declarations came across -- the two specs an admission query names, the token it
 * answers with, the submission that installs one, and the port interface this class
 * implements. What did not come across is the construct parameter grammar (`ParameterSpec`,
 * `QuantityUnit`), because this module reads no field of either spec: `authority` hands both
 * straight to the caller-supplied `resolveActionAuthority` and looks at neither. So an
 * `ActionSpec` here is the identity a caller needs to name an Action and its control group,
 * and not a body-description format.
 *
 * **This seam currently has no writer.** The Warrior and Broot both declare
 * `supportedLocomotionPort` and drive the carrier through `request`/`resolve` without ever
 * calling `authority` or `stage`; the only caller that did was the construct runtime. Golem
 * session 05 owns the locomotion contract and is the named reader that is coming, which is
 * why this is kept rather than cut -- see the house rule about a view field with no reader
 * *yet*, and delete it if session 05 lands without one.
 */
export interface ActionSpec {
  readonly id: string;
  readonly group: string;
}

export interface ControlGroupSpec {
  readonly id: string;
}

export interface LocomotionAuthorityToken {
  readonly carrierPartId: string;
}

export interface LocomotionSubmission {
  readonly action: string;
  readonly group: string;
  readonly authority: LocomotionAuthorityToken;
  readonly request: LocomotionRequest;
}

/** Optional runtime seam: a pair may deliberately construct without a carrier. */
export interface LocomotionSchedulerPort {
  authority(action: ActionSpec, group: ControlGroupSpec): LocomotionAuthorityToken | null;
  stage(submission: LocomotionSubmission): void;
  priorSample(authority: LocomotionAuthorityToken): SupportedLocomotionSample;
  clearSubmission(action: string, group: string, authority: LocomotionAuthorityToken, reason: string): void;
  clearAll(reason: string): void;
}

const STOP: LocomotionRequest = Object.freeze({
  localForward: 0, localRight: 0, yaw: 0, recover: false,
});

/**
 * A rise is interrupted by a new *staggering* authored transfer, not a brush.  The ledger still
 * records every physical contact for normal supported/fallen thresholds, but treating any
 * positive floating-point contact as an interrupt made a weapon scrape reset a bounded rise at
 * 240 Hz forever.  Express the boundary in the same mass-independent specific impulse units as
 * the state machine, so a real hit retains its physical consequence without a special recovery
 * damage rule.
 */
export function recoveryHitInterrupted(events: readonly StabilityEvent[], supportedMassKg: number,
  authority: StabilityAuthority | null): boolean {
  const freshSpecificImpulseMps = events.reduce((sum, event) => sum +
    (event.kind === "specific-impulse" ? event.specificImpulseMps :
      Math.hypot(...event.horizontalShoveNs) / supportedMassKg), 0);
  const capacity = (authority?.braceCapacityMultiplier ?? 1) * (authority?.gaitStabilityScale ?? 1);
  return freshSpecificImpulseMps >= SUPPORTED_LOCOMOTION_V1.STAGGER_SPECIFIC_IMPULSE_MPS * capacity;
}

export const DEFAULT_SUPPORTED_CARRIER: VirtualCarrierConfig = Object.freeze({
  maxSpeedMps: 1.6,
  maxAccelerationMps2: 9,
  maxYawSpeedRadS: 2.4,
  maxYawAccelerationRadS2: 14,
});

export const MAX_STANDABLE_SLOPE_DEGREES = 35;
export const MIN_STANDABLE_UPWARD_NORMAL_Y = Math.cos(MAX_STANDABLE_SLOPE_DEGREES * Math.PI / 180);
// Separation is part of the bounded rise, not a fallen-body teleport. The close-opponent fixture
// below needs 0.27 m; 0.35 m admits that measured overlap while still refusing coincident carriers
// and remaining far below the 1.62 m displacement admitted by the actuator acceleration limit.
export const MAX_RECOVERY_SEPARATION_M = 0.35;
export const RECOVERY_SEPARATION_MARGIN_M = 0.02;

/** Downward/ceiling normals and any surface steeper than the frozen 35 degree limit are not feet. */
export function isStandableUpwardNormalY(y: number): boolean {
  return Number.isFinite(y) && y >= MIN_STANDABLE_UPWARD_NORMAL_Y;
}


/** Flat-floor authority used by the current arena and headless fixtures. Walls may register too. */
export function flatSupportedWorldRegistry(): StandableWorldRegistry {
  const registry = new StandableWorldRegistry();
  const floor: WorldQueryCollider = Object.freeze({
    id: "arena-floor", category: "standable-world", ownerPartId: null,
    upwardNormal: Object.freeze([0, 1, 0] as const),
    sweep: () => null,
    support: (at: import("./supported-locomotion-runtime.ts").WorldPoint) =>
      Math.abs(at.x) > 30 || Math.abs(at.z) > 30 ? null : Object.freeze({ colliderId: "arena-floor", fraction: 1,
      point: Object.freeze({ x: at.x, y: 0, z: at.z }),
      upwardNormal: Object.freeze([0, 1, 0] as const) }),
  });
  registry.register(floor);
  const wall = (id: string, axis: "x" | "z", sign: -1 | 1): WorldQueryCollider => Object.freeze({
    id, category: "wall", ownerPartId: null, upwardNormal: Object.freeze([0, 1, 0] as const),
    support: () => null,
    sweep: (from: import("./supported-locomotion-runtime.ts").WorldPoint,
      to: import("./supported-locomotion-runtime.ts").WorldPoint, footprint: LocomotionFootprint) => {
      const limit = sign * (13 - footprint.radiusM);
      const start = from[axis]; const end = to[axis]; const delta = end - start;
      if ((sign > 0 && start > limit) || (sign < 0 && start < limit)) {
        return Object.freeze({ colliderId: id, fraction: 0,
          point: Object.freeze({ x: from.x, y: from.y, z: from.z }),
          upwardNormal: Object.freeze([0, 1, 0] as const) });
      }
      if ((sign > 0 && end <= limit) || (sign < 0 && end >= limit) || delta === 0) return null;
      const fraction = Math.max(0, Math.min(1, (limit - start) / delta));
      return Object.freeze({ colliderId: id, fraction,
        point: Object.freeze({ x: from.x + (to.x - from.x) * fraction, y: from.y,
          z: from.z + (to.z - from.z) * fraction }), upwardNormal: Object.freeze([0, 1, 0] as const) });
    },
  });
  registry.register(wall("arena-wall-east", "x", 1)); registry.register(wall("arena-wall-west", "x", -1));
  registry.register(wall("arena-wall-north", "z", 1)); registry.register(wall("arena-wall-south", "z", -1));
  return registry;
}

export interface PhysicalSupportedLocomotionOptions {
  readonly id: string;
  readonly position: Readonly<{ x: number; y: number; z: number }>;
  readonly yaw: number;
  readonly footprint: LocomotionFootprint;
  readonly ownerPartIds: ReadonlySet<string>;
  readonly root: SupportedRootAdapter;
  readonly registry: StandableWorldRegistry;
  readonly config?: VirtualCarrierConfig;
  readonly supportedMassKg: number;
  readonly authority: () => StabilityAuthority | null;
  readonly liveSupport: () => boolean;
  readonly postureSupported: () => boolean;
  readonly supportBindings: readonly string[];
  /** Read-only live topology projected by the body owner; never a runtime/body handle. */
  readonly supportGroups?: () => readonly PhysicalSupportGroupDiagnostic[];
  /** Live terminal/contact point for one registered support role. */
  readonly supportPoint?: (binding: string) => WorldPoint | null;
  readonly applyAngularDrive?: (yaw: number, state: Exclude<SupportState, "fallen">) => void;
  /** Fighter's supported root follows the resolved upright carrier until an authored release makes it ragdoll. */
  readonly driveAnimatedRoot?: (position: WorldPoint,
    velocity: Readonly<{ x: number; y: number; z: number }>, yaw: number, dt: number) => void;
  /** Applies only the occupancy-checked, acceleration-bounded RisingActuator frame. */
  readonly driveRisingRoot?: (position: WorldPoint, velocity: WorldPoint, yaw: number) => void;
  readonly releaseRoot?: () => void;
  readonly restoreRoot?: () => void;
  readonly releaseAnatomyCollision?: () => void;
  readonly restoreSupportedAnatomyCollision?: () => void;
  readonly resolveActionAuthority?: (action: ActionSpec, group: ControlGroupSpec) => LocomotionAuthorityToken | null;
}

export interface PhysicalSupportBindingDiagnostic {
  readonly id: string;
  readonly live: boolean;
  readonly reason: string | null;
}

export interface PhysicalSupportGroupDiagnostic {
  readonly id: string;
  readonly live: boolean;
  readonly reason: string | null;
  readonly bindings: readonly PhysicalSupportBindingDiagnostic[];
}

export interface PhysicalSupportedLocomotionDiagnostic {
  readonly state: SupportedLocomotionState;
  readonly stability: Readonly<{ specificImpulseMps: number; staggerAtMps: number; fallAtMps: number }>;
  readonly authority: boolean;
  readonly activeGroup: string | null;
  readonly liveSupport: boolean;
  readonly postureSupported: boolean;
  readonly supportGroups: readonly PhysicalSupportGroupDiagnostic[];
  readonly freshSupportBindings: readonly string[];
  readonly requested: LocomotionRequest | null;
  readonly allowed: LocomotionRequest | null;
  readonly blockedReason: string | null;
  readonly releaseReason: string | null;
  readonly recoveryProgress: number | null;
}

/** Production command buffer plus the non-body carrier and bounded dynamic-root motor. */
export class PhysicalSupportedLocomotionPort implements SupportedLocomotionPort, LocomotionSchedulerPort {
  readonly physicalSupportedLocomotionV1 = true;
  readonly registry: StandableWorldRegistry;
  private readonly staged = new StagedSupportedLocomotionPort();
  private readonly carrier: VirtualLocomotionCarrier;
  private readonly motor: SupportedRootMotor;
  private readonly census = new SupportedRuntimeResourceCensus();
  private readonly options: PhysicalSupportedLocomotionOptions;
  private supportState: SupportedLocomotionState = initialSupportedLocomotionState();
  private sequence = 0;
  private activeAuthority: (StabilityAuthority & { readonly requiresAllFreshSupport?: boolean }) | null = null;
  private activeAuthorityOwner: string | null = null;
  private rising: RisingActuator | null = null;
  private risingFrameComplete = false;
  private pairOccupancyClear = true;
  private recoveryPairTarget: WorldPoint | null = null;
  private anatomyReleased = false;
  private releaseReason: string | null = null;
  private lastBoundary: Pick<PhysicalSupportedLocomotionDiagnostic, "authority" | "liveSupport" |
    "postureSupported" | "freshSupportBindings"> =
    Object.freeze({ authority: false, liveSupport: false, postureSupported: false,
      freshSupportBindings: Object.freeze([]) });
  private disposed = false;

  constructor(options: PhysicalSupportedLocomotionOptions) {
    this.options = options;
    this.registry = options.registry;
    this.carrier = new VirtualLocomotionCarrier({ position: options.position, yaw: options.yaw },
      options.footprint, options.config ?? DEFAULT_SUPPORTED_CARRIER, options.ownerPartIds);
    this.motor = new SupportedRootMotor(`${options.id}.root`, options.root, this.census);
  }

  beginControlStep(): void {
    this.staged.beginControlStep();
    this.sequence += 1;
    const priorRequest = this.staged.snapshot().committed?.allowed ?? null;
    const authority = this.activeAuthority ?? this.options.authority();
    const evidenceBindings = authority?.supportBindings.map(({ role }) => role) ?? this.options.supportBindings;
    const evidence = evidenceBindings.flatMap((binding) => {
      const point = this.options.supportPoint ? this.options.supportPoint(binding) : this.carrier.state;
      return point === null ? [] : this.registry.supportEvidence(point, this.carrier.footprint,
        this.carrier.ownerPartIds, binding, this.sequence);
    });
    const shoves = this.staged.snapshot().stabilityEvents;
    const liveSupport = this.options.liveSupport();
    const postureSupported = this.options.postureSupported();
    const root = this.options.root.sample();
    const recoveryTarget = { x: this.recoveryPairTarget?.x ?? root.position.x,
      y: this.carrier.state.y, z: this.recoveryPairTarget?.z ?? root.position.z };
    const recoveryGroundAvailable = evidenceBindings.length > 0 && this.registry.supportEvidence(
      { x: recoveryTarget.x, y: 0, z: recoveryTarget.z }, this.carrier.footprint,
      this.carrier.ownerPartIds, evidenceBindings[0], this.sequence).length > 0;
    const recoveryDistanceM = Math.hypot(recoveryTarget.x - root.position.x,
      recoveryTarget.y - root.position.y, recoveryTarget.z - root.position.z);
    const recoveryWithinAccelerationLimit = 6 * recoveryDistanceM /
      (SUPPORTED_CARRIER_V1.RISING_DURATION_S * SUPPORTED_CARRIER_V1.RISING_DURATION_S) <=
      SUPPORTED_CARRIER_V1.RISING_MAX_ACCELERATION_MPS2;
    const occupancyClear = recoveryWithinAccelerationLimit && this.pairOccupancyClear &&
      this.registry.allowedFraction(root.position, recoveryTarget,
        this.carrier.footprint, this.carrier.ownerPartIds) >= 1;
    this.lastBoundary = Object.freeze({ authority: authority !== null, liveSupport, postureSupported,
      freshSupportBindings: Object.freeze([...new Set(evidence.map(({ supportBinding }) => supportBinding))].sort()) });
    const priorState = this.supportState.state;
    this.supportState = stepSupportedLocomotionState(this.supportState, {
      dt: this.staged.snapshot().committed?.dt ?? 1 / 240,
      safeBoundarySequence: this.sequence,
      authority, liveSupport, postureSupported, supportEvidence: evidence,
      supportedMassKg: this.options.supportedMassKg, authoredShoves: shoves,
      recoverRequested: priorRequest?.recover === true || (this.supportState.state === "fallen" &&
        priorRequest !== null && Math.max(Math.abs(priorRequest.localForward),
          Math.abs(priorRequest.localRight), Math.abs(priorRequest.yaw)) > 0),
      recoveryGroundAvailable, occupancyClear,
      hitInterrupted: recoveryHitInterrupted(shoves, this.options.supportedMassKg, authority),
    });
    if (this.supportState.state === "fallen") {
      if (priorState !== "fallen") {
        // Release is an edge, not a deceleration request. The physical root becomes a ragdoll on
        // this boundary, so the body-less carrier must discard its prior velocity too; otherwise
        // diagnostics report several frames of phantom allowed motion while the body is fallen.
        this.carrier.reset(this.carrier.state, this.carrier.state.yaw);
        this.releaseReason = !liveSupport ? "support chain is not live"
          : !postureSupported ? "supported posture was lost"
            : evidence.length === 0 ? "fresh standable support is unavailable"
              : "stability threshold was exceeded";
        this.rising = null;
        this.risingFrameComplete = false;
        this.options.releaseRoot?.();
        if (!this.anatomyReleased) {
          this.options.releaseAnatomyCollision?.();
          this.anatomyReleased = true;
        }
      }
      this.motor.drive(this.carrier.state, { x: 0, y: 0, z: 0 }, "fallen");
    } else if (this.supportState.state === "rising" && priorState !== "rising") {
      const live = this.options.root.sample();
      const target = { x: this.recoveryPairTarget?.x ?? live.position.x,
        y: this.carrier.state.y, z: this.recoveryPairTarget?.z ?? live.position.z };
      this.carrier.reset(target, this.carrier.state.yaw);
      this.rising = new RisingActuator(live.position, target, this.carrier.state.yaw,
        this.carrier.footprint, this.registry, this.carrier.ownerPartIds);
      this.risingFrameComplete = false;
    } else if (this.supportState.state === "supported" && priorState === "rising") {
      this.rising = null;
      this.risingFrameComplete = false;
      this.releaseReason = null;
      this.recoveryPairTarget = null;
      this.options.restoreRoot?.();
      if (this.anatomyReleased) {
        this.options.restoreSupportedAnatomyCollision?.();
        this.anatomyReleased = false;
      }
    }
    if (root.released && !this.anatomyReleased) {
      this.releaseReason = "carrier root is detached";
      this.options.releaseRoot?.();
      this.options.releaseAnatomyCollision?.();
      this.anatomyReleased = true;
    }
  }
  request(value: LocomotionRequest): void { this.staged.request(value); }
  sample(): SupportedLocomotionSample { return this.staged.sample(); }
  queueStabilityEvent(event: StabilityEvent): void { this.staged.queueStabilityEvent(event); }
  snapshot(): SupportedLocomotionPortSnapshot { return this.staged.snapshot(); }
  priorAllowed(): LocomotionRequest | null { return this.staged.snapshot().committed?.allowed ?? null; }
  get state(): SupportState { return this.supportState.state; }
  carrierGround(): WorldPoint {
    const state = this.carrier.state;
    return Object.freeze({ x: state.x, y: 0, z: state.z });
  }
  diagnostic(): PhysicalSupportedLocomotionDiagnostic {
    const request = this.staged.sample().request;
    const allowed = this.priorAllowed();
    const authority = this.activeAuthority ?? this.options.authority();
    const capacity = (authority?.braceCapacityMultiplier ?? 1) *
      (authority?.gaitStabilityScale ?? 1);
    const staged = this.staged.snapshot();
    const constrained = request !== null && allowed !== null &&
      (Math.abs(request.localForward - allowed.localForward) > 1e-9 ||
       Math.abs(request.localRight - allowed.localRight) > 1e-9 ||
       Math.abs(request.yaw - allowed.yaw) > 1e-9);
    const blockedReason = staged.lastClearReason ??
      (request !== null && this.supportState.state === "fallen" ? "carrier is released while fallen"
        : request !== null && !this.lastBoundary.authority ? "locomotion authority is unavailable"
          : request !== null && !this.lastBoundary.liveSupport ? "support chain is not live"
            : request !== null && !this.lastBoundary.postureSupported ? "supported posture is unavailable"
              : request !== null && this.lastBoundary.freshSupportBindings.length === 0
                ? "fresh standable support is unavailable"
                : constrained ? "carrier motion is constrained by world or opponent footprint" : null);
    const supportGroups = Object.freeze((this.options.supportGroups?.() ?? []).map((group) => Object.freeze({
      id: group.id, live: group.live, reason: group.reason,
      bindings: Object.freeze(group.bindings.map((binding) => Object.freeze({ ...binding }))),
    })));
    return Object.freeze({ state: Object.freeze({ ...this.supportState }), ...this.lastBoundary,
      stability: Object.freeze({ specificImpulseMps: this.supportState.specificImpulseMps,
        staggerAtMps: SUPPORTED_LOCOMOTION_V1.STAGGER_SPECIFIC_IMPULSE_MPS * capacity,
        fallAtMps: SUPPORTED_LOCOMOTION_V1.FALL_SPECIFIC_IMPULSE_MPS * capacity }),
      activeGroup: this.activeAuthorityOwner?.split("/", 1)[0] ?? null,
      supportGroups, requested: request === null ? null : Object.freeze({ ...request }),
      allowed: allowed === null ? null : Object.freeze({ ...allowed }), blockedReason,
      releaseReason: this.releaseReason,
      recoveryProgress: this.supportState.state === "rising"
        ? Math.min(1, this.supportState.risingElapsedS / SUPPORTED_LOCOMOTION_V1.RISING_DURATION_S)
        : this.supportState.state === "fallen" ? 0 : null });
  }

  authority(action: ActionSpec, group: ControlGroupSpec): LocomotionAuthorityToken | null {
    // This is an admission query, not ownership.  The scheduler probes it before it cancels an
    // old parameterized Action; claiming ownership here let that old cancellation clear the
    // newly probed authority.  The following safe boundary then evaluated a still-moving
    // two-foot body with capacity 1 instead of its declared combat brace and could release it
    // under a sub-braced blow.  `stage` is the only proof that the Action actually survived
    // admission and authored a carrier request, so it is the only place that may install it.
    return this.options.resolveActionAuthority?.(action, group) ?? null;
  }
  stage(submission: LocomotionSubmission): void {
    if (!("supportBindings" in submission.authority)) {
      throw new Error(`physical locomotion submission "${submission.group}/${submission.action}" lacks stability authority`);
    }
    this.activeAuthority = submission.authority as StabilityAuthority;
    this.activeAuthorityOwner = `${submission.group}/${submission.action}`;
    this.staged.request(submission.request);
  }
  priorSample(_authority: LocomotionAuthorityToken): SupportedLocomotionSample {
    return Object.freeze({ request: this.priorAllowed() });
  }
  clearSubmission(action: string, group: string, _authority: LocomotionAuthorityToken, reason: string): void {
    if (this.activeAuthorityOwner !== `${group}/${action}`) return;
    this.clear(reason);
  }
  clearAll(reason: string): void { this.clear(reason); }

  proposal(dt: number): CarrierProposal {
    if (this.disposed) throw new Error("physical supported locomotion port is disposed");
    if (this.supportState.state === "fallen" && !this.options.root.sample().released) {
      // A fallen fighter is lower, not absent. Letting the opponent ignore its footprint allowed
      // the supported carrier to stand directly over the ragdoll; recovery was then occupancy-
      // blocked forever and the camera showed only the trapped fighter's sword and shield. Follow
      // the live fallen root at each safe boundary so the body can be walked around but not through.
      const live = this.options.root.sample().position;
      this.carrier.reset({ x: live.x, y: this.carrier.state.y, z: live.z }, this.carrier.state.yaw);
    }
    const missingRequiredFallbackSupport = this.activeAuthority?.requiresAllFreshSupport === true &&
      this.activeAuthority.supportBindings.some(({ role }) =>
        !this.lastBoundary.freshSupportBindings.includes(role));
    if (missingRequiredFallbackSupport) {
      // Support grace decides when the body falls; it is not air-walk authority. A fallback
      // carrier missing any member of its exact authored support set stops on this same pair
      // boundary, while retaining the state-machine grace that lets a physical replant recover.
      this.carrier.reset(this.carrier.state, this.carrier.state.yaw);
      return this.carrier.propose(STOP, dt);
    }
    const request = this.supportState.state === "fallen" || this.options.root.sample().released
      ? STOP : this.staged.sample().request ?? STOP;
    return this.carrier.propose(request, dt);
  }

  blocksOpponentFootprint(): boolean {
    return !this.options.root.sample().released;
  }

  updatePairOccupancy(other: PhysicalSupportedLocomotionPort): void {
    const here = this.supportState.state === "fallen" ? this.options.root.sample().position : this.carrier.state;
    const there = other.supportState.state === "fallen" ? other.options.root.sample().position : other.carrier.state;
    const required = this.carrier.footprint.radiusM + other.carrier.footprint.radiusM;
    const distance = Math.hypot(there.x - here.x, there.z - here.z);
    if (distance >= required - 1e-9) {
      this.pairOccupancyClear = true;
      if (this.supportState.state !== "rising") this.recoveryPairTarget = null;
      return;
    }
    if (this.supportState.state === "rising" && this.recoveryPairTarget) {
      this.pairOccupancyClear = Math.hypot(there.x - this.recoveryPairTarget.x,
        there.z - this.recoveryPairTarget.z) >= required - 1e-9;
      return;
    }
    this.pairOccupancyClear = false;
    this.recoveryPairTarget = null;
    if (this.supportState.state !== "fallen") return;
    const separationM = required - distance + RECOVERY_SEPARATION_MARGIN_M;
    if (separationM > MAX_RECOVERY_SEPARATION_M) return;
    const sign = this.options.id.localeCompare(other.options.id) <= 0 ? -1 : 1;
    const awayX = distance > 1e-9 ? (here.x - there.x) / distance : sign;
    const awayZ = distance > 1e-9 ? (here.z - there.z) / distance : 0;
    const target = Object.freeze({ x: here.x + awayX * separationM,
      y: this.carrier.state.y, z: here.z + awayZ * separationM });
    // The other carrier is accounted for by the exact endpoint separation above. This sweep is
    // the independent world/debris half: a wall or obstacle still vetoes the retreat before any
    // RisingActuator exists.
    if (this.registry.allowedFraction(here, target,
        this.carrier.footprint, this.carrier.ownerPartIds) < 1) return;
    this.recoveryPairTarget = target;
    this.pairOccupancyClear = true;
  }

  commitPhysical(proposal: CarrierProposal, allowed: HorizontalMove, dt: number): void {
    this.carrier.commit(proposal, allowed);
    const requested = this.staged.sample().request;
    const sin = Math.sin(proposal.prior.yaw); const cos = Math.cos(proposal.prior.yaw);
    const achievedRight = allowed.x * cos - allowed.z * sin;
    const achievedForward = allowed.x * sin + allowed.z * cos;
    const maxDistance = this.carrier.config.maxSpeedMps * dt;
    const resolution: LocomotionResolution = Object.freeze({ dt, allowed: requested === null ? null : Object.freeze({
      localForward: maxDistance > 0 ? Math.max(-1, Math.min(1, achievedForward / maxDistance)) : 0,
      localRight: maxDistance > 0 ? Math.max(-1, Math.min(1, achievedRight / maxDistance)) : 0,
      yaw: Math.max(-1, Math.min(1, allowed.yaw / (this.carrier.config.maxYawSpeedRadS * dt))),
      recover: requested.recover,
    }) });
    this.staged.commit(resolution);
    const state = this.carrier.state;
    if (this.supportState.state === "rising" && this.rising) {
      if (this.risingFrameComplete) {
        if (this.options.driveRisingRoot) {
          this.options.driveRisingRoot(this.rising.target, { x: 0, y: 0, z: 0 }, this.rising.yaw);
        } else {
          this.motor.drive(this.rising.target, { x: 0, y: 0, z: 0 }, "rising");
          this.options.applyAngularDrive?.(this.rising.yaw, "rising");
        }
      } else {
        const frame = this.rising.step(dt);
        this.risingFrameComplete = frame.complete;
        if (this.options.driveRisingRoot) {
          this.options.driveRisingRoot(frame.position, frame.velocity, frame.yaw);
        } else {
          this.motor.drive(frame.position, frame.velocity, "rising");
          this.options.applyAngularDrive?.(frame.yaw, "rising");
        }
      }
    } else if (this.supportState.state !== "fallen") {
      // Supported is a physical hold as well as a response to movement. An
      // idle/weapon-only command still needs the admitted root driven from the
      // STOP proposal, particularly after a collision has tilted an ANIMATED
      // body. `resolution.allowed` remains null when no request existed; this
      // branch maintains the body without inventing a locomotion command.
      const velocity = { x: state.velocityX, y: 0, z: state.velocityZ };
      if (this.options.root.sample().motionType === "animated" && this.options.driveAnimatedRoot) {
        this.options.driveAnimatedRoot({ x: state.x, y: state.y, z: state.z }, velocity, state.yaw, dt);
      } else {
        this.motor.drive({ x: state.x, y: state.y, z: state.z }, velocity, this.supportState.state);
        this.options.applyAngularDrive?.(state.yaw, this.supportState.state);
      }
    }
  }

  /** Compatibility-only commit; physical pairs always use `commitPhysical`. */
  commit(resolution: LocomotionResolution): void { this.staged.commit(resolution); }
  clear(reason: string): void { this.activeAuthority = null; this.activeAuthorityOwner = null;
    this.staged.clear(reason); this.motor.drive(
    { x: this.carrier.state.x, y: this.carrier.state.y, z: this.carrier.state.z },
    { x: 0, y: 0, z: 0 }, "fallen"); }
  dispose(): void { if (this.disposed) return; this.disposed = true; this.clear("dispose"); this.motor.dispose(); }
}

export function isPhysicalSupportedLocomotionPort(
  port: SupportedLocomotionPort | null | undefined,
): port is PhysicalSupportedLocomotionPort {
  return port instanceof PhysicalSupportedLocomotionPort;
}

/** Both proposals exist before the symmetric footprint calculation commits either body. */
export function resolvePhysicalSupportedPair(
  left: SupportedLocomotionPort | null | undefined,
  right: SupportedLocomotionPort | null | undefined,
  dt: number,
): boolean {
  if (!isPhysicalSupportedLocomotionPort(left) || !isPhysicalSupportedLocomotionPort(right)) return false;
  if (left.registry !== right.registry) throw new Error("supported pair must share one world-query registry");
  const leftProposal = left.proposal(dt);
  const rightProposal = right.proposal(dt);
  left.updatePairOccupancy(right);
  right.updatePairOccupancy(left);
  const independentlyAllowed = (proposal: CarrierProposal): HorizontalMove => {
    const fraction = left.registry.allowedFraction(proposal.prior, proposal.next,
      proposal.footprint, proposal.ownerPartIds);
    return Object.freeze({ x: proposal.displacement.x * fraction,
      z: proposal.displacement.z * fraction, yaw: proposal.displacement.yaw });
  };
  const allowed = left.blocksOpponentFootprint() && right.blocksOpponentFootprint()
    ? resolveCarrierPair(leftProposal, rightProposal, left.registry)
    : Object.freeze({ left: independentlyAllowed(leftProposal), right: independentlyAllowed(rightProposal) });
  left.commitPhysical(leftProposal, allowed.left, dt);
  right.commitPhysical(rightProposal, allowed.right, dt);
  return true;
}
