import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import {
  PhysicsConstraintAxis,
  PhysicsConstraintMotorType,
} from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";

import type { ControlDiagnosticsPort, ControlEndpoint, DriverStopReason, InstalledDriver } from "../control-host.ts";
import { emptyConstructCommand, type ConstructCommand, type ConstructControlGraph } from "./actions.ts";
import { CONSTRUCT_CONTROLLERS } from "./controllers.ts";
import { ConstructMind, type ConstructDecisionDiagnostic } from "./mind.ts";
import { type ConstructProgram } from "./program.ts";
import type { ConstructRuntime } from "./runtime.ts";
import { ActionScheduler, type ActiveActionDiagnostic, type ControllerView, type JointReading,
  type ActionEffect, type MotorTarget, type SchedulerEvent } from "./scheduler.ts";
import { SensorFrame, type SensorSpec } from "./sensors.ts";
import { ConstructRecorder } from "./recorder.ts";
import type { ActionCapability } from "./capabilities.ts";

export const CONSTRUCT_CONTROL_SURFACE = "construct-v1";

export interface ConstructControlSnapshot {
  readonly command: ConstructCommand;
  readonly events: readonly SchedulerEvent[];
  readonly active: readonly ActiveActionDiagnostic[];
  readonly facts: Readonly<Record<string, number | boolean | string>>;
  readonly capabilities: readonly ActionCapability[];
  readonly decision: ConstructDecisionDiagnostic | null;
  readonly motorTargets: readonly MotorTargetDiagnostic[];
}

export interface MotorTargetDiagnostic extends MotorTarget {
  readonly minRad: number;
  readonly maxRad: number;
  /** Commanded position is on a travel stop; actual motor torque is not observed here. */
  readonly targetAtLimit: boolean;
}

export interface ConstructControlHooks {
  beforeStep?(dt: number): void;
  effect?(effect: ActionEffect): void;
  capabilities?(): readonly ActionCapability[];
  admission?(dt: number, command: ConstructCommand): readonly ActionCapability[];
}

const jointAngle = (runtime: ConstructRuntime, id: string, axisId?: "x" | "y" | "z"): number => {
  const frames = runtime.joint(id).liveFrames();
  const relative = Quaternion.Inverse(frames.parent.rotation).multiply(frames.child.rotation).normalize();
  const axis = axisId ?? runtime.joint(id).spec.angularAxes[0].id;
  const component = axis === "x" ? relative.x : axis === "y" ? relative.y : relative.z;
  let angle = 2 * Math.atan2(component, relative.w);
  if (angle > Math.PI) angle -= Math.PI * 2;
  if (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
};

export class ConstructControlEndpoint implements ControlEndpoint {
  readonly surface = CONSTRUCT_CONTROL_SURFACE;
  readonly recording = new ConstructRecorder(false);
  readonly diagnostics: ControlDiagnosticsPort;
  readonly sensors: SensorFrame;
  private readonly runtime: ConstructRuntime;
  private readonly graph: ConstructControlGraph;
  private readonly sensorSpecs: readonly SensorSpec[];
  private readonly programs: Readonly<Record<string, ConstructProgram | null>>;
  private readonly scheduler: ActionScheduler;
  private current: InstalledDriver;
  private debugCommand: ConstructCommand = emptyConstructCommand();
  private publishedFacts: Readonly<Record<string, number | boolean | string>> = Object.freeze({});
  private readonly previousAngles = new Map<string, number>();
  private lastCommand: ConstructCommand = emptyConstructCommand();
  private lastEvents: readonly SchedulerEvent[] = Object.freeze([]);
  private stopped = false;
  private readonly hooks: ConstructControlHooks;
  private lastCapabilities: readonly ActionCapability[] = Object.freeze([]);
  private lastDecision: ConstructDecisionDiagnostic | null = null;
  private stepMotorTargets: MotorTargetDiagnostic[] = [];
  private lastMotorTargets: readonly MotorTargetDiagnostic[] = Object.freeze([]);

  constructor(
    runtime: ConstructRuntime,
    graph: ConstructControlGraph,
    sensorSpecs: readonly SensorSpec[],
    programs: Readonly<Record<string, ConstructProgram | null>>,
    initialPolicy: string,
    hooks: ConstructControlHooks = {},
  ) {
    this.runtime = runtime;
    this.graph = graph;
    this.sensorSpecs = sensorSpecs;
    this.sensors = new SensorFrame(sensorSpecs);
    this.programs = programs;
    this.hooks = hooks;
    this.diagnostics = Object.freeze({ surface: this.surface, read: () => this.snapshot() });
    this.scheduler = new ActionScheduler(graph, CONSTRUCT_CONTROLLERS, {
      write: (target) => this.writeMotor(target), effect: (effect) => this.hooks.effect?.(effect),
    });
    this.current = this.buildPolicy(initialPolicy);
  }

  get driver(): InstalledDriver { return this.current; }

  setDebugCommand(command: ConstructCommand): void { this.debugCommand = command; }

  install(driver: InstalledDriver): void {
    if (driver.surface !== this.surface) {
      throw new Error(`control source for surface ${driver.surface} cannot drive surface ${this.surface}`);
    }
    this.current.stop("handover");
    this.recordStop("control handover");
    this.lastDecision = null;
    this.current = driver;
  }

  installPolicy(name: string): void { this.install(this.buildPolicy(name)); }

  /**
   * Learned controllers enter through the same command/scheduler seam as authored Minds.
   * Exposing a command source rather than the scheduler itself is intentional: a trainer
   * may choose requests, but cannot write a motor or bypass capability admission.
   */
  installCommandSource(name: string, command: (dt: number) => ConstructCommand): void {
    if (name.trim() === "") throw new Error("construct command source name cannot be empty");
    this.install(this.driverFor(name, command));
  }

  installHuman(): void { this.install(this.driverFor("construct-debug", () => this.debugCommand)); }

  releaseHuman(): void { this.installPolicy("construct-hold"); }

  stopFighting(): void {
    this.stopped = true;
    this.current.stop("verdict");
    this.recordStop("verdict");
  }

  dispose(): void {
    this.current.stop("dispose");
    this.recordStop("dispose");
    this.recording.flush();
    this.recording.detach();
  }

  publishFacts(facts: Readonly<Record<string, number | boolean | string>>,
    availableSensors?: ReadonlySet<string>): void {
    this.publishedFacts = Object.freeze({ ...facts });
    this.sensors.clear();
    for (const sensor of this.sensorSpecs) {
      if (availableSensors && !availableSensors.has(sensor.id)) continue;
      const value = facts[sensor.id];
      if (typeof value === "number" || typeof value === "boolean") this.sensors.publish(sensor.id, value);
    }
  }

  /** One immutable post-step record; callers never read the scheduler's reused event array. */
  snapshot(): ConstructControlSnapshot {
    return Object.freeze({
      command: this.lastCommand,
      events: this.lastEvents,
      active: Object.freeze(this.scheduler.diagnostics().map((row) => Object.freeze({ ...row }))),
      facts: this.publishedFacts,
      capabilities: this.lastCapabilities,
      decision: this.lastDecision,
      motorTargets: this.lastMotorTargets,
    });
  }

  private buildPolicy(name: string): InstalledDriver {
    if (!Object.prototype.hasOwnProperty.call(this.programs, name)) {
      throw new Error(`construct control does not support policy "${name}"`);
    }
    const program = this.programs[name];
    if (program === null) {
      const hold = this.graph.actions.find((action) => action.id === "hold");
      if (!hold) throw new Error("construct-hold requires an installed hold action");
      return this.driverFor(name, () => ({ version: 1, requests: [{
        request: { action: hold.id, parameters: {} }, priority: 0, sourceIndex: 0,
      }] }));
    }
    const mind = new ConstructMind(program, this.graph, this.sensorSpecs);
    return this.driverFor(name, (dt) => mind.decide(this.sensors, dt, this.scheduler), () => mind.diagnostic());
  }

  private driverFor(name: string, command: (dt: number) => ConstructCommand,
    decision?: () => ConstructDecisionDiagnostic): InstalledDriver {
    let driverStopped = false;
    return Object.freeze({
      surface: this.surface,
      name,
      step: (dt: number) => {
        if (driverStopped || this.stopped) return;
        this.hooks.beforeStep?.(dt);
        const next = command(dt);
        this.stepMotorTargets = [];
        this.lastCapabilities = Object.freeze([...(this.hooks.admission?.(dt, next) ??
          this.hooks.capabilities?.() ?? [])]);
        this.lastDecision = decision?.() ?? null;
        const events = this.scheduler.step(next, this.controllerView(dt), dt, this.lastCapabilities);
        this.lastMotorTargets = Object.freeze(this.stepMotorTargets.map((target) => Object.freeze({ ...target })));
        this.lastCommand = next;
        this.lastEvents = Object.freeze(events.map((event) => Object.freeze({ ...event })));
        this.recording.record(next, this.lastEvents);
      },
      stop: (_reason: DriverStopReason) => { driverStopped = true; },
    });
  }

  private controllerView(dt: number): ControllerView {
    const joints: Record<string, JointReading> = {};
    for (const joint of this.runtime.joints.values()) {
      for (const [index, axis] of joint.spec.angularAxes.entries()) {
        const key = `${joint.id}:${axis.id}`;
        const angleRad = jointAngle(this.runtime, joint.id, axis.id);
        const prior = this.previousAngles.get(key) ?? angleRad;
        this.previousAngles.set(key, angleRad);
        const reading = { angleRad, speedRadS: (angleRad - prior) / dt,
          minRad: axis.minRad, maxRad: axis.maxRad,
          maxSpeedRadS: axis.maxSpeedRadS, maxForceNm: axis.maxTorqueNm };
        joints[key] = reading;
        if (index === 0) joints[joint.id] = reading;
      }
    }
    const root = this.runtime.part(this.runtime.blueprint.rootPart).node;
    const rotation = root.rotationQuaternion ?? Quaternion.Identity();
    const up = Vector3.Up().rotateByQuaternionToRef(rotation, new Vector3());
    const worldUpInBody = Vector3.Up().rotateByQuaternionToRef(Quaternion.Inverse(rotation), new Vector3());
    const facts: Record<string, number | boolean | string> = {
      ...this.publishedFacts,
      "core-upright": Vector3.Dot(up, Vector3.Up()) > 0.72,
      "core-roll-rad": Math.atan2(worldUpInBody.x, worldUpInBody.y),
      "core-pitch-rad": Math.atan2(-worldUpInBody.z, worldUpInBody.y),
    };
    return { joints, facts };
  }

  private writeMotor(target: MotorTarget): void {
    const segments = target.joint.split(":");
    if (segments.length > 2) throw new Error(`motor target "${target.joint}" has an invalid joint axis`);
    const [jointId, requestedAxis] = segments;
    const joint = this.runtime.joint(jointId);
    const configured = requestedAxis === undefined ? joint.spec.angularAxes[0]
      : joint.spec.angularAxes.find((axis) => axis.id === requestedAxis);
    if (!configured) throw new Error(`joint "${jointId}" has no configured angular axis "${requestedAxis}"`);
    const axis = configured.id === "x" ? PhysicsConstraintAxis.ANGULAR_X : configured.id === "y"
      ? PhysicsConstraintAxis.ANGULAR_Y : PhysicsConstraintAxis.ANGULAR_Z;
    this.stepMotorTargets.push({ ...target, minRad: configured.minRad, maxRad: configured.maxRad,
      targetAtLimit: Math.abs(target.angleRad - configured.minRad) <= 1e-6 ||
        Math.abs(target.angleRad - configured.maxRad) <= 1e-6 });
    joint.constraint.setAxisMotorType(axis, PhysicsConstraintMotorType.POSITION);
    joint.constraint.setAxisMotorTarget(axis, target.angleRad);
    joint.constraint.setAxisMotorMaxForce(axis, Math.min(target.maxForceNm, configured.maxTorqueNm));
  }

  private recordStop(reason: string): void {
    const events = this.scheduler.stop(reason);
    if (events.length === 0) return;
    const command = emptyConstructCommand();
    this.lastCommand = command;
    this.lastEvents = events;
    this.recording.record(command, events);
    this.recording.flush();
  }
}

/** Surface tag is the type boundary; the arena never switches on a concrete body class. */
export function constructControlSnapshot(endpoint: ControlEndpoint): ConstructControlSnapshot | null {
  if (endpoint.surface !== CONSTRUCT_CONTROL_SURFACE || endpoint.diagnostics?.surface !== CONSTRUCT_CONTROL_SURFACE) {
    return null;
  }
  return endpoint.diagnostics.read() as ConstructControlSnapshot;
}
