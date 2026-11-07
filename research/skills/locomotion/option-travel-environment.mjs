/** Braking from physically reached Option Mind runs, with the configured travel record.
 * A prefix is played once per environment. Snapshots keep physics, perception, orders and the
 * complete controller state. An episode starts at the braking learner's first request, with the
 * stop command's delivery delay retained in its reading, and steps through the learning adapter
 * (`research/learner-adapter.mjs`); `brakingPolicy` replaces the record's braking actor.
 * Rewards are credit per second, scaled to the 30 decisions a second they were tuned per decision
 * at; a fall or corridor exit costs `fallPenalty` once. `speedCost` adds dense horizontal-speed
 * cost while the narrow quiet-speed credit remains.
 */
import '../../../tests/harness/preload-data.mjs';
import { readFileSync } from 'node:fs';
import { LONE_WORLD } from '../../../src/app/node/evaluation.ts';
import { defaultMind } from '../../../src/app/catalog.ts';
import { DEFAULT_ENGINE } from '../../../src/core/physics/engines.ts';
import { massCentreToRef, massOf } from '../../../src/core/bodies/read-motion.ts';
import { Vector3 } from '../../../src/core/math/vector.ts';
import { exp } from '../../../src/core/math/real.ts';
import { pending } from '../../../src/core/math/learning/learner.ts';
import { decide } from '../../learner-adapter.mjs';
import { MOVE } from '../../../src/skills/locomotion/move-part.ts';
import { STOCK_GAITS } from '../../../src/skills/locomotion/gaits.ts';
import { RESIDUAL_LAYOUT } from './residual-environment.mjs';
import { footOn } from '../../../src/control/support.ts';

/** The one shared physical walk/run record below its permission views. */
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

export async function optionTravelEnvironment(configuration) {
  const o = { model: 'workshop-fighter', starts: [15, 15.25, 15.5, 15.75], seconds: 4,
    speedWidth: .3, speedCost: 0, fallPenalty: 5, seed: 1, ...configuration };
  if (!o.settings || !Array.isArray(o.starts) || !o.starts.length || !o.starts.every(t => Number.isFinite(t) && t >= 5))
    throw Error('Option travel training names a record and physically played start times');
  if (!Number.isFinite(o.speedCost) || o.speedCost < 0) throw Error('Option travel speed cost is finite and nonnegative');
  const settings = JSON.parse(readFileSync(o.settings, 'utf8'));
  if (o.brakingPolicy) settings.learned = { ...settings.learned, braking: JSON.parse(readFileSync(o.brakingPolicy, 'utf8')) };
  if (!settings.learned || !settings.envelope) throw Error('Option travel training requires learned corrections and an explicit envelope');
  const { steered: _, ...networks } = settings.learned;
  const tuning = { ...settings, learned: { ...networks, steered: 'braking' } };
  const base = defaultMind(o.model);
  const mind = { ...base, tuning: { ...base.tuning, parts: { ...base.tuning?.parts, legs: { ...MOVE,
    gaits: STOCK_GAITS.map(gait => ({ ...gait, legs: { ...gait.legs, tuning } })) } } } };
  const forward = { x: 0, z: 1 };
  const built = await LONE_WORLD.build({ kind: 'lone', engine: o.engine ?? DEFAULT_ENGINE, lone: {
    model: o.model, mind, floorSize: 400, balance: 0, seed: o.seed,
    loadout: o.loadout ?? { left: 'empty', right: 'empty' }, ...(o.gusts ? { gusts: true } : {}),
    script: [{ at: 1, orders: { move: { kind: 'direct', direction: forward }, gait: 'run', pace: 4, face: null } }],
  } });
  if ('refused' in built) throw Error(built.refused);
  try {
    const states = learnedState(built.body.minded.state);
    if (states.length !== 1) throw Error('Option travel training needs one shared learned run state');
    const state = states[0], learner = state.learner, { world, body } = built;
    const parts = [...body.built.segments.values()], mass = massOf(parts);
    const feet = ['left', 'right'].map(side => body.built.segments.get(footOn(body.built.spec, side)));
    const centre = new Vector3(), velocity = new Vector3(), work = new Vector3();
    const snapshots = new Map(), history = [], entries = [];
    let word = o.seed >>> 0, episode = null;
    const physical = () => {
      massCentreToRef(parts, mass, centre, work, velocity);
      return { time: world.time, centre: [centre.x, centre.y, centre.z], velocity: [velocity.x, velocity.y, velocity.z], down: body.body.down,
        ...(o.controlTrace ? { control: { running: state.motion.walkRun.running, pace: state.motion.run.pace,
          command: state.inference.command, phase: state.motion.run.phase, idlePlacement: !!state.motion.legs.idle.target,
          velocityAction: state.inference.velocityAction.slice(), referenceAction: state.inference.referenceAction.slice(),
          feet: feet.map(foot => {
            const end = body.body.state.mind.host.motor.stance.reading.ends[foot.spec.name];
            return { name: foot.spec.name, middleHeight: end.middle.y,
              grounded: body.built.physics.contactsOf(foot.body).some(c => c.other === null && c.impulse > 0 && c.normal[1] < -.5),
              askedForce: [end.asked.force.x, end.asked.force.y, end.asked.force.z] };
          }) } } : {}),
        ...(o.trace ? { standing: !body.body.down && feet.some(foot => body.built.physics.contactsOf(foot.body)
          .some(contact => contact.other === null && contact.impulse > 0 && contact.normal[1] < -.5)) } : {}),
        ...(o.trace ? { segments: parts.map(p => ({ name: p.name, position: [p.pose.position.x, p.pose.position.y, p.pose.position.z],
          rotation: [p.pose.rotation.x, p.pose.rotation.y, p.pose.rotation.z, p.pose.rotation.w] })) } : {}) };
    };
    for (const start of [...new Set(o.starts)].sort((a, b) => a - b)) {
      while (world.time < start - world.dt / 2) { world.step(); history.push(physical()); }
      const window = history.slice(-world.hz), entry = window.reduce((n, s) => n + s.velocity[2], 0) / world.hz;
      if (window.length !== world.hz || entry < 4 || body.body.down || !state.motion.walkRun.running || Math.abs(centre.x) > 1)
        throw Error(`Option travel fixture unreached at ${start}s: rolling speed ${entry}, down ${body.body.down}, corridor ${Math.abs(centre.x)}`);
      const warm = LONE_WORLD.save(built), prelude = [];
      built.state.script.orders = { move: null, face: forward };
      // The stop order's delivery, up to the braking learner's first request, is the episode's prelude.
      while (!pending(learner)) {
        world.step(); prelude.push(physical());
        if (prelude.length > 16) throw Error('Option travel stop did not reach its braking learner');
      }
      snapshots.set(start, { snapshot: LONE_WORLD.save(built), prelude });
      entries.push({ start, entry });
      LONE_WORLD.load(built, warm);
    }
    const reset = async given => {
      word = (Math.imul(word, 1664525) + 1013904223) >>> 0;
      const start = given?.start ?? o.starts[Math.floor(word / 4294967296 * o.starts.length)];
      if (!snapshots.has(start)) throw Error('Option travel reset needs a retained reached start');
      const cached = snapshots.get(start);
      LONE_WORLD.load(built, cached.snapshot);
      built.state.script.orders = { move: null, face: forward };
      episode = { start, ticks: cached.prelude.length,
        maxOff: cached.prelude.reduce((n, s) => Math.max(n, Math.abs(s.centre[0])), 0),
        along: cached.prelude.reduce((n, s) => n + s.velocity[2], 0), samples: o.trace ? cached.prelude.slice() : null };
      return learner.inputs.slice();
    };
    const step = (action, { squashed = false } = {}) => {
      if (!Array.isArray(action) || action.length !== 12 || !action.every(Number.isFinite)) throw Error('Option travel needs twelve finite actions');
      if (squashed && action.some(x => Math.abs(x) > 1)) throw Error('Option travel squashed action exceeds one');
      const samples = o.trace ? [] : null, limit = Math.round(o.seconds * world.hz);
      let down = false;
      const played = decide(learner, squashed ? action.slice() : action.map(tanh), () => {
        world.step(); const sample = physical(); samples?.push(sample); episode.samples?.push(sample); episode.ticks++;
        episode.along += velocity.z; episode.maxOff = Math.max(episode.maxOff, Math.abs(centre.x));
        down ||= sample.down;
        const failed = down || episode.maxOff > 1, speed = Math.sqrt(velocity.x ** 2 + velocity.z ** 2);
        const effort = state.inference.velocityAction.reduce((n, v) => n + v * v, 0) / 12;
        const rate = exp(-((speed / o.speedWidth) ** 2)) + .15 * state.inference.observation[9]
          - .1 * velocity.x ** 2 - .05 * centre.x ** 2 - .005 * effort - o.speedCost * speed;
        return { reward: rate * 30 * world.dt - (failed ? o.fallPenalty : 0),
          ended: failed ? 'terminated' : episode.ticks >= limit ? 'truncated' : null };
      }, world.dt);
      return { observation: state.inference.observation.slice(), reward: played.reward, ...(o.trace ? { samples } : {}),
        terminated: played.ended === 'terminated' || played.ended === 'done', truncated: played.ended === 'truncated',
        info: { along: episode.along / episode.ticks, command: 4, down, corridor: episode.maxOff,
          seconds: episode.ticks / world.hz, warmStart: { start: episode.start }, entry: entries.find(e => e.start === episode.start).entry,
          worldSteps: played.steps, worldSeconds: played.seconds } };
    };
    await reset();
    return { observationSize: 49, actionSize: 12, layout: { ...RESIDUAL_LAYOUT, interval: learner.interval }, reset, step,
      samples: () => episode.samples, entries, reading: physical, observation: () => state.inference.observation.slice(),
      dispose: () => built.dispose(), harness: { name: 'Node lone world Option Mind', engine: o.engine ?? DEFAULT_ENGINE, hz: world.hz, balance: 0,
        model: o.model, loadout: o.loadout ?? { left: 'empty', right: 'empty' }, seed: o.seed, gusts: !!o.gusts,
        protocol: 'whole-stop-learner', speedCost: o.speedCost, fallPenalty: o.fallPenalty } };
  } catch (error) { built.dispose(); throw error; }
}
