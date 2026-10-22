import { controller, NO_POSTURE } from "../../mind/controller.ts";
import type { ActuatorModel, Policy } from "../../mind/direct.ts";
import { anyBody } from "../../mind/parts.ts";
import { deepFreeze } from "../../state.ts";

/** **Joint feedback**'s config: targets in radians by channel, and explicit time, speed and activation bounds. */
interface DirectMindConfig {
  readonly kind: "direct";
  readonly targets: Readonly<Record<string, number>>;
  readonly seconds: number;
  readonly speed: number;
  readonly activation: number;
}

/** Joint feedback as it starts: no target named, so every joint is driven to zero, within its range. */
const DIRECT: DirectMindConfig = deepFreeze({ kind: "direct", targets: {}, seconds: .1, speed: 1, activation: 1 });

/** What is wrong with `config`'s gains; none when its time and speed are positive and its activation within [0, 1]. */
function directFaults(config: DirectMindConfig): readonly string[] {
  return !Number.isFinite(config.seconds) || config.seconds <= 0 || !Number.isFinite(config.speed) || config.speed <= 0
    || !Number.isFinite(config.activation) || config.activation < 0 || config.activation > 1 ? ["invalid direct controller gains"] : [];
}

/** Joint feedback, an independent reference policy with every gain supplied by its experiment: the policy `config` names; a config with a fault is refused. */
export function directPolicy(config: DirectMindConfig): (model: ActuatorModel) => Policy {
  const fault = directFaults(config)[0];
  if (fault) throw new Error(fault);
  const settings = deepFreeze({ ...config, targets: { ...config.targets } });
  return (model) => {
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
  };
}

/** **Joint feedback** as an entrant: a policy of observations and checked actions (`BodyHost.policy`), fit for any body. */
export const DIRECT_MIND = controller<DirectMindConfig>({
  role: "mind", label: "Joint feedback", stage: "experimental", fields: [], slots: [], defaults: DIRECT,
  keys: { kind: true, targets: true, seconds: true, speed: true, activation: true },
  fits: anyBody,
  faults: directFaults,
  presets: {},
  builtIn: () => NO_POSTURE,
  create: (host, config) => { host.policy(directPolicy(config)); return { state: {} }; },
});
