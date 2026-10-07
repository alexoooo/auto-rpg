import type { Scene } from "@babylonjs/core/scene.js";
import { createBody, type Body } from "../body.ts";
import { buildBody } from "../build/build-body.ts";
import type { PhysicsEngine } from "../engine/engine.ts";
import { modelSpec, type HumanoidModel as BodyModel } from "../models.ts";
import { checkedAction, type ActuatorAction } from "../mind/actions.ts";
import { createPolicyBody } from "../mind/direct.ts";
import type { BodyObservation } from "../observation.ts";
import type { PhysicalBody } from "../physical-body.ts";
import { deepFreeze } from "../state.ts";
import { createWorld, type World } from "../world.ts";
import type { WorldTask } from "./environment.ts";

export interface ReachTaskConfig {
  readonly model: BodyModel;
  readonly controller: "actuator" | "layered";
  readonly actuation: World["actuation"];
  readonly gravity: boolean;
  readonly pin: string;
  readonly channel: string;
  readonly target: readonly [number, number];
  readonly servoSeconds: number;
  readonly tolerance: number;
  readonly holdSteps: number;
  /** Installed engine artifact identity, supplied by the experiment's manifest. */
  readonly engineRevision: string;
}

type ReachAction = ActuatorAction | { readonly kind: "posture"; readonly targets: Readonly<Record<string, number>> };
interface ReachObservation { readonly body: BodyObservation; readonly goal: { readonly channel: string; readonly angle: number } }

/** The Node and browser reach fixture: one physical objective with either actuator or layered actions. */
export function createReachTask(scene: Scene, engine: PhysicsEngine, config: ReachTaskConfig, random: () => number): WorldTask<ReachAction, ReachObservation> & { readonly body: PhysicalBody } {
  if (!Number.isFinite(config.servoSeconds) || config.servoSeconds <= 0 || !Number.isFinite(config.tolerance) || config.tolerance <= 0
    || !Number.isSafeInteger(config.holdSteps) || config.holdSteps < 1 || config.engineRevision !== engine.revision) throw new Error("invalid reach task configuration");
  const settings = deepFreeze({ ...config, target: [...config.target] as [number, number] });
  const spec = modelSpec(settings.model);
  const channels = spec.joints.flatMap((joint) => joint.dofs.map((dof) => ({ name: `${joint.name} ${dof.positive}`, min: dof.min.value, max: dof.max.value })));
  const index = channels.findIndex((c) => c.name === settings.channel), channel = channels[index];
  if (!channel || settings.target.length !== 2 || !settings.target.every(Number.isFinite) || settings.target[0] > settings.target[1]
    || settings.target[0] < channel.min || settings.target[1] > channel.max || !spec.segments.some((s) => s.name === settings.pin)) throw new Error("invalid reach fixture");
  const draw = random();
  if (!(draw >= 0 && draw < 1)) throw new Error("task random draw must be in [0, 1)");
  const goal = deepFreeze({ channel: settings.channel, angle: settings.target[0] + draw * (settings.target[1] - settings.target[0]) });
  const world = createWorld(scene, engine, { actuation: settings.actuation, gravity: settings.gravity });
  const built = buildBody(spec, world, { position: [0, 0, 0] });
  built.segments.get(settings.pin)!.body.setFixed(true);
  const state = { actuator: deepFreeze({ kind: "velocity", activation: channels.map(() => 0), velocity: channels.map(() => 0) }) as ActuatorAction,
    posture: {} as Readonly<Record<string, number>>, error: 0, held: 0 };
  let body: PhysicalBody;
  try {
    switch (settings.controller) {
      case "actuator": body = createPolicyBody(built, world, () => ({ name: "external", state: {}, step: () => state.actuator })); break;
      case "layered": {
        const commanded: Body = createBody(built, world, { servoSeconds: settings.servoSeconds });
        commanded.drive(() => ({ posture: state.posture, hands: { left: null, right: null }, pushes: [], stance: null }));
        body = commanded; break;
      }
      default: throw new Error(`unknown reach controller ${settings.controller satisfies never}`);
    }
  } catch (error) { built.dispose(); world.dispose(); throw error; }
  const measure = (count: boolean) => {
    state.error = Math.abs(body.observe().joints[index]!.angle - goal.angle);
    if (count) state.held = state.error <= settings.tolerance ? state.held + 1 : 0;
  };
  measure(false);
  const watch = world.afterStep(() => measure(true));
  return {
    world, body,
    configuration: { task: "joint-reach", protocol: 1, ...settings,
      anatomy: JSON.parse(JSON.stringify(spec, (key, value) => key === "provenance" ? undefined : value)),
      assists: { root: 0, weapon: false }, sensing: "body and task goal", modelAccess: "actuator descriptions" },
    state: { task: state, body: body.state },
    check(action) {
      switch (settings.controller) {
        case "actuator": {
          if (action.kind === "posture") throw new Error("actuator task needs an actuator action");
          return checkedAction(action, channels.length);
        }
        case "layered": {
          if (action.kind !== "posture" || !action.targets || typeof action.targets !== "object" || Array.isArray(action.targets)) throw new Error("layered task needs posture targets");
          for (const [name, value] of Object.entries(action.targets)) {
            const c = channels.find((entry) => entry.name === name);
            if (!c || !Number.isFinite(value) || value < c.min || value > c.max) throw new Error(`invalid posture target ${name}`);
          }
          return deepFreeze({ kind: "posture", targets: { ...action.targets } });
        }
        default: throw new Error(`unknown reach controller ${settings.controller satisfies never}`);
      }
    },
    act(action) {
      switch (action.kind) {
        case "velocity": case "torque": state.actuator = action; return;
        case "posture": state.posture = action.targets; return;
        default: throw new Error(`unknown reach action ${(action satisfies never as ReachAction).kind}`);
      }
    },
    observe: () => ({ body: body.observe(), goal }),
    evaluate: () => ({ metrics: { error: state.error, heldSteps: state.held },
      terminated: state.held >= settings.holdSteps ? "reached-and-held" : null,
      invalid: Number.isFinite(state.error) ? null : "non-finite joint motion" }),
    dispose() { watch.dispose(); body.dispose(); built.dispose(); world.dispose(); },
  };
}
