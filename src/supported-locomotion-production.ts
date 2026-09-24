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
  type PairAllowedMoves,
  type SupportedRootAdapter,
  type VirtualCarrierConfig,
  type WorldQueryCollider,
  type WorldPoint,
} from "./supported-locomotion-runtime.ts";
import type { StabilityEvent } from "./supported-locomotion-state.ts";
import { CONTACT_PRESS, type PressReading } from "./contact-press.ts";
import { fallenDwellS, initialSupportedLocomotionState, ledgerFalls, recoveredRiseS, risingEligibility, risingFloorS,
  shoveSpecificImpulse, sizeTime, stabilityLines, stepSupportedLocomotionState,
  type StabilityAuthority, type StabilityLines, type SupportState,
  type SupportedLocomotionBoundary, type SupportedLocomotionState } from "./supported-locomotion-state.ts";
import { hullHoldsCentre, TIPPING, tippingGeometry, type MassDistribution, type TippingGeometry } from "./tipping.ts";
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
 * **This seam has no writer, and as of 2026-09-04 it has no reader that is coming either.**
 * The Warrior and Broot both declare `supportedLocomotionPort` and drive the carrier through
 * `request`/`resolve` without ever calling `authority` or `stage`; the only caller that did
 * was the construct runtime. The header used to name golem session 05 as the reader that was
 * coming and said to delete this if that session landed without one.
 *
 * **Session 05 landed without one, and here is why rather than merely that.** Its locomotion
 * modules do supply a `StabilityAuthority` -- `src/golem/locomotion/biped.ts` publishes one per
 * boundary, its support bindings and its stat scales -- but they supply it through the
 * `authority` *callback* on `PhysicalSupportedLocomotionOptions`, which is the seam the Warrior
 * already uses and which needs no scheduler. The three methods below exist for a caller that
 * admits parameterized Actions into control groups and then submits movement under a token, and
 * the golem plan set has no such caller and will not grow one: frozen rule 9 says there is no
 * learning in it and that the central mind is a scripted state machine, and frozen rule 8 says
 * `Intent` is the whole command surface -- an Action/control-group admission query would be a
 * second one. Sessions 06 (wheel and multileg), 08 (assembly) and 09 (the scripted mind) are the
 * only ones left that could plausibly want it, and each of them commands locomotion through the
 * same `Intent`.
 *
 * So this is **dead and should be deleted**: measured 2026-09-04, nothing outside this file
 * references `ActionSpec`, `ControlGroupSpec`, `LocomotionAuthorityToken`, `LocomotionSubmission`,
 * `LocomotionSchedulerPort`, `resolveActionAuthority`, `authority`, `stage`, `priorSample`,
 * `clearSubmission` or `clearAll` -- not one source file, test, script or document outside
 * `docs/plans/golem-01-demolition.md`, which names them only to record that they were moved here.
 * Session 05 left the deletion rather than taking it because two other sessions were editing this
 * tree at the same time and a cut this wide is not an append; whoever next has this file to
 * themselves should make it, and `clear` remains the whole of what `clearAll` and
 * `clearSubmission` do.
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
  localForward: 0, localRight: 0, yaw: 0,
});

/**
 * A lying body is kept from starting its rise by a new *staggering* contact transfer, not a
 * brush -- staggering against the lines of the body as it lies, read as the ledger reads them; a rise
 * already under way is put down by the ledger instead (`stepSupportedLocomotionState`).
 * The ledger still
 * records every physical contact for normal supported/fallen thresholds, but treating any
 * positive floating-point contact as an interrupt made a weapon scrape reset a bounded rise at
 * 240 Hz forever.  Express the boundary in the same mass-independent specific impulse units as
 * the state machine, so a real hit retains its physical consequence without a special recovery
 * damage rule.
 */
export function recoveryHitInterrupted(events: readonly StabilityEvent[], supportedMassKg: number,
  authority: StabilityAuthority | null, tipping: TippingGeometry | null): boolean {
  const [x, z] = shoveSpecificImpulse(events, supportedMassKg, tipping);
  const freshSpecificImpulseMps = Math.hypot(x, z);
  return freshSpecificImpulseMps > 0 &&
    freshSpecificImpulseMps >= stabilityLines(authority, tipping, x, z).staggerAtMps;
}

export const DEFAULT_SUPPORTED_CARRIER: VirtualCarrierConfig = Object.freeze({
  maxSpeedMps: 1.6,
  maxAccelerationMps2: 9,
  maxYawSpeedRadS: 2.4,
  maxYawAccelerationRadS2: 14,
});

export const MAX_STANDABLE_SLOPE_DEGREES = 35;
export const MIN_STANDABLE_UPWARD_NORMAL_Y = Math.cos(MAX_STANDABLE_SLOPE_DEGREES * Math.PI / 180);
/**
 * **A rise relocates** (physical contact session 02, 2026-09-23). A body rises where it lies if it
 * can; if that spot is refused -- another footprint over it, a wall it is lying against, no ground
 * under it, or a path the rise cannot make -- it rises to the nearest spot that is not. Candidates
 * are rings `RECOVERY_RING_STEP_M` apart with `RECOVERY_RING_ANGLES` points on each, the nearer ring
 * first and, on one ring, the direction away from the nearest occupant first. They go out to the
 * rise's own reach: the farthest the keyframed rise can carry the root in its shortest duration
 * without passing `RISING_MAX_ACCELERATION_MPS2`, a*T^2/6 (1.62 m at x1). Each candidate must be
 * clear of every other footprint by `RECOVERY_SEPARATION_MARGIN_M`, stand on ground, be reachable
 * within the acceleration bound, and be reached by a sweep the world allows.
 *
 * It replaced a retreat straight away from one opponent capped at 0.35 m, which was never asked for
 * a body lying by a wall; session 01's census charged 5.4 % of stone's downed time and 11.7 % of the
 * giant group's to walls (Node bout runner, `research/downed-census.mjs`). The step and angle count
 * are resolution, not tuning: the rings are walked only when the body's own spot is refused.
 */
export const RECOVERY_RING_STEP_M = 0.1;
export const RECOVERY_RING_ANGLES = 16;
export const RECOVERY_SEPARATION_MARGIN_M = 0.02;

/** Another carrier's footprint, as the rise gate reads it: where it stands (or lies) and how wide. */
interface RecoveryOccupant { readonly x: number; readonly z: number; readonly radiusM: number }

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
      // A footprint already inside the wall's band -- a body that fell against it -- may leave it
      // straight inward and nothing else: the sweep is clear once it is clear, and ends clear.
      if ((sign > 0 && start > limit) || (sign < 0 && start < limit)) {
        if ((sign > 0 && end <= limit) || (sign < 0 && end >= limit)) return null;
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
  /** Whether a fallen body's fall has finished; absent is the frozen dwell alone. Read once per
   *  boundary, before the state steps. See `SupportedLocomotionBoundary.fallSettled`. */
  readonly fallSettled?: () => boolean;
  /** How long a rise over this distance (metres, live root to recovery target) lasts; absent is
   *  `RISING_DURATION_S`. Asked before the state steps, so the rise it admits is the one it runs. */
  readonly risingDuration?: (distanceM: number) => number;
  readonly supportBindings: readonly string[];
  /**
   * Where the whole body's mass is and how it is spread, read off its live parts (physical contact
   * session 08). With `supportPatch` it is the body's tipping geometry; absent, or null, is a body
   * the ledger cannot tip.
   */
  readonly massDistribution?: () => MassDistribution | null;
  /**
   * The corners of one support's contact patch in world axes -- a sole's four, a wheel's patch --
   * whether or not it is planted this boundary: a body's base is its stance, and a foot in the air
   * is on its way down. Null for a support that is gone.
   */
  readonly supportPatch?: (binding: string) => readonly WorldPoint[] | null;
  /**
   * Every part's lowest points in world axes, on the floor or not; the port keeps those within
   * `TIPPING.CONTACT_BAND_M` of the lowest. A lying or rising body rests on these, and they are
   * what its base is while it has no stance.
   */
  readonly groundContacts?: () => readonly WorldPoint[];
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
  /**
   * What a shove is worth to this body, and the mass it was divided by to say so.
   *
   * `supportedMassKg` is on the readout because without it the other numbers cannot be checked
   * or reproduced: a shove arrives in newton-seconds and becomes a specific impulse by one
   * division, and the divisor is a getter on the carrier that changes as modules are bolted on or
   * cut off. A reading that reports the quotient and hides the denominator is one nobody can
   * compute the next shove from. A line in newton-seconds at the centre of mass is a line here
   * times it.
   *
   * The two lines are along the body's weakest direction (`stabilityLines` with no direction);
   * `PhysicalSupportedLocomotionPort.stabilityLinesAlong` gives them along any other.
   * `tipping` is the last boundary's geometry they were read from.
   */
  readonly stability: Readonly<{ specificImpulseMps: number; supportedMassKg: number;
    staggerAtMps: number; fallAtMps: number; tipping: TippingGeometry | null }>;
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

/** What contact has done to a standing body so far, for a census (physical contact session 07). */
export interface ContactPressDiagnostic {
  /** Times the body was lifted off its feet: the edge into fallen with `lifted` set. */
  readonly lifts: number;
  /** Seconds it spent pushed past its grip. */
  readonly pushedS: number;
  /** The last window's upward force, newtons, and the body's weight to compare it with. */
  readonly liftN: number;
  readonly weightN: number;
  /** The slide's speed now, m/s. */
  readonly slideMps: number;
}

/** One boundary's rise gate, read by `PhysicalSupportedLocomotionPort.riseGate`. */
export type RiseAbort = "blow" | "refused" | "deadline";

export interface RiseGateDiagnostic {
  readonly prior: SupportState;
  readonly now: SupportState;
  /** `risingEligibility`'s refusal for the state stepped from, or null where it was eligible. */
  readonly reason: string | null;
  readonly fallenElapsedS: number;
  readonly risingElapsedS: number;
  readonly risingDurationS: number;
  readonly fallSettled: boolean;
  readonly postureSupported: boolean;
  readonly liveSupport: boolean;
  readonly recoveryGroundAvailable: boolean;
  readonly occupancyClear: boolean;
  /** The other footprints' half of `occupancyClear`: the recovery target is clear of all of them. */
  readonly pairOccupancyClear: boolean;
  /** Whether the recovery target is somewhere other than where the body lies (`RECOVERY_RING_STEP_M`). */
  readonly relocated: boolean;
  /**
   * What ended the last rise that ended back on the floor, latched from that edge until the next rise
   * begins: `blow` when the fall ledger reached the fall line, `refused` when the rise gate stopped
   * holding (obstruction, lost ground, lost support), `deadline` when posture did not come within
   * `RISE_POSTURE_DEADLINE` of the rise duration. Null before any rise has ended so. A census reads it
   * to tell a body struck through its rise from one that failed to stand (physical contact session 02).
   */
  readonly riseAbort: RiseAbort | null;
  /** The rise's acceleration bound half of `occupancyClear`. */
  readonly withinAcceleration: boolean;
  /** The world sweep half of `occupancyClear` -- a wall or obstacle between root and target. Null
   *  where an earlier half already refused and the sweep was never asked. */
  readonly recoverySweepClear: boolean | null;
  readonly hitInterrupted: boolean;
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
  private occupants: readonly RecoveryOccupant[] = [];
  private pairOccupancyClear = true;
  private recoveryTarget: WorldPoint | null = null;
  /** Whether the rise under way went somewhere other than where the body lay; set as it begins. */
  private riseRelocated = false;
  /** `RiseGateDiagnostic.riseAbort`: set on the rising-to-fallen edge, cleared as a rise begins. */
  private riseAbort: RiseAbort | null = null;
  private anatomyReleased = false;
  private releaseReason: string | null = null;
  /** The press read before this boundary, and the pair's push from the last resolution. */
  private press: PressReading | null = null;
  private pairPush: Readonly<{ x: number; z: number }> | null = null;
  private lifted = false;
  /** The last boundary's tipping geometry (`readTipping`), for the diagnostic and `stabilityLinesAlong`. */
  private tipping: TippingGeometry | null = null;
  /**
   * The last standing base that held the centre of mass, relative to its ground point: the stance a
   * rising body is judged on (`readTipping`).
   */
  private standingHull: TippingGeometry["hull"] | null = null;
  private readonly contactTally = { lifts: 0, pushedS: 0, liftN: 0 };
  private lastRiseGate: { readonly prior: SupportedLocomotionState;
    readonly boundary: SupportedLocomotionBoundary; readonly pairOccupancyClear: boolean;
    readonly withinAcceleration: boolean; readonly recoverySweepClear: boolean | null;
    readonly relocated: boolean } | null = null;
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

  /** Its whole weight's mass, as the carrier holds it up, kg. */
  get supportedMassKg(): number { return this.options.supportedMassKg; }

  /** What the other bodies pressed on this one with over the press's window; read by the next boundary. */
  applyContactPress(reading: PressReading): void { this.press = reading; }

  /** What the other body's trunk pushes with, newtons, from the last pair resolution; null for none. */
  notePairPush(push: Readonly<{ x: number; z: number }> | null): void { this.pairPush = push; }

  contactPress(): ContactPressDiagnostic {
    const slide = this.carrier.slide;
    return Object.freeze({ lifts: this.contactTally.lifts, pushedS: this.contactTally.pushedS,
      liftN: this.contactTally.liftN, weightN: this.options.supportedMassKg * CONTACT_PRESS.GRAVITY_MPS2,
      slideMps: Math.hypot(slide.x, slide.z) });
  }

  /**
   * **Contact lifts and pushes a standing body** (physical contact session 07). Before the boundary,
   * so what it files is read by the ledger this step.
   *
   * - **Lifted**: the other bodies held this one up with more than its weight over the press's window
   *   (`ContactPress`). The boundary sets it down as fallen, and the release keeps the velocity the
   *   carrier last drove the root at.
   * - **Pushed**: a horizontal force past the feet's grip, `GRIP * W`. The force is the other body's
   *   trunk if the two footprints met on the last resolution -- what its feet can push with,
   *   `GRIP * W_other` along the contact -- and otherwise what its parts pressed with, each capped at
   *   the same grip by `ContactPress`. Whatever is past this body's grip is the excess: it slides the
   *   carrier at `excess / M` and files `excess * dt` to the ledger, which is the stagger the plan
   *   asked for. With no excess the feet brake the slide at `GRIP * g`. So two bodies of one weight
   *   never push each other: each pushes with exactly the grip the other holds with.
   */
  private readContact(): void {
    const reading = this.press;
    const pair = this.pairPush;
    this.press = null;
    this.pairPush = null;
    this.lifted = false;
    const state = this.supportState.state;
    if ((state !== "supported" && state !== "staggered") || this.options.root.sample().released) return;
    const dt = this.staged.snapshot().committed?.dt ?? 1 / 240;
    const massKg = this.options.supportedMassKg;
    const weightN = massKg * CONTACT_PRESS.GRAVITY_MPS2;
    if (reading) {
      this.contactTally.liftN = reading.liftN;
      // Past the weight by more than rounding: an equal body's press is capped at exactly this.
      this.lifted = reading.liftN > weightN * (1 + CONTACT_PRESS.MARGIN);
    }
    const fx = pair ? pair.x : reading?.pushX ?? 0;
    const fz = pair ? pair.z : reading?.pushZ ?? 0;
    const force = Math.hypot(fx, fz);
    const grip = CONTACT_PRESS.GRIP * weightN;
    if (force > grip * (1 + CONTACT_PRESS.MARGIN)) {
      const share = 1 - grip / force;
      const ex = fx * share, ez = fz * share;
      this.staged.queueStabilityEvent({ horizontalShoveNs: [ex * dt, ez * dt] });
      this.carrier.slideBy(ex / massKg * dt, ez / massKg * dt);
      this.contactTally.pushedS += dt;
    } else {
      this.carrier.brakeSlide(CONTACT_PRESS.GRIP * CONTACT_PRESS.GRAVITY_MPS2 * dt);
    }
  }

  beginControlStep(): void {
    this.readContact();
    this.staged.beginControlStep();
    this.sequence += 1;
    const authority = this.activeAuthority ?? this.options.authority();
    const evidenceBindings = authority?.supportBindings.map(({ role }) => role) ?? this.options.supportBindings;
    const evidence = evidenceBindings.flatMap((binding) => {
      const point = this.options.supportPoint ? this.options.supportPoint(binding) : this.carrier.state;
      return point === null ? [] : this.registry.supportEvidence(point, this.carrier.footprint,
        this.carrier.ownerPartIds, binding, this.sequence);
    });
    const shoves = this.staged.snapshot().stabilityEvents;
    const tipping = this.readTipping(evidenceBindings);
    this.tipping = tipping;
    const liveSupport = this.options.liveSupport();
    const postureSupported = this.options.postureSupported();
    const root = this.options.root.sample();
    const own = Object.freeze({ x: root.position.x, y: this.carrier.state.y, z: root.position.z });
    const groundAt = (target: WorldPoint): boolean => evidenceBindings.length > 0 &&
      this.registry.supportEvidence({ x: target.x, y: 0, z: target.z }, this.carrier.footprint,
        this.carrier.ownerPartIds, evidenceBindings[0], this.sequence).length > 0;
    // The rise under way keeps the length it began with; a prospective one is asked for afresh, of
    // the body at x1, and then divided by its recovery stat here, so every body's rise answers to
    // the stat on one rule (`recoveredRiseS`). A body that states no rise of its own takes the frozen
    // one at its size, which is a time (`sizeTime`).
    const riseTo = (target: WorldPoint) => {
      const distanceM = Math.hypot(target.x - root.position.x, target.y - root.position.y,
        target.z - root.position.z);
      const durationS = this.rising?.durationS ?? recoveredRiseS(
        this.options.risingDuration?.(distanceM) ?? SUPPORTED_CARRIER_V1.RISING_DURATION_S * sizeTime(authority),
        distanceM, SUPPORTED_CARRIER_V1.RISING_MAX_ACCELERATION_MPS2, authority);
      return { durationS, withinAcceleration:
        6 * distanceM / (durationS * durationS) <= SUPPORTED_CARRIER_V1.RISING_MAX_ACCELERATION_MPS2 };
    };
    const sweepClear = (target: WorldPoint): boolean => this.registry.allowedFraction(root.position, target,
      this.carrier.footprint, this.carrier.ownerPartIds) >= 1;
    if (this.supportState.state === "fallen") {
      this.recoveryTarget = this.findRecoveryTarget(own, authority, groundAt, riseTo, sweepClear);
    } else if (this.supportState.state !== "rising") {
      this.recoveryTarget = null;
    }
    const recoveryTarget = this.recoveryTarget ?? own;
    const recoveryGroundAvailable = groundAt(recoveryTarget);
    const rise = riseTo(recoveryTarget);
    const risingDurationS = rise.durationS;
    const recoveryWithinAccelerationLimit = rise.withinAcceleration;
    this.pairOccupancyClear = this.clearOfOccupants(recoveryTarget, 0);
    const occupancyClear = recoveryWithinAccelerationLimit && this.pairOccupancyClear &&
      sweepClear(recoveryTarget);
    this.lastBoundary = Object.freeze({ authority: authority !== null, liveSupport, postureSupported,
      freshSupportBindings: Object.freeze([...new Set(evidence.map(({ supportBinding }) => supportBinding))].sort()) });
    const priorState = this.supportState.state;
    const prior = this.supportState;
    const boundary: SupportedLocomotionBoundary = {
      dt: this.staged.snapshot().committed?.dt ?? 1 / 240,
      safeBoundarySequence: this.sequence,
      authority, liveSupport, postureSupported, supportEvidence: evidence,
      supportedMassKg: this.options.supportedMassKg, contactShoves: shoves, tipping,
      recoveryGroundAvailable, occupancyClear,
      hitInterrupted: recoveryHitInterrupted(shoves, this.options.supportedMassKg, authority, tipping),
      fallSettled: this.options.fallSettled?.() ?? true,
      risingDurationS,
      lifted: this.lifted,
    };
    this.supportState = stepSupportedLocomotionState(prior, boundary);
    // Kept only while a body is down, and read by nothing but `riseGate`: what the rise gate was
    // handed on this boundary, for a census of bodies that never get up.
    this.lastRiseGate = priorState === "fallen" || priorState === "rising"
      ? { prior, boundary, pairOccupancyClear: this.pairOccupancyClear, withinAcceleration:
        recoveryWithinAccelerationLimit, recoverySweepClear: occupancyClear ? true
          : this.pairOccupancyClear && recoveryWithinAccelerationLimit ? false : null,
        relocated: priorState === "rising" ? this.riseRelocated : recoveryTarget !== own }
      : null;
    if (this.supportState.state === "fallen" && priorState === "rising") {
      // The state machine's own order: the ledger first, then the gate, then the deadline.
      this.riseAbort = ledgerFalls(this.supportState, authority, tipping) ? "blow"
        : !risingEligibility({ ...prior, fallenElapsedS: Math.max(prior.fallenElapsedS, fallenDwellS(authority)) },
          boundary).eligible ? "refused" : "deadline";
    }
    if (this.supportState.state === "fallen") {
      if (priorState !== "fallen") {
        // Release is an edge, not a deceleration request. The physical root becomes a ragdoll on
        // this boundary, so the body-less carrier must discard its prior velocity too; otherwise
        // diagnostics report several frames of phantom allowed motion while the body is fallen.
        this.carrier.reset(this.carrier.state, this.carrier.state.yaw);
        if (this.lifted) this.contactTally.lifts += 1;
        this.releaseReason = this.lifted ? "lifted by contact"
          : !liveSupport ? "support chain is not live"
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
      const target = recoveryTarget;
      this.recoveryTarget = target;
      this.riseRelocated = target !== own;
      this.riseAbort = null;
      this.carrier.reset(target, this.carrier.state.yaw);
      this.rising = new RisingActuator(root.position, target, this.carrier.state.yaw,
        this.carrier.footprint, this.registry, this.carrier.ownerPartIds, risingDurationS,
        risingFloorS(authority));
      this.risingFrameComplete = false;
    } else if (this.supportState.state === "supported" && priorState === "rising") {
      this.rising = null;
      this.risingFrameComplete = false;
      this.releaseReason = null;
      this.recoveryTarget = null;
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
  /**
   * Why the last boundary did or did not let a downed body rise: the reason `risingEligibility`
   * gave for the state it stepped from, and each input that could refuse it. Null unless that
   * state was fallen or rising. Instrumentation only -- nothing in the game reads it
   * (`research/downed-census.mjs` does).
   */
  riseGate(): RiseGateDiagnostic | null {
    const gate = this.lastRiseGate;
    if (!gate) return null;
    const { prior, boundary } = gate;
    const eligibility = risingEligibility(prior.state === "rising" ? { ...prior,
      fallenElapsedS: Math.max(prior.fallenElapsedS, fallenDwellS(boundary.authority)) } : prior, boundary);
    return Object.freeze({ prior: prior.state, now: this.supportState.state, reason: eligibility.reason,
      fallenElapsedS: prior.fallenElapsedS, risingElapsedS: prior.risingElapsedS,
      risingDurationS: boundary.risingDurationS,
      fallSettled: boundary.fallSettled, postureSupported: boundary.postureSupported,
      liveSupport: boundary.liveSupport, recoveryGroundAvailable: boundary.recoveryGroundAvailable,
      occupancyClear: boundary.occupancyClear, pairOccupancyClear: gate.pairOccupancyClear,
      withinAcceleration: gate.withinAcceleration, recoverySweepClear: gate.recoverySweepClear,
      relocated: gate.relocated, riseAbort: this.riseAbort, hitInterrupted: boundary.hitInterrupted });
  }
  /**
   * The body's tipping geometry this boundary: its whole mass's distribution over its base.
   *
   * **What the base is depends on whether the body stands.** A standing or staggered body's is its
   * stance -- the patch of every support it has, planted or not, because a foot in the air is on
   * its way down -- together with anything else of it on the floor. A lying or rising body has no
   * stance: its base is whatever of it is on the floor, a support patch included only when it is.
   * "On the floor" is within `TIPPING.CONTACT_BAND_M` of the lowest point the body has.
   *
   * **A rising body is judged on the stance it is rising onto**: the last standing base that held
   * its centre of mass, around where that centre of mass is now, at its live height and gyration. The
   * rise is authored -- the carrier hoists the pelvis while the legs still lie where they fell -- so
   * what is on the floor spans nothing under the centre of mass: measured on stone x1 mirrors
   * (`.review/rise-base.mjs`, Node bout runner), the lowest points stay about a metre from it for the
   * whole rise, and the fall line read 0 from 0.2 s into every rise, so that any touch put the body
   * down again. That is a keyframe's reading, not a body's. A low body on its feet is hard to tip
   * and gets easier as it straightens, and no blow is exempt. A body that has never stood is judged
   * on what is on the floor. Null without both readers, and for a body with no base.
   */
  private readTipping(bindings: readonly string[]): TippingGeometry | null {
    const patch = this.options.supportPatch;
    const mass = this.options.massDistribution?.() ?? null;
    if (!patch || !mass) return null;
    const stance = bindings.flatMap((binding) => patch(binding) ?? []);
    const contacts = this.options.groundContacts?.() ?? [];
    let lowest = Infinity;
    for (const point of stance) lowest = Math.min(lowest, point.y);
    for (const point of contacts) lowest = Math.min(lowest, point.y);
    const onFloor = (point: WorldPoint): boolean => point.y <= lowest + TIPPING.CONTACT_BAND_M;
    const standing = this.supportState.state === "supported" || this.supportState.state === "staggered";
    if (standing) {
      const geometry = tippingGeometry(mass, [...stance, ...contacts.filter(onFloor)]);
      if (geometry && hullHoldsCentre(geometry.hull)) this.standingHull = geometry.hull;
      return geometry;
    }
    const live = tippingGeometry(mass, [...stance.filter(onFloor), ...contacts.filter(onFloor)]);
    if (this.supportState.state !== "rising" || !live || !this.standingHull) return live;
    return Object.freeze({ ...live, hull: this.standingHull });
  }

  /**
   * The stagger and fall lines and the righting rate along one horizontal direction, from the last
   * boundary's geometry: what a push that way would have to reach. For a bench or a census; the
   * state machine reads the same function (`stabilityLines`).
   */
  stabilityLinesAlong(dirX: number, dirZ: number): StabilityLines {
    return stabilityLines(this.activeAuthority ?? this.options.authority(), this.tipping, dirX, dirZ);
  }

  /**
   * The horizontal impulse that would put this body down along its weakest direction, N.s: the fall
   * line there times the mass a shove is divided by. Physical contact session 09, for
   * `BodyView.stabilityImpulseNs`, which a mind reads on both bodies every control step -- so it is
   * formed once per boundary's geometry rather than once per read, which would be 32 hull clips and
   * an allocation a read. Zero until the body's base has first been read, at its first control
   * step: no geometry is no line, and a view field is finite.
   */
  fallImpulseNs(): number {
    const authority = this.activeAuthority ?? this.options.authority();
    if (this.fallImpulseOf !== this.tipping || this.fallImpulseAuthority !== authority) {
      this.fallImpulseOf = this.tipping;
      this.fallImpulseAuthority = authority;
      const line = stabilityLines(authority, this.tipping).fallAtMps;
      this.fallImpulse = Number.isFinite(line) ? line * this.options.supportedMassKg : 0;
    }
    return this.fallImpulse;
  }
  private fallImpulseOf: TippingGeometry | null | undefined = undefined;
  private fallImpulseAuthority: unknown = undefined;
  private fallImpulse = 0;

  carrierGround(): WorldPoint {
    const state = this.carrier.state;
    return Object.freeze({ x: state.x, y: 0, z: state.z });
  }
  diagnostic(): PhysicalSupportedLocomotionDiagnostic {
    const request = this.staged.sample().request;
    const allowed = this.priorAllowed();
    const authority = this.activeAuthority ?? this.options.authority();
    const lines = stabilityLines(authority, this.tipping);
    const staged = this.staged.snapshot();
    const constrained = request !== null && allowed !== null &&
      (Math.abs(request.localForward - allowed.localForward) > 1e-9 ||
       Math.abs(request.localRight - allowed.localRight) > 1e-9 ||
       Math.abs(request.yaw - allowed.yaw) > 1e-9);
    const blockedReason = staged.lastClearReason ??
      (request !== null && this.supportState.state === "fallen" ? "carrier is released while fallen"
        : request !== null && this.supportState.state === "rising" ? "carrier is held while it rises"
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
        supportedMassKg: this.options.supportedMassKg,
        staggerAtMps: lines.staggerAtMps, fallAtMps: lines.fallAtMps, tipping: this.tipping }),
      activeGroup: this.activeAuthorityOwner?.split("/", 1)[0] ?? null,
      supportGroups, requested: request === null ? null : Object.freeze({ ...request }),
      allowed: allowed === null ? null : Object.freeze({ ...allowed }), blockedReason,
      releaseReason: this.releaseReason,
      recoveryProgress: this.supportState.state === "rising"
        ? Math.min(1, this.supportState.risingElapsedS /
          (this.rising?.durationS ?? risingFloorS(authority)))
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
      return this.carrier.propose(STOP, dt, this.options.supportedMassKg);
    }
    // **A rising carrier stands still.** The rise owns the root and drives it to its fixed target, so
    // a carrier that walked on the mind's request would leave the body it describes: the other body
    // follows the carrier, at exact contact, into the spot the rise is bound for, and the gate refuses
    // the rise. The refusals physical contact session 02's census charged to a touch were this: with
    // the carrier held, refused rises fell from 419 to 19 on stone, 378 to 99 on the skeleton and 269
    // to 2 on the giant group, and two of the 120 left were against a body on its feet -- the rest
    // are a lying body in the way, or a dead support chain (Node harness, `research/downed-census.mjs`,
    // 96 blocks, 2026-09-24). A carrier walked off its target would also have dragged the root after
    // it the moment the rise completed.
    const held = this.supportState.state === "fallen" || this.supportState.state === "rising";
    const request = held || this.options.root.sample().released
      ? STOP : this.staged.sample().request ?? STOP;
    // Its mass is what it resists another carrier with: where two footprints meet, each gives way in
    // proportion to the other's mass (`resolveCarrierPair`), so a light body walking into a heavy
    // one is the one stopped.
    return this.carrier.propose(request, dt, this.options.supportedMassKg);
  }

  blocksOpponentFootprint(): boolean {
    return !this.options.root.sample().released;
  }

  /** Where this carrier's footprint is, for another body's rise gate: its ragdoll root while fallen. */
  private occupantFootprint(): RecoveryOccupant {
    const at = this.supportState.state === "fallen" ? this.options.root.sample().position : this.carrier.state;
    return Object.freeze({ x: at.x, z: at.z, radiusM: this.carrier.footprint.radiusM });
  }

  /**
   * The other footprints this body's rise must clear, sampled each substep for the next boundary.
   * **Fallen is lower, not absent**: a living fallen carrier still reserves its footprint, and
   * treating it as non-blocking is what let one carrier stand through the other's ragdoll.
   */
  updatePairOccupancy(other: PhysicalSupportedLocomotionPort): void {
    this.occupants = Object.freeze([other.occupantFootprint()]);
  }

  get footprint(): LocomotionFootprint { return this.carrier.footprint; }

  /** Dungeon recovery must clear every neighbour, including fallen actors. */
  updateGroupOccupancy(others: readonly PhysicalSupportedLocomotionPort[]): void {
    this.occupants = Object.freeze(others.map((other) => other.occupantFootprint()));
  }

  private clearOfOccupants(target: { readonly x: number; readonly z: number }, marginM: number): boolean {
    return this.occupants.every((other) => Math.hypot(other.x - target.x, other.z - target.z) >=
      this.carrier.footprint.radiusM + other.radiusM + marginM - 1e-9);
  }

  /**
   * The spot a fallen body would rise to on this boundary, or null where none is admitted: its own,
   * or failing that the nearest on the recovery rings (`RECOVERY_RING_STEP_M`). The body's own spot
   * is judged exactly as the gate judges it; a relocated one must also clear every other footprint
   * by `RECOVERY_SEPARATION_MARGIN_M`, so that it is not refused a substep later by rounding.
   */
  private findRecoveryTarget(own: WorldPoint, authority: StabilityAuthority | null,
    groundAt: (target: WorldPoint) => boolean,
    riseTo: (target: WorldPoint) => { readonly withinAcceleration: boolean },
    sweepClear: (target: WorldPoint) => boolean): WorldPoint | null {
    const admits = (target: WorldPoint, marginM: number): boolean => this.clearOfOccupants(target, marginM) &&
      groundAt(target) && riseTo(target).withinAcceleration && sweepClear(target);
    if (admits(own, 0)) return own;
    const floorS = risingFloorS(authority);
    const reachM = SUPPORTED_CARRIER_V1.RISING_MAX_ACCELERATION_MPS2 * floorS * floorS / 6;
    let nearest: RecoveryOccupant | null = null;
    let nearestM = Infinity;
    for (const other of this.occupants) {
      const distanceM = Math.hypot(other.x - own.x, other.z - own.z);
      if (distanceM < nearestM) { nearest = other; nearestM = distanceM; }
    }
    const away = nearest && nearestM > 1e-9 ? Math.atan2(own.z - nearest.z, own.x - nearest.x) : 0;
    const turn = 2 * Math.PI / RECOVERY_RING_ANGLES;
    for (let ring = 1; ring * RECOVERY_RING_STEP_M <= reachM + 1e-9; ring += 1) {
      const radiusM = ring * RECOVERY_RING_STEP_M;
      for (let k = 0; k < RECOVERY_RING_ANGLES; k += 1) {
        // 0, +1, -1, +2, -2, ...: away from the nearest occupant first.
        const step = k === 0 ? 0 : (k % 2 === 1 ? 1 : -1) * Math.ceil(k / 2);
        const angle = away + step * turn;
        const target = Object.freeze({ x: own.x + radiusM * Math.cos(angle), y: own.y,
          z: own.z + radiusM * Math.sin(angle) });
        if (admits(target, RECOVERY_SEPARATION_MARGIN_M)) return target;
      }
    }
    return null;
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
      // The slide with the gait, so the root is driven at what the carrier actually moved at, and a
      // body that falls while pushed keeps going the way it was pushed.
      const slide = this.carrier.slide;
      const velocity = { x: state.velocityX + slide.x, y: 0, z: state.velocityZ + slide.z };
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
  const allowed: PairAllowedMoves = left.blocksOpponentFootprint() && right.blocksOpponentFootprint()
    ? resolveCarrierPair(leftProposal, rightProposal, left.registry)
    : Object.freeze({ left: independentlyAllowed(leftProposal), right: independentlyAllowed(rightProposal) });
  // Where the footprints met, a body still walking in pushes the other with what its feet hold,
  // `GRIP * W`, along the contact (physical contact session 07). The other reads it at its next
  // boundary. Keyframed trunks report no contact to the solver, so this is the only way one body
  // walks into another.
  const contact = allowed.contact ?? null;
  const pushOf = (pusher: PhysicalSupportedLocomotionPort, closing: number, sign: number) => {
    if (!contact || !(closing > 0)) return null;
    const push = CONTACT_PRESS.GRIP * pusher.supportedMassKg * CONTACT_PRESS.GRAVITY_MPS2 * sign;
    return Object.freeze({ x: contact.nx * push, z: contact.nz * push });
  };
  left.notePairPush(pushOf(right, contact?.rightClosing ?? 0, -1));
  right.notePairPush(pushOf(left, contact?.leftClosing ?? 0, 1));
  left.commitPhysical(leftProposal, allowed.left, dt);
  right.commitPhysical(rightProposal, allowed.right, dt);
  return true;
}
