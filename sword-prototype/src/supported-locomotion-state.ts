export type SupportState = "supported" | "staggered" | "fallen" | "rising";

/** Frozen v1 physical values. */
export const SUPPORTED_LOCOMOTION_V1 = Object.freeze({
  STABILITY_DECAY_MPS_PER_S: 0.020,
  STAGGER_SPECIFIC_IMPULSE_MPS: 0.006,
  FALL_SPECIFIC_IMPULSE_MPS: 0.014,
  BRACE_CAPACITY_MULTIPLIER: 1.50,
  FALLEN_DWELL_S: 0.35,
  SUPPORT_GRACE_S: 0.10,
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
}

/** Combat queues this authored horizontal shove; solver reaction impulse has no field here. */
export interface StabilityEvent { readonly horizontalShoveNs: readonly [number, number] }

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
export function fighterRequestsRising(state: SupportedLocomotionState, input: FighterRecoveryInput): boolean {
  return state.state === "fallen" && state.fallenElapsedS >= SUPPORTED_LOCOMOTION_V1.FALLEN_DWELL_S &&
    [input.localForward, input.localRight, input.yaw].every(Number.isFinite) &&
    Math.max(Math.abs(input.localForward), Math.abs(input.localRight), Math.abs(input.yaw)) > 0;
}

/** The caller supplies scheduler admission of the locomotion recover Action, never a hand tactic. */
export function constructRequestsRising(state: SupportedLocomotionState,
  locomotionRecoverActionActive: boolean): boolean {
  return state.state === "fallen" && state.fallenElapsedS >= SUPPORTED_LOCOMOTION_V1.FALLEN_DWELL_S &&
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
  readonly occupancyClear: boolean;
  readonly hitInterrupted: boolean;
}

export interface RisingEligibility { readonly eligible: boolean; readonly reason: string | null }

export function risingEligibility(state: SupportedLocomotionState,
  input: SupportedLocomotionBoundary): RisingEligibility {
  if (state.state !== "fallen" && state.state !== "rising") {
    return Object.freeze({ eligible: false, reason: "recovery requires a fallen or rising body" });
  }
  if (state.fallenElapsedS < SUPPORTED_LOCOMOTION_V1.FALLEN_DWELL_S) {
    return Object.freeze({ eligible: false, reason: "fallen dwell has not elapsed" });
  }
  if (!input.recoverRequested) return Object.freeze({ eligible: false, reason: "recovery was not requested" });
  if (!input.authority) return Object.freeze({ eligible: false, reason: "locomotion authority is unavailable" });
  if (!input.liveSupport) return Object.freeze({ eligible: false, reason: "support chain is not live" });
  if (!input.occupancyClear) return Object.freeze({ eligible: false, reason: "recovery occupancy is obstructed" });
  if (input.hitInterrupted) return Object.freeze({ eligible: false, reason: "recovery was interrupted by a hit" });
  const allowed = new Set(input.authority.supportBindings.map(({ role }) => role));
  // Fresh ground admits a rise. Once the bounded path has started, requiring the same terminal
  // to remain planted makes lifting that terminal cancel recovery by construction; live topology,
  // occupancy and hit interruption remain checked on every rising boundary.
  if (state.state === "fallen" &&
      !input.supportEvidence.some((row) => isFreshStandableSupport(row, input.safeBoundarySequence, allowed))) {
    return Object.freeze({ eligible: false, reason: "fresh standable support is unavailable" });
  }
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
  if (input.authority && (!Number.isFinite(input.authority.braceCapacityMultiplier) ||
      input.authority.braceCapacityMultiplier < 1 || !Number.isFinite(input.authority.gaitStabilityScale) ||
      input.authority.gaitStabilityScale <= 0 || input.authority.gaitStabilityScale > 1)) {
    throw new Error("supported locomotion authority has invalid stability scaling");
  }
  for (const event of input.authoredShoves) {
    if (event.horizontalShoveNs.length !== 2 || event.horizontalShoveNs.some((value) => !Number.isFinite(value))) {
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
  const added = input.authoredShoves.reduce((sum, event) =>
    sum + Math.hypot(...event.horizontalShoveNs) / input.supportedMassKg, 0);
  const specificImpulseMps = Math.max(0,
    prior.specificImpulseMps - SUPPORTED_LOCOMOTION_V1.STABILITY_DECAY_MPS_PER_S * input.dt) + added;
  const hasSupport = supportAvailable(input);
  const supportMissingS = hasSupport ? 0 : prior.supportMissingS + input.dt;
  const capacity = (input.authority?.braceCapacityMultiplier ?? 1) *
    (input.authority?.gaitStabilityScale ?? 1);
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
      fallenElapsedS: Math.max(prior.fallenElapsedS, SUPPORTED_LOCOMOTION_V1.FALLEN_DWELL_S) }, input);
    if (!eligible.eligible) return Object.freeze({ state: "fallen", specificImpulseMps,
      supportMissingS, fallenElapsedS: 0, risingElapsedS: 0, driveStaged: false });
    const risingElapsedS = prior.risingElapsedS + input.dt;
    if (risingElapsedS >= SUPPORTED_LOCOMOTION_V1.RISING_DURATION_S && input.postureSupported) {
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
