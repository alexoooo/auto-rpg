import type { ActionController, ControllerContext, ControllerDiagnostic, ControllerFactory } from "./scheduler.ts";
import { humanoidSwordBindMetrics } from "./humanoid.ts";

export interface AimSolution {
  readonly yawRad: number;
  readonly pitchRad: number;
  readonly reachable: boolean;
  readonly reason: string | null;
}

export interface LiveLauncherAimGeometry {
  /** The actual projectile spawn point, expressed in construct-root coordinates. */
  readonly origin: Readonly<{ x: number; y: number; z: number }>;
  /** The actual compiled launcher forward axis, expressed in construct-root coordinates. */
  readonly forward: Readonly<{ x: number; y: number; z: number }>;
  readonly yawRad: number;
  readonly pitchRad: number;
}

export interface SweepCentreSolution {
  readonly yawRad: number;
  readonly pitchRad: number;
  /** Distance from the socket to the closest point on the finite blade centreline. */
  readonly bladeRadiusM: number;
}

/** A low outside feint followed by a target-centred rising cut through the head band. */
export const SWORDBEARER_TARGET_SWEEP = Object.freeze({ halfArcRad: 0.32,
  lateralOffsetM: 0.45, openingLateralOffsetM: -0.45, openingAboveM: 2.55,
  openingWeaponXAboveM: -0.10, windHeightOffsetM: -0.85, commitHeightOffsetM: 0.42 });

/** Select the outside opening feint from raw described geometry, never a host-side mirror label. */
export function swordbearerWindLateralOffset(
  rangeM: number,
  blockerPresent: boolean,
  weaponPresent: boolean,
  weaponLocalXM: number,
): number {
  if (!Number.isFinite(rangeM) || !Number.isFinite(weaponLocalXM)) {
    throw new Error("target-centred sweep opening facts must be finite");
  }
  return blockerPresent && weaponPresent && rangeM >= SWORDBEARER_TARGET_SWEEP.openingAboveM &&
    weaponLocalXM > SWORDBEARER_TARGET_SWEEP.openingWeaponXAboveM
    ? SWORDBEARER_TARGET_SWEEP.openingLateralOffsetM
    : SWORDBEARER_TARGET_SWEEP.lateralOffsetM;
}

/**
 * Put the Swordbearer's real, offset L-shaped sword chain through a root-local target.
 *
 * The yaw bearing is not at the root centre and the pitch bearing does not carry a
 * forward ray: it first drops by `pitchToSocketM`, then the ordinary sword projects
 * forward from that socket. Treating either as a camera aim produces a plausible
 * looking number that misses the torso. The finite blade radius is chosen before the
 * two-link angle, so targets inside reach are crossed by the blade rather than merely
 * pointed at by an unreachable tip.
 */
export function solveSwordbearerSweepCentre(
  target: Readonly<{ x: number; y: number; z: number }>,
  bind = humanoidSwordBindMetrics(),
): SweepCentreSolution {
  if (![target.x, target.y, target.z, bind.pitchToSocketM, bind.socketToTipM,
    ...bind.yawPivotRootM, ...bind.pitchPivotRootM].every(Number.isFinite)) {
    throw new Error("Swordbearer sweep target and bind geometry must be finite");
  }
  if (bind.pitchToSocketM < 0 || bind.socketToTipM <= 0) {
    throw new Error("Swordbearer sweep bind lengths must be positive");
  }
  const x = target.x - bind.yawPivotRootM[0];
  const z = target.z - bind.yawPivotRootM[2];
  const y = target.y - bind.pitchPivotRootM[1];
  const horizontalM = Math.hypot(x, z);
  if (horizontalM < 1e-9) throw new Error("Swordbearer sweep target cannot lie on the yaw axis");
  const radiusSquared = x * x + y * y + z * z - bind.pitchToSocketM ** 2;
  const bladeRadiusM = Math.max(0, Math.min(bind.socketToTipM,
    Math.sqrt(Math.max(0, radiusSquared))));
  const pitchRad = Math.atan2(-bind.pitchToSocketM, bladeRadiusM) - Math.atan2(y, horizontalM);
  return Object.freeze({ yawRad: Math.atan2(x, z), pitchRad, bladeRadiusM });
}

export function solveTwoAxisAim(
  direction: Readonly<{ x: number; y: number; z: number }>,
  yawLimits: readonly [number, number],
  pitchLimits: readonly [number, number],
): AimSolution {
  const length = Math.hypot(direction.x, direction.y, direction.z);
  if (!Number.isFinite(length) || length < 1e-9) throw new Error("aim direction must be finite and non-zero");
  const yawRad = Math.atan2(direction.x, direction.z);
  const pitchRad = Math.atan2(direction.y, Math.hypot(direction.x, direction.z));
  const reachable = yawRad >= yawLimits[0] && yawRad <= yawLimits[1] &&
    pitchRad >= pitchLimits[0] && pitchRad <= pitchLimits[1];
  return Object.freeze({ yawRad, pitchRad, reachable,
    reason: reachable ? null : `direction requires yaw ${yawRad.toFixed(3)} and pitch ${pitchRad.toFixed(3)} outside mount limits` });
}

const wrappedAngle = (value: number): number => Math.atan2(Math.sin(value), Math.cos(value));

/**
 * Correct a two-axis mount from the ray its compiled launcher is actually carrying.
 *
 * Target telemetry is construct-root local, but neither bearing is rooted there: the
 * muzzle is translated by both links and the projectile begins beyond the socket. The
 * current muzzle ray already contains that whole hierarchy. Converting its angular error
 * into a delta on the current joint readings makes the inverse work for either mirror and
 * keeps blueprint geometry authoritative without copying a Warden-only stand-off here.
 */
export function solveTwoAxisLauncherAim(
  target: Readonly<{ x: number; y: number; z: number }>,
  geometry: LiveLauncherAimGeometry,
  yawLimits: readonly [number, number],
  pitchLimits: readonly [number, number],
): AimSolution {
  const values = [target.x, target.y, target.z,
    geometry.origin.x, geometry.origin.y, geometry.origin.z,
    geometry.forward.x, geometry.forward.y, geometry.forward.z,
    geometry.yawRad, geometry.pitchRad, ...yawLimits, ...pitchLimits];
  if (!values.every(Number.isFinite)) throw new Error("launcher aim geometry must be finite");
  const x = target.x - geometry.origin.x;
  const y = target.y - geometry.origin.y;
  const z = target.z - geometry.origin.z;
  if (Math.hypot(x, y, z) < 1e-9) throw new Error("launcher aim target cannot lie at the muzzle");
  const forwardLength = Math.hypot(geometry.forward.x, geometry.forward.y, geometry.forward.z);
  if (forwardLength < 1e-9) throw new Error("launcher aim forward axis must be non-zero");

  const targetYaw = Math.atan2(x, z);
  const currentYaw = Math.atan2(geometry.forward.x, geometry.forward.z);
  // Positive rotation about the mount's X axis pitches Babylon's +Z forward ray down.
  const targetPitch = Math.atan2(-y, Math.hypot(x, z));
  const currentPitch = Math.atan2(-geometry.forward.y,
    Math.hypot(geometry.forward.x, geometry.forward.z));
  const yawRad = geometry.yawRad + wrappedAngle(targetYaw - currentYaw);
  const pitchRad = geometry.pitchRad + wrappedAngle(targetPitch - currentPitch);
  const reachable = yawRad >= yawLimits[0] && yawRad <= yawLimits[1] &&
    pitchRad >= pitchLimits[0] && pitchRad <= pitchLimits[1];
  return Object.freeze({ yawRad, pitchRad, reachable,
    reason: reachable ? null : `muzzle ray requires yaw ${yawRad.toFixed(3)} and pitch ${pitchRad.toFixed(3)} outside mount limits` });
}

const boundJoint = (context: ControllerContext, role: string): string => {
  const binding = context.group.bindings[role];
  if (!binding || binding.joints.length !== 1) {
    throw new Error(`group "${context.group.id}" needs one joint bound as "${role}"`);
  }
  return binding.joints[0];
};
const boundModule = (context: ControllerContext, role: string): string => {
  const binding = context.group.bindings[role];
  if (!binding || binding.modules.length !== 1) {
    throw new Error(`group "${context.group.id}" needs one module bound as "${role}"`);
  }
  return binding.modules[0];
};

class MountController implements ActionController {
  private readonly context: ControllerContext;
  private readonly mode: "aim" | "track" | "sweep" | "fire" | "guard";
  private phase = "ready";
  private elapsed = 0;
  private cancelled = "";
  private fired = false;
  private sweepPhase: "wind" | "commit" | "recover" | "complete" = "wind";
  private targetError = Number.POSITIVE_INFINITY;
  private readonly sweepArcRad: number;
  private readonly targetCentredSweep: boolean;
  private sweepWindCentreYaw = 0;
  private sweepCommitCentreYaw = 0;
  private sweepWindPitch = 0.25;
  private sweepCommitPitch = 0.25;
  private sweepWindLateralOffsetM: number = SWORDBEARER_TARGET_SWEEP.lateralOffsetM;
  private sweepCommitLateralOffsetM: number = SWORDBEARER_TARGET_SWEEP.lateralOffsetM;

  constructor(context: ControllerContext, mode: "aim" | "track" | "sweep" | "fire" | "guard",
    sweepArcRad = 0.90, targetCentredSweep = false) {
    this.context = context;
    this.mode = mode;
    this.sweepArcRad = sweepArcRad;
    this.targetCentredSweep = targetCentredSweep;
    boundJoint(context, "yaw");
    boundJoint(context, "pitch");
    if (mode === "guard") boundModule(context, "sword");
  }

  private snapshotSweepCentre(): void {
    const fact = (id: string): number => {
      const value = this.context.view.facts[id];
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`target-centred sweep requires finite fact "${id}"`);
      }
      return value;
    };
    // Exact-fresh replanting exposed one asymmetric opening: the ordinary +0.45 m lane met the
    // left historical approach's buckler, while applying -0.45 m to every cut destabilized the
    // mirrored recovery and close wall corpus. The opponent's described sword flank distinguishes
    // those opening poses without a side label. Latch it at shielded opening-range admission;
    // close cuts and unblocked opponents retain the canonical lane, and the Action never changes
    // its selected wind/commit lanes mid-swing.
    const target = { x: fact("opponent-local-x"), y: fact("opponent-local-y"),
      z: fact("opponent-local-z") };
    const wind = solveSwordbearerSweepCentre({ ...target,
      x: target.x + this.sweepWindLateralOffsetM,
      y: target.y + SWORDBEARER_TARGET_SWEEP.windHeightOffsetM });
    const commit = solveSwordbearerSweepCentre({ ...target,
      x: target.x + this.sweepCommitLateralOffsetM,
      y: target.y + SWORDBEARER_TARGET_SWEEP.commitHeightOffsetM });
    this.sweepWindCentreYaw = wind.yawRad;
    this.sweepCommitCentreYaw = commit.yawRad;
    this.sweepWindPitch = wind.pitchRad;
    this.sweepCommitPitch = commit.pitchRad;
  }

  enter(): void {
    this.phase = this.mode === "sweep" ? "wind" : "tracking";
    if (this.mode === "sweep" && this.targetCentredSweep) {
      const range = this.context.view.facts["opponent-range"];
      const weaponX = this.context.view.facts["opponent-weapon-local-x"];
      if (typeof range !== "number" || !Number.isFinite(range) ||
          typeof weaponX !== "number" || !Number.isFinite(weaponX)) {
        throw new Error("target-centred sweep opening facts must be finite");
      }
      this.sweepWindLateralOffsetM = swordbearerWindLateralOffset(range,
        this.context.view.facts["opponent-blocker-present"] === true,
        this.context.view.facts["opponent-weapon-present"] === true, weaponX);
      this.sweepCommitLateralOffsetM = SWORDBEARER_TARGET_SWEEP.lateralOffsetM;
      this.snapshotSweepCentre();
    }
  }

  private trackedTarget(yawReading: Readonly<{ minRad: number; maxRad: number }>,
    pitchReading: Readonly<{ minRad: number; maxRad: number }>): AimSolution {
    const fact = (id: string): number => {
      const value = this.context.view.facts[id];
      if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`mount tracking requires finite fact "${id}"`);
      return value;
    };
    const authoredAimX = this.context.view.facts["opponent-aim-local-x"];
    const x = (typeof authoredAimX === "number" && Number.isFinite(authoredAimX)
      ? authoredAimX : fact("opponent-local-x")) +
      Number(this.context.request.parameters["target-lateral-offset"] ?? 0);
    // A launcher can deliberately select a lane above or below centre mass. This remains
    // authored Action input: the generic mount owns the geometry, not an Arbalest-only
    // guess about where a shield happens to be.
    const y = fact("opponent-local-y") + Number(this.context.request.parameters["target-height-offset"] ?? 0);
    const z = fact("opponent-local-z");
    const geometry = Object.freeze({
      origin: Object.freeze({ x: fact("launcher-muzzle-local-x"), y: fact("launcher-muzzle-local-y"),
        z: fact("launcher-muzzle-local-z") }),
      forward: Object.freeze({ x: fact("launcher-forward-local-x"), y: fact("launcher-forward-local-y"),
        z: fact("launcher-forward-local-z") }),
      yawRad: this.context.view.joints[boundJoint(this.context, "yaw")]?.angleRad ?? Number.NaN,
      pitchRad: this.context.view.joints[boundJoint(this.context, "pitch")]?.angleRad ?? Number.NaN,
    });
    const speed = Math.max(1e-6, fact("projectile-speed-mps"));
    const leadS = Math.min(2, Math.hypot(x - geometry.origin.x, y - geometry.origin.y,
      z - geometry.origin.z) / speed);
    return solveTwoAxisLauncherAim({
      x: x + fact("opponent-local-vx") * leadS,
      y: y + fact("opponent-local-vy") * leadS,
      z: z + fact("opponent-local-vz") * leadS,
    }, geometry, [yawReading.minRad, yawReading.maxRad], [pitchReading.minRad, pitchReading.maxRad]);
  }

  private guardTarget(yawReading: Readonly<{ minRad: number; maxRad: number }>,
    pitchReading: Readonly<{ minRad: number; maxRad: number }>): AimSolution {
    const fact = (id: string): number => {
      const value = this.context.view.facts[id];
      if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`mount guard requires finite fact "${id}"`);
      return value;
    };
    return solveTwoAxisAim({ x: fact("opponent-local-x"), y: fact("opponent-local-y"),
      z: fact("opponent-local-z") }, [yawReading.minRad, yawReading.maxRad],
    [pitchReading.minRad, pitchReading.maxRad]);
  }

  step(dt: number): void {
    this.elapsed += dt;
    const yaw = boundJoint(this.context, "yaw");
    const pitch = boundJoint(this.context, "pitch");
    const yawReading = this.context.view.joints[yaw];
    const pitchReading = this.context.view.joints[pitch];
    if (!yawReading || !pitchReading) throw new Error(`mount cannot read configured yaw/pitch joints`);
    let yawTarget = Number(this.context.request.parameters.yaw ?? 0);
    let pitchTarget = Number(this.context.request.parameters.pitch ?? 0);
    let reachable = true;
    if (this.mode === "track" || this.mode === "fire") {
      const solution = this.trackedTarget(yawReading, pitchReading);
      yawTarget = solution.yawRad;
      pitchTarget = solution.pitchRad;
      reachable = solution.reachable;
    }
    if (this.mode === "guard") {
      const solution = this.guardTarget(yawReading, pitchReading);
      yawTarget = solution.yawRad;
      pitchTarget = solution.pitchRad;
      reachable = solution.reachable;
    }
    if (this.mode === "sweep") {
      const direction = Number(this.context.request.parameters.direction ?? 1);
      const centreYaw = this.targetCentredSweep
        ? this.sweepPhase === "wind" ? this.sweepWindCentreYaw : this.sweepCommitCentreYaw
        : 0;
      yawTarget = this.sweepPhase === "wind" ? centreYaw - direction * this.sweepArcRad :
        this.sweepPhase === "commit" ? centreYaw + direction * this.sweepArcRad : centreYaw;
      // The mounted sword projects along the socket's forward axis. Its damaging travel is
      // therefore the declared yaw stroke itself; pitching it down first only turns the blade
      // into an unstable vertical pendulum and makes module choice alter the shared mount.
      pitchTarget = this.targetCentredSweep
        ? this.sweepPhase === "wind" ? this.sweepWindPitch : this.sweepCommitPitch
        : this.sweepPhase === "commit" ? 0.25 : 0;
      this.phase = this.sweepPhase;
    }
    this.context.motors.write({ joint: yaw, angleRad: Math.max(yawReading.minRad, Math.min(yawReading.maxRad, yawTarget)),
      maxSpeedRadS: yawReading.maxSpeedRadS, maxForceNm: yawReading.maxForceNm });
    this.context.motors.write({ joint: pitch, angleRad: Math.max(pitchReading.minRad, Math.min(pitchReading.maxRad, pitchTarget)),
      maxSpeedRadS: pitchReading.maxSpeedRadS, maxForceNm: pitchReading.maxForceNm });
    const aligned = Math.abs(yawReading.angleRad - yawTarget) < 0.04 && Math.abs(pitchReading.angleRad - pitchTarget) < 0.04;
    this.targetError = Math.hypot(yawReading.angleRad - yawTarget, pitchReading.angleRad - pitchTarget);
    if (this.mode === "sweep" && aligned) {
      // Wind can take more than a second while the opponent closes. Re-centre once at the commit
      // edge, then hold that physical chord stable until it has actually crossed the target.
      if (this.targetCentredSweep && this.sweepPhase === "wind") this.snapshotSweepCentre();
      this.sweepPhase = this.sweepPhase === "wind" ? "commit" : this.sweepPhase === "commit" ? "recover" : "complete";
      this.phase = this.sweepPhase;
    } else if (this.mode === "fire") {
      const lineOfSight = this.context.view.facts["line-of-sight"] === true;
      const clear = this.context.view.facts["launcher-clear"] === true;
      this.phase = !reachable ? "outside-limits" : !lineOfSight ? "blocked-line" : !clear ? "self-blocked" :
        aligned ? "fire-window" : "tracking";
      if (reachable && lineOfSight && clear && aligned && !this.fired) {
        const binding = this.context.group.bindings.launcher;
        const output = binding?.modules.length === 1 ? binding.modules[0] : null;
        if (!output) throw new Error(`group "${this.context.group.id}" needs one module bound as "launcher"`);
        this.context.effects.fireProjectile(output);
        this.fired = true;
      }
    }
    else if (this.mode === "aim" || this.mode === "track") {
      this.phase = !reachable ? "outside-limits" : aligned ? "aligned" : "tracking";
    } else if (this.mode === "guard") {
      this.phase = !reachable ? "outside-limits" : aligned ? "guarding" : "guard-tracking";
    }
  }

  done(): boolean { return (this.mode === "aim" && this.phase === "aligned") ||
    (this.mode === "sweep" && this.sweepPhase === "complete") || (this.mode === "fire" && this.fired); }
  cancel(reason: string): void { this.cancelled = reason; this.phase = "cancelled"; }
  diagnostic(): ControllerDiagnostic { return { phase: this.phase, detail: this.cancelled || `${this.elapsed.toFixed(3)} s`,
    progress: this.targetError, epsilon: 0.04 }; }
}

const mountFactory = (name: string, mode: "aim" | "track" | "sweep" | "fire" | "guard",
  sweepArcRad = 0.90, targetCentredSweep = false): ControllerFactory => Object.freeze({
  name, create: (context: ControllerContext) => new MountController(context, mode, sweepArcRad, targetCentredSweep),
});

export const MOUNT_CONTROLLERS: readonly ControllerFactory[] = Object.freeze([
  mountFactory("aim-direction", "aim"),
  mountFactory("track-target", "track"),
  mountFactory("sweep-arc", "sweep"),
  mountFactory("sweep-compact-arc", "sweep", 0.55),
  // This is intentionally not a generic two-axis mount affordance. Its inverse kinematics are
  // the Swordbearer's declared offset, hanging-arm bind and ordinary finite sword geometry.
  mountFactory("swordbearer-target-sweep", "sweep", SWORDBEARER_TARGET_SWEEP.halfArcRad, true),
  mountFactory("fire-projectile", "fire"),
  mountFactory("guard-mount", "guard"),
]);
