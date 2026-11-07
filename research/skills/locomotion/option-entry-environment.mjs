/** Moving corrections through the configured Option Mind, from a physically settled rest.
 * Heading episodes retain the ordinary command delay, walking entry and muscle limits.
 * `ordinary` reads the record's velocity actor; otherwise the learner supplies its decisions.
 * `rewardPace` sets the training target without changing the movement order or its gate.
 * `paces` samples reached entry prefixes at several commanded speeds, paired with each heading.
 * `overspeedCost` penalizes excess speed above the reward target when training slower orders.
 * `rewardReserve` adds the same speed reserve to each sampled pace unless `rewardPace` is explicit.
 * `trainingActor: "slow-velocity"` learns the low-speed branch while the faster actor stays frozen.
 * Snapshots restore the complete world, perception and controller state between episodes.
 */
import '../../../tests/harness/preload-data.mjs';
import { readFileSync } from 'node:fs';
import { LONE_WORLD } from '../../../src/app/node/evaluation.ts';
import { defaultMind } from '../../../src/app/catalog.ts';
import { DEFAULT_ENGINE } from '../../../src/core/physics/engines.ts';
import { massCentreToRef, massOf } from '../../../src/core/bodies/read-motion.ts';
import { Vector3 } from '../../../src/core/math/vector.ts';
import { exp, sin, cos } from '../../../src/core/math/real.ts';
import { recoveryNetwork } from '../../../src/core/math/learning/recovery-network.ts';
import { uprightness } from '../../../src/control/ground.ts';
import { MOVE } from '../../../src/skills/locomotion/move-part.ts';
import { STOCK_GAITS } from '../../../src/skills/locomotion/gaits.ts';
import { RESIDUAL_LAYOUT } from './residual-environment.mjs';

function learnedState(value, found = [], seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return found;
  seen.add(value);
  if (value.inference && value.motion) found.push(value);
  else for (const child of Object.values(value)) learnedState(child, found, seen);
  return found;
}
const tanh = value => {
  const t = exp(-2 * Math.abs(value));
  return (value < 0 ? -1 : 1) * (1 - t) / (1 + t);
};

export async function optionEntryEnvironment(configuration) {
  const o = { model: 'workshop-fighter', headings: [0], pace: 4, seconds: 14, seed: 1, fallPenalty: 20, overspeedCost: 0, rewardReserve: 0, ...configuration };
  if (!o.settings || !Array.isArray(o.headings) || !o.headings.length || !o.headings.every(Number.isFinite)
    || !Number.isFinite(o.pace) || o.pace <= 0 || !Number.isFinite(o.seconds) || o.seconds <= 0)
    throw Error('Option entry needs a record, finite headings and positive pace and duration');
  const paces = o.paces ?? [o.pace];
  if (!Array.isArray(paces) || !paces.length || !paces.every(p => Number.isFinite(p) && p > 0))
    throw Error('Option entry paces are finite and positive');
  if (o.rewardPace !== undefined && (!Number.isFinite(o.rewardPace) || o.rewardPace <= 0))
    throw Error('Option entry reward pace is finite and positive');
  if (!Number.isFinite(o.overspeedCost) || o.overspeedCost < 0) throw Error('Option entry overspeed cost is finite and nonnegative');
  if (!Number.isFinite(o.rewardReserve) || o.rewardReserve < 0) throw Error('Option entry reward reserve is finite and nonnegative');
  const samePace = (a, b) => Math.abs(a - b) <= 8 * Number.EPSILON * Math.max(1, a, b);
  const settings = JSON.parse(readFileSync(o.settings, 'utf8'));
  if (!settings.learned || !settings.envelope || settings.learned.decisionSteps !== 4)
    throw Error('Option entry needs learned corrections, an explicit envelope and four-step decisions');
  const { steered: _, ...networks } = settings.learned;
  const trainingActor = o.trainingActor ?? 'velocity';
  if (trainingActor !== 'velocity' && trainingActor !== 'slow-velocity') throw Error('Option entry trains velocity or slow-velocity');
  if (trainingActor === 'slow-velocity' && !networks.slowVelocity) throw Error('Option entry low-speed training needs its actor');
  const actor = recoveryNetwork(trainingActor === 'slow-velocity' ? networks.slowVelocity.network : networks.velocity);
  const tuning = { ...settings, learned: { ...networks, ...(o.ordinary ? {} : { steered: trainingActor }) } };
  const base = defaultMind(o.model);
  const mind = { ...base, tuning: { ...base.tuning, parts: { ...base.tuning?.parts, legs: { ...MOVE,
    gaits: STOCK_GAITS.map(gait => ({ ...gait, legs: { ...gait.legs, tuning } })) } } } };
  const built = await LONE_WORLD.build({ kind: 'lone', engine: o.engine ?? DEFAULT_ENGINE, lone: {
    model: o.model, mind, floorSize: 400, balance: 0, seed: o.seed, script: [],
    loadout: o.loadout ?? { left: 'empty', right: 'empty' }, ...(o.gusts ? { gusts: true } : {}),
  } });
  if ('refused' in built) throw Error(built.refused);
  try {
    const states = learnedState(built.body.minded.state);
    if (states.length !== 1) throw Error('Option entry needs one shared learned run state');
    const state = states[0], { world, body } = built;
    const parts = [...body.built.segments.values()], mass = massOf(parts), upright = uprightness(body.built);
    const centre = new Vector3(), velocity = new Vector3(), work = new Vector3();
    const physical = () => {
      massCentreToRef(parts, mass, centre, work, velocity);
      return { time: world.time, centre: [centre.x, centre.y, centre.z], velocity: [velocity.x, velocity.y, velocity.z],
        down: upright.fallen(), ...(o.controlTrace ? { control: { steps: state.inference.steps, command: state.inference.command,
          face: state.inference.face, origin: { ...state.inference.origin }, crossTrack: state.inference.observation[16],
          heading: state.motion.walkRun.heading,
          action: state.inference.velocityAction.slice() } } : {}), ...(o.trace ? { segments: parts.map(p => ({ name: p.name,
          position: [p.pose.position.x, p.pose.position.y, p.pose.position.z],
          rotation: [p.pose.rotation.x, p.pose.rotation.y, p.pose.rotation.z, p.pose.rotation.w] })) } : {}) };
    };
    while (world.time < 1 - world.dt / 2) world.step();
    const initial = physical();
    if (initial.down || Math.hypot(initial.velocity[0], initial.velocity[2]) >= .15)
      throw Error('Option entry fixture did not reach quiet rest');
    const saved = LONE_WORLD.save(built), snapshots = new Map(), entries = [];
    for (const heading of new Set(o.headings)) for (const pace of new Set(paces)) {
      LONE_WORLD.load(built, saved);
      const angle = heading * Math.PI / 180, direction = { x: sin(angle), z: cos(angle) };
      built.state.script.orders = { move: { kind: 'direct', direction }, gait: 'run', pace, face: null };
      const prelude = [];
      let snapshot = saved;
      // The Mind first delivers its walking cap, then the selected travel cap. Retain that
      // command-delivery prefix and start before the first decision at the requested pace.
      while (!samePace(state.inference.command, pace)) {
        snapshot = LONE_WORLD.save(built);
        if (!o.ordinary) state.learner.outputs = actor(state.inference.observation);
        world.step(); const sample = physical();
        if (!samePace(state.inference.command, pace)) prelude.push(sample);
        if (prelude.length > 6 * world.hz) throw Error(`Option entry did not reach ${pace} m/s at heading ${heading}`);
      }
      LONE_WORLD.load(built, snapshot);
      if (state.motion.walkRun.running || prelude.some(s => s.down))
        throw Error(`Option entry prefix includes learned running or a fall at heading ${heading}`);
      snapshots.set(`${heading}/${pace}`, { snapshot, prelude, direction });
      entries.push({ heading, pace, prefixSeconds: prelude.length / world.hz, running: state.motion.walkRun.running });
    }
    let word = o.seed >>> 0, episode;
    const reset = async given => {
      word = (Math.imul(word, 1664525) + 1013904223) >>> 0;
      const choices = o.headings.flatMap(heading => paces.map(pace => ({ heading, pace })))
        .filter(c => (given?.heading === undefined || c.heading === given.heading) && (given?.pace === undefined || c.pace === given.pace));
      if (!choices.length) throw Error('Option entry reset names a configured heading and pace');
      const { heading, pace } = choices[Math.floor(word / 4294967296 * choices.length)];
      const { snapshot, prelude, direction } = snapshots.get(`${heading}/${pace}`);
      LONE_WORLD.load(built, snapshot);
      built.state.script.orders = { move: { kind: 'direct', direction }, gait: 'run', pace, face: null };
      episode = { ticks: prelude.length, heading, pace, rewardPace: o.rewardPace ?? pace + o.rewardReserve, direction,
        along: prelude.reduce((n, s) => n + s.velocity[0] * direction.x + s.velocity[2] * direction.z, 0),
        maxOff: prelude.reduce((n, s) => Math.max(n, Math.abs((s.centre[0] - initial.centre[0]) * direction.z - (s.centre[2] - initial.centre[2]) * direction.x)), 0),
        origin: initial.centre, samples: o.trace ? prelude.slice() : null };
      return state.inference.observation.slice();
    };
    const step = (action, { squashed = false } = {}) => {
      if (!Array.isArray(action) || action.length !== 12 || !action.every(Number.isFinite)
        || squashed && action.some(x => Math.abs(x) > 1)) throw Error('Option entry needs twelve finite bounded actions');
      if (!o.ordinary) state.learner.outputs = squashed ? action.slice() : action.map(tanh);
      let down = false, along = 0;
      const samples = o.trace ? [] : null;
      for (let i = 0; i < 4 && episode.ticks < Math.round(o.seconds * world.hz); i++) {
        world.step(); const sample = physical(); samples?.push(sample); episode.samples?.push(sample); episode.ticks++;
        const d = episode.direction;
        along = velocity.x * d.x + velocity.z * d.z;
        episode.along += along;
        episode.maxOff = Math.max(episode.maxOff, Math.abs((centre.x - episode.origin[0]) * d.z - (centre.z - episode.origin[2]) * d.x));
        down ||= sample.down;
        if (down || episode.maxOff > 1) break;
      }
      const d = episode.direction, cross = velocity.x * d.z - velocity.z * d.x;
      const effort = state.inference.velocityAction.reduce((n, v) => n + v * v, 0) / 12;
      const reward = 1 - Math.max(0, episode.rewardPace - along) / episode.rewardPace + .15 * state.inference.observation[9]
        - .1 * cross ** 2 - .05 * episode.maxOff ** 2 - .005 * effort
        - o.overspeedCost * Math.max(0, along - episode.rewardPace) ** 2 - (down || episode.maxOff > 1 ? o.fallPenalty : 0);
      return { observation: state.inference.observation.slice(), reward, ...(o.trace ? { samples } : {}),
        terminated: down || episode.maxOff > 1, truncated: episode.ticks >= Math.round(o.seconds * world.hz),
        info: { along: episode.along / episode.ticks, command: episode.pace, down, corridor: episode.maxOff,
          seconds: episode.ticks / world.hz, heading: episode.heading } };
    };
    await reset();
    return { observationSize: 49, actionSize: 12, layout: RESIDUAL_LAYOUT, reset, step,
      samples: () => episode.samples, observation: () => state.inference.observation.slice(), entries,
      dispose: () => built.dispose(), harness: { name: 'Node lone world Option Mind', engine: o.engine ?? DEFAULT_ENGINE,
        hz: world.hz, balance: 0, model: o.model, seed: o.seed, gusts: !!o.gusts,
        loadout: o.loadout ?? { left: 'empty', right: 'empty' }, protocol: 'heading-entry',
        pace: paces.length === 1 ? paces[0] : null, paces: paces.slice(), rewardPace: o.rewardPace ?? (paces.length === 1 ? paces[0] + o.rewardReserve : null),
        overspeedCost: o.overspeedCost, rewardReserve: o.rewardReserve, trainingActor, steered: !o.ordinary } };
  } catch (error) { built.dispose(); throw error; }
}
