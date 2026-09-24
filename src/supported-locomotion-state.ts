export type SupportState = "supported" | "staggered" | "fallen" | "rising";

/**
 * Frozen v1 physical values.
 *
 * **The stagger line, the fall line and the decay are a holding repair, and temporary** (physical
 * contact session 06). They were 0.006, 0.014 and 0.020, tuned against an authored shove of
 * `speed * 0.11 * (1.35 - 0.7 * quality)` N.s that carried no mass. Session 06 replaced it with the
 * momentum a contact moves between two effective masses, about ten times larger per wounding blow
 * (median 11.9 N.s against 1.14), and filed it on every contact and parry rather than on the ones that
 * passed the edge's floor. All three were scaled by one factor, so the ledger's shape did not move and
 * only its scale did. The factor was read off stone x1 mirrors, knockdowns per body per bout
 * (`research/control-band.mjs`, Node harness, research runner, cap 150 s, 96 blocks, seed 20260923):
 *
 * | Scale | 1 | 6 | 10 | 16 | **20** | 22 | 25 |
 * | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
 * | Knockdowns | 40.57 | 19.48 | 14.01 | 7.39 | **4.89 [4.39, 5.39]** | 3.87 | 3.16 |
 *
 * Session 01's band is 4.93 [4.54, 5.32]. Session 08 deletes the stagger and fall lines for a tipping
 * capacity, because the owner's rule is that a knockdown ends up physical, and this table is not that.
 */
export const SUPPORTED_LOCOMOTION_V1 = Object.freeze({
  STABILITY_DECAY_MPS_PER_S: 0.40,
  STAGGER_SPECIFIC_IMPULSE_MPS: 0.12,
  FALL_SPECIFIC_IMPULSE_MPS: 0.28,
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

/**
 * How long a rise may run without reaching a standing posture before the body lies down and tries
 * again, as a multiple of that rise's own duration (physical contact session 02, 2026-09-23).
 *
 * After its duration a rise becomes supported only once `postureSupported` holds, and before this
 * a rise whose posture never held stayed `rising` for ever: session 01's census charged 9.0 % of
 * the giant group's downed time to it (Node bout runner, `research/downed-census.mjs`). A retry is
 * the ordinary fallen state -- its dwell, its settle, its gates -- so nothing new is authored about
 * the second attempt. Two is a stated choice rather than a measured one, taken on the owner's behalf:
 * it leaves a slow posture a whole second rise's worth of time to arrive, and caps a stuck one at
 * twice the rise it was given.
 */
export const RISE_POSTURE_DEADLINE = 2;

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
  /**
   * The body's size stat (`src/golem/attributes.ts`). Every threshold above is a speed -- a blow's
   * impulse over the supported mass -- and so goes as the square root of the size, and both floors
   * of a knockdown are times and go the same way (`SizeLaw`). The mass the thresholds divide by is
   * the body's own and already follows it. Absent reads as 1.
   */
  readonly sizeScale?: number;
  /**
   * **A holding repair, stated as one** (physical contact session 04, 2026-09-24): how many times
   * heavier this body is than the body its thresholds were measured on. A shove's N.s are divided
   * by the supported mass over this ratio, so a body that took a denser build without its blows
   * changing falls at the N.s it fell at, and its ledger decays at the rate it did, with every
   * constant above untouched. Each stone locomotion states its own from the mass census; a body
   * whose mass did not move reads 1, and so does an absent field. Sessions 06 and 08 replace the
   * thresholds, and this with them.
   */
  readonly stabilityMassRatio?: number;
}

/** The mass a shove's N.s are divided by: the supported mass over the authority's holding ratio. */
export function stabilityMassKg(supportedMassKg: number, authority: StabilityAuthority | null): number {
  return supportedMassKg / (authority?.stabilityMassRatio ?? 1);
}

/**
 * The velocity change a batch of shoves hands a standing body, m/s: the horizontal part of each
 * impulse over the mass the body stands with. The one reading of a shove, for the ledger and for
 * the recovery interrupt alike.
 */
export function shoveSpecificImpulseMps(events: readonly StabilityEvent[], supportedMassKg: number,
  authority: StabilityAuthority | null): number {
  const massKg = stabilityMassKg(supportedMassKg, authority);
  return events.reduce((sum, event) => sum + Math.hypot(...event.horizontalShoveNs) / massKg, 0);
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
    * (authority?.stabilityScale ?? 1) * sizeTime(authority);
}

/**
 * The square root of the body's size: the factor on a speed and on a time alike (`SizeLaw`), and
 * exactly 1 for a body at x1 or an authority that names none.
 */
export function sizeTime(authority: StabilityAuthority | null | undefined): number {
  return Math.sqrt(authority?.sizeScale ?? 1);
}

/**
 * The shortest a body lies before it may rise: the frozen dwell over its recovery stat. The one place
 * the dwell is divided; the state machine and the port's rise gate read it here.
 */
export function fallenDwellS(authority: StabilityAuthority | null | undefined): number {
  return SUPPORTED_LOCOMOTION_V1.FALLEN_DWELL_S * sizeTime(authority) / (authority?.recoveryScale ?? 1);
}

/**
 * The shortest a rise may last: the frozen rise over the body's recovery stat. A body may lengthen a
 * rise past this and never shorten one under it.
 */
export function risingFloorS(authority: StabilityAuthority | null | undefined): number {
  return SUPPORTED_LOCOMOTION_V1.RISING_DURATION_S * sizeTime(authority) / (authority?.recoveryScale ?? 1);
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
 * What a contact pushed a body with, newton-seconds in world axes; solver reaction impulse has no
 * field here.
 *
 * `Combat` files the impulse of an inelastic contact between the striker's effective mass and the
 * struck point's, along the contact normal (`contactImpulseNs` in `src/scoring.ts`, physical
 * contact session 06), for every blow and every parry alike. The ledger divides the horizontal part
 * by the body's stability mass, so a heavier body takes a smaller velocity change from the same blow.
 *
 * **`verticalShoveNs` is carried and read by nothing yet.** It is the upward share of the same
 * impulse, positive up, and session 07 is its reader: a sustained lift out of it. A locomotion
 * bench's own shove is horizontal and leaves it out.
 */
export type StabilityEvent = Readonly<{
  readonly horizontalShoveNs: readonly [number, number];
  readonly verticalShoveNs?: number;
}>;

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

export interface SupportedLocomotionBoundary {
  readonly dt: number;
  readonly safeBoundarySequence: number;
  readonly authority: StabilityAuthority | null;
  readonly liveSupport: boolean;
  readonly postureSupported: boolean;
  readonly supportEvidence: readonly StandableSupportEvidence[];
  readonly supportedMassKg: number;
  readonly contactShoves: readonly StabilityEvent[];
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
  /**
   * Whether the other body's contact held this one up with more than its weight over the press's
   * window (`ContactPress`, physical contact session 07). A standing body so lifted is not standing
   * on anything and falls; read only while supported or staggered. Absent is false.
   */
  readonly lifted?: boolean;
}

export interface RisingEligibility { readonly eligible: boolean; readonly reason: string | null }

/**
 * Whether a downed body may rise on this boundary, and if not, why.
 *
 * **Rising belongs to the body, not the mind** (physical contact session 02, 2026-09-23). Nothing
 * here asks whether anybody wants the body up: once its fall has settled and its dwell has
 * elapsed, it rises as soon as the world lets it. It used to wait for a `recover` request derived
 * from movement input, so a mind that held still never rose, and a rise lost the request -- and
 * fell back with its dwell reset -- at any boundary where the mind stopped moving. The house rule
 * is that recovery cannot require the support state it exists to restore; the mind's input is
 * one more thing it may not require.
 */
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
  if (!input.authority) return Object.freeze({ eligible: false, reason: "locomotion authority is unavailable" });
  if (!input.liveSupport) return Object.freeze({ eligible: false, reason: "support chain is not live" });
  if (!input.recoveryGroundAvailable) {
    return Object.freeze({ eligible: false, reason: "standable recovery ground is unavailable" });
  }
  if (!input.occupancyClear) return Object.freeze({ eligible: false, reason: "recovery occupancy is obstructed" });
  // Fallen only: a staggering blow keeps a lying body down for that boundary. A rise under way is
  // put down by the ledger, as a standing body is (`stepSupportedLocomotionState`).
  if (state.state === "fallen" && input.hitInterrupted) {
    return Object.freeze({ eligible: false, reason: "recovery was interrupted by a hit" });
  }
  // Falling is allowed to leave every foot above the floor or folded under the carrier. Requiring
  // one of those terminals to publish a fresh planted contact before the bounded righting path may
  // begin makes an upside-down but otherwise intact body unrecoverable by construction. The rise
  // instead earns reattachment through live support topology, the settled fall, the fallen dwell,
  // pair occupancy and uninterrupted clearance. Fresh terminal contact is still
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
        (!Number.isFinite(input.authority.stabilityScale) || input.authority.stabilityScale <= 0)) ||
      (input.authority.stabilityMassRatio !== undefined &&
        (!Number.isFinite(input.authority.stabilityMassRatio) || input.authority.stabilityMassRatio <= 0)))) {
    throw new Error("supported locomotion authority has invalid stability scaling");
  }
  for (const event of input.contactShoves) {
    if (event.horizontalShoveNs.length !== 2 ||
        event.horizontalShoveNs.some((value) => !Number.isFinite(value))) {
      throw new Error("supported locomotion shove must contain two finite horizontal components");
    }
    if (event.verticalShoveNs !== undefined && !Number.isFinite(event.verticalShoveNs)) {
      throw new Error("supported locomotion shove must have a finite vertical component");
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
  const added = shoveSpecificImpulseMps(input.contactShoves, input.supportedMassKg, input.authority);
  const specificImpulseMps = Math.max(0,
    prior.specificImpulseMps - SUPPORTED_LOCOMOTION_V1.STABILITY_DECAY_MPS_PER_S * input.dt) + added;
  const hasSupport = supportAvailable(input);
  const supportMissingS = hasSupport ? 0 : prior.supportMissingS + input.dt;
  const capacity = stabilityCapacity(input.authority);
  const staggerAt = SUPPORTED_LOCOMOTION_V1.STAGGER_SPECIFIC_IMPULSE_MPS * capacity;
  const fallAt = SUPPORTED_LOCOMOTION_V1.FALL_SPECIFIC_IMPULSE_MPS * capacity;

  if (prior.state === "rising") {
    // **A rising body is put down exactly as a standing one is**: by the ledger reaching `fallAt`
    // (physical contact session 02, 2026-09-23). The ledger restarts at zero when the rise begins,
    // so what it holds here is what has landed since, and the fall that put the body down is not
    // counted twice. It used to be put down by any staggering blow (`hitInterrupted`), and one body
    // opted out of that altogether; both were authored rules about a rise, and a rise is now as hard
    // to put down as a standing body until session 08 gives its posture a capacity of its own.
    if (specificImpulseMps >= fallAt) {
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
    if (risingElapsedS >= input.risingDurationS * RISE_POSTURE_DEADLINE) {
      return Object.freeze({ state: "fallen", specificImpulseMps,
        supportMissingS, fallenElapsedS: 0, risingElapsedS: 0, driveStaged: false });
    }
    return Object.freeze({ state: "rising", specificImpulseMps, supportMissingS: 0,
      fallenElapsedS: prior.fallenElapsedS, risingElapsedS, driveStaged: true });
  }

  if (prior.state === "fallen") {
    const fallenElapsedS = prior.fallenElapsedS + input.dt;
    const fallen = Object.freeze({ state: "fallen" as const, specificImpulseMps,
      supportMissingS, fallenElapsedS, risingElapsedS: 0, driveStaged: false });
    // The rise starts its ledger at zero: see the rising branch above.
    return risingEligibility(fallen, input).eligible
      ? Object.freeze({ ...fallen, state: "rising" as const, specificImpulseMps: 0, risingElapsedS: 0,
        driveStaged: true })
      : fallen;
  }

  if (specificImpulseMps >= fallAt || supportMissingS > SUPPORTED_LOCOMOTION_V1.SUPPORT_GRACE_S ||
      input.lifted === true) {
    return Object.freeze({ state: "fallen", specificImpulseMps, supportMissingS,
      fallenElapsedS: 0, risingElapsedS: 0, driveStaged: false });
  }
  return Object.freeze({ state: specificImpulseMps >= staggerAt ? "staggered" : "supported",
    specificImpulseMps, supportMissingS, fallenElapsedS: 0, risingElapsedS: 0, driveStaged: false });
}
