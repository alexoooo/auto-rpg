import type { BuiltBody } from "../build/build-body.ts";
import type { AssistCeiling } from "../control/assist.ts";
import type { BodyObservation } from "../observation.ts";
import { observeBody } from "../observation.ts";
import { physicalBody, type PhysicalBody } from "../physical-body.ts";
import { deepFreeze } from "../state.ts";
import type { World } from "../world.ts";
import { applyBodyAction, checkedBodyAction, type BodyAction } from "./body-actions.ts";
import type { EquipmentPort } from "./equipment-port.ts";
import type { DirectMindConfig } from "./config.ts";
import { embody } from "./mind.ts";
import { clockSenses, type Senses } from "./senses.ts";

/** Immutable actuator description; no object here can change the live body. */
interface ActuatorModel {
  readonly equipment?: EquipmentPort["model"];
  readonly channels: readonly {
    readonly name: string; readonly min: number; readonly max: number;
    readonly positive: number; readonly negative: number;
  }[];
}

/** An observation/action policy owns only its own explicit memory. */
interface Policy {
  readonly name: string;
  readonly state: object;
  step(observation: BodyObservation, dt: number): BodyAction;
  idle?(): void;
}

interface PolicyOptions { readonly senses?: () => Senses; readonly assist?: AssistCeiling; readonly equipment?: EquipmentPort }

/** Host a replacement controller through detached observations and checked actions alone. */
export function createPolicyBody(built: BuiltBody, world: World, make: (model: ActuatorModel) => Policy, options: PolicyOptions = {}): PhysicalBody {
  const sense = options.senses ?? clockSenses(world), equipment = options.equipment;
  const embodied = embody(built, world, (own) => {
    const observe = observeBody(built, own.muscles, world, sense, equipment ? () => equipment.observe() : undefined);
    const model = deepFreeze({ channels: own.muscles.channels.map((c) => ({ name: c.name, min: c.dof.spec.min.value,
      max: c.dof.spec.max.value, positive: c.positive.peak, negative: c.negative.peak })),
      ...(equipment ? { equipment: equipment.model } : {}) });
    const policy = make(model);
    return { name: policy.name, state: policy.state, idle: () => policy.idle?.(), step() {
      const action = checkedBodyAction(policy.step(observe(), world.dt), model.channels.length, equipment);
      applyBodyAction(own.muscles, action, equipment);
    } };
  }, sense, options.assist);
  return physicalBody(embodied.own, world, sense, () => embodied.mind.name, embodied.state, embodied.dispose, undefined, equipment);
}

/** Joint feedback is an independent reference policy, with every gain supplied by its experiment. */
export function createDirectBody(built: BuiltBody, world: World, config: DirectMindConfig, options: PolicyOptions = {}): PhysicalBody {
  if (!Number.isFinite(config.seconds) || config.seconds <= 0 || !Number.isFinite(config.speed) || config.speed <= 0
    || !Number.isFinite(config.activation) || config.activation < 0 || config.activation > 1) throw new Error("invalid direct controller gains");
  const settings = deepFreeze({ ...config, targets: { ...config.targets } });
  return createPolicyBody(built, world, (model) => {
    for (const [name, target] of Object.entries(settings.targets)) {
      const channel = model.channels.find((c) => c.name === name);
      if (!channel || !Number.isFinite(target) || target < channel.min || target > channel.max) throw new Error(`invalid joint target ${name}`);
    }
    const state = { steps: 0, idles: 0 };
    const activation = model.channels.map(() => settings.activation), velocity = model.channels.map(() => 0);
    return { name: "direct", state, idle() { state.idles++; }, step(observation) {
      state.steps++;
      for (let i = 0; i < velocity.length; i++) {
        const channel = model.channels[i]!, target = settings.targets[channel.name] ?? Math.max(channel.min, Math.min(channel.max, 0));
        velocity[i] = Math.max(-settings.speed, Math.min(settings.speed, (target - observation.joints[i]!.angle) / settings.seconds));
      }
      return { kind: "velocity", activation, velocity };
    } };
  }, options);
}
