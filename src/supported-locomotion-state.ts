import {
  baseReachM, leverAt, rockingDecayMps2, TIPPING, tippingLineMps, type TippingGeometry,
} from "./tipping.ts";

export type SupportState = "supported" | "staggered" | "fallen" | "rising";

/**
 * Frozen v1 values.
 *
 * **There is no stagger line, fall line or decay here** (physical contact session 08). A standing
 * body tips when a blow carries its centre of mass over the edge of its base, and gravity rights it
 * at a rate its own geometry sets; both are read off the live body each boundary (`src/tipping.ts`,
 * the boundary's `tipping`). The three constants they replace were a holding repair tuned to one
 * family's knockdown rate, and the brace, gait and mass-ratio fields that scaled them per family went
 * with them.
 */
export const SUPPORTED_LOCOMOTION_V1 = Object.freeze({
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
  /**
   * The body's stability stat (`src/golem/attributes.ts`), a plain factor on the tipping line and
   * so on the stagger line with it. Absent reads as 1, which is what a hand-built authority in a
   * test means.
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
   * The body's size stat (`src/golem/attributes.ts`). Both floors of a knockdown are times and go as
   * the square root of the size (`SizeLaw`). The tipping line reads it from the body itself -- a
   * larger body's centre of mass is higher and its base wider -- so it is not applied there again.
   * Absent reads as 1.
   */
  readonly sizeScale?: number;
}

/**
 * The ledger's reading of a batch of shoves, as a horizontal vector in m/s: each impulse's horizontal
 * part, times its lever over the centre of mass's height (`leverAt`), over the body's mass. Blows
 * from opposite sides cancel, as they do on a rocking body. A body with no tipping reading takes each
 * blow at the centre of mass.
 */
export function shoveSpecificImpulse(events: readonly StabilityEvent[], supportedMassKg: number,
  tipping: TippingGeometry | null): [number, number] {
  let x = 0, z = 0;
  for (const event of events) {
    const lever = tipping ? leverAt(tipping, event.atY) : 1;
    x += event.horizontalShoveNs[0] * lever / supportedMassKg;
    z += event.horizontalShoveNs[1] * lever / supportedMassKg;
  }
  return [x, z];
}

/** Where a body staggers and falls along one horizontal direction, and how fast it rights itself. */
export interface StabilityLines {
  /** m/s of the ledger. */
  readonly staggerAtMps: number;
  readonly fallAtMps: number;
  /** m/s per second. */
  readonly decayMps2: number;
}

const NO_LINES: StabilityLines = Object.freeze({ staggerAtMps: Infinity, fallAtMps: Infinity, decayMps2: 0 });

/**
 * Whether a body's ledger has reached its fall line along the way it is rocking. A body with nothing
 * on its ledger is not falling whatever its base: a centre of mass outside the base with nothing
 * pushing it is a body its own locomotion is holding up.
 */
export function ledgerFalls(state: Pick<SupportedLocomotionState, "specificImpulseMps" | "leanX" | "leanZ">,
  authority: StabilityAuthority | null | undefined, tipping: TippingGeometry | null | undefined): boolean {
  return state.specificImpulseMps > 0 &&
    state.specificImpulseMps >= stabilityLines(authority, tipping, state.leanX, state.leanZ).fallAtMps;
}

/** Directions the weakest line is looked for along; 32 is finer than any base here has corners. */
const PROBE_DIRECTIONS = 32;

/**
 * **The one place the lines are formed** (physical contact session 08): the tipping line of the
 * body's geometry along a direction, times its stability stat, and the stagger line at
 * `TIPPING.STAGGER_FRACTION` of it. With no direction -- a ledger at zero -- the weakest direction
 * the base has. A body with no tipping reading (no support corners, a hand-built boundary) cannot be
 * tipped and is not righted: the support-grace rule is what puts a body with no base down.
 *
 * The state machine, the recovery interrupt, the rise's abort and the port's diagnostic all read
 * it here; a copy of it anywhere else is a body that staggers on one rule and recovers on another.
 */
export function stabilityLines(authority: StabilityAuthority | null | undefined,
  tipping: TippingGeometry | null | undefined, dirX = 0, dirZ = 0): StabilityLines {
  if (!tipping) return NO_LINES;
  let reach: number;
  if (Math.hypot(dirX, dirZ) > 0) {
    reach = baseReachM(tipping.hull, dirX, dirZ);
  } else {
    reach = Infinity;
    for (let i = 0; i < PROBE_DIRECTIONS; i += 1) {
      const angle = 2 * Math.PI * i / PROBE_DIRECTIONS;
      reach = Math.min(reach, baseReachM(tipping.hull, Math.cos(angle), Math.sin(angle)));
    }
  }
  const fallAtMps = tippingLineMps(tipping.comHeightM, tipping.gyrationM, reach) * (authority?.stabilityScale ?? 1);
  return Object.freeze({ staggerAtMps: fallAtMps * TIPPING.STAGGER_FRACTION, fallAtMps,
    decayMps2: rockingDecayMps2(tipping.comHeightM, reach) });
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
 * contact session 06), for every blow and every parry alike, and the contact point's world height
 * with it: the ledger reads a blow by its lever about the base (`leverAt`). The ledger divides the
 * horizontal part by the body's supported mass, so a heavier body takes a smaller velocity change
 * from the same blow.
 *
 * **`verticalShoveNs` is carried and read by nothing.** It is the upward share of the same
 * impulse, positive up; session 07's lift is read from the sustained contact force instead
 * (`ContactPress`). A locomotion bench's own shove is horizontal and leaves it out, and names no
 * height, so it lands at the centre of mass.
 */
export type StabilityEvent = Readonly<{
  readonly horizontalShoveNs: readonly [number, number];
  readonly verticalShoveNs?: number;
  /** The world height it landed at, m; absent is the centre of mass. */
  readonly atY?: number;
}>;

export interface SupportedLocomotionState {
  readonly state: SupportState;
  /** The ledger's size, m/s: the length of the lean below. */
  readonly specificImpulseMps: number;
  /** The ledger as a horizontal vector, m/s: which way the body is rocking, and how hard. */
  readonly leanX: number;
  readonly leanZ: number;
  readonly supportMissingS: number;
  readonly fallenElapsedS: number;
  readonly risingElapsedS: number;
  readonly driveStaged: boolean;
}

export const initialSupportedLocomotionState = (): SupportedLocomotionState => Object.freeze({
  state: "supported", specificImpulseMps: 0, leanX: 0, leanZ: 0, supportMissingS: 0,
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
  /**
   * The body's tipping geometry this boundary (`src/tipping.ts`): its centre of mass, its spread
   * and its base, read off the live parts. Null for a body with no base at all, which the ledger
   * cannot tip; the support-grace rule puts it down instead.
   */
  readonly tipping: TippingGeometry | null;
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
  if (input.authority?.stabilityScale !== undefined &&
      (!Number.isFinite(input.authority.stabilityScale) || input.authority.stabilityScale <= 0)) {
    throw new Error("supported locomotion authority has invalid stability scaling");
  }
  const tipping = input.tipping;
  if (tipping !== null && (!(tipping.comHeightM > 0) || !Number.isFinite(tipping.comHeightM) ||
      !(tipping.gyrationM >= 0) || !Number.isFinite(tipping.gyrationM) || !Number.isFinite(tipping.groundY) ||
      tipping.hull.some((point) => point.length !== 2 || !point.every(Number.isFinite)))) {
    throw new Error("supported locomotion tipping geometry must be finite, with the centre of mass above the ground");
  }
  for (const event of input.contactShoves) {
    if (event.horizontalShoveNs.length !== 2 ||
        event.horizontalShoveNs.some((value) => !Number.isFinite(value))) {
      throw new Error("supported locomotion shove must contain two finite horizontal components");
    }
    if (event.verticalShoveNs !== undefined && !Number.isFinite(event.verticalShoveNs)) {
      throw new Error("supported locomotion shove must have a finite vertical component");
    }
    if (event.atY !== undefined && !Number.isFinite(event.atY)) {
      throw new Error("supported locomotion shove must land at a finite height");
    }
  }
};

const supportAvailable = (input: SupportedLocomotionBoundary): boolean => {
  if (!input.authority || !input.liveSupport || !input.postureSupported) return false;
  const allowed = new Set(input.authority.supportBindings.map(({ role }) => role));
  return input.supportEvidence.some((row) => isFreshStandableSupport(row, input.safeBoundarySequence, allowed));
};

interface Lean { readonly specificImpulseMps: number; readonly leanX: number; readonly leanZ: number }

const ZERO_LEAN: Lean = Object.freeze({ specificImpulseMps: 0, leanX: 0, leanZ: 0 });

/**
 * The ledger after one boundary: the prior lean righted by gravity at its own direction's rate, and
 * this boundary's shoves added as a vector. A body rocking one way that is struck from the other is
 * righted by the blow, as a rocking body is.
 */
function nextLean(prior: SupportedLocomotionState, input: SupportedLocomotionBoundary): Lean {
  const [addX, addZ] = shoveSpecificImpulse(input.contactShoves, input.supportedMassKg, input.tipping);
  const priorMps = Math.hypot(prior.leanX, prior.leanZ);
  const kept = priorMps > 0
    ? Math.max(0, priorMps - stabilityLines(input.authority, input.tipping, prior.leanX, prior.leanZ).decayMps2
      * input.dt) / priorMps
    : 0;
  const leanX = prior.leanX * kept + addX;
  const leanZ = prior.leanZ * kept + addZ;
  return { specificImpulseMps: Math.hypot(leanX, leanZ), leanX, leanZ };
}

/** One immutable transition at the pre-physics safe edge. */
export function stepSupportedLocomotionState(prior: SupportedLocomotionState,
  input: SupportedLocomotionBoundary): SupportedLocomotionState {
  checkedBoundary(input);
  const lean = nextLean(prior, input);
  const hasSupport = supportAvailable(input);
  const supportMissingS = hasSupport ? 0 : prior.supportMissingS + input.dt;
  // Along the direction the body is rocking (`ledgerFalls`).
  const lines = stabilityLines(input.authority, input.tipping, lean.leanX, lean.leanZ);
  const falls = ledgerFalls(lean, input.authority, input.tipping);
  const staggers = lean.specificImpulseMps > 0 && lean.specificImpulseMps >= lines.staggerAtMps;

  if (prior.state === "rising") {
    // **A rising body is put down exactly as a standing one is**: by its lean reaching the tipping
    // line of the body it is at that boundary (physical contact session 08) -- a low centre of mass
    // on a base still forming, read off the live parts as a standing body's is, with no immunity and
    // no escape on top. The ledger restarts at zero when the rise begins, so what it holds here is
    // what has landed since, and the fall that put the body down is not counted twice.
    if (falls) {
      return Object.freeze({ state: "fallen", ...lean,
        supportMissingS, fallenElapsedS: 0, risingElapsedS: 0, driveStaged: false });
    }
    const eligible = risingEligibility({ ...prior,
      fallenElapsedS: Math.max(prior.fallenElapsedS, fallenDwellS(input.authority)) }, input);
    if (!eligible.eligible) return Object.freeze({ state: "fallen", ...lean,
      supportMissingS, fallenElapsedS: 0, risingElapsedS: 0, driveStaged: false });
    const risingElapsedS = prior.risingElapsedS + input.dt;
    if (risingElapsedS >= input.risingDurationS && input.postureSupported) {
      return Object.freeze({ state: "supported", ...ZERO_LEAN, supportMissingS: 0,
        fallenElapsedS: 0, risingElapsedS: 0, driveStaged: false });
    }
    if (risingElapsedS >= input.risingDurationS * RISE_POSTURE_DEADLINE) {
      return Object.freeze({ state: "fallen", ...lean,
        supportMissingS, fallenElapsedS: 0, risingElapsedS: 0, driveStaged: false });
    }
    return Object.freeze({ state: "rising", ...lean, supportMissingS: 0,
      fallenElapsedS: prior.fallenElapsedS, risingElapsedS, driveStaged: true });
  }

  if (prior.state === "fallen") {
    const fallenElapsedS = prior.fallenElapsedS + input.dt;
    const fallen = Object.freeze({ state: "fallen" as const, ...lean,
      supportMissingS, fallenElapsedS, risingElapsedS: 0, driveStaged: false });
    // The rise starts its ledger at zero: see the rising branch above.
    return risingEligibility(fallen, input).eligible
      ? Object.freeze({ ...fallen, state: "rising" as const, ...ZERO_LEAN, risingElapsedS: 0,
        driveStaged: true })
      : fallen;
  }

  if (falls || supportMissingS > SUPPORTED_LOCOMOTION_V1.SUPPORT_GRACE_S || input.lifted === true) {
    return Object.freeze({ state: "fallen", ...lean, supportMissingS,
      fallenElapsedS: 0, risingElapsedS: 0, driveStaged: false });
  }
  return Object.freeze({ state: staggers ? "staggered" : "supported",
    ...lean, supportMissingS, fallenElapsedS: 0, risingElapsedS: 0, driveStaged: false });
}
