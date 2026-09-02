import type { ActionController, ControllerContext, ControllerFactory, ControllerDiagnostic,
  JointReading } from "./scheduler.ts";
import type { ParameterSpec } from "./actions.ts";
import { BIPED_CONTROLLERS, SUPPORTED_BIPED_LIMP_V1 } from "./biped.ts";
import { LOCOMOTION_CONTROLLERS, SUPPORTED_QUADRUPED_CRAWL_V1 } from "./locomotion.ts";
import { MOUNT_CONTROLLERS } from "./mounts.ts";
import { TWINBLADE_COMBAT_CONTROLLERS } from "./twinblade-combat.ts";

export type ControllerRole = "any-joints" | "one-rotational-joint" | "quadruped" | "biped" | "two-axis-mount";

export interface ControllerCompatibility {
  readonly controller: string;
  readonly role: ControllerRole;
  readonly minimumJoints: number;
  readonly minimumModules: number;
  readonly requiredParameters: readonly string[];
  /** UI-readable role cardinalities. The controller remains the authority when it starts. */
  readonly bindings: readonly Readonly<{
    readonly role: string;
    readonly repeat: "once" | "at-least-three";
    readonly joints: number;
    readonly modules: number;
    readonly allowAdditionalModules?: boolean;
  }>[];
  /** Exact saved parameter descriptors used to seed a new Action form. */
  readonly parameters: Readonly<Record<string, ParameterSpec>>;
  readonly supportedLocomotion?: Readonly<{
    readonly gaitStabilityScale: number;
    readonly brace: boolean;
    /** Descriptor-owned exclusion; the Forge and runtime read this without controller-name dispatch. */
    readonly alternative?: Readonly<{
      readonly family: string;
      readonly rank: "primary" | "fallback";
    }>;
  }>;
}

export const ARBALEST_LEFT_SWORD_GUARD = Object.freeze({
  shoulder: -0.35, elbow: -0.65, wrist: 0.35, palm: -0.15,
});

/**
 * The Swordbearer has no imaginary second weapon.  Its ordinary stone forearm is instead held
 * forward at the vital plate while the mounted sword works.  The four X-axis hinges can make an
 * honest forward-side intercept, but cannot secretly cross the chassis laterally.  This is
 * intentionally a posture only:
 * enemy blades still meet the real arm collider, but the action neither arms a scorer nor creates
 * a hidden shield body.
 */
export const HUMANOID_OFFHAND_GUARD = Object.freeze({
  shoulder: -0.55, elbow: -0.90, wrist: 0.50, palm: -0.25,
});

/**
 * A fall can carry an otherwise level blade back across the core.  The stow Action begins in
 * its ordinary level lane, then latches its alternate declared pitch before the live semantic
 * sword/core clearance reaches zero.  This is a bounded safety interlock over published body
 * facts, not an attempt to move a mesh or to solve the ragdoll from the controller.
 */
export const MOUNT_SAFE_HOLD_V1 = Object.freeze({ minimumClearanceM: 0.05 });

export const ARBALEST_LEFT_SWORD_LANE = Object.freeze({ x: -0.34, toleranceM: 0.08,
  waitForLaneS: 0.15 });
const ARBALEST_LEFT_SWORD_DRIVE_CLEARANCE_M = 0.12;

export const HUMANOID_LEFT_SWORD_SWEEP_V1 = Object.freeze({
  chamberS: 0.34,
  commitS: 0.32,
  recoverS: 0.24,
  guard: ARBALEST_LEFT_SWORD_GUARD,
  chamberHeightOffsetM: 0.38,
  commitHeightOffsetM: -0.28,
  chamberDepthOffsetM: 0,
  commitDepthOffsetM: 0,
});

export const WARDEN_SHIELD_BASH_V1 = Object.freeze({
  chamberS: 0.16,
  driveS: 0.12,
  holdS: 0.10,
  recoverS: 0.22,
  chamberRad: -0.42,
  driveRad: 0.52,
  recoverRad: 0.30,
});

type LeftSwordPose = Readonly<{ shoulder: number; elbow: number; wrist: number; palm: number }>;

const LEFT_SWORD_LIMITS = Object.freeze({
  shoulder: Object.freeze([-0.95, 0.95] as const),
  elbow: Object.freeze([-1.25, 0.35] as const),
  wrist: Object.freeze([-0.75, 0.75] as const),
  palm: Object.freeze([-0.55, 0.55] as const),
});

/**
 * The Arbalest's ordinary arm is four X hinges, so its sword tip has one honest
 * planar target and no hidden lateral actuator. This forward model is the exact
 * authored shoulder/elbow/wrist/palm chain from `humanoid.ts`, including the
 * hand socket and the unscaled 1.105 m sword. A bounded coordinate descent is
 * cheap at Action admission and turns the snapshotted opponent point into four
 * joint targets without reaching into a body or solver.
 */
export function solveArbalestLeftSwordPose(target: Readonly<{ y: number; z: number }>): LeftSwordPose {
  if (!Number.isFinite(target.y) || !Number.isFinite(target.z)) {
    throw new Error("Arbalest left-sword target must be finite");
  }
  const roles = Object.freeze(["shoulder", "elbow", "wrist", "palm"] as const);
  const desiredY = Math.max(-0.60, Math.min(0.72, target.y));
  const desiredZ = Math.max(0.75, Math.min(2.18, target.z));
  const point = (pose: LeftSwordPose): readonly [number, number] => {
    let y = 0.25;
    let z = 0;
    let angle = 0;
    for (const [role, length] of [["shoulder", 0.55], ["elbow", 0.45],
      ["wrist", 0.20]] as const) {
      angle += pose[role];
      y -= length * Math.cos(angle);
      z -= length * Math.sin(angle);
    }
    angle += pose.palm;
    // Palm child frame [0, 0.08, 0.03], sword socket [0, 0, 0.10]
    // and 1.105 m tip combine to this terminal vector.
    y += -0.08 * Math.cos(angle) - 1.175 * Math.sin(angle);
    z += -0.08 * Math.sin(angle) + 1.175 * Math.cos(angle);
    return [y, z];
  };
  const score = (pose: LeftSwordPose): number => {
    const [y, z] = point(pose);
    return (y - desiredY) ** 2 + (z - desiredZ) ** 2;
  };
  let pose: LeftSwordPose = { ...ARBALEST_LEFT_SWORD_GUARD };
  let increment = 0.45;
  for (let iteration = 0; iteration < 48; iteration += 1) {
    for (const role of roles) for (const direction of [-1, 1]) {
      const limits = LEFT_SWORD_LIMITS[role];
      const candidate = { ...pose,
        [role]: Math.max(limits[0], Math.min(limits[1], pose[role] + direction * increment)) };
      if (score(candidate) < score(pose)) pose = candidate;
    }
    increment *= 0.88;
  }
  return Object.freeze(pose);
}

const reading = (context: ControllerContext, joint: string): JointReading => {
  const value = context.view.joints[joint];
  if (!value) throw new Error(`controller "${context.action.controller}" cannot read joint "${joint}"`);
  return value;
};

const oneBoundJoint = (context: ControllerContext, role: string): string => {
  const binding = context.group.bindings[role];
  if (!binding || binding.joints.length !== 1) {
    throw new Error(`group "${context.group.id}" needs one joint bound as "${role}"`);
  }
  return binding.joints[0];
};

const clampedWrite = (context: ControllerContext, joint: string, angleRad: number): number => {
  const value = reading(context, joint);
  const clamped = Math.max(value.minRad, Math.min(value.maxRad, angleRad));
  context.motors.write({ joint, angleRad: clamped,
    maxSpeedRadS: value.maxSpeedRadS, maxForceNm: value.maxForceNm });
  return Math.abs(value.angleRad - clamped);
};

class HumanoidLeftSwordSweepController implements ActionController {
  private readonly context: ControllerContext;
  private readonly joints: Readonly<Record<keyof LeftSwordPose, string>>;
  private target: Readonly<{ x: number; y: number; z: number }>;
  private committed: boolean;
  private chamber: LeftSwordPose;
  private commit: LeftSwordPose;
  private elapsed = 0;
  private phase = "ready";
  private cancelled = "";
  private progress = Number.POSITIVE_INFINITY;

  constructor(context: ControllerContext) {
    this.context = context;
    this.joints = Object.freeze({ shoulder: oneBoundJoint(context, "shoulder"),
      elbow: oneBoundJoint(context, "elbow"), wrist: oneBoundJoint(context, "wrist"),
      palm: oneBoundJoint(context, "palm") });
    this.target = this.readTarget();
    this.committed = context.view.facts["core-upright"] === true &&
      this.target.x >= ARBALEST_LEFT_SWORD_LANE.x - ARBALEST_LEFT_SWORD_LANE.toleranceM &&
      this.target.x <= ARBALEST_LEFT_SWORD_LANE.x + ARBALEST_LEFT_SWORD_LANE.toleranceM;
    this.chamber = solveArbalestLeftSwordPose({
      y: this.target.y + HUMANOID_LEFT_SWORD_SWEEP_V1.chamberHeightOffsetM,
      z: this.target.z + HUMANOID_LEFT_SWORD_SWEEP_V1.chamberDepthOffsetM,
    });
    this.commit = solveArbalestLeftSwordPose({
      y: this.target.y + HUMANOID_LEFT_SWORD_SWEEP_V1.commitHeightOffsetM,
      z: this.target.z + HUMANOID_LEFT_SWORD_SWEEP_V1.commitDepthOffsetM,
    });
  }

  private readTarget(): Readonly<{ x: number; y: number; z: number }> {
    const fact = (id: string): number => {
      const value = this.context.view.facts[id];
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`humanoid-left-sword-sweep requires finite fact "${id}"`);
      }
      return value;
    };
    return Object.freeze({ x: fact("opponent-local-x"), y: fact("opponent-local-y"),
      z: fact("opponent-local-z") });
  }

  private snapshotPoses(target: Readonly<{ y: number; z: number }>): void {
    this.chamber = solveArbalestLeftSwordPose({
      y: target.y + HUMANOID_LEFT_SWORD_SWEEP_V1.chamberHeightOffsetM,
      z: target.z + HUMANOID_LEFT_SWORD_SWEEP_V1.chamberDepthOffsetM,
    });
    this.commit = solveArbalestLeftSwordPose({
      y: target.y + HUMANOID_LEFT_SWORD_SWEEP_V1.commitHeightOffsetM,
      z: target.z + HUMANOID_LEFT_SWORD_SWEEP_V1.commitDepthOffsetM,
    });
  }

  private clearForDrive(): boolean {
    const clearance = this.context.view.facts["left-sword-clearance-m"];
    return this.context.view.facts["left-sword-clear"] === true &&
      (typeof clearance !== "number" || !Number.isFinite(clearance) ||
        clearance >= ARBALEST_LEFT_SWORD_DRIVE_CLEARANCE_M);
  }

  enter(): void {
    if (this.committed && !this.clearForDrive()) throw new Error("self-blocked");
    this.phase = this.committed ? "chamber" : "aligning";
  }

  private writePose(pose: LeftSwordPose): void {
    this.progress = Math.max(...Object.entries(pose).map(([role, angle]) =>
      clampedWrite(this.context, this.joints[role as keyof LeftSwordPose], angle)));
  }

  step(dt: number): void {
    if (this.cancelled !== "") return;
    this.elapsed += dt;
    const tuning = HUMANOID_LEFT_SWORD_SWEEP_V1;
    const liveRange = this.context.view.facts["opponent-range"];
    if (this.context.view.facts["line-of-sight"] !== true || typeof liveRange !== "number" ||
        !Number.isFinite(liveRange) || liveRange >= 2.60) {
      this.writePose(tuning.guard);
      this.phase = "complete";
      this.progress = 0;
      return;
    }
    // Melee opportunity is a cadence edge, while an X-hinge arm still cannot attack outside
    // its shoulder plane. Keep this admitted Action in guard while locomotion turns, then take
    // one fresh centre snapshot at the actual lane crossing. Completing short off-lane cycles
    // let the last cycle disappear exactly when a late opportunity arrived; snapshotting before
    // the turn instead committed toward a point the four X hinges could never reach.
    if (!this.committed) {
      // Locomotion can move the torso into a once-safe guard while this Action waits for its
      // four-X-hinge lane. End the armed interval before writing another pose: throwing here
      // would turn ordinary moving-body occlusion into a controller fault, while continuing to
      // drive the guard was the measured late self-crossing in the frozen Arbalest mirror.
      if (!this.clearForDrive()) {
        this.phase = "complete";
        this.progress = 0;
        return;
      }
      const target = this.readTarget();
      const inLane = target.x >= ARBALEST_LEFT_SWORD_LANE.x - ARBALEST_LEFT_SWORD_LANE.toleranceM &&
        target.x <= ARBALEST_LEFT_SWORD_LANE.x + ARBALEST_LEFT_SWORD_LANE.toleranceM;
      if (this.context.view.facts["core-upright"] === true && inLane) {
        this.target = target;
        this.snapshotPoses(target);
        this.committed = true;
        this.elapsed = 0;
        this.phase = "chamber";
        this.writePose(this.chamber);
      } else if (this.elapsed < ARBALEST_LEFT_SWORD_LANE.waitForLaneS) this.phase = "aligning";
      else { this.phase = "complete"; this.progress = 0; }
      return;
    }
    if (!this.clearForDrive()) {
      this.phase = "complete";
      this.progress = 0;
      return;
    }
    if (this.elapsed < tuning.chamberS) {
      this.phase = "chamber";
      this.writePose(this.chamber);
    } else if (this.elapsed < tuning.chamberS + tuning.commitS) {
      this.phase = "commit";
      this.writePose(this.commit);
    } else if (this.elapsed < tuning.chamberS + tuning.commitS + tuning.recoverS) {
      this.phase = "recover";
      this.writePose(tuning.guard);
    } else {
      this.phase = "complete";
      this.progress = 0;
      this.writePose(tuning.guard);
    }
  }

  done(): boolean { return this.phase === "complete"; }
  cancel(reason: string): void { this.cancelled = reason; this.phase = "cancelled"; }
  diagnostic(): ControllerDiagnostic {
    return { phase: this.phase,
      detail: this.cancelled || `snap target ${this.target.x.toFixed(3)},${this.target.y.toFixed(3)},${this.target.z.toFixed(3)}`,
      progress: this.progress, epsilon: 0.04 };
  }
}

class WardenShieldBashController implements ActionController {
  private readonly context: ControllerContext;
  private readonly bearing: string;
  private elapsed = 0;
  private phase = "ready";
  private cancelled = "";
  private progress = Number.POSITIVE_INFINITY;

  constructor(context: ControllerContext) {
    this.context = context;
    this.bearing = oneBoundJoint(context, "bearing");
  }

  enter(): void { this.phase = "chamber"; }

  step(dt: number): void {
    if (this.cancelled !== "") return;
    this.elapsed += dt;
    const tuning = WARDEN_SHIELD_BASH_V1;
    let target: number = tuning.recoverRad;
    if (this.elapsed < tuning.chamberS) { this.phase = "chamber"; target = tuning.chamberRad; }
    else if (this.elapsed < tuning.chamberS + tuning.driveS) { this.phase = "drive"; target = tuning.driveRad; }
    else if (this.elapsed < tuning.chamberS + tuning.driveS + tuning.holdS) {
      this.phase = "hold"; target = tuning.driveRad;
    } else if (this.elapsed < tuning.chamberS + tuning.driveS + tuning.holdS + tuning.recoverS) {
      this.phase = "recover";
    } else { this.phase = "complete"; }
    this.progress = clampedWrite(this.context, this.bearing, target);
  }

  done(): boolean { return this.phase === "complete"; }
  cancel(reason: string): void { this.cancelled = reason; this.phase = "cancelled"; }
  diagnostic(): ControllerDiagnostic { return { phase: this.phase,
    detail: this.cancelled || `${this.elapsed.toFixed(3)} s`, progress: this.progress, epsilon: 0.04 }; }
}

class JointController {
  private readonly context: ControllerContext;
  private readonly targets: Readonly<Record<string, number>>;
  private phase = "ready";
  private cancelled = "";
  private progress = Number.POSITIVE_INFINITY;
  private readonly completeWhenSettled: boolean;

  constructor(context: ControllerContext, targets: Readonly<Record<string, number>>, completeWhenSettled = false) {
    this.context = context;
    this.targets = targets;
    this.completeWhenSettled = completeWhenSettled;
  }

  enter(): void { this.phase = "converging"; }

  step(): void {
    if (this.cancelled !== "") return;
    let settled = true;
    let greatestError = 0;
    for (const [jointId, target] of Object.entries(this.targets)) {
      const reading = this.context.view.joints[jointId];
      if (!reading) throw new Error(`controller "${this.context.action.controller}" cannot read joint "${jointId}"`);
      const angle = Math.max(reading.minRad, Math.min(reading.maxRad, target));
      const error = Math.abs(angle - reading.angleRad);
      greatestError = Math.max(greatestError, error);
      if (error > 0.01 || Math.abs(reading.speedRadS) > 0.04) settled = false;
      this.context.motors.write({
        joint: jointId,
        angleRad: angle,
        maxSpeedRadS: reading.maxSpeedRadS,
        maxForceNm: reading.maxForceNm,
      });
    }
    this.phase = settled ? "holding" : "converging";
    this.progress = greatestError;
  }

  done(): boolean { return this.completeWhenSettled && this.phase === "holding"; }
  cancel(reason: string): void { this.cancelled = reason; this.phase = "cancelled"; }
  diagnostic(): ControllerDiagnostic {
    return { phase: this.phase, detail: this.cancelled || `${Object.keys(this.targets).length} motor target(s)`,
      progress: this.progress, epsilon: 0.002 };
  }
}

/** A held mount pose may react only to the saved body's published semantic clearance, never to meshes. */
class MountSafeHoldController implements ActionController {
  private readonly context: ControllerContext;
  private readonly yaw: string;
  private readonly pitch: string;
  private readonly yawTarget: number;
  private readonly levelPitchTarget: number;
  private readonly tiltedPitchTarget: number;
  private readonly minimumClearanceM: number;
  private tilted = false;
  private phase = "ready";
  private cancelled = "";
  private progress = Number.POSITIVE_INFINITY;

  constructor(context: ControllerContext) {
    this.context = context;
    this.yaw = oneBoundJoint(context, "yaw"); this.pitch = oneBoundJoint(context, "pitch");
    this.yawTarget = numberParameter(context, "yaw");
    this.levelPitchTarget = numberParameter(context, "pitch");
    this.tiltedPitchTarget = numberParameter(context, "tilted-pitch");
    this.minimumClearanceM = numberParameter(context, "minimum-clearance-m");
  }

  enter(): void { this.phase = "stowing"; }

  step(): void {
    if (this.cancelled !== "") return;
    const clearance = this.context.view.facts["sword-core-clearance-m"];
    // Latch rather than alternate: changing target back and forth near one solver sample made
    // the recovery mount buzz through the core. The requested threshold remains an authored,
    // inspectable Action parameter and cannot be narrower than the controller's measured floor.
    if (typeof clearance === "number" && Number.isFinite(clearance) &&
        clearance <= Math.max(this.minimumClearanceM, MOUNT_SAFE_HOLD_V1.minimumClearanceM)) this.tilted = true;
    const targetPitch = this.tilted ? this.tiltedPitchTarget : this.levelPitchTarget;
    this.progress = Math.max(clampedWrite(this.context, this.yaw, this.yawTarget),
      clampedWrite(this.context, this.pitch, targetPitch));
    this.phase = this.progress <= 0.01 ? "holding" : "stowing";
  }

  // A recovery controller must retain its safe hold for the whole fallen interval. Completing on
  // convergence immediately re-admitted a new stow instance every tick and produced a noisy,
  // physically weaker motor target.
  done(): boolean { return false; }
  cancel(reason: string): void { this.cancelled = reason; this.phase = "cancelled"; }
  diagnostic(): ControllerDiagnostic { return { phase: this.phase,
    detail: this.cancelled || `${this.tilted ? "clearance" : "level"} mount hold`,
    progress: this.progress, epsilon: 0.01 }; }
}

const numberParameter = (context: ControllerContext, name: string): number => {
  const value = context.request.parameters[name];
  if (typeof value !== "number") throw new Error(`controller "${context.action.controller}" requires numeric parameter "${name}"`);
  return value;
};

const choiceParameter = (context: ControllerContext, name: string): string => {
  const value = context.request.parameters[name];
  if (typeof value !== "string") throw new Error(`controller "${context.action.controller}" requires choice parameter "${name}"`);
  return value;
};

export const CONTROLLER_COMPATIBILITY: readonly ControllerCompatibility[] = Object.freeze([
  Object.freeze({ controller: "hold-joints", role: "any-joints", minimumJoints: 1, minimumModules: 0,
    requiredParameters: Object.freeze([]), bindings: Object.freeze([]), parameters: Object.freeze({}) }),
  Object.freeze({ controller: "turn-joint-to-angle", role: "one-rotational-joint", minimumJoints: 1, minimumModules: 0,
    requiredParameters: Object.freeze(["joint", "angle-rad"]), bindings: Object.freeze([]),
    parameters: Object.freeze({
      joint: Object.freeze({ kind: "enum", values: Object.freeze(["replace-with-group-joint"]) }),
      "angle-rad": Object.freeze({ kind: "number", min: -3.14159, max: 3.14159, unit: "radians" }),
    }) }),
  Object.freeze({ controller: "arbalest-left-sword-guard", role: "any-joints", minimumJoints: 4, minimumModules: 1,
    requiredParameters: Object.freeze(["shoulder", "elbow", "wrist", "palm"]), bindings: Object.freeze([]),
    parameters: Object.freeze(Object.fromEntries(["shoulder", "elbow", "wrist", "palm"].map((name) => [name,
      Object.freeze({ kind: "number" as const, min: -1.25, max: 0.95, unit: "radians" as const })]))),
  }),
  Object.freeze({ controller: "humanoid-offhand-guard", role: "any-joints", minimumJoints: 4, minimumModules: 0,
    requiredParameters: Object.freeze([]), bindings: Object.freeze([
      ...(["shoulder", "elbow", "wrist", "palm"] as const).map((role) =>
        Object.freeze({ role, repeat: "once" as const, joints: 1, modules: 0 })),
    ]), parameters: Object.freeze({}) }),
  Object.freeze({ controller: "mount-safe-hold", role: "two-axis-mount", minimumJoints: 2,
    minimumModules: 1, requiredParameters: Object.freeze(["yaw", "pitch", "tilted-pitch", "minimum-clearance-m"]), bindings: Object.freeze([
      Object.freeze({ role: "yaw", repeat: "once", joints: 1, modules: 0 }),
      Object.freeze({ role: "pitch", repeat: "once", joints: 1, modules: 0 }),
    ]), parameters: Object.freeze({
      yaw: Object.freeze({ kind: "number", min: -2.5, max: 2.5, unit: "radians" }),
      pitch: Object.freeze({ kind: "number", min: -0.75, max: 1.65, unit: "radians" }),
      "tilted-pitch": Object.freeze({ kind: "number", min: -0.75, max: 1.65, unit: "radians" }),
      "minimum-clearance-m": Object.freeze({ kind: "number", min: 0.006, max: 0.20, unit: "metres" }),
    }) }),
  Object.freeze({ controller: "arbalest-launcher-neutral", role: "two-axis-mount",
    minimumJoints: 2, minimumModules: 1, requiredParameters: Object.freeze([]),
    bindings: Object.freeze([
      Object.freeze({ role: "yaw", repeat: "once" as const, joints: 1, modules: 0 }),
      Object.freeze({ role: "pitch", repeat: "once" as const, joints: 1, modules: 0 }),
      Object.freeze({ role: "output", repeat: "once" as const, joints: 0, modules: 1,
        allowAdditionalModules: true }),
    ]), parameters: Object.freeze({}) }),
  Object.freeze({ controller: "arbalest-left-sword-neutral", role: "any-joints",
    minimumJoints: 4, minimumModules: 1, requiredParameters: Object.freeze([]),
    bindings: Object.freeze([
      ...(["shoulder", "elbow", "wrist", "palm"] as const).map((role) =>
        Object.freeze({ role, repeat: "once" as const, joints: 1, modules: 0 })),
      Object.freeze({ role: "sword", repeat: "once" as const, joints: 0, modules: 1 }),
    ]), parameters: Object.freeze({}) }),
  Object.freeze({ controller: "humanoid-left-sword-sweep", role: "any-joints", minimumJoints: 4, minimumModules: 1,
    requiredParameters: Object.freeze([]), bindings: Object.freeze([
      ...(["shoulder", "elbow", "wrist", "palm"] as const).map((role) =>
        Object.freeze({ role, repeat: "once" as const, joints: 1, modules: 0 })),
      Object.freeze({ role: "sword", repeat: "once" as const, joints: 0, modules: 1 }),
    ]), parameters: Object.freeze({}) }),
  Object.freeze({ controller: "warden-shield-bash", role: "one-rotational-joint", minimumJoints: 1, minimumModules: 1,
    requiredParameters: Object.freeze([]), bindings: Object.freeze([
      Object.freeze({ role: "bearing", repeat: "once" as const, joints: 1, modules: 1 }),
    ]), parameters: Object.freeze({}) }),
  ...["quadruped-move", "quadruped-turn", "brace", "recover"].map((controller): ControllerCompatibility => Object.freeze({
    controller, role: "quadruped" as const, minimumJoints: 12, minimumModules: 3,
    requiredParameters: Object.freeze(controller === "quadruped-move" ? ["forward", "right", "speed"]
      : controller === "quadruped-turn" ? ["yaw"] : []),
    bindings: Object.freeze([Object.freeze({ role: "limb", repeat: "at-least-three" as const, joints: 4, modules: 1 })]),
    parameters: Object.freeze(controller === "quadruped-move" ? {
      forward: Object.freeze({ kind: "number" as const, min: -1, max: 1, unit: "scalar" as const }),
      right: Object.freeze({ kind: "number" as const, min: -1, max: 1, unit: "scalar" as const }),
      speed: Object.freeze({ kind: "number" as const, min: 0, max: 2.2, unit: "metres-per-second" as const }),
    } : controller === "quadruped-turn" ? {
      yaw: Object.freeze({ kind: "number" as const, min: -1, max: 1, unit: "scalar" as const }),
    } : {}) as Readonly<Record<string, ParameterSpec>>,
  })),
  ...["supported-quadruped-move", "supported-quadruped-turn", "supported-quadruped-brace",
    "supported-quadruped-recover"].map((controller): ControllerCompatibility => Object.freeze({
    controller, role: "quadruped" as const, minimumJoints: 13, minimumModules: 3,
    requiredParameters: Object.freeze(controller === "supported-quadruped-move" ? ["forward", "right", "speed"]
      : controller === "supported-quadruped-turn" ? ["yaw"] : []),
    bindings: Object.freeze([
      Object.freeze({ role: "limb", repeat: "at-least-three" as const, joints: 4, modules: 1 }),
      Object.freeze({ role: "balance-chain", repeat: "once" as const, joints: 1, modules: 0 }),
    ]),
    parameters: Object.freeze(controller === "supported-quadruped-move" ? {
      forward: Object.freeze({ kind: "number" as const, min: -1, max: 1, unit: "scalar" as const }),
      right: Object.freeze({ kind: "number" as const, min: -1, max: 1, unit: "scalar" as const }),
      speed: Object.freeze({ kind: "number" as const, min: 0, max: 1.6, unit: "metres-per-second" as const }),
    } : controller === "supported-quadruped-turn" ? {
      yaw: Object.freeze({ kind: "number" as const, min: -1, max: 1, unit: "scalar" as const }),
    } : {}) as Readonly<Record<string, ParameterSpec>>,
    supportedLocomotion: Object.freeze({ gaitStabilityScale: 1,
      brace: controller === "supported-quadruped-brace",
      ...(controller === "supported-quadruped-move" ? {
        alternative: Object.freeze({ family: "supported-quadruped-move", rank: "primary" as const }),
      } : {}),
    }),
  })),
  Object.freeze({ controller: "supported-quadruped-crawl", role: "quadruped" as const,
    minimumJoints: 13, minimumModules: 3,
    requiredParameters: Object.freeze(["forward", "right", "yaw", "speed"]),
    bindings: Object.freeze([
      Object.freeze({ role: "limb", repeat: "at-least-three" as const, joints: 4, modules: 1 }),
      Object.freeze({ role: "balance-chain", repeat: "once" as const, joints: 1, modules: 0 }),
    ]),
    parameters: Object.freeze({
      forward: Object.freeze({ kind: "number" as const, min: -1, max: 1, unit: "scalar" as const }),
      right: Object.freeze({ kind: "number" as const, min: -1, max: 1, unit: "scalar" as const }),
      yaw: Object.freeze({ kind: "number" as const, min: -1, max: 1, unit: "scalar" as const }),
      speed: Object.freeze({ kind: "number" as const, min: 0,
        max: SUPPORTED_QUADRUPED_CRAWL_V1.MAX_SPEED_MPS, unit: "metres-per-second" as const }),
    }),
    supportedLocomotion: Object.freeze({ gaitStabilityScale: SUPPORTED_QUADRUPED_CRAWL_V1.GAIT_STABILITY_SCALE,
      brace: false,
      alternative: Object.freeze({ family: "supported-quadruped-move", rank: "fallback" as const }),
    }),
  }),
  ...["biped-move", "biped-turn", "biped-brace", "biped-recover"].map((controller): ControllerCompatibility => Object.freeze({
    controller, role: "biped" as const, minimumJoints: 8, minimumModules: 2,
    requiredParameters: Object.freeze(controller === "biped-move" ? ["forward", "right", "speed"]
      : controller === "biped-turn" ? ["yaw"] : []),
    bindings: Object.freeze([
      Object.freeze({ role: "left-foot", repeat: "once" as const, joints: 4, modules: 1 }),
      Object.freeze({ role: "right-foot", repeat: "once" as const, joints: 4, modules: 1 }),
    ]),
    parameters: Object.freeze(controller === "biped-move" ? {
      forward: Object.freeze({ kind: "number" as const, min: -1, max: 1, unit: "scalar" as const }),
      right: Object.freeze({ kind: "number" as const, min: -1, max: 1, unit: "scalar" as const }),
      speed: Object.freeze({ kind: "number" as const, min: 0, max: 1.6, unit: "metres-per-second" as const }),
    } : controller === "biped-turn" ? {
      yaw: Object.freeze({ kind: "number" as const, min: -1, max: 1, unit: "scalar" as const }),
    } : {}) as Readonly<Record<string, ParameterSpec>>,
  })),
  ...["supported-biped-move", "supported-biped-turn", "supported-biped-brace",
    "supported-biped-recover"].map((controller): ControllerCompatibility => Object.freeze({
    controller, role: "biped" as const, minimumJoints: 11, minimumModules: 2,
    requiredParameters: Object.freeze(controller === "supported-biped-move" ? ["forward", "right", "speed"]
      : controller === "supported-biped-turn" ? ["yaw"] : []),
    bindings: Object.freeze([
      Object.freeze({ role: "left-foot", repeat: "once" as const, joints: 4, modules: 1 }),
      Object.freeze({ role: "right-foot", repeat: "once" as const, joints: 4, modules: 1 }),
      Object.freeze({ role: "balance-chain", repeat: "once" as const, joints: 3, modules: 0 }),
    ]),
    parameters: Object.freeze(controller === "supported-biped-move" ? {
      forward: Object.freeze({ kind: "number" as const, min: -1, max: 1, unit: "scalar" as const }),
      right: Object.freeze({ kind: "number" as const, min: -1, max: 1, unit: "scalar" as const }),
      speed: Object.freeze({ kind: "number" as const, min: 0, max: 1.6, unit: "metres-per-second" as const }),
    } : controller === "supported-biped-turn" ? {
      yaw: Object.freeze({ kind: "number" as const, min: -1, max: 1, unit: "scalar" as const }),
    } : {}) as Readonly<Record<string, ParameterSpec>>,
    supportedLocomotion: Object.freeze({ gaitStabilityScale: 1,
      brace: controller === "supported-biped-brace",
      ...(controller === "supported-biped-move" ? {
        alternative: Object.freeze({ family: "supported-biped-move", rank: "primary" as const }),
      } : {}),
    }),
  })),
  ...(["left", "right"] as const).map((side): ControllerCompatibility => Object.freeze({
    controller: `supported-biped-limp-${side}`, role: "biped" as const,
    minimumJoints: 7, minimumModules: 1,
    requiredParameters: Object.freeze(["forward", "right", "yaw", "speed"]),
    bindings: Object.freeze([
      Object.freeze({ role: `${side}-foot`, repeat: "once" as const, joints: 4, modules: 1 }),
      Object.freeze({ role: "balance-chain", repeat: "once" as const, joints: 3, modules: 0 }),
    ]),
    parameters: Object.freeze({
      forward: Object.freeze({ kind: "number" as const, min: -1, max: 1, unit: "scalar" as const }),
      right: Object.freeze({ kind: "number" as const, min: -1, max: 1, unit: "scalar" as const }),
      yaw: Object.freeze({ kind: "number" as const, min: -1, max: 1, unit: "scalar" as const }),
      speed: Object.freeze({ kind: "number" as const, min: 0,
        max: SUPPORTED_BIPED_LIMP_V1.MAX_SPEED_MPS, unit: "metres-per-second" as const }),
    }),
    supportedLocomotion: Object.freeze({ gaitStabilityScale: SUPPORTED_BIPED_LIMP_V1.GAIT_STABILITY_SCALE,
      brace: false,
      alternative: Object.freeze({ family: "supported-biped-move", rank: "fallback" as const }),
    }),
  })),
  Object.freeze({ controller: "twinblade-scissor-cut", role: "biped" as const,
    minimumJoints: 15, minimumModules: 4,
    requiredParameters: Object.freeze(["blocker-outward-m", "cutter-chamber-cross-m",
      "cutter-chamber-drop-m", "open-lane-offset-m", "motor-speed-fraction", "motor-force-fraction",
      "travel-multiplier", "settle-allowance-s", "brace-knee-rad", "brace-ankle-rad", "brace-sole-rad"]),
    bindings: Object.freeze([
      Object.freeze({ role: "left-foot", repeat: "once" as const, joints: 4, modules: 1 }),
      Object.freeze({ role: "right-foot", repeat: "once" as const, joints: 4, modules: 1 }),
      Object.freeze({ role: "balance-chain", repeat: "once" as const, joints: 3, modules: 0 }),
      ...(["left", "right"] as const).flatMap((side) => [
        Object.freeze({ role: `${side}-yaw`, repeat: "once" as const, joints: 1, modules: 0 }),
        Object.freeze({ role: `${side}-pitch`, repeat: "once" as const, joints: 1, modules: 0 }),
        Object.freeze({ role: `${side}-sword`, repeat: "once" as const, joints: 0, modules: 1 }),
      ]),
    ]),
    parameters: Object.freeze({
      "blocker-outward-m": Object.freeze({ kind: "number" as const, min: 0.05, max: 0.70, unit: "metres" as const }),
      "cutter-chamber-cross-m": Object.freeze({ kind: "number" as const, min: 0.05, max: 0.80, unit: "metres" as const }),
      "cutter-chamber-drop-m": Object.freeze({ kind: "number" as const, min: 0, max: 0.70, unit: "metres" as const }),
      "open-lane-offset-m": Object.freeze({ kind: "number" as const, min: 0, max: 0.35, unit: "metres" as const }),
      "motor-speed-fraction": Object.freeze({ kind: "number" as const, min: 0.25, max: 1, unit: "scalar" as const }),
      "motor-force-fraction": Object.freeze({ kind: "number" as const, min: 0.25, max: 1, unit: "scalar" as const }),
      "travel-multiplier": Object.freeze({ kind: "number" as const, min: 0.5, max: 3, unit: "scalar" as const }),
      "settle-allowance-s": Object.freeze({ kind: "number" as const, min: 0, max: 0.5, unit: "seconds" as const }),
      "brace-knee-rad": Object.freeze({ kind: "number" as const, min: -0.60, max: 0.15, unit: "radians" as const }),
      "brace-ankle-rad": Object.freeze({ kind: "number" as const, min: -0.25, max: 0.35, unit: "radians" as const }),
      "brace-sole-rad": Object.freeze({ kind: "number" as const, min: -0.20, max: 0.30, unit: "radians" as const }),
    }),
    supportedLocomotion: Object.freeze({ gaitStabilityScale: 1, brace: true }),
  }),
  ...["aim-direction", "track-target", "sweep-arc", "sweep-compact-arc", "target-centred-sweep",
    "warden-sword-sweep",
    "fire-projectile", "guard-mount"].map((controller): ControllerCompatibility => Object.freeze({
    controller, role: "two-axis-mount" as const, minimumJoints: 2, minimumModules: 1,
    requiredParameters: Object.freeze(controller === "aim-direction" ? ["yaw", "pitch"]
      : controller === "sweep-arc" || controller === "sweep-compact-arc" ||
        controller === "target-centred-sweep" || controller === "warden-sword-sweep" ? ["direction"] : []),
    bindings: Object.freeze([
      Object.freeze({ role: "yaw", repeat: "once" as const, joints: 1, modules: 0 }),
      Object.freeze({ role: "pitch", repeat: "once" as const, joints: 1, modules: 0 }),
      Object.freeze({ role: "output", repeat: "once" as const, joints: 0, modules: 1, allowAdditionalModules: true }),
      ...(controller === "fire-projectile" ? [Object.freeze({ role: "launcher", repeat: "once" as const, joints: 0, modules: 1 })] : []),
      ...(controller === "guard-mount" ? [Object.freeze({ role: "sword", repeat: "once" as const, joints: 0, modules: 1 })] : []),
    ]),
    parameters: Object.freeze(controller === "aim-direction" ? {
      yaw: Object.freeze({ kind: "number" as const, min: -2.5, max: 2.5, unit: "radians" as const }),
      pitch: Object.freeze({ kind: "number" as const, min: -0.75, max: 1.65, unit: "radians" as const }),
    } : controller === "sweep-arc" || controller === "sweep-compact-arc" ||
      controller === "target-centred-sweep" || controller === "warden-sword-sweep" ? {
      direction: Object.freeze({ kind: "number" as const, min: -1, max: 1, unit: "scalar" as const }),
      ...(controller === "target-centred-sweep" ? { "target-height-offset": Object.freeze({
        kind: "number" as const, min: -0.5, max: 1, unit: "metres" as const }) } : {}),
    } : {}) as Readonly<Record<string, ParameterSpec>>,
  })),
]);

export const BOOTSTRAP_CONTROLLERS: readonly ControllerFactory[] = Object.freeze([
  Object.freeze({
    name: "hold-joints",
    create: (context: ControllerContext) => {
      const targets = Object.fromEntries(context.group.joints.flatMap((joint) => {
        const axes = Object.keys(context.view.joints).filter((id) => id.startsWith(`${joint}:`)).sort();
        const ids = axes.length > 0 ? axes : [joint];
        return ids.map((id) => {
          const reading = context.view.joints[id];
          if (!reading) throw new Error(`hold-joints cannot read joint "${id}"`);
          return [id, reading.angleRad];
        });
      }));
      return new JointController(context, targets);
    },
  }),
  Object.freeze({
    name: "turn-joint-to-angle",
    create: (context: ControllerContext) => {
      const joint = choiceParameter(context, "joint");
      if (!context.group.joints.includes(joint)) {
        throw new Error(`turn-joint-to-angle cannot use joint "${joint}" outside group "${context.group.id}"`);
      }
      const requestedAxis = context.request.parameters.axis;
      if (requestedAxis !== undefined && requestedAxis !== "x" && requestedAxis !== "y" && requestedAxis !== "z") {
        throw new Error(`turn-joint-to-angle axis must be x, y or z`);
      }
      const target = requestedAxis === undefined ? joint : `${joint}:${requestedAxis}`;
      return new JointController(context, { [target]: numberParameter(context, "angle-rad") }, true);
    },
  }),
  Object.freeze({
    name: "arbalest-left-sword-guard",
    create: (context: ControllerContext) => new JointController(context, {
      "left-shoulder": numberParameter(context, "shoulder"),
      "left-elbow": numberParameter(context, "elbow"),
      "left-wrist": numberParameter(context, "wrist"),
      "left-palm": numberParameter(context, "palm"),
    }),
  }),
  Object.freeze({
    name: "humanoid-offhand-guard",
    create: (context: ControllerContext) => new JointController(context, Object.fromEntries(
      (["shoulder", "elbow", "wrist", "palm"] as const).map((role) => [
        oneBoundJoint(context, role), HUMANOID_OFFHAND_GUARD[role],
      ]),
    )),
  }),
  // A fallen carrier keeps its ordinary attached weapon on a named motor pose instead of leaving
  // the last attack impulse free to fold the blade through its own core. The controller consumes
  // the installed self-sensor clearance fact rather than reaching into a mesh or solver. It
  // remains non-scoring: combat never treats `stow-sword` as an attack.
  Object.freeze({
    name: "mount-safe-hold",
    create: (context: ControllerContext) => new MountSafeHoldController(context),
  }),
  Object.freeze({
    name: "arbalest-launcher-neutral",
    create: (context: ControllerContext) => new JointController(context, {
      [oneBoundJoint(context, "yaw")]: 0,
      [oneBoundJoint(context, "pitch")]: 0,
    }),
  }),
  Object.freeze({
    name: "arbalest-left-sword-neutral",
    create: (context: ControllerContext) => new JointController(context, {
      [oneBoundJoint(context, "shoulder")]: ARBALEST_LEFT_SWORD_GUARD.shoulder,
      [oneBoundJoint(context, "elbow")]: ARBALEST_LEFT_SWORD_GUARD.elbow,
      [oneBoundJoint(context, "wrist")]: ARBALEST_LEFT_SWORD_GUARD.wrist,
      [oneBoundJoint(context, "palm")]: ARBALEST_LEFT_SWORD_GUARD.palm,
    }),
  }),
  Object.freeze({
    name: "humanoid-left-sword-sweep",
    create: (context: ControllerContext) => new HumanoidLeftSwordSweepController(context),
  }),
  Object.freeze({
    name: "warden-shield-bash",
    create: (context: ControllerContext) => new WardenShieldBashController(context),
  }),
]);

export const CONSTRUCT_CONTROLLERS: readonly ControllerFactory[] = Object.freeze([
  ...BOOTSTRAP_CONTROLLERS,
  ...BIPED_CONTROLLERS,
  ...LOCOMOTION_CONTROLLERS,
  ...MOUNT_CONTROLLERS,
  ...TWINBLADE_COMBAT_CONTROLLERS,
]);

/** Total controller lookup: unknown names are errors, never aliases for hold. */
export function controllerFactory(name: string): ControllerFactory {
  const factory = CONSTRUCT_CONTROLLERS.find((candidate) => candidate.name === name);
  if (!factory) throw new Error(`unknown construct controller "${name}"`);
  return factory;
}

export function compatibleControllers(joints: number, modules: number): readonly ControllerCompatibility[] {
  return CONTROLLER_COMPATIBILITY.filter((descriptor) =>
    joints >= descriptor.minimumJoints && modules >= descriptor.minimumModules
  );
}

export function supportedLocomotionControllerDescriptor(name: string): Readonly<{
  readonly controller: string; readonly gaitStabilityScale: number; readonly brace: boolean;
  readonly alternative?: Readonly<{ readonly family: string; readonly rank: "primary" | "fallback" }>;
}> | null {
  const descriptor = CONTROLLER_COMPATIBILITY.find(({ controller }) => controller === name);
  return descriptor?.supportedLocomotion
    ? Object.freeze({ controller: descriptor.controller, ...descriptor.supportedLocomotion }) : null;
}
