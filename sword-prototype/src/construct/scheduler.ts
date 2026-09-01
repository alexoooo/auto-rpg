import {
  actionFor,
  validateConstructCommand,
  type ActionRequest,
  type ActionSpec,
  type ConstructCommand,
  type ConstructControlGraph,
  type ControlGroupSpec,
} from "./actions.ts";
import type { ActionCapability } from "./capabilities.ts";
import type { LocomotionRequest, SupportedLocomotionSample } from "../supported-locomotion.ts";

export interface JointReading {
  readonly angleRad: number;
  readonly speedRadS: number;
  readonly minRad: number;
  readonly maxRad: number;
  readonly maxSpeedRadS: number;
  readonly maxForceNm: number;
}

export interface ControllerView {
  readonly joints: Readonly<Record<string, JointReading>>;
  readonly facts: Readonly<Record<string, number | boolean | string>>;
}

export interface MotorTarget {
  readonly joint: string;
  readonly angleRad: number;
  readonly maxSpeedRadS: number;
  readonly maxForceNm: number;
}

export interface MotorSink {
  write(target: MotorTarget): void;
  effect?(effect: ActionEffect): void;
}

export interface ActionEffect { readonly kind: "fire-projectile"; readonly module: string }

export interface ControllerDiagnostic {
  readonly phase: string;
  readonly detail: string;
  readonly progress: number;
  readonly epsilon: number;
}

export interface ActionController {
  enter(): void;
  step(dt: number): void;
  done(): boolean;
  cancel(reason: string): void;
  diagnostic(): ControllerDiagnostic;
}

export interface ControllerContext {
  readonly action: ActionSpec;
  readonly request: ActionRequest;
  readonly group: ControlGroupSpec;
  readonly view: ControllerView;
  readonly motors: MotorWriter;
  readonly effects: EffectWriter;
  readonly locomotion: LocomotionWriter;
}

export interface ControllerFactory {
  readonly name: string;
  create(context: ControllerContext): ActionController;
}

/** A controller cannot even name a motor outside the group that instantiated it. */
export class MotorWriter {
  private readonly allowed: ReadonlySet<string>;
  private readonly sink: MotorSink;

  constructor(joints: readonly string[], sink: MotorSink) {
    this.allowed = new Set(joints);
    this.sink = sink;
  }

  write(target: MotorTarget): void {
    const baseJoint = target.joint.split(":", 1)[0];
    if (!this.allowed.has(baseJoint)) {
      throw new Error(`controller cannot write foreign joint "${target.joint}"`);
    }
    if (!Number.isFinite(target.angleRad) || !Number.isFinite(target.maxSpeedRadS) ||
        !Number.isFinite(target.maxForceNm) || target.maxSpeedRadS <= 0 || target.maxForceNm <= 0) {
      throw new Error(`controller wrote an invalid target for joint "${target.joint}"`);
    }
    this.sink.write(target);
  }
}

/** Like motors, hardware effects are confined to modules declared by the selected group. */
export class EffectWriter {
  private readonly allowed: ReadonlySet<string>;
  private readonly sink: MotorSink;

  constructor(modules: readonly string[], sink: MotorSink) { this.allowed = new Set(modules); this.sink = sink; }

  fireProjectile(module: string): void {
    if (!this.allowed.has(module)) throw new Error(`controller cannot fire foreign module "${module}"`);
    this.sink.effect?.(Object.freeze({ kind: "fire-projectile", module }));
  }
}

export interface LocomotionAuthorityToken {
  readonly carrierPartId: string;
}

export interface LocomotionSubmission {
  readonly action: string;
  readonly group: string;
  readonly authority: LocomotionAuthorityToken;
  readonly request: LocomotionRequest;
}

/** Optional runtime seam: legacy pairs deliberately construct the scheduler without a carrier. */
export interface LocomotionSchedulerPort {
  authority(action: ActionSpec, group: ControlGroupSpec): LocomotionAuthorityToken | null;
  stage(submission: LocomotionSubmission): void;
  priorSample(authority: LocomotionAuthorityToken): SupportedLocomotionSample;
  clearSubmission(action: string, group: string, authority: LocomotionAuthorityToken, reason: string): void;
  clearAll(reason: string): void;
}

const locomotionAxis = (value: number, field: string): number => {
  if (!Number.isFinite(value) || value < -1 || value > 1) {
    throw new Error(`locomotion request ${field} must be finite and within -1..1`);
  }
  return value;
};

/** A controller can submit a command but can neither name nor alter its carrier authority. */
export class LocomotionWriter {
  private readonly action: ActionSpec;
  private readonly group: ControlGroupSpec;
  private readonly authority: LocomotionAuthorityToken | null;
  private readonly submit: ((submission: LocomotionSubmission) => void) | null;
  private readonly portSample: ((authority: LocomotionAuthorityToken) => SupportedLocomotionSample) | null;

  constructor(action: ActionSpec, group: ControlGroupSpec, authority: LocomotionAuthorityToken | null,
    submit: ((submission: LocomotionSubmission) => void) | null,
    portSample: ((authority: LocomotionAuthorityToken) => SupportedLocomotionSample) | null = null) {
    this.action = action;
    this.group = group;
    this.authority = authority;
    this.submit = submit;
    this.portSample = portSample;
  }

  /** Controllers may preserve a legacy motor-only path without seeing or forging the token. */
  get available(): boolean { return this.authority !== null && this.submit !== null; }

  request(value: LocomotionRequest): void {
    if (!this.authority || !this.submit) {
      throw new Error(`action "${this.action.id}" in group "${this.group.id}" has no locomotion authority`);
    }
    if (typeof value.recover !== "boolean") throw new Error("locomotion request recover must be boolean");
    const request = Object.freeze({
      localForward: locomotionAxis(value.localForward, "localForward"),
      localRight: locomotionAxis(value.localRight, "localRight"),
      yaw: locomotionAxis(value.yaw, "yaw"),
      recover: value.recover,
    });
    if (Math.hypot(request.localForward, request.localRight) > 1 + 1e-12) {
      throw new Error("locomotion request forward/right vector must be normalized");
    }
    this.submit(Object.freeze({ action: this.action.id, group: this.group.id,
      authority: this.authority, request }));
  }

  /** Previous committed boundary only; the pair has not resolved this boundary while controllers run. */
  sample(): SupportedLocomotionSample {
    if (!this.authority || !this.portSample) return Object.freeze({ request: null });
    return this.portSample(this.authority);
  }
}

export type SchedulerEventKind = "admitted" | "started" | "completed" | "cancelled" | "refused" | "failed";

export interface SchedulerEvent {
  readonly kind: SchedulerEventKind;
  readonly action: string;
  readonly group: string;
  readonly reason: string | null;
}

export interface ActiveActionDiagnostic {
  readonly action: string;
  readonly group: string;
  readonly phase: string;
  readonly detail: string;
  readonly progress: number;
  readonly epsilon: number;
}

interface ActiveAction {
  readonly key: string;
  readonly action: ActionSpec;
  readonly request: ActionRequest;
  readonly controller: ActionController;
  readonly liveView: { current: ControllerView };
  readonly locomotionAuthority: LocomotionAuthorityToken | null;
}

const requestKey = (action: ActionSpec): string => `${action.group}/${action.id}`;

export class ActionScheduler {
  private readonly graph: ConstructControlGraph;
  private readonly factories: ReadonlyMap<string, ControllerFactory>;
  private readonly sink: MotorSink;
  private readonly locomotionPort: LocomotionSchedulerPort | null;
  private readonly active = new Map<string, ActiveAction>();
  private readonly eventRows: SchedulerEvent[] = [];
  private readonly locomotionClaims = new Map<string, string>();

  constructor(graph: ConstructControlGraph, factories: readonly ControllerFactory[], sink: MotorSink,
    locomotionPort: LocomotionSchedulerPort | null = null) {
    this.graph = graph;
    this.sink = sink;
    this.locomotionPort = locomotionPort;
    this.factories = new Map(factories.map((factory) => [factory.name, factory]));
    if (this.factories.size !== factories.length) throw new Error("construct controller registry has duplicate names");
    for (const action of graph.actions) {
      if (!this.factories.has(action.controller)) {
        throw new Error(`action "${action.id}" references unknown controller "${action.controller}"`);
      }
    }
  }

  get events(): readonly SchedulerEvent[] { return this.eventRows; }

  /** Authored programs may continue a scheduler-owned action; this is runtime state, not a sensor. */
  isActionActive(action: string): boolean {
    for (const running of this.active.values()) if (running.action.id === action) return true;
    return false;
  }

  diagnostics(): readonly ActiveActionDiagnostic[] {
    return [...this.active.values()].map(({ action, controller }) => {
      const diagnostic = controller.diagnostic();
      return { action: action.id, group: action.group, phase: diagnostic.phase, detail: diagnostic.detail,
        progress: diagnostic.progress, epsilon: diagnostic.epsilon };
    });
  }

  step(command: ConstructCommand, view: ControllerView, dt: number,
    capabilities?: readonly ActionCapability[]): readonly SchedulerEvent[] {
    if (!Number.isFinite(dt) || dt <= 0) throw new Error("construct scheduler dt must be finite and positive");
    validateConstructCommand(this.graph, command);
    this.eventRows.length = 0;
    this.locomotionClaims.clear();
    const capabilityByAction = new Map((capabilities ?? []).map((row) => [row.action, row]));

    const ordered = command.requests.map((scheduled) => ({ scheduled,
      request: scheduled.request, action: actionFor(this.graph, scheduled.request) }))
      .sort((left, right) => right.scheduled.priority - left.scheduled.priority ||
        left.scheduled.sourceIndex - right.scheduled.sourceIndex ||
        left.action.id.localeCompare(right.action.id));

    const claims = new Map<string, string>();
    const admitted = new Set<string>();
    for (const { request, action } of ordered) {
      const group = this.group(action.group);
      const key = requestKey(action);
      let locomotionAuthority: LocomotionAuthorityToken | null = null;
      try {
        locomotionAuthority = this.locomotionPort?.authority(action, group) ?? null;
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        this.eventRows.push({ kind: "refused", action: action.id, group: group.id, reason });
        continue;
      }
      const priorRunning = this.active.get(key);
      if (priorRunning?.locomotionAuthority &&
          (!locomotionAuthority || JSON.stringify(priorRunning.locomotionAuthority) !== JSON.stringify(locomotionAuthority))) {
        const reason = `locomotion authority for "${group.id}/${action.id}" was revoked`;
        this.cancelAndClear(priorRunning, reason);
        this.active.delete(key);
        this.eventRows.push({ kind: "cancelled", action: action.id, group: group.id, reason });
        continue;
      }
      if (locomotionAuthority && !action.claims.includes("resource:balance")) {
        this.eventRows.push({ kind: "refused", action: action.id, group: group.id,
          reason: `locomotion action "${action.id}" in group "${group.id}" must claim "resource:balance"` });
        continue;
      }
      const capability = capabilityByAction.get(action.id);
      if (capability && !capability.available) {
        const reason = capability.reason ?? `action "${action.id}" is unavailable`;
        const running = this.active.get(key);
        if (running) {
          this.cancelAndClear(running, reason);
          this.active.delete(key);
          this.eventRows.push({ kind: "cancelled", action: action.id, group: group.id, reason });
        } else {
          this.eventRows.push({ kind: "refused", action: action.id, group: group.id, reason });
        }
        continue;
      }
      const requestedClaims = [
        ...group.joints.map((joint) => `joint:${joint}`),
        ...action.claims,
      ];
      const conflict = requestedClaims.find((claim) => claims.has(claim));
      if (conflict) {
        const holder = claims.get(conflict) as string;
        this.eventRows.push({ kind: "refused", action: action.id, group: group.id,
          reason: `claim "${conflict}" is held by "${holder}" while ` +
            `"${group.id}/${action.id}" requested it` });
        continue;
      }
      admitted.add(key);
      for (const claim of requestedClaims) claims.set(claim, key);
      this.eventRows.push({ kind: "admitted", action: action.id, group: group.id, reason: null });

      let running = this.active.get(key);
      if (running && JSON.stringify(running.request.parameters) !== JSON.stringify(request.parameters)) {
        this.cancelAndClear(running, "parameters changed");
        this.eventRows.push({ kind: "cancelled", action: action.id, group: group.id, reason: "parameters changed" });
        this.active.delete(key);
        running = undefined;
      }
      if (!running) {
        const factory = this.factories.get(action.controller) as ControllerFactory;
        let controller: ActionController;
        const liveView = { current: view };
        const locomotion = new LocomotionWriter(action, group, locomotionAuthority,
          this.locomotionPort ? (submission) => this.stageLocomotion(submission) : null,
          this.locomotionPort ? (authority) => this.locomotionPort?.priorSample(authority) ??
            Object.freeze({ request: null }) : null);
        try {
          controller = factory.create({ action, request, group, get view() { return liveView.current; },
            motors: new MotorWriter(group.joints, this.sink), effects: new EffectWriter(group.modules, this.sink),
            locomotion });
          controller.enter();
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          if (locomotionAuthority) {
            this.locomotionPort?.clearSubmission(action.id, group.id, locomotionAuthority, reason);
            this.releaseLocomotionClaim(action.id, group.id, locomotionAuthority);
          }
          this.eventRows.push({ kind: "refused", action: action.id, group: group.id, reason });
          admitted.delete(key);
          for (const claim of requestedClaims) claims.delete(claim);
          continue;
        }
        running = { key, action, request, controller, liveView, locomotionAuthority };
        this.active.set(key, running);
        this.eventRows.push({ kind: "started", action: action.id, group: group.id, reason: null });
      }
      // Controllers persist across requests; their sensor/joint view must not persist with admission.
      running.liveView.current = view;
      let done = false;
      try {
        running.controller.step(dt);
        done = running.controller.done();
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        this.cancelAndClear(running, reason);
        if (running.locomotionAuthority) {
          this.releaseLocomotionClaim(running.action.id, running.action.group, running.locomotionAuthority);
        }
        this.active.delete(key);
        this.eventRows.push({ kind: "failed", action: action.id, group: group.id, reason });
        admitted.delete(key);
        for (const claim of requestedClaims) claims.delete(claim);
        continue;
      }
      if (done) {
        this.clearLocomotion(running, "action completed");
        this.active.delete(key);
        this.eventRows.push({ kind: "completed", action: action.id, group: group.id, reason: null });
      }
    }

    for (const [key, running] of [...this.active]) {
      if (admitted.has(key)) continue;
      this.cancelAndClear(running, "request withdrawn or conflicted");
      this.active.delete(key);
      this.eventRows.push({ kind: "cancelled", action: running.action.id, group: running.action.group,
        reason: "request withdrawn or conflicted" });
    }
    return this.eventRows;
  }

  cancelUnavailable(actionId: string, groupId: string, reason: string): void {
    const key = `${groupId}/${actionId}`;
    const running = this.active.get(key);
    if (!running) return;
    this.cancelAndClear(running, reason);
    this.active.delete(key);
    this.eventRows.push({ kind: "cancelled", action: actionId, group: groupId, reason });
  }

  stop(reason = "scheduler stopped"): readonly SchedulerEvent[] {
    this.eventRows.length = 0;
    for (const running of this.active.values()) {
      this.cancelAndClear(running, reason);
      this.eventRows.push({ kind: "cancelled", action: running.action.id, group: running.action.group, reason });
    }
    this.active.clear();
    this.locomotionPort?.clearAll(reason);
    return Object.freeze(this.eventRows.map((event) => Object.freeze({ ...event })));
  }

  private group(id: string): ControlGroupSpec {
    const group = this.graph.groups.find((candidate) => candidate.id === id);
    if (!group) throw new Error(`construct control references missing group "${id}"`);
    return group;
  }

  private stageLocomotion(submission: LocomotionSubmission): void {
    const key = `${submission.group}/${submission.action}`;
    const prior = this.locomotionClaims.get(submission.authority.carrierPartId);
    if (prior) {
      throw new Error(`carrier "${submission.authority.carrierPartId}" already has locomotion from ` +
        `"${prior}" while "${key}" submitted another request`);
    }
    this.locomotionClaims.set(submission.authority.carrierPartId, key);
    this.locomotionPort?.stage(submission);
  }

  private clearLocomotion(running: ActiveAction, reason: string): void {
    if (!running.locomotionAuthority) return;
    this.locomotionPort?.clearSubmission(running.action.id, running.action.group,
      running.locomotionAuthority, reason);
  }

  /** Terminal controller code is untrusted; motion revocation is not allowed to depend on it returning. */
  private cancelAndClear(running: ActiveAction, reason: string): void {
    try { running.controller.cancel(reason); }
    catch { /* Cancellation is best-effort; the scoped locomotion clear below is authoritative. */ }
    finally { this.clearLocomotion(running, reason); }
  }

  private releaseLocomotionClaim(action: string, group: string, authority: LocomotionAuthorityToken): void {
    if (this.locomotionClaims.get(authority.carrierPartId) === `${group}/${action}`) {
      this.locomotionClaims.delete(authority.carrierPartId);
    }
  }
}
