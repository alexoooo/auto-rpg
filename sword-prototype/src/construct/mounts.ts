import type { ActionController, ControllerContext, ControllerDiagnostic, ControllerFactory } from "./scheduler.ts";

export interface AimSolution {
  readonly yawRad: number;
  readonly pitchRad: number;
  readonly reachable: boolean;
  readonly reason: string | null;
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

  constructor(context: ControllerContext, mode: "aim" | "track" | "sweep" | "fire" | "guard",
    sweepArcRad = 0.90) {
    this.context = context;
    this.mode = mode;
    this.sweepArcRad = sweepArcRad;
    boundJoint(context, "yaw");
    boundJoint(context, "pitch");
    if (mode === "guard") boundModule(context, "sword");
  }

  enter(): void { this.phase = this.mode === "sweep" ? "wind" : "tracking"; }

  private trackedTarget(yawReading: Readonly<{ minRad: number; maxRad: number }>,
    pitchReading: Readonly<{ minRad: number; maxRad: number }>): AimSolution {
    const fact = (id: string): number => {
      const value = this.context.view.facts[id];
      if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`mount tracking requires finite fact "${id}"`);
      return value;
    };
    const x = fact("opponent-local-x"); const y = fact("opponent-local-y"); const z = fact("opponent-local-z");
    const speed = Math.max(1e-6, fact("projectile-speed-mps"));
    const leadS = Math.min(2, Math.hypot(x, y, z) / speed);
    return solveTwoAxisAim({
      x: x + fact("opponent-local-vx") * leadS,
      y: y + fact("opponent-local-vy") * leadS,
      z: z + fact("opponent-local-vz") * leadS,
    }, [yawReading.minRad, yawReading.maxRad], [pitchReading.minRad, pitchReading.maxRad]);
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
      yawTarget = this.sweepPhase === "wind" ? direction * -this.sweepArcRad :
        this.sweepPhase === "commit" ? direction * this.sweepArcRad : 0;
      // The mounted sword projects along the socket's forward axis. Its damaging travel is
      // therefore the declared yaw stroke itself; pitching it down first only turns the blade
      // into an unstable vertical pendulum and makes module choice alter the shared mount.
      pitchTarget = this.sweepPhase === "commit" ? 0.25 : 0;
      this.phase = this.sweepPhase;
    }
    this.context.motors.write({ joint: yaw, angleRad: Math.max(yawReading.minRad, Math.min(yawReading.maxRad, yawTarget)),
      maxSpeedRadS: yawReading.maxSpeedRadS, maxForceNm: yawReading.maxForceNm });
    this.context.motors.write({ joint: pitch, angleRad: Math.max(pitchReading.minRad, Math.min(pitchReading.maxRad, pitchTarget)),
      maxSpeedRadS: pitchReading.maxSpeedRadS, maxForceNm: pitchReading.maxForceNm });
    const aligned = Math.abs(yawReading.angleRad - yawTarget) < 0.04 && Math.abs(pitchReading.angleRad - pitchTarget) < 0.04;
    this.targetError = Math.hypot(yawReading.angleRad - yawTarget, pitchReading.angleRad - pitchTarget);
    if (this.mode === "sweep" && aligned) {
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
  sweepArcRad = 0.90): ControllerFactory => Object.freeze({
  name, create: (context: ControllerContext) => new MountController(context, mode, sweepArcRad),
});

export const MOUNT_CONTROLLERS: readonly ControllerFactory[] = Object.freeze([
  mountFactory("aim-direction", "aim"),
  mountFactory("track-target", "track"),
  mountFactory("sweep-arc", "sweep"),
  mountFactory("sweep-compact-arc", "sweep", 0.55),
  mountFactory("fire-projectile", "fire"),
  mountFactory("guard-mount", "guard"),
]);
