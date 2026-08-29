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
}

const requestKey = (action: ActionSpec): string => `${action.group}/${action.id}`;

export class ActionScheduler {
  private readonly graph: ConstructControlGraph;
  private readonly factories: ReadonlyMap<string, ControllerFactory>;
  private readonly sink: MotorSink;
  private readonly active = new Map<string, ActiveAction>();
  private readonly eventRows: SchedulerEvent[] = [];

  constructor(graph: ConstructControlGraph, factories: readonly ControllerFactory[], sink: MotorSink) {
    this.graph = graph;
    this.sink = sink;
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
      const capability = capabilityByAction.get(action.id);
      if (capability && !capability.available) {
        const reason = capability.reason ?? `action "${action.id}" is unavailable`;
        const running = this.active.get(key);
        if (running) {
          running.controller.cancel(reason);
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
        this.eventRows.push({ kind: "refused", action: action.id, group: group.id,
          reason: `claim "${conflict}" is held by "${claims.get(conflict)}"` });
        continue;
      }
      admitted.add(key);
      for (const claim of requestedClaims) claims.set(claim, key);
      this.eventRows.push({ kind: "admitted", action: action.id, group: group.id, reason: null });

      let running = this.active.get(key);
      if (running && JSON.stringify(running.request.parameters) !== JSON.stringify(request.parameters)) {
        running.controller.cancel("parameters changed");
        this.eventRows.push({ kind: "cancelled", action: action.id, group: group.id, reason: "parameters changed" });
        this.active.delete(key);
        running = undefined;
      }
      if (!running) {
        const factory = this.factories.get(action.controller) as ControllerFactory;
        let controller: ActionController;
        const liveView = { current: view };
        try {
          controller = factory.create({ action, request, group, get view() { return liveView.current; },
            motors: new MotorWriter(group.joints, this.sink), effects: new EffectWriter(group.modules, this.sink) });
          controller.enter();
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          this.eventRows.push({ kind: "refused", action: action.id, group: group.id, reason });
          admitted.delete(key);
          for (const claim of requestedClaims) claims.delete(claim);
          continue;
        }
        running = { key, action, request, controller, liveView };
        this.active.set(key, running);
        this.eventRows.push({ kind: "started", action: action.id, group: group.id, reason: null });
      }
      // Controllers persist across requests; their sensor/joint view must not persist with admission.
      running.liveView.current = view;
      try {
        running.controller.step(dt);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        running.controller.cancel(reason);
        this.active.delete(key);
        this.eventRows.push({ kind: "failed", action: action.id, group: group.id, reason });
        admitted.delete(key);
        for (const claim of requestedClaims) claims.delete(claim);
        continue;
      }
      if (running.controller.done()) {
        this.active.delete(key);
        this.eventRows.push({ kind: "completed", action: action.id, group: group.id, reason: null });
      }
    }

    for (const [key, running] of [...this.active]) {
      if (admitted.has(key)) continue;
      running.controller.cancel("request withdrawn or conflicted");
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
    running.controller.cancel(reason);
    this.active.delete(key);
    this.eventRows.push({ kind: "cancelled", action: actionId, group: groupId, reason });
  }

  stop(reason = "scheduler stopped"): readonly SchedulerEvent[] {
    this.eventRows.length = 0;
    for (const running of this.active.values()) {
      running.controller.cancel(reason);
      this.eventRows.push({ kind: "cancelled", action: running.action.id, group: running.action.group, reason });
    }
    this.active.clear();
    return Object.freeze(this.eventRows.map((event) => Object.freeze({ ...event })));
  }

  private group(id: string): ControlGroupSpec {
    const group = this.graph.groups.find((candidate) => candidate.id === id);
    if (!group) throw new Error(`construct control references missing group "${id}"`);
    return group;
  }
}
