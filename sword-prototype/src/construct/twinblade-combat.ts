import type { ActionController, ControllerContext, ControllerDiagnostic, ControllerFactory,
  JointReading } from "./scheduler.ts";
import { BIPED_BRACE_POSE, writeBipedBrace, type BipedBracePose } from "./biped.ts";
import { solveSwordbearerSweepCentre, type SweepCentreSolution } from "./mounts.ts";
import { twinbladeSwordBindMetrics, type TwinbladeSide } from "./twinblade.ts";

export interface TwinbladeArmPath {
  readonly chamber: SweepCentreSolution;
  readonly commit: SweepCentreSolution;
}
export interface TwinbladeScissorCutPath {
  readonly lane: "blocker-relative" | "open-torso";
  readonly blockerSide: TwinbladeSide;
  readonly cutterSide: TwinbladeSide;
  readonly left: TwinbladeArmPath;
  readonly right: TwinbladeArmPath;
}
export type TwinbladeLane =
  | Readonly<{ kind: "blocker-relative";
    blocker: Readonly<{ x: number; y: number; z: number }> }>
  | Readonly<{ kind: "open-torso" }>;
export interface TwinbladeScissorCutTuning {
  readonly outwardChamberM: number;
  readonly cutterChamberCrossM: number;
  readonly cutterChamberDropM: number;
  readonly openLaneOffsetM: number;
  readonly travelMultiplier: number;
  readonly settleAllowanceS: number;
}

export const TWINBLADE_SCISSOR_CUT: TwinbladeScissorCutTuning = Object.freeze({ outwardChamberM: 0.28,
  cutterChamberCrossM: 0.35, cutterChamberDropM: 0.20, openLaneOffsetM: 0,
  travelMultiplier: 0.75, settleAllowanceS: 0.05 });
export const TWINBLADE_MINIMUM_CUT_PHASE_S = 0.13;

/**
 * Resolve both real mount chains independently. The blocker chooses the open torso
 * lane; its near blade cuts first, then the opposite blade closes the scissor.
 */
export function solveTwinbladeScissorCutPath(
  target: Readonly<{ x: number; y: number; z: number }>,
  requestedLane: TwinbladeLane | Readonly<{ x: number; y: number; z: number }>,
  tuning: Readonly<TwinbladeScissorCutTuning> = TWINBLADE_SCISSOR_CUT,
): TwinbladeScissorCutPath {
  // The point-only spelling is the v1 call surface retained for saved test and
  // tool callers. Runtime code always chooses one of the two named lanes.
  const lane: TwinbladeLane = "kind" in requestedLane
    ? requestedLane
    : Object.freeze({ kind: "blocker-relative", blocker: requestedLane });
  const geometry = lane.kind === "blocker-relative"
    ? [target.x, target.y, target.z, lane.blocker.x, lane.blocker.y, lane.blocker.z]
    : [target.x, target.y, target.z];
  if (!geometry.every(Number.isFinite)) {
    throw new Error("Twinblade scissor-cut geometry must be finite");
  }
  if (!Number.isFinite(tuning.openLaneOffsetM) || tuning.openLaneOffsetM < 0 ||
      tuning.openLaneOffsetM > 0.35) {
    throw new Error("Twinblade open-lane offset must be between 0 and 0.35 metres");
  }
  if (lane.kind === "open-torso") {
    const separationM = Math.max(0.10, tuning.openLaneOffsetM);
    // Each blade must actually traverse the torso, not merely converge a few centimetres toward
    // its own near edge. The old same-side chamber/commit pair completed cleanly while producing
    // almost no physical work; mirrored crossings give the two sequential phases real travel and
    // keep their paths distinct without inventing a host-side combat result.
    const points = {
      left: {
        chamber: { x: target.x - tuning.outwardChamberM, y: target.y - 0.10, z: target.z },
        commit: { x: target.x + separationM, y: target.y, z: target.z },
      },
      right: {
        chamber: { x: target.x + tuning.outwardChamberM, y: target.y - 0.10, z: target.z },
        commit: { x: target.x - separationM, y: target.y, z: target.z },
      },
    };
    const path = (side: TwinbladeSide): TwinbladeArmPath => {
      const bind = twinbladeSwordBindMetrics(side);
      return Object.freeze({ chamber: solveSwordbearerSweepCentre(points[side].chamber, bind),
        commit: solveSwordbearerSweepCentre(points[side].commit, bind) });
    };
    return Object.freeze({ lane: "open-torso", blockerSide: "left", cutterSide: "right",
      left: path("left"), right: path("right") });
  }
  const blocker = lane.blocker;
  const offsetX = blocker.x - target.x;
  if (Math.abs(offsetX) < 0.02) {
    throw new Error("Twinblade scissor cut needs a blocker separated from the target centre");
  }
  const blockerSide: TwinbladeSide = offsetX < 0 ? "left" : "right";
  const cutterSide: TwinbladeSide = blockerSide === "left" ? "right" : "left";
  const sign = blockerSide === "left" ? -1 : 1;
  const openLane = { x: target.x - sign * tuning.openLaneOffsetM, y: target.y, z: target.z };
  const points = {
    blocker: {
      chamber: { x: target.x + sign * tuning.outwardChamberM,
        y: target.y - 0.10, z: target.z },
      commit: openLane,
    },
    cutter: {
      // The opposite blade must begin on the blocker's side and cross into the open lane.
      // Starting on its own side produced a short 140 mm convergence that finished cleanly
      // against the Warrior's hand without ever traversing the torso.
      chamber: { x: target.x + sign * tuning.cutterChamberCrossM,
        y: target.y - tuning.cutterChamberDropM, z: target.z },
      commit: openLane,
    },
  };
  const path = (side: TwinbladeSide, role: "blocker" | "cutter"): TwinbladeArmPath => {
    const bind = twinbladeSwordBindMetrics(side);
    return Object.freeze({ chamber: solveSwordbearerSweepCentre(points[role].chamber, bind),
      commit: solveSwordbearerSweepCentre(points[role].commit, bind) });
  };
  return Object.freeze({ lane: "blocker-relative", blockerSide, cutterSide,
    left: path("left", blockerSide === "left" ? "blocker" : "cutter"),
    right: path("right", blockerSide === "right" ? "blocker" : "cutter") });
}

const boundJoint = (context: ControllerContext, role: string): string => {
  const binding = context.group.bindings[role];
  if (!binding || binding.joints.length !== 1) {
    throw new Error(`group "${context.group.id}" needs one joint bound as "${role}"`);
  }
  return binding.joints[0];
};
const requireSword = (context: ControllerContext, side: TwinbladeSide): void => {
  const binding = context.group.bindings[`${side}-sword`];
  if (!binding || binding.modules.length !== 1) {
    throw new Error(`Twinblade controller requires one mounted ${side} sword`);
  }
};
const reading = (context: ControllerContext, joint: string): JointReading => {
  const row = context.view.joints[joint];
  if (!row) throw new Error(`Twinblade controller cannot read joint "${joint}"`);
  return row;
};
const fact = (context: ControllerContext, id: string): number => {
  const value = context.view.facts[id];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Twinblade scissor cut requires finite fact "${id}"`);
  }
  return value;
};
const parameter = (context: ControllerContext, id: string): number => {
  const value = context.request.parameters[id];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Twinblade scissor cut requires finite parameter "${id}"`);
  }
  return value;
};

class TwinbladeNeutralController implements ActionController {
  private readonly context: ControllerContext;
  private readonly joints: readonly string[];
  private progress = Number.POSITIVE_INFINITY;
  private cancelled = "";

  constructor(context: ControllerContext) {
    this.context = context;
    this.joints = Object.freeze(["left-yaw", "left-pitch", "right-yaw", "right-pitch"]
      .map((role) => boundJoint(context, role)));
    requireSword(context, "left"); requireSword(context, "right");
  }
  enter(): void {}
  step(): void {
    let greatest = 0;
    for (const joint of this.joints) {
      const row = reading(this.context, joint);
      greatest = Math.max(greatest, Math.abs(row.angleRad));
      this.context.motors.write({ joint, angleRad: Math.max(row.minRad, Math.min(row.maxRad, 0)),
        maxSpeedRadS: row.maxSpeedRadS, maxForceNm: row.maxForceNm });
    }
    this.progress = greatest;
  }
  done(): boolean { return false; }
  cancel(reason: string): void { this.cancelled = reason; }
  diagnostic(): ControllerDiagnostic { return { phase: this.cancelled ? "cancelled" : "neutral-hold",
    detail: this.cancelled || "four declared mount axes at neutral", progress: this.progress, epsilon: 0.04 }; }
}

type Phase = "chamber" | "first-cut" | "second-cut" | "recover" | "complete" | "cancelled";

class TwinbladeScissorCutController implements ActionController {
  private readonly context: ControllerContext;
  private readonly joints: Readonly<Record<TwinbladeSide, Readonly<{ yaw: string; pitch: string }>>>;
  private path!: TwinbladeScissorCutPath;
  private lane!: Readonly<{ kind: "open-torso" } | { kind: "blocker-relative";
    blockerSide: TwinbladeSide }>;
  private pathTuning: Readonly<TwinbladeScissorCutTuning> = TWINBLADE_SCISSOR_CUT;
  private cutAdvanceFraction = 0;
  private phase: Phase = "chamber";
  private pendingPhase: Exclude<Phase, "cancelled"> | null = null;
  private elapsedS = 0;
  private phaseLimitS = 0;
  private progress = Number.POSITIVE_INFINITY;
  private cancelled = "";
  private motorSpeedFraction = 1;
  private motorForceFraction = 1;
  private travelMultiplier = TWINBLADE_SCISSOR_CUT.travelMultiplier;
  private settleAllowanceS = TWINBLADE_SCISSOR_CUT.settleAllowanceS;
  private bracePose: Readonly<BipedBracePose> = BIPED_BRACE_POSE;

  constructor(context: ControllerContext) {
    this.context = context;
    this.joints = Object.freeze({
      left: Object.freeze({ yaw: boundJoint(context, "left-yaw"), pitch: boundJoint(context, "left-pitch") }),
      right: Object.freeze({ yaw: boundJoint(context, "right-yaw"), pitch: boundJoint(context, "right-pitch") }),
    });
    requireSword(context, "left"); requireSword(context, "right");
    for (const side of ["left-foot", "right-foot"]) {
      const binding = context.group.bindings[side];
      if (!binding || binding.joints.length !== 4 || binding.modules.length !== 1) {
        throw new Error(`Twinblade scissor cut requires exact biped binding "${side}"`);
      }
    }
  }

  enter(): void {
    const stableDownedOpponent = this.context.view.facts["opponent-upright"] === false &&
      this.context.view.facts["opponent-rising"] === false;
    if (this.context.view.facts["line-of-sight"] !== true && !stableDownedOpponent) {
      throw new Error("Twinblade scissor cut requires visible opponent geometry");
    }
    this.pathTuning = Object.freeze({ ...TWINBLADE_SCISSOR_CUT,
      outwardChamberM: parameter(this.context, "blocker-outward-m"),
      cutterChamberCrossM: parameter(this.context, "cutter-chamber-cross-m"),
      cutterChamberDropM: parameter(this.context, "cutter-chamber-drop-m"),
      openLaneOffsetM: parameter(this.context, "open-lane-offset-m") });
    this.motorSpeedFraction = parameter(this.context, "motor-speed-fraction");
    this.motorForceFraction = parameter(this.context, "motor-force-fraction");
    this.travelMultiplier = parameter(this.context, "travel-multiplier");
    this.settleAllowanceS = parameter(this.context, "settle-allowance-s");
    this.bracePose = Object.freeze({ kneeRad: parameter(this.context, "brace-knee-rad"),
      ankleRad: parameter(this.context, "brace-ankle-rad"),
      soleRad: parameter(this.context, "brace-sole-rad") });
    this.cutAdvanceFraction = parameter(this.context, "cut-advance-fraction");
    const targetX = fact(this.context, "opponent-local-x");
    const blockerX = fact(this.context, "opponent-blocker-local-x");
    this.lane = this.context.view.facts["opponent-blocker-present"] === true
      ? Object.freeze({ kind: "blocker-relative" as const,
        blockerSide: blockerX - targetX < 0 ? "left" as const : "right" as const })
      : Object.freeze({ kind: "open-torso" as const });
    this.refreshPath(true);
    this.validatePath();
    this.begin("chamber");
  }

  private refreshPath(required = false): void {
    const target = {
      x: fact(this.context, "opponent-local-x"),
      y: fact(this.context, "opponent-local-y") + parameter(this.context,
        this.lane.kind === "blocker-relative"
          ? "blocker-target-height-offset-m" : "target-height-offset-m"),
      z: fact(this.context, "opponent-local-z"),
    };
    const lane: TwinbladeLane = this.lane.kind === "open-torso"
      ? this.lane
      : Object.freeze({ kind: "blocker-relative", blocker: Object.freeze({
        // Lane identity is an admission fact. Fresh blocker noise may not swap the two blades
        // midway through one Action, so subsequent phase edges preserve only its measured side.
        x: target.x + (this.lane.blockerSide === "left" ? -0.10 : 0.10),
        y: target.y, z: target.z,
      }) });
    const candidate = solveTwinbladeScissorCutPath(target, lane, this.pathTuning);
    const reachable = (["left", "right"] as const).every((side) =>
      (["chamber", "commit"] as const).every((phase) => {
        const solution = candidate[side][phase];
        const yaw = reading(this.context, this.joints[side].yaw);
        const pitch = reading(this.context, this.joints[side].pitch);
        return solution.yawRad >= yaw.minRad && solution.yawRad <= yaw.maxRad &&
          solution.pitchRad >= pitch.minRad && solution.pitchRad <= pitch.maxRad;
      }));
    if (reachable) this.path = candidate;
    else if (required) throw new Error("Twinblade target is outside declared joint limits");
  }

  private solution(side: TwinbladeSide): SweepCentreSolution {
    if (this.phase === "recover") return Object.freeze({ yawRad: 0, pitchRad: 0, bladeRadiusM: 0 });
    if (this.phase === "chamber") return this.path[side].chamber;
    if (this.phase === "first-cut") {
      return side === this.path.blockerSide ? this.path[side].commit : this.path[side].chamber;
    }
    if (this.phase === "second-cut") {
      // The first blade cannot remain parked through the target while the second blade tries
      // to occupy the same finite body. That was a scissor only in target-space: Havok kept
      // the first sword embedded against the torso and the closing sword stopped on the hand
      // or on its partner. Clear the completed stroke back to chamber as the other blade cuts.
      return side === this.path.blockerSide ? this.path[side].chamber : this.path[side].commit;
    }
    return this.path[side].commit;
  }
  private validatePath(): void {
    for (const side of ["left", "right"] as const) for (const phase of ["chamber", "commit"] as const) {
      const solution = this.path[side][phase];
      const yaw = reading(this.context, this.joints[side].yaw);
      const pitch = reading(this.context, this.joints[side].pitch);
      if (solution.yawRad < yaw.minRad || solution.yawRad > yaw.maxRad ||
          solution.pitchRad < pitch.minRad || solution.pitchRad > pitch.maxRad) {
        throw new Error(`Twinblade ${side} ${phase} target is outside declared joint limits`);
      }
    }
  }
  private begin(phase: Exclude<Phase, "cancelled">): void {
    this.phase = phase; this.elapsedS = 0;
    if (phase === "complete") return;
    let travelS = 0;
    for (const side of ["left", "right"] as const) {
      const solution = this.solution(side);
      const yaw = reading(this.context, this.joints[side].yaw);
      const pitch = reading(this.context, this.joints[side].pitch);
      travelS = Math.max(travelS,
        Math.abs(yaw.angleRad - solution.yawRad) / (yaw.maxSpeedRadS * this.motorSpeedFraction),
        Math.abs(pitch.angleRad - solution.pitchRad) / (pitch.maxSpeedRadS * this.motorSpeedFraction));
    }
    this.phaseLimitS = Math.max(travelS * this.travelMultiplier + this.settleAllowanceS,
      phase === "first-cut" || phase === "second-cut" ? TWINBLADE_MINIMUM_CUT_PHASE_S : 0);
  }
  step(dt: number): void {
    if (this.pendingPhase) {
      const phase = this.pendingPhase;
      this.pendingPhase = null;
      if (phase === "first-cut" || phase === "second-cut") this.refreshPath();
      this.begin(phase);
    }
    if (this.phase === "complete" || this.phase === "cancelled") return;
    // The combined cut owns `resource:balance`, so in supported mode it must keep the same
    // zero-velocity carrier authority as the brace it replaces. In legacy mode there is no
    // carrier to feed and the established motor-only cut remains available.
    if (this.context.locomotion.available) {
      this.context.locomotion.request({ localForward: this.cutAdvanceFraction,
        localRight: 0, yaw: 0, recover: this.context.view.facts["core-upright"] === false });
    }
    this.elapsedS += dt;
    const braceError = writeBipedBrace(this.context, this.bracePose);
    let greatest = braceError;
    for (const side of ["left", "right"] as const) {
      const solution = this.solution(side);
      for (const [axis, angleRad] of [["yaw", solution.yawRad], ["pitch", solution.pitchRad]] as const) {
        const joint = this.joints[side][axis]; const row = reading(this.context, joint);
        greatest = Math.max(greatest, Math.abs(row.angleRad - angleRad));
        this.context.motors.write({ joint, angleRad,
          maxSpeedRadS: row.maxSpeedRadS * this.motorSpeedFraction,
          maxForceNm: row.maxForceNm * this.motorForceFraction });
      }
    }
    this.progress = greatest;
    if (this.elapsedS < this.phaseLimitS) return;
    // Keep the diagnostic on the phase that authored this step's motor targets.
    // The next scheduler step changes phase before it writes the new targets, so
    // a collision cannot label the last chamber command as a commit command.
    this.pendingPhase = this.phase === "chamber" ? "first-cut" : this.phase === "first-cut" ? "second-cut" :
      this.phase === "second-cut" ? "recover" : "complete";
  }
  done(): boolean { return this.phase === "complete"; }
  cancel(reason: string): void { this.cancelled = reason; this.pendingPhase = null; this.phase = "cancelled"; }
  diagnostic(): ControllerDiagnostic { return { phase: this.phase,
    detail: this.cancelled || `${this.path?.lane ?? "unknown"} ${this.path?.blockerSide ?? "unknown"}; ${this.elapsedS.toFixed(3)} s`,
    progress: this.progress, epsilon: 0.04 }; }
}

export const TWINBLADE_COMBAT_CONTROLLERS: readonly ControllerFactory[] = Object.freeze([
  Object.freeze({ name: "twinblade-neutral-hold",
    create: (context: ControllerContext) => new TwinbladeNeutralController(context) }),
  Object.freeze({ name: "twinblade-scissor-cut",
    create: (context: ControllerContext) => new TwinbladeScissorCutController(context) }),
]);
