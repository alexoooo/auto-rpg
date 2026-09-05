import type { Intent } from "../mind.ts";
import type { Part } from "../rig.ts";
import type { LocomotionRequest } from "../supported-locomotion.ts";
import type {
  PhysicalSupportedLocomotionPort,
} from "../supported-locomotion-production.ts";
import type {
  LocomotionFootprint,
  StandableWorldRegistry,
  SupportedRootAdapter,
  VirtualCarrierConfig,
} from "../supported-locomotion-runtime.ts";
import type {
  ConstructPostureEvidence,
  StabilityAuthority,
  SupportState,
} from "../supported-locomotion-state.ts";
import type { BuiltModule, GolemModuleDefinition, ModuleBuild } from "./module.ts";

/**
 * The locomotion module contract, and the instrument that reads one.
 *
 * **Locomotion is the one slot handled specially and the reason is on record.** Continuous
 * dynamic-root balance was tried at 240 Hz and both humanoid bodies lost foot evidence and fell
 * inside the then-current grace *at rest*. So a golem moves on the supported carrier from
 * `src/supported-locomotion*.ts`: a virtual carrier with no body and no combat shape resolves
 * where the golem is allowed to be, and the admitted physical root is `ANIMATED` and follows it
 * until an authored knockdown releases it to `DYNAMIC`. The legs prove support, sell the motion
 * and take the hits; the carrier does the moving. `AGENTS.md` says plainly that "restoring
 * physics" by deleting `driveAnimatedRoot` recreates the pile-up this system exists to avoid.
 *
 * **Nothing in `src/supported-locomotion*.ts` changes shape for this.** Every type below is a
 * golem-side name for something that already existed: `VirtualCarrierConfig`,
 * `LocomotionFootprint`, `SupportedRootAdapter`, `StabilityAuthority` and
 * `ConstructPostureEvidence` are all imported, and the module's whole job is to fill them in
 * from its own anatomy and hand them to `PhysicalSupportedLocomotionPort`.
 *
 * **Explicit `.ts` on every intra-directory import**, for the reason `module.ts` gives: Node
 * loads this graph directly and strips types rather than compiling them.
 */

/**
 * What a locomotion module is commanded with, once per control boundary.
 *
 * The existing `LocomotionRequest` -- `localForward`, `localRight`, `yaw`, `recover` -- plus
 * `crouch` from `Intent.posture`, which is the field `mind.ts` has carried marked "reserved for
 * session 05" since the posture record was split out. Nothing is added to `Intent` for any of
 * it: `locomotionCommand` below is a narrowing, which is the direction the one-seam rule allows.
 */
export interface LocomotionCommand {
  readonly request: LocomotionRequest;
  /** 0 standing through 1 fully crouched, as `PostureIntent.crouch` states it. */
  readonly crouch: number;
}

/**
 * The whole `Intent` narrowed onto one locomotion module. This is the registry's adapter.
 *
 * **`recover` is derived from what the person is *asking* for, never from what the carrier
 * achieved**, and that distinction is a recorded trap rather than a nicety: a fallen carrier
 * zeroes its own translation, so a `recover` read back off the committed movement is false for
 * exactly as long as the body is fallen, and the body is therefore trapped for ever. `Intent`
 * has no `recover` field and must not grow one, so the rule is the one the game already uses --
 * `fighterRequestsRising` in `supported-locomotion-state.ts`: deliberate movement input after
 * the fallen dwell is the request to get up. Setting it while upright costs nothing, because
 * `risingEligibility` reads it only in the fallen and rising states.
 */
export const locomotionCommand = (intent: Intent): LocomotionCommand => ({
  request: {
    localForward: intent.forward,
    localRight: intent.strafe,
    yaw: intent.turn,
    recover: intent.forward !== 0 || intent.strafe !== 0 || intent.turn !== 0,
  },
  crouch: intent.posture.crouch,
});

/**
 * The height a carrier stands and crouches at, metres above the ground it is standing on.
 *
 * **Crouch is a carrier property rather than a pose**, which is the frozen choice that makes
 * offering more than one locomotion option worth anything: the biped has a height range and
 * Session 06's wheel does not, and a mind asking either of them to crouch is asking about the
 * carrier rather than about a leg. The `VirtualLocomotionCarrier` itself is horizontal-only by
 * construction -- its `commit` preserves `y` -- so the vertical is the module's to drive, and
 * this record is what it drives between.
 */
export interface LocomotionHeightRange {
  /** Where the module's socket sits when standing. */
  readonly standM: number;
  /** Where it sits fully crouched. Equal to `standM` for a carrier that does not crouch. */
  readonly crouchM: number;
}

/** One named place a locomotion module can prove it is standing on something. */
export interface LocomotionSupportBinding {
  /** The role name the `StabilityAuthority` and the support evidence both use. */
  readonly role: string;
  /** What it is, for a readout. */
  readonly label: string;
}

/**
 * What a built locomotion module publishes beyond the ordinary module contract.
 *
 * The four the session plan names -- the root body, a `SupportedRootAdapter`, `postureEvidence`
 * and `gait(dt)` -- plus the port itself and the registry it navigates against, because a
 * caller that could not reach those two could not put two golems in one arena (Session 08) and
 * could not put an obstacle in front of one (the corpus this session owes).
 */
export interface BuiltLocomotion extends BuiltModule<LocomotionCommand> {
  /** The admitted physical root: `ANIMATED` while supported, `DYNAMIC` once knocked down. */
  readonly root: Part;
  /** The adapter the bounded root motor samples and drives through. */
  readonly adapter: SupportedRootAdapter;
  /** The command buffer, carrier, state machine and rising actuator, already wired. */
  readonly port: PhysicalSupportedLocomotionPort;
  /**
   * The world-query registry this module navigates against.
   *
   * Handed in through `ModuleBuild.world` when a caller has one -- a pair of golems must share
   * exactly one, which `resolvePhysicalSupportedPair` checks -- and otherwise the flat-floor
   * authority. A caller may register further colliders into it after the build; the port reads
   * it afresh at every safe boundary.
   */
  readonly world: StandableWorldRegistry;
  readonly footprint: LocomotionFootprint;
  readonly heightRange: LocomotionHeightRange;
  /** The live stability authority. Recomputed per boundary, because gait scale moves with speed. */
  authority(): StabilityAuthority;
  /**
   * Root-up, root-above-feet and stack-above-root, together.
   *
   * **A contact count is sensor evidence, not a posture verdict.** The first Swordbearer test
   * accepted two live foot contacts while the body lay on its back, which is why the predicate
   * this feeds -- `constructPostureIsSupported`, not the fighter one, because its thresholds are
   * shape-agnostic and suit a squat body -- wants three independent signals at once.
   */
  postureEvidence(): ConstructPostureEvidence;
  /** One substep of the legs. Called from `step`; exposed so a harness can drive it alone. */
  gait(dt: number): void;
  /**
   * The two halves of `step` either side of the carrier resolution, for a caller that owns it.
   *
   * `step(dt)` is `beginSubstep()`, the solo carrier resolution, `gait(dt)`, `endSubstep(dt)` --
   * which is right for one module on a bench and wrong for a *pair*, because two carriers have to
   * be proposed before either is committed. `resolvePhysicalSupportedPair` is the production path
   * for that and it needs both ports in hand, so a pair harness drives:
   *
   *     both.beginSubstep(); both.port.beginControlStep(); both.port.request(...);
   *     resolvePhysicalSupportedPair(a.port, b.port, dt);
   *     both.gait(dt); both.endSubstep(dt);
   *
   * `beginSubstep` exists because the root's linear velocity is read once per substep and cached
   * -- `getLinearVelocityToRef` crosses the plugin boundary and allocates 216 B a call, and the
   * port samples the root three or four times a boundary. A caller that skipped it would drive a
   * pair off a velocity a substep old.
   */
  beginSubstep(): void;
  endSubstep(dt: number): void;
  /** Everything a readout or a test wants to know about this substep. */
  evidence(): LocomotionEvidence;
  /**
   * The run so far, accumulated by the module's own instrument.
   *
   * On the module rather than on the harness because both harnesses want the same record and a
   * second copy of the accumulation is a second copy that can drift -- which is the defect this
   * directory calls the worst one available, a green reading that is about something else.
   */
  readout(): LocomotionReadoutState;
  /**
   * The bench's knockdown: **an impulse, not a force**, and no force is applied from outside
   * the solver. The magnitude is the module's own and carries its bracket in `config.ts`.
   */
  shove(): void;
}

export interface LocomotionModuleDefinition extends GolemModuleDefinition<LocomotionCommand> {
  readonly carrier: VirtualCarrierConfig;
  readonly heightRange: LocomotionHeightRange;
  readonly footprint: LocomotionFootprint;
  readonly supportBindings: readonly LocomotionSupportBinding[];
  build(ctx: ModuleBuild): BuiltLocomotion;
}

/** Declare a locomotion module, freezing it and keeping the slot list honest. */
export const defineLocomotion = (definition: LocomotionModuleDefinition): LocomotionModuleDefinition => {
  if (definition.slots.length !== 1 || definition.slots[0] !== "locomotion") {
    throw new Error(`locomotion module "${definition.id}" must declare exactly the locomotion slot`);
  }
  if (!(definition.heightRange.crouchM <= definition.heightRange.standM)) {
    throw new Error(`locomotion module "${definition.id}" has a crouch above its stand height`);
  }
  if (definition.supportBindings.length === 0) {
    throw new Error(`locomotion module "${definition.id}" declares no support binding`);
  }
  return Object.freeze(definition);
};

// --------------------------------------------------------------------------- the instrument

/**
 * One substep's reading of a locomotion module.
 *
 * Allocated once by the recorder and mutated in place: this is written 240 times a second.
 */
export interface LocomotionEvidence {
  /** Seconds since the run started. */
  t: number;
  state: SupportState;
  /** What the command asked the carrier for, m/s -- the request scaled by the carrier ceiling. */
  commandedSpeedMps: number;
  /** What the carrier resolved, m/s. The difference is world clipping, not tracking error. */
  carrierSpeedMps: number;
  /** What the physical root actually did, m/s, horizontal. */
  rootSpeedMps: number;
  /** Where the module's socket is above the ground it stands on, metres. */
  heightM: number;
  crouch: number;
  /** `carrierUpDot`: the root's own up against world up. */
  upDot: number;
  /** `rootHeightAboveCarrierM`: the root above the mean sole. */
  rootAboveFeetM: number;
  /** `terminalHeightAboveRootM`: what the root carries, above the root. */
  stackAboveRootM: number;
  postureSupported: boolean;
  /** How many declared bindings published fresh standable support this boundary. */
  freshBindings: number;
  /** How many soles are inside the step envelope of standable world. */
  plantedFeet: number;
  /**
   * How fast the *stillest sole in contact* moved over the ground this substep, m/s.
   *
   * A minimum and not a maximum, and that is the whole of what the reading means: a walk puts the
   * swing foot through contact height twice a stride at about twice the body's speed, so a
   * maximum over planted feet reports the walk itself as a defect. What this asks is whether the
   * golem has a foot *holding* the ground.
   */
  footSlipMps: number;
  /**
   * The largest gap between a driven joint's command and what it achieved, radians.
   *
   * The lag that says whether the legs read as heavy: a finite torque ceiling against real mass
   * is what buys it, and a ceiling raised until this is zero is a stiff leg rather than a better
   * one. Taken over all six driven angles, so one bad joint cannot hide behind five good ones.
   */
  jointErrorRad: number;
  /** How far the highest sole is above the ground, metres: the step's own clearance. */
  soleLiftM: number;
  /** How far what the root carries has leaned away from the root, radians. */
  carriedLeanRad: number;
  /** Real Havok contacts this substep, and how many of them were the golem hitting itself. */
  contacts: number;
  selfContacts: number;
}

export const blankLocomotionEvidence = (): LocomotionEvidence => ({
  t: 0, state: "supported", commandedSpeedMps: 0, carrierSpeedMps: 0, rootSpeedMps: 0,
  heightM: 0, crouch: 0, upDot: 1, rootAboveFeetM: 0, stackAboveRootM: 0,
  postureSupported: true, freshBindings: 0, plantedFeet: 0, footSlipMps: 0,
  jointErrorRad: 0, soleLiftM: 0, carriedLeanRad: 0,
  contacts: 0, selfContacts: 0,
});

export interface LocomotionReadoutState {
  readonly steps: number;
  readonly seconds: number;
  /** How many substeps the state machine called supported or staggered. */
  readonly supportedSteps: number;
  /**
   * When the posture predicate first went false, or null if it never did.
   *
   * **The number the Swordbearer test did not have.** A run that is supported for 99 % of its
   * substeps and lost its posture once is not a run that stood up; the first loss is what says
   * so, and it is reported beside the count rather than folded into it.
   */
  readonly firstPostureLossSeconds: number | null;
  readonly minUpDot: number;
  readonly minRootAboveFeetM: number;
  readonly minStackAboveRootM: number;
  /** The longest run of substeps with no fresh standable support at all, in seconds. */
  readonly longestSupportGapSeconds: number;
  readonly peakCommandedSpeedMps: number;
  readonly peakCarrierSpeedMps: number;
  /** Peak |carrier - root| horizontal speed while supported: how far the body lags its carrier. */
  readonly peakCarrierLagMps: number;
  readonly meanCarrierLagMps: number;
  /** Peak and mean slip of a sole that was planted on this substep and the one before it. */
  readonly peakFootSlipMps: number;
  readonly meanFootSlipMps: number;
  readonly plantedSteps: number;
  readonly minHeightM: number;
  readonly maxHeightM: number;
  /** Peak joint lag while upright: the reading the three torque ceilings were swept against. */
  readonly peakJointErrorRad: number;
  readonly peakSoleLiftM: number;
  /** Peak waist lean while upright, and the peak over the whole run including a knockdown. */
  readonly peakUprightLeanRad: number;
  readonly peakLeanRad: number;
  readonly firstFallenSeconds: number | null;
  readonly firstRisingSeconds: number | null;
  /** When the state machine returned to supported after a fall, or null. */
  readonly recoveredSeconds: number | null;
  /** From the first fallen substep to that return. Null while either end is missing. */
  readonly riseSeconds: number | null;
  readonly contacts: number;
  readonly selfContacts: number;
}

/**
 * The locomotion bench's instrument.
 *
 * Deliberately **not** `BenchReadout`: that one is about a tip, an anchor and a stroke, and
 * every column in it is a question about an effector. A constant whose unit depends on which
 * option happens to be on the stand is a number waiting to be quoted wrongly, and the same is
 * true of a whole instrument.
 */
export class LocomotionReadout {
  private steps = 0;
  private seconds = 0;
  private supported = 0;
  private firstPostureLoss: number | null = null;
  private minUp = Number.POSITIVE_INFINITY;
  private minRootAbove = Number.POSITIVE_INFINITY;
  private minStackAbove = Number.POSITIVE_INFINITY;
  private gap = 0;
  private longestGap = 0;
  private peakCommanded = 0;
  private peakCarrier = 0;
  private peakLag = 0;
  private lagSum = 0;
  private lagSteps = 0;
  private peakSlip = 0;
  private slipSum = 0;
  private slipSteps = 0;
  private planted = 0;
  private minHeight = Number.POSITIVE_INFINITY;
  private maxHeight = 0;
  private peakJointError = 0;
  private peakSoleLift = 0;
  private peakUprightLean = 0;
  private peakLean = 0;
  private firstFallen: number | null = null;
  private firstRising: number | null = null;
  private recovered: number | null = null;
  private contacts = 0;
  private selfContacts = 0;

  sample(row: LocomotionEvidence): void {
    this.steps += 1;
    this.seconds = row.t;
    const upright = row.state === "supported" || row.state === "staggered";
    if (upright) this.supported += 1;
    if (!row.postureSupported && this.firstPostureLoss === null) this.firstPostureLoss = row.t;
    this.minUp = Math.min(this.minUp, row.upDot);
    this.minRootAbove = Math.min(this.minRootAbove, row.rootAboveFeetM);
    this.minStackAbove = Math.min(this.minStackAbove, row.stackAboveRootM);
    // A gap is measured in substeps of *no* fresh binding, which is the quantity the frozen
    // 0.35 s support grace is stated in. One foot is support; the count is reported separately.
    if (row.freshBindings === 0) {
      this.gap += 1;
      this.longestGap = Math.max(this.longestGap, this.gap);
    } else {
      this.gap = 0;
    }
    this.peakCommanded = Math.max(this.peakCommanded, row.commandedSpeedMps);
    this.peakCarrier = Math.max(this.peakCarrier, row.carrierSpeedMps);
    if (upright) {
      const lag = Math.abs(row.carrierSpeedMps - row.rootSpeedMps);
      this.peakLag = Math.max(this.peakLag, lag);
      this.lagSum += lag;
      this.lagSteps += 1;
    }
    // Slip is only a question about a body that is standing. A fallen golem's soles are dragged
    // by whatever the ragdoll is doing and a rising one is being carried by the actuator, so
    // counting either would report the knockdown as a gait defect.
    if (upright && row.plantedFeet > 0) {
      this.planted += 1;
      this.peakSlip = Math.max(this.peakSlip, row.footSlipMps);
      this.slipSum += row.footSlipMps;
      this.slipSteps += 1;
    }
    this.minHeight = Math.min(this.minHeight, row.heightM);
    this.maxHeight = Math.max(this.maxHeight, row.heightM);
    this.peakSoleLift = Math.max(this.peakSoleLift, row.soleLiftM);
    this.peakLean = Math.max(this.peakLean, row.carriedLeanRad);
    if (upright) {
      this.peakJointError = Math.max(this.peakJointError, row.jointErrorRad);
      this.peakUprightLean = Math.max(this.peakUprightLean, row.carriedLeanRad);
    }
    if (row.state === "fallen" && this.firstFallen === null) this.firstFallen = row.t;
    if (row.state === "rising" && this.firstRising === null) this.firstRising = row.t;
    if (this.firstFallen !== null && this.recovered === null && row.state === "supported") {
      this.recovered = row.t;
    }
    this.contacts += row.contacts;
    this.selfContacts += row.selfContacts;
  }

  state(): LocomotionReadoutState {
    const finite = (value: number): number => (Number.isFinite(value) ? value : 0);
    return Object.freeze({
      steps: this.steps,
      seconds: this.seconds,
      supportedSteps: this.supported,
      firstPostureLossSeconds: this.firstPostureLoss,
      minUpDot: finite(this.minUp),
      minRootAboveFeetM: finite(this.minRootAbove),
      minStackAboveRootM: finite(this.minStackAbove),
      longestSupportGapSeconds: this.steps > 0 && this.seconds > 0
        ? this.longestGap * (this.seconds / this.steps) : 0,
      peakCommandedSpeedMps: this.peakCommanded,
      peakCarrierSpeedMps: this.peakCarrier,
      peakCarrierLagMps: this.peakLag,
      meanCarrierLagMps: this.lagSteps > 0 ? this.lagSum / this.lagSteps : 0,
      peakFootSlipMps: this.peakSlip,
      meanFootSlipMps: this.slipSteps > 0 ? this.slipSum / this.slipSteps : 0,
      plantedSteps: this.planted,
      minHeightM: finite(this.minHeight),
      maxHeightM: this.maxHeight,
      peakJointErrorRad: this.peakJointError,
      peakSoleLiftM: this.peakSoleLift,
      peakUprightLeanRad: this.peakUprightLean,
      peakLeanRad: this.peakLean,
      firstFallenSeconds: this.firstFallen,
      firstRisingSeconds: this.firstRising,
      recoveredSeconds: this.recovered,
      riseSeconds: this.firstFallen !== null && this.recovered !== null
        ? this.recovered - this.firstFallen : null,
      contacts: this.contacts,
      selfContacts: this.selfContacts,
    });
  }
}

const fixed = (value: number | null, places: number): string =>
  value === null ? "n/a" : value.toFixed(places);

/** The readout's lines, shared by the page panel and the Node bench so neither can drift. */
export function formatLocomotion(
  state: LocomotionReadoutState,
  live: LocomotionEvidence,
): readonly string[] {
  return Object.freeze([
    `support        ${live.state}   posture ${live.postureSupported ? "held" : "LOST"}`
      + `   bindings ${live.freshBindings}/${live.plantedFeet} planted`,
    `carrier        commanded ${live.commandedSpeedMps.toFixed(3)}`
      + `  allowed ${live.carrierSpeedMps.toFixed(3)}  root ${live.rootSpeedMps.toFixed(3)} m/s`,
    `carrier lag    peak ${state.peakCarrierLagMps.toFixed(3)}`
      + `  mean ${state.meanCarrierLagMps.toFixed(3)} m/s`,
    `foot slip      peak ${(state.peakFootSlipMps * 1000).toFixed(1)}`
      + `  mean ${(state.meanFootSlipMps * 1000).toFixed(1)} mm/s over ${state.plantedSteps} planted steps`,
    `legs           joint lag peak ${state.peakJointErrorRad.toFixed(4)} rad`
      + `  sole lift peak ${(state.peakSoleLiftM * 1000).toFixed(1)} mm`
      + `  lean ${state.peakUprightLeanRad.toFixed(4)}/${state.peakLeanRad.toFixed(4)} rad`,
    `posture        up ${live.upDot.toFixed(4)} (min ${state.minUpDot.toFixed(4)})`
      + `  root above feet ${live.rootAboveFeetM.toFixed(3)} m`
      + `  stack ${live.stackAboveRootM.toFixed(3)} m`,
    `first loss     ${fixed(state.firstPostureLossSeconds, 3)} s`
      + `   longest support gap ${state.longestSupportGapSeconds.toFixed(3)} s`,
    `height         ${live.heightM.toFixed(3)} m  (${state.minHeightM.toFixed(3)}`
      + `..${state.maxHeightM.toFixed(3)})  crouch ${live.crouch.toFixed(2)}`,
    `knockdown      fell ${fixed(state.firstFallenSeconds, 3)}`
      + `  rising ${fixed(state.firstRisingSeconds, 3)}`
      + `  supported ${fixed(state.recoveredSeconds, 3)}`
      + `  rise ${fixed(state.riseSeconds, 3)} s`,
    `contacts       ${state.contacts}   self ${state.selfContacts}`,
  ]);
}

// --------------------------------------------------------------------- one carrier, no pair

/**
 * Resolve one carrier against the world alone.
 *
 * `resolvePhysicalSupportedPair` is the production path and it needs two ports, because the
 * whole of its extra work is the unordered circle calculation between two footprints. A bench
 * has one module on one stand, so this is the same cycle with that half deliberately absent:
 * the world clipping is `allowedFraction`, which is what the pair function calls first and
 * independently anyway. It is exported so the page bench and the Node bench cannot drift.
 *
 * Ordering matters and is the production one, from `stepControlledPair`: the safe boundary
 * first, then the request, then the proposal and the commit. Reversing the first two evaluates
 * the state machine against a request that has already been superseded.
 */
export function stepSoloCarrier(
  port: PhysicalSupportedLocomotionPort,
  world: StandableWorldRegistry,
  request: LocomotionRequest,
  dt: number,
): void {
  port.beginControlStep();
  port.request(request);
  const proposal = port.proposal(dt);
  const fraction = world.allowedFraction(proposal.prior, proposal.next,
    proposal.footprint, proposal.ownerPartIds);
  port.commitPhysical(proposal, Object.freeze({
    x: proposal.displacement.x * fraction,
    z: proposal.displacement.z * fraction,
    yaw: proposal.displacement.yaw,
  }), dt);
}
