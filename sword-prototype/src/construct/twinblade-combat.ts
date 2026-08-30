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
  readonly blockerSide: TwinbladeSide;
  readonly cutterSide: TwinbladeSide;
  readonly left: TwinbladeArmPath;
  readonly right: TwinbladeArmPath;
}
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

/**
 * Resolve both real mount chains independently. The blocker chooses the open torso
 * lane; its near blade cuts first, then the opposite blade closes the scissor.
 */
export function solveTwinbladeScissorCutPath(
  target: Readonly<{ x: number; y: number; z: number }>,
  blocker: Readonly<{ x: number; y: number; z: number }>,
  tuning: Readonly<TwinbladeScissorCutTuning> = TWINBLADE_SCISSOR_CUT,
): TwinbladeScissorCutPath {
  if (![target.x, target.y, target.z, blocker.x, blocker.y, blocker.z].every(Number.isFinite)) {
    throw new Error("Twinblade scissor-cut geometry must be finite");
  }
  if (!Number.isFinite(tuning.openLaneOffsetM) || tuning.openLaneOffsetM < 0 ||
      tuning.openLaneOffsetM > 0.35) {
    throw new Error("Twinblade open-lane offset must be between 0 and 0.35 metres");
  }
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
      chamber: { x: target.x - sign * tuning.cutterChamberCrossM,
        y: target.y - tuning.cutterChamberDropM, z: target.z },
      commit: openLane,
    },
  };
  const path = (side: TwinbladeSide, role: "blocker" | "cutter"): TwinbladeArmPath => {
    const bind = twinbladeSwordBindMetrics(side);
    return Object.freeze({ chamber: solveSwordbearerSweepCentre(points[role].chamber, bind),
      commit: solveSwordbearerSweepCentre(points[role].commit, bind) });
  };
  return Object.freeze({ blockerSide, cutterSide,
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
    if (this.context.view.facts["line-of-sight"] !== true) {
      throw new Error("Twinblade scissor cut requires visible opponent geometry");
    }
    if (this.context.view.facts["opponent-blocker-present"] !== true) {
      throw new Error("Twinblade scissor cut requires an attached described blocker");
    }
    const tuning = Object.freeze({ ...TWINBLADE_SCISSOR_CUT,
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
    this.path = solveTwinbladeScissorCutPath({ x: fact(this.context, "opponent-local-x"),
      y: fact(this.context, "opponent-local-y"), z: fact(this.context, "opponent-local-z") },
    { x: fact(this.context, "opponent-blocker-local-x"),
      y: fact(this.context, "opponent-blocker-local-y"), z: fact(this.context, "opponent-blocker-local-z") },
    tuning);
    this.validatePath();
    this.begin("chamber");
  }

  private solution(side: TwinbladeSide): SweepCentreSolution {
    if (this.phase === "recover") return Object.freeze({ yawRad: 0, pitchRad: 0, bladeRadiusM: 0 });
    if (this.phase === "chamber") return this.path[side].chamber;
    if (this.phase === "first-cut") {
      return side === this.path.blockerSide ? this.path[side].commit : this.path[side].chamber;
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
    this.phaseLimitS = travelS * this.travelMultiplier + this.settleAllowanceS;
  }
  step(dt: number): void {
    if (this.pendingPhase) {
      const phase = this.pendingPhase;
      this.pendingPhase = null;
      this.begin(phase);
    }
    if (this.phase === "complete" || this.phase === "cancelled") return;
    // The combined cut owns `resource:balance`, so in supported mode it must keep the same
    // zero-velocity carrier authority as the brace it replaces. In legacy mode there is no
    // carrier to feed and the established motor-only cut remains available.
    if (this.context.locomotion.available) {
      this.context.locomotion.request({ localForward: 0, localRight: 0, yaw: 0, recover: false });
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
    detail: this.cancelled || `blocker ${this.path?.blockerSide ?? "unknown"}; ${this.elapsedS.toFixed(3)} s`,
    progress: this.progress, epsilon: 0.04 }; }
}

export const TWINBLADE_COMBAT_CONTROLLERS: readonly ControllerFactory[] = Object.freeze([
  Object.freeze({ name: "twinblade-neutral-hold",
    create: (context: ControllerContext) => new TwinbladeNeutralController(context) }),
  Object.freeze({ name: "twinblade-scissor-cut",
    create: (context: ControllerContext) => new TwinbladeScissorCutController(context) }),
]);
