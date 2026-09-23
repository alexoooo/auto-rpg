export type SupportState = "supported" | "staggered" | "fallen" | "rising";

/** Frozen v1 physical values. */
export const SUPPORTED_LOCOMOTION_V1 = Object.freeze({
  STABILITY_DECAY_MPS_PER_S: 0.020,
  STAGGER_SPECIFIC_IMPULSE_MPS: 0.006,
  FALL_SPECIFIC_IMPULSE_MPS: 0.014,
  BRACE_CAPACITY_MULTIPLIER: 1.50,
  FALLEN_DWELL_S: 0.35,
  // The supported carrier may bridge one bounded clinch compression while its feet replant.
  // 0.10 s treated ordinary shield/torso contact as a fall before either body could finish an
  // authored attack. The 0.35 s bridge still cannot hide a real shove (the impulse threshold is
  // immediate), but it lets the game locomotion layer carry a short upright clinch while the
  // solver separates and replants its finite feet.
  SUPPORT_GRACE_S: 0.35,
  RISING_DURATION_S: 0.45,
});

export type SupportContactCategory = "standable-world" | "wall" | "opponent" | "weapon" |
  "proxy" | "detached-part" | "debris";

/** Provider-owned classification: no Babylon collision object crosses into this pure module. */
export interface StandableSupportEvidence {
  readonly safeBoundarySequence: number;
  readonly supportBinding: string;
  readonly contactedOwner: string;
  readonly category: SupportContactCategory;
  readonly point: readonly [number, number, number];
  readonly upwardNormal: readonly [number, number, number];
  readonly freshness: "current" | "stale";
}

export function isFreshStandableSupport(evidence: StandableSupportEvidence,
  safeBoundarySequence: number, allowedBindings: ReadonlySet<string>): boolean {
  return Number.isSafeInteger(safeBoundarySequence) && evidence.safeBoundarySequence === safeBoundarySequence &&
    evidence.freshness === "current" && evidence.category === "standable-world" &&
    allowedBindings.has(evidence.supportBinding) && evidence.point.every(Number.isFinite) &&
    evidence.upwardNormal.every(Number.isFinite) &&
    Math.abs(Math.hypot(...evidence.upwardNormal) - 1) <= 1e-6;
}

export interface FighterPostureEvidence {
  readonly pelvisUpDot: number;
  readonly torsoHeightAbovePelvisM: number;
  readonly headHeightAboveTorsoM: number;
}

export function fighterPostureIsSupported(evidence: FighterPostureEvidence): boolean {
  return Number.isFinite(evidence.pelvisUpDot) && evidence.pelvisUpDot >= 0.72 &&
    Number.isFinite(evidence.torsoHeightAbovePelvisM) && evidence.torsoHeightAbovePelvisM > 0.20 &&
    Number.isFinite(evidence.headHeightAboveTorsoM) && evidence.headHeightAboveTorsoM > 0.08;
}

export interface ConstructPostureEvidence {
  readonly chainContinuous: boolean;
  readonly carrierUpDot: number;
  readonly rootHeightAboveCarrierM: number;
  readonly terminalHeightAboveRootM: number;
}

export function constructPostureIsSupported(evidence: ConstructPostureEvidence): boolean {
  return evidence.chainContinuous && Number.isFinite(evidence.carrierUpDot) && evidence.carrierUpDot >= 0.72 &&
    Number.isFinite(evidence.rootHeightAboveCarrierM) && evidence.rootHeightAboveCarrierM > 0.08 &&
    Number.isFinite(evidence.terminalHeightAboveRootM) && evidence.terminalHeightAboveRootM > 0.04;
}

/** Private engine authority is structurally accepted but cannot be supplied through a command. */
export interface StabilityAuthority {
  readonly carrierPartId: string;
  readonly supportBindings: readonly { readonly role: string }[];
  readonly braceCapacityMultiplier: number;
  readonly gaitStabilityScale: number;
  /**
   * The body's stability stat (`src/golem/attributes.ts`), a plain factor on every threshold.
   *
   * **Its own field, not folded into brace**, because brace is refused below 1 and the stat is not:
   * a wheel braces at 1.0, and a less stable wheel is a legal body. Absent reads as 1, which is what
   * a hand-built authority in a test means.
   */
  readonly stabilityScale?: number;
  /**
   * The body's recovery stat (`src/golem/attributes.ts`): a divisor on the two frozen floors of a
   * knockdown, `FALLEN_DWELL_S` and `RISING_DURATION_S`, read through `fallenDwellS` and
   * `risingFloorS`. On the authority for the reason `stabilityScale` is: one path for every
   * per-body number the state machine reads. Absent reads as 1.
   */
  readonly recoveryScale?: number;
}

/**
 * How many times the base thresholds a body takes before it staggers or falls: its brace, its gait
 * and its stability stat, multiplied.
 *
 * **The one place the product is formed.** The state machine, the recovery interrupt and the port's
 * diagnostic all read it here; a copy of it anywhere else is a body that staggers on one rule and
 * recovers on another.
 */
export function stabilityCapacity(authority: StabilityAuthority | null | undefined): number {
  return (authority?.braceCapacityMultiplier ?? 1) * (authority?.gaitStabilityScale ?? 1)
    * (authority?.stabilityScale ?? 1);
}

/**
 * The shortest a body lies before it may rise: the frozen dwell over its recovery stat. The one place
 * the dwell is divided; the state machine and both request helpers read it here.
 */
export function fallenDwellS(authority: StabilityAuthority | null | undefined): number {
  return SUPPORTED_LOCOMOTION_V1.FALLEN_DWELL_S / (authority?.recoveryScale ?? 1);
}

/**
 * The shortest a rise may last: the frozen rise over the body's recovery stat. A body may lengthen a
 * rise past this and never shorten one under it.
 */
export function risingFloorS(authority: StabilityAuthority | null | undefined): number {
  return SUPPORTED_LOCOMOTION_V1.RISING_DURATION_S / (authority?.recoveryScale ?? 1);
}

/**
 * How long a rise lasts on a body with this recovery stat, given how long the body itself would take
 * over it at x1 (`bodyS`) and how far the rise lifts it.
 *
 * Divided by the stat, **but never shortened past what the rising actuator can accelerate**: a lift
 * over `d` metres in `T` seconds peaks at `6 d / T^2` (a smoothstep), and the port refuses a rise
 * over `RISING_MAX_ACCELERATION_MPS2` as obstructed. Divided blindly, a fast body's rise from the
 * floor would be refused every boundary, and a body that can never begin a rise is exactly what the
 * recovery house rule forbids. So above x1 the rise stops shortening at that limit -- or stays at
 * x1's length, if x1's was already past it, which is the port's refusal as it always was. Below x1
 * it only lengthens, which no limit refuses. At x1 it is `bodyS` exactly: `bodyS / 1` is `bodyS`, and
 * the clamp can only return it.
 */
export function recoveredRiseS(bodyS: number, distanceM: number, maxAccelerationMps2: number,
  authority: StabilityAuthority | null | undefined): number {
  const recovery = authority?.recoveryScale ?? 1;
  // The margin keeps a rise sized exactly at the limit from failing the port's `<=` by rounding.
  const reachable = Math.sqrt(6 * distanceM / maxAccelerationMps2) * (1 + 1e-9);
  return Math.max(bodyS / recovery, Math.min(bodyS, reachable));
}

/**
 * Combat queues an authored transfer; solver reaction impulse has no field here.
 *
 * Ordinary contacts retain force impulse because their transfer is computed from
 * a material-point velocity. An authored bash already declares a mass-independent
 * velocity change, so converting it back through target mass would make the
 * controller stronger or weaker merely because its opponent is heavier.
 */
export type StabilityEvent =
  | Readonly<{ readonly kind?: "horizontal-shove";
    readonly horizontalShoveNs: readonly [number, number] }>
  | Readonly<{ readonly kind: "specific-impulse"; readonly specificImpulseMps: number }>;

export interface SupportedLocomotionState {
  readonly state: SupportState;
  readonly specificImpulseMps: number;
  readonly supportMissingS: number;
  readonly fallenElapsedS: number;
  readonly risingElapsedS: number;
  readonly driveStaged: boolean;
}

export const initialSupportedLocomotionState = (): SupportedLocomotionState => Object.freeze({
  state: "supported", specificImpulseMps: 0, supportMissingS: 0,
  fallenElapsedS: 0, risingElapsedS: 0, driveStaged: false,
});

export interface FighterRecoveryInput {
  readonly localForward: number;
  readonly localRight: number;
  readonly yaw: number;
}

/** A Fighter asks to rise only by supplying deliberate movement after the fallen dwell. */
export function fighterRequestsRising(state: SupportedLocomotionState, input: FighterRecoveryInput,
  authority: StabilityAuthority | null = null): boolean {
  return state.state === "fallen" && state.fallenElapsedS >= fallenDwellS(authority) &&
    [input.localForward, input.localRight, input.yaw].every(Number.isFinite) &&
    Math.max(Math.abs(input.localForward), Math.abs(input.localRight), Math.abs(input.yaw)) > 0;
}

/** The caller supplies scheduler admission of the locomotion recover Action, never a hand tactic. */
export function constructRequestsRising(state: SupportedLocomotionState,
  locomotionRecoverActionActive: boolean, authority: StabilityAuthority | null = null): boolean {
  return state.state === "fallen" && state.fallenElapsedS >= fallenDwellS(authority) &&
    locomotionRecoverActionActive;
}

export interface SupportedLocomotionBoundary {
  readonly dt: number;
  readonly safeBoundarySequence: number;
  readonly authority: StabilityAuthority | null;
  readonly liveSupport: boolean;
  readonly postureSupported: boolean;
  readonly supportEvidence: readonly StandableSupportEvidence[];
  readonly supportedMassKg: number;
  readonly authoredShoves: readonly StabilityEvent[];
  readonly recoverRequested: boolean;
  /** Standable world under the recovery footprint; this is not a claim that a folded foot is planted. */
  readonly recoveryGroundAvailable: boolean;
  readonly occupancyClear: boolean;
  readonly hitInterrupted: boolean;
  /**
   * The body's own verdict that its fall has finished, read only while it is fallen.
   *
   * `FALLEN_DWELL_S` is a floor on the ragdoll and nothing more: a body whose mind asks to rise at
   * once is keyframed off the floor 0.35 s after it was released, which on a light body is before
   * it has finished tipping over. What "finished" means is the body's -- a biped reads its own
   * table's `knockdown` -- and a body with no rule of its own answers true, which is the dwell
   * alone. It is not a support requirement: a rule that answers it has to carry a cap, because a
   * body that is struck while it lies never comes to rest. Read only while fallen, never by a rise.
   */
  readonly fallSettled: boolean;
  /**
   * How long the rise under way -- or the one about to begin -- lasts, seconds. Never less than
   * `risingFloorS` of the authority, which is `RISING_DURATION_S` at recovery x1; a body that sets
   * nothing longer hands over exactly that. A biped with a
   * `knockdown` lengthens it so the scripted lift never moves its pelvis faster than its table says,
   * which from the floor is about 1.1 s where the frozen 0.45 s lifted it at up to 2.4 m/s.
   */
  readonly risingDurationS: number;
}

export interface RisingEligibility { readonly eligible: boolean; readonly reason: string | null }

export function risingEligibility(state: SupportedLocomotionState,
  input: SupportedLocomotionBoundary): RisingEligibility {
  if (state.state !== "fallen" && state.state !== "rising") {
    return Object.freeze({ eligible: false, reason: "recovery requires a fallen or rising body" });
  }
  if (state.fallenElapsedS < fallenDwellS(input.authority)) {
    return Object.freeze({ eligible: false, reason: "fallen dwell has not elapsed" });
  }
  // Fallen only: a rise already under way is keyframed and never at rest, and asking it to be
  // would cancel it one boundary after it began.
  if (state.state === "fallen" && !input.fallSettled) {
    return Object.freeze({ eligible: false, reason: "the fall has not come to rest" });
  }
  if (!input.recoverRequested) return Object.freeze({ eligible: false, reason: "recovery was not requested" });
  if (!input.authority) return Object.freeze({ eligible: false, reason: "locomotion authority is unavailable" });
  if (!input.liveSupport) return Object.freeze({ eligible: false, reason: "support chain is not live" });
  if (!input.recoveryGroundAvailable) {
    return Object.freeze({ eligible: false, reason: "standable recovery ground is unavailable" });
  }
  if (!input.occupancyClear) return Object.freeze({ eligible: false, reason: "recovery occupancy is obstructed" });
  if (input.hitInterrupted) return Object.freeze({ eligible: false, reason: "recovery was interrupted by a hit" });
  // Falling is allowed to leave every foot above the floor or folded under the carrier. Requiring
  // one of those terminals to publish a fresh planted contact before the bounded righting path may
  // begin makes an upside-down but otherwise intact body unrecoverable by construction. The rise
  // instead earns reattachment through live support topology, an explicit recover request, the
  // fallen dwell, pair occupancy and uninterrupted clearance. Fresh terminal contact is still
  // mandatory when the completed posture asks to become supported again.
  return Object.freeze({ eligible: true, reason: null });
}

const checkedBoundary = (input: SupportedLocomotionBoundary): void => {
  if (!Number.isFinite(input.dt) || input.dt <= 0) {
    throw new Error("supported locomotion boundary dt must be finite and positive");
  }
  if (!Number.isSafeInteger(input.safeBoundarySequence) || input.safeBoundarySequence < 0) {
    throw new Error("supported locomotion boundary sequence must be a non-negative safe integer");
  }
  if (!Number.isFinite(input.supportedMassKg) || input.supportedMassKg <= 0) {
    throw new Error("supported locomotion mass must be finite and positive");
  }
  if (typeof input.fallSettled !== "boolean") {
    throw new Error("supported locomotion boundary must say whether the fall has come to rest");
  }
  if (input.authority?.recoveryScale !== undefined &&
      (!Number.isFinite(input.authority.recoveryScale) || input.authority.recoveryScale <= 0)) {
    throw new Error("supported locomotion authority has an invalid recovery scale");
  }
  if (!Number.isFinite(input.risingDurationS) || input.risingDurationS < risingFloorS(input.authority)) {
    throw new Error("supported locomotion rise may be lengthened but never shorter than RISING_DURATION_S");
  }
  if (input.authority && (!Number.isFinite(input.authority.braceCapacityMultiplier) ||
      input.authority.braceCapacityMultiplier < 1 || !Number.isFinite(input.authority.gaitStabilityScale) ||
      input.authority.gaitStabilityScale <= 0 || input.authority.gaitStabilityScale > 1 ||
      (input.authority.stabilityScale !== undefined &&
        (!Number.isFinite(input.authority.stabilityScale) || input.authority.stabilityScale <= 0)))) {
    throw new Error("supported locomotion authority has invalid stability scaling");
  }
  for (const event of input.authoredShoves) {
    if (event.kind === "specific-impulse") {
      if (!Number.isFinite(event.specificImpulseMps) || event.specificImpulseMps < 0) {
        throw new Error("supported locomotion authored specific impulse must be finite and non-negative");
      }
    } else if (event.horizontalShoveNs.length !== 2 ||
        event.horizontalShoveNs.some((value) => !Number.isFinite(value))) {
      throw new Error("supported locomotion authored shove must contain two finite horizontal components");
    }
  }
};

const supportAvailable = (input: SupportedLocomotionBoundary): boolean => {
  if (!input.authority || !input.liveSupport || !input.postureSupported) return false;
  const allowed = new Set(input.authority.supportBindings.map(({ role }) => role));
  return input.supportEvidence.some((row) => isFreshStandableSupport(row, input.safeBoundarySequence, allowed));
};

/** One immutable transition at the pre-physics safe edge. */
export function stepSupportedLocomotionState(prior: SupportedLocomotionState,
  input: SupportedLocomotionBoundary): SupportedLocomotionState {
  checkedBoundary(input);
  const added = input.authoredShoves.reduce((sum, event) => sum +
    (event.kind === "specific-impulse" ? event.specificImpulseMps :
      Math.hypot(...event.horizontalShoveNs) / input.supportedMassKg), 0);
  const specificImpulseMps = Math.max(0,
    prior.specificImpulseMps - SUPPORTED_LOCOMOTION_V1.STABILITY_DECAY_MPS_PER_S * input.dt) + added;
  const hasSupport = supportAvailable(input);
  const supportMissingS = hasSupport ? 0 : prior.supportMissingS + input.dt;
  const capacity = stabilityCapacity(input.authority);
  const staggerAt = SUPPORTED_LOCOMOTION_V1.STAGGER_SPECIFIC_IMPULSE_MPS * capacity;
  const fallAt = SUPPORTED_LOCOMOTION_V1.FALL_SPECIFIC_IMPULSE_MPS * capacity;

  if (prior.state === "rising") {
    // The decaying ledger records why the body fell; it is not a second hit. Fallen is allowed
    // to enter rising while that history remains above fallAt, so reapplying the upright threshold
    // here would cancel the rise one boundary later. Production marks a new nonzero shove through
    // hitInterrupted, which remains the fresh-event abort.
    if (input.hitInterrupted) {
      return Object.freeze({ state: "fallen", specificImpulseMps,
      supportMissingS, fallenElapsedS: 0, risingElapsedS: 0, driveStaged: false });
    }
    const eligible = risingEligibility({ ...prior,
      fallenElapsedS: Math.max(prior.fallenElapsedS, fallenDwellS(input.authority)) }, input);
    if (!eligible.eligible) return Object.freeze({ state: "fallen", specificImpulseMps,
      supportMissingS, fallenElapsedS: 0, risingElapsedS: 0, driveStaged: false });
    const risingElapsedS = prior.risingElapsedS + input.dt;
    if (risingElapsedS >= input.risingDurationS && input.postureSupported) {
      return Object.freeze({ state: "supported", specificImpulseMps: 0, supportMissingS: 0,
        fallenElapsedS: 0, risingElapsedS: 0, driveStaged: false });
    }
    return Object.freeze({ state: "rising", specificImpulseMps, supportMissingS: 0,
      fallenElapsedS: prior.fallenElapsedS, risingElapsedS, driveStaged: true });
  }

  if (prior.state === "fallen") {
    const fallenElapsedS = prior.fallenElapsedS + input.dt;
    const fallen = Object.freeze({ state: "fallen" as const, specificImpulseMps,
      supportMissingS, fallenElapsedS, risingElapsedS: 0, driveStaged: false });
    return risingEligibility(fallen, input).eligible
      ? Object.freeze({ ...fallen, state: "rising" as const, risingElapsedS: 0, driveStaged: true })
      : fallen;
  }

  if (specificImpulseMps >= fallAt || supportMissingS > SUPPORTED_LOCOMOTION_V1.SUPPORT_GRACE_S) {
    return Object.freeze({ state: "fallen", specificImpulseMps, supportMissingS,
      fallenElapsedS: 0, risingElapsedS: 0, driveStaged: false });
  }
  return Object.freeze({ state: specificImpulseMps >= staggerAt ? "staggered" : "supported",
    specificImpulseMps, supportMissingS, fallenElapsedS: 0, risingElapsedS: 0, driveStaged: false });
}
