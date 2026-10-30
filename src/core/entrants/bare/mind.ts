/**
 * **The bare mind**: a body under a network and nothing of the toolkit's control: its own body
 * observed (`BodyObservation`) in, each muscle's pull out (`host.policy`). It is the testbed's most
 * general route, a mind from the senses to the muscles, which a trainer's bout drives as it drives
 * a skill's steer.
 *
 * Every `every` control steps it reads its inputs (`bareLayout`: each channel's angle and rate, its
 * root's up, its centre of mass's height, its root's velocity and spin, the nearest other body's place and
 * velocity, its orders' direction and pace), each vector in its heading's frame (along, up, across
 * its root's yaw), and decides each channel's pull, -1 to 1: a channel pulls at that share of its
 * strength toward its positive motion (above 0) or its negative one. A decision acts from the
 * control step after the one it reads. With a network (`BareConfig.network`), the network decides;
 * with none, the pulls its learner holds stand (zero, limp, unless something writes them: a
 * trainer, which reads its inputs and writes its outputs, `Learner`).
 */
import { networkFaults, recoveryNetwork, type Network } from "../../control/recovery-network.ts";
import type { BodyObservation } from "../../observation.ts";
import type { BodySpec } from "../../spec/body.ts";
import { deepFreeze } from "../../state.ts";
import { controller, NO_POSTURE, type Controller, type MindPreset } from "../../mind/controller.ts";
import type { BodyAction } from "../../mind/body-actions.ts";
import type { MindWiring } from "../../mind/minds.ts";
import { NOTHING_SENSED } from "../../mind/senses.ts";
import { learnerOf, type Learner } from "../../mind/learner.ts";

/** **The bare mind's config**: its network, or none (its pulls written from outside), and how many control steps apart it decides. */
interface BareConfig {
  readonly kind: "bare";
  readonly network: Network | null;
  readonly every: number;
}

/** The bare mind's memory: control steps taken, and its learner (`Learner`): the inputs it last read, and the pulls it holds, its outputs. */
interface BareState {
  steps: number;
  readonly learner: Learner;
}

/** Each channel's name, `joint positive-motion`, in the order the muscle driver lays them (`channelName`). */
const channelsOf = (spec: BodySpec): string[] => spec.joints.flatMap((joint) => joint.dofs.map((dof) => `${joint.name} ${dof.positive}`));

/** The root segment: the one no joint moves. */
const rootOf = (spec: BodySpec): string => {
  const children = new Set(spec.joints.map((joint) => joint.child));
  return spec.segments.find((segment) => !children.has(segment.name))!.name;
};

/** **What a bare mind of a body of `spec` reads and decides**, by name, in order: its inputs and its outputs (a pull a channel). */
function bareLayout(spec: BodySpec): { readonly inputs: readonly string[]; readonly outputs: readonly string[] } {
  const channels = channelsOf(spec), frame = (name: string) => [`${name} along`, `${name} up`, `${name} across`];
  return {
    inputs: [...channels.map((c) => `${c} angle`), ...channels.map((c) => `${c} rate`), ...frame("root up"), "centre height", ...frame("root velocity"),
      ...frame("root spin"), "other seen", ...frame("other place"), ...frame("other velocity"), "ordered", "order along", "order across", "order pace"],
    outputs: channels.map((c) => `${c} pull`),
  };
}

const BARE: BareConfig = deepFreeze({ kind: "bare", network: null, every: 2 });

const PRESETS: Readonly<Record<string, MindPreset<BareConfig>>> = deepFreeze({
  bare: { label: "Bare (no network)", config: BARE, offered: false },
});

/** Why a body of `spec` cannot carry `config`'s network: its inputs and outputs are the body's layout's. */
function fits(spec: BodySpec, config: BareConfig): string | null {
  if (!config.network) return null;
  const layout = bareLayout(spec), { inputs } = networkFaults(config.network);
  return inputs !== layout.inputs.length || config.network.actions !== layout.outputs.length
    ? `its network reads ${inputs} inputs for ${config.network.actions} pulls; this body gives ${layout.inputs.length} for ${layout.outputs.length}` : null;
}

/** The pulls of `state` as a body action: each channel at the pull's share of its strength, toward its sign's motion. */
function actionOf(pulls: readonly number[]): BodyAction {
  return { kind: "velocity", activation: pulls.map((pull) => Math.min(1, Math.abs(pull))), velocity: pulls.map((pull) => pull > 0 ? Infinity : pull < 0 ? -Infinity : 0) };
}

/**
 * `observation` read into `into` in `bareLayout`'s order, the root at `root` among its segments,
 * `orders` its move and pace. The heading is the root's turn about the vertical alone (its swing
 * left out), forward +z of the root.
 */
function read(into: number[], observation: BodyObservation, root: number, orders: ReturnType<MindWiring["orders"]>): void {
  into.length = 0;
  for (const joint of observation.joints) into.push(joint.angle);
  for (const joint of observation.joints) into.push(joint.rate);
  const segment = observation.segments[root]!, [x, y, z, w] = segment.rotation, twist = w * w + y * y;
  const fx = twist > 1e-12 ? 2 * w * y / twist : 0, fz = twist > 1e-12 ? (w * w - y * y) / twist : 1;
  const frame = (vx: number, vy: number, vz: number) => { into.push(vx * fx + vz * fz, vy, vx * fz - vz * fx); };
  frame(2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x));
  into.push(observation.centre[1]);
  frame(...segment.velocity);
  frame(...segment.spin);
  const own = observation.centre;
  let nearest: BodyObservation["senses"]["others"][number] | null = null, best = Infinity;
  for (const other of observation.senses.others) {
    if (other.out) continue;
    const dx = other.centre[0] - own[0], dz = other.centre[2] - own[2], d = dx * dx + dz * dz;
    if (d < best) { best = d; nearest = other; }
  }
  into.push(nearest ? 1 : 0);
  if (nearest) { frame(nearest.centre[0] - own[0], nearest.centre[1] - own[1], nearest.centre[2] - own[2]); frame(...nearest.velocity); }
  else into.push(0, 0, 0, 0, 0, 0);
  const move = orders?.move, direct = move?.kind === "direct" ? move.direction : null, length = direct ? Math.sqrt(direct.x * direct.x + direct.z * direct.z) : 0;
  into.push(direct ? 1 : 0);
  if (direct && length > 0) into.push((direct.x * fx + direct.z * fz) / length, (direct.x * fz - direct.z * fx) / length);
  else into.push(0, 0);
  into.push(orders?.pace ?? 0);
}

export const BARE_MIND: Controller = controller<BareConfig>({
  role: "mind", label: "Bare", stage: "experimental", fields: [], slots: [], defaults: BARE,
  keys: { kind: true, network: true, every: true }, presets: PRESETS,
  fits: (spec, config) => fits(spec, config),
  // It strikes with whatever its pulls swing: every effector the body has, and what each holds.
  strikes: (spec) => (spec.effectors ?? []).map((effector) => effector.segment),
  faults: (config) => [...(Number.isSafeInteger(config.every) && config.every >= 1 ? [] : ["it decides every whole number of control steps, 1 or more"]),
    ...(config.network ? networkFaults(config.network).faults : [])],
  builtIn: () => NO_POSTURE,
  create: (host, config, wiring) => {
    const layout = bareLayout(host.spec), rootName = rootOf(host.spec);
    let root = -1;
    const decide = config.network ? recoveryNetwork(config.network) : null, senses = wiring.senses ?? (() => NOTHING_SENSED);
    const state: BareState = { steps: 0, learner: learnerOf(layout.outputs.length, true) };
    host.policy((model) => {
      if (model.channels.map((channel) => channel.name).join("\n") !== channelsOf(host.spec).join("\n")) throw new Error("the bare layout's channels are not the body's");
      return { name: "bare", state, step(observation) {
        const { learner } = state, action = actionOf(learner.outputs);
        if (state.steps % config.every === 0) {
          if (root < 0) root = observation.segments.findIndex((segment) => segment.name === rootName);
          read(learner.inputs, observation, root, wiring.orders(senses()));
          learner.decisions++;
          if (decide) { const pulls = decide(learner.inputs); for (let i = 0; i < pulls.length; i++) learner.outputs[i] = pulls[i]!; }
        }
        state.steps++;
        return action;
      } };
    });
    return { state };
  },
});
