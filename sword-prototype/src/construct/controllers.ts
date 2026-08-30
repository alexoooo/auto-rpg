import type { ControllerContext, ControllerFactory, ControllerDiagnostic } from "./scheduler.ts";
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
  ...["aim-direction", "track-target", "sweep-arc", "sweep-compact-arc", "fire-projectile", "guard-mount"].map((controller): ControllerCompatibility => Object.freeze({
    controller, role: "two-axis-mount" as const, minimumJoints: 2, minimumModules: 1,
    requiredParameters: Object.freeze(controller === "aim-direction" ? ["yaw", "pitch"]
      : controller === "sweep-arc" || controller === "sweep-compact-arc" ? ["direction"] : []),
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
    } : controller === "sweep-arc" || controller === "sweep-compact-arc" ? {
      direction: Object.freeze({ kind: "number" as const, min: -1, max: 1, unit: "scalar" as const }),
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
