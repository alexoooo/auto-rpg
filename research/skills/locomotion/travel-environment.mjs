/** One travel actor over scripted game orders, from quiet rest or physically reached moving states.
 * Every prefix uses the configured Option Mind. Snapshots retain physics, perception, orders,
 * native gait and learner state. Rewards read post-step COM velocity, physical falls and the
 * requested line. A failed prefix is reported and excluded; a failed episode costs more than
 * its complete positive credit. Explicit scripts use the same mechanism as the curriculum.
 */
import '../../../tests/harness/preload-data.mjs';
import { readFileSync } from 'node:fs';
import { LONE_WORLD } from '../../../src/app/node/evaluation.ts';
import { defaultMind } from '../../../src/app/catalog.ts';
import { DEFAULT_ENGINE } from '../../../src/core/physics/engines.ts';
import { massCentreToRef, massOf } from '../../../src/core/bodies/read-motion.ts';
import { Vector3 } from '../../../src/core/math/vector.ts';
import { exp, sin, cos } from '../../../src/core/math/real.ts';
import { pending } from '../../../src/core/math/learning/learner.ts';
import { uprightness } from '../../../src/control/ground.ts';
import { footStatesOf, groundContact } from '../../../src/control/support.ts';
import { MOVE } from '../../../src/skills/locomotion/move-part.ts';
import { STOCK_GAITS } from '../../../src/skills/locomotion/gaits.ts';
import { TRAVEL_LAYOUT } from '../../../src/skills/locomotion/learned-run.ts';
import { isOrders } from '../../../src/minds/orders.ts';
import { decide } from '../../learner-adapter.mjs';

const tanh = value => { const t = exp(-2 * Math.abs(value)); return (value < 0 ? -1 : 1) * (1 - t) / (1 + t); };

export async function travelEnvironment(configuration) {
  const o = { model: 'workshop-fighter', seed: 1, heading: 0, warmPaces: [1, 2, 3, 4, 4.5],
    starts: [2, 3, 4, 5, 5.25, 5.5, 5.75, 7, 7.25, 7.5, 7.75, 9],
    restTimes: [1],
    reserve: .3, overspeedCost: .1, uprightCredit: .15, sideCost: .1, corridorCost: .05, effortCost: .005,
    ...configuration };
  if (!o.settings || !Array.isArray(o.scripts) || !o.scripts.length) throw Error('Travel training needs a record and order scripts');
  const validProgram = p => p && typeof p === 'object' && typeof p.start === 'string' && p.start.length > 0 && Array.isArray(p.cues) && p.cues.length > 0
    && Number.isFinite(p.seconds) && p.seconds > 0 && (p.weight === undefined || Number.isFinite(p.weight) && p.weight > 0)
    && p.cues.every((c, i) => c && Number.isFinite(c.at) && c.at >= 0 && c.at < p.seconds && (i === 0 || c.at >= p.cues[i - 1].at)
      && isOrders(c.orders) && (c.orders.move === null || c.orders.move.kind === 'direct' && Number.isFinite(c.orders.pace) && c.orders.pace > 0));
  if (!o.scripts.every(validProgram)) throw Error('Travel scripts need ordered direct-movement/stop cues and positive durations and weights');
  for (const name of ['warmPaces', 'starts', 'restTimes']) if (!Array.isArray(o[name]) || !o[name].length || !o[name].every(x => Number.isFinite(x) && x > 0))
    throw Error(`Travel ${name} must contain positive finite values`);
  if (!Number.isFinite(o.heading) || o.headings !== undefined && (!Array.isArray(o.headings) || !o.headings.length || !o.headings.every(Number.isFinite)))
    throw Error('Travel headings must be finite angles');
  for (const name of ['reserve', 'overspeedCost', 'uprightCredit', 'sideCost', 'corridorCost', 'effortCost'])
    if (!Number.isFinite(o[name]) || o[name] < 0) throw Error(`Travel ${name} must be finite and nonnegative`);
  if (o.loadouts !== undefined && (!Array.isArray(o.loadouts) || !o.loadouts.length)) throw Error('Travel loadouts must be a nonempty list');
  const heading = o.headings ? o.headings[(o.seed >>> 0) % o.headings.length] : o.heading;
  const rotation = heading - o.heading, cr = cos(rotation), sr = sin(rotation);
  const turn = v => ({ x: v.x * cr + v.z * sr, z: v.z * cr - v.x * sr });
  // A heading variation rotates the body and its complete order programs together.
  const scripts = rotation === 0 ? o.scripts : o.scripts.map(p => ({ ...p, cues: p.cues.map(c => ({ ...c, orders: {
    ...c.orders, move: c.orders.move === null ? null : { ...c.orders.move, direction: turn(c.orders.move.direction) },
    face: c.orders.face === null ? null : turn(c.orders.face),
  } })) }));
  const tuning = JSON.parse(readFileSync(o.settings, 'utf8'));
  if (!tuning.learned?.travel || !tuning.envelope) throw Error('Travel training needs its single actor and an explicit development envelope');
  const loadout = o.loadouts ? o.loadouts[(o.seed >>> 0) % o.loadouts.length] : o.loadout ?? { left: 'empty', right: 'empty' };
  const base = defaultMind(o.model);
  const mind = { ...base, tuning: { ...base.tuning, parts: { ...base.tuning?.parts, legs: { ...MOVE,
    gaits: STOCK_GAITS.map(gait => ({ ...gait, legs: { ...gait.legs, tuning } })) } } } };
  const built = await LONE_WORLD.build({ kind: 'lone', engine: o.engine ?? DEFAULT_ENGINE, lone: {
    model: o.model, mind, floorSize: 400, balance: 0, heading, seed: o.seed, loadout,
    script: [], ...(o.gusts ? { gusts: true } : {}),
  } });
  if ('refused' in built) throw Error(built.refused);
  try {
    // The report's mind uses recovery-wrapped Move; its gaits share one walk/run state.
    const states = [...new Set(built.body.minded.state.mind.skills.legs.legs.gaits)];
    if (states.length !== 1) throw Error('Travel training requires one shared physical travel learner');
    const state = states[0], learner = state.learner, { world, body } = built;
    const parts = [...body.built.segments.values()], mass = massOf(parts), upright = uprightness(body.built), feet = footStatesOf(body.built);
    const centre = new Vector3(), velocity = new Vector3(), work = new Vector3();
    const forward = { x: sin(heading), z: cos(heading) };
    const go = pace => ({ move: { kind: 'direct', direction: forward }, gait: 'run', pace, face: null });
    const physical = () => {
      massCentreToRef(parts, mass, centre, work, velocity);
      const standing = !upright.fallen() && !upright.down() && feet.some(foot => foot.contactParts.some(part =>
        part.chain.every(joint => joint.attached()) && body.built.physics.contactsOf(part.segment.body).some(c => groundContact(c, .5))));
      return { time: world.time, centre: [centre.x, centre.y, centre.z], velocity: [velocity.x, velocity.y, velocity.z],
        down: upright.fallen(), standing,
        ...(o.controlTrace ? { control: { running: state.motion.walkRun.running, travel: state.inference.travel,
          command: state.inference.command, phase: state.motion.run.phase, action: state.inference.action.slice() } } : {}),
        ...(o.trace ? { segments: parts.map(p => ({ name: p.spec.name, position: [p.pose.position.x, p.pose.position.y, p.pose.position.z],
          rotation: [p.pose.rotation.x, p.pose.rotation.y, p.pose.rotation.z, p.pose.rotation.w] })) } : {}) };
    };
    const rests = [], times = [...new Set(o.restTimes)].sort((a, b) => a - b);
    for (const requested of times) {
      while (world.time < requested - world.dt / 2 || !pending(learner)) {
        world.step();
        if (world.time > requested + 1) throw Error('Travel fixture did not reach a quiet learner request');
      }
      const sample = physical();
      if (sample.down || !sample.standing || Math.hypot(velocity.x, velocity.z) >= .15)
        throw Error(`Travel fixture did not reach quiet rest at ${requested} s`);
      rests.push({ id: times.length === 1 ? 'rest' : `rest/${requested}`, kind: 'rest', requested,
        snapshot: LONE_WORLD.save(built), time: world.time, centre: sample.centre });
    }
    const rest = rests[0], starts = [...rests], rejected = [], entries = [];
    const movingStarts = scripts.some(p => p.start !== 'rest' && !p.start.startsWith('rest/'));
    if (movingStarts) for (const pace of o.warmPaces) {
      LONE_WORLD.load(built, rest.snapshot); built.state.script.orders = go(pace);
      const history = [], origin = rest.centre;
      let fell = false, maxOff = 0;
      for (const requested of [...new Set(o.starts)].sort((a, b) => a - b)) {
        while (!fell && maxOff <= 1 && (world.time < requested - world.dt / 2 || !pending(learner))) {
          world.step(); const sample = physical(); history.push(sample); fell ||= sample.down;
          maxOff = Math.max(maxOff, Math.abs((centre.x - origin[0]) * forward.z - (centre.z - origin[2]) * forward.x));
          if (fell || maxOff > 1) break;
        }
        const window = history.slice(-world.hz), speed = window.reduce((n, s) => n + s.velocity[0] * forward.x + s.velocity[2] * forward.z, 0) / world.hz;
        if (fell || maxOff > 1 || window.length !== world.hz || speed < pace || !pending(learner)) {
          rejected.push({ pace, requested, time: world.time, speed, down: fell, corridor: maxOff });
          continue;
        }
        const support = feet.filter(foot => foot.contactParts.some(part => part.chain.every(joint => joint.attached())
          && body.built.physics.contactsOf(part.segment.body).some(c => groundContact(c, .5)))).map(foot => foot.side);
        const entry = { id: `${pace}/${requested}`, pace, requested, time: world.time, speed, phase: state.motion.run.phase, support };
        starts.push({ ...entry, kind: 'moving', snapshot: LONE_WORLD.save(built) }); entries.push(entry);
      }
    }
    if (movingStarts && !entries.length) throw Error(`Travel fixtures reached no moving starts: ${JSON.stringify(rejected)}`);
    let word = o.seed >>> 0, episode;
    const random = () => { word = (Math.imul(word, 1664525) + 1013904223) >>> 0; return word / 4294967296; };
    const pick = values => values[Math.floor(random() * values.length)];
    const totalWeight = scripts.reduce((sum, p) => sum + (p.weight ?? 1), 0);
    const pickProgram = () => {
      let draw = random() * totalWeight;
      for (const p of scripts) if ((draw -= p.weight ?? 1) < 0) return p;
      return scripts.at(-1);
    };
    const reset = async given => {
      const program = given?.program ?? pickProgram();
      if (!validProgram(program)) throw Error('A travel episode names ordered movement/stop cues and a positive duration');
      const candidates = program.start === 'rest' ? rests : program.start === 'moving' ? starts.filter(s => s.kind === 'moving') : starts.filter(s => s.id === program.start);
      if (!candidates.length) throw Error(`Travel episode start is unreached: ${program.start}`);
      const start = pick(candidates); LONE_WORLD.load(built, start.snapshot); physical();
      episode = { program, start, began: world.time, next: 0, ticks: 0, requested: forward, pace: start.pace ?? 0,
        origin: { x: centre.x, z: centre.z }, corridorEnabled: program.corridor !== false, maxOff: 0,
        along: 0, shortfall: 0, quiet: 0, quietMax: 0, stopScale: Math.max(1, Math.hypot(velocity.x, velocity.z)), samples: [] };
      deliver();
      return learner.inputs.slice();
    };
    const deliver = () => {
      while (episode.next < episode.program.cues.length && Math.round(episode.program.cues[episode.next].at * world.hz) <= episode.ticks) {
        const cue = episode.program.cues[episode.next++], orders = cue.orders;
        if (orders.move?.kind === 'direct') {
          const d = orders.move.direction, length = Math.hypot(d.x, d.z);
          if (!(length > 0)) throw Error('Travel direction must be nonzero');
          if (episode.requested.x !== d.x / length || episode.requested.z !== d.z / length || cue.line === 'start')
            Object.assign(episode.origin, { x: centre.x, z: centre.z });
          episode.requested = { x: d.x / length, z: d.z / length }; episode.pace = orders.pace ?? 4;
        } else { episode.pace = 0; episode.stopScale = Math.max(1, Math.hypot(velocity.x, velocity.z)); }
        if (cue.corridor !== undefined) episode.corridorEnabled = cue.corridor;
        // Snapshot loads mutate live orders in place; the curriculum owns its separate copy.
        built.state.script.orders = structuredClone(orders);
      }
    };
    const step = (action, { squashed = false } = {}) => {
      if (!Array.isArray(action) || action.length !== TRAVEL_LAYOUT.outputs.length || !action.every(Number.isFinite)
        || squashed && action.some(x => Math.abs(x) > 1)) throw Error('Travel needs one finite bounded action per named output');
      let down = false;
      const samples = o.trace ? [] : null, limit = Math.round(episode.program.seconds * world.hz);
      const applied = squashed ? action.slice() : action.map(tanh), effort = applied.reduce((n, v) => n + v * v, 0) / applied.length;
      const played = decide(learner, applied, () => {
        deliver(); world.step(); const sample = physical(); samples?.push(sample); if (o.trace) episode.samples.push(sample); episode.ticks++;
        const d = episode.requested, along = velocity.x * d.x + velocity.z * d.z, cross = velocity.x * d.z - velocity.z * d.x;
        const off = Math.abs((centre.x - episode.origin.x) * d.z - (centre.z - episode.origin.z) * d.x);
        if (episode.corridorEnabled) episode.maxOff = Math.max(episode.maxOff, off);
        down ||= sample.down;
        const speed = Math.hypot(velocity.x, velocity.z), target = episode.pace + o.reserve;
        const progress = episode.pace > 0 ? Math.max(0, Math.min(1, along / target))
          : .5 * Math.max(0, 1 - speed / episode.stopScale) + .5 * exp(-((speed / .3) ** 2));
        const rate = Math.max(0, progress + o.uprightCredit * Math.max(0, Math.min(1, state.inference.observation[9]))
          - o.sideCost * cross ** 2 - o.corridorCost * off ** 2 - o.effortCost * effort
          - (episode.pace > 0 ? o.overspeedCost * Math.max(0, along - target) ** 2 : 0));
        const failed = down || episode.maxOff > 1;
        episode.along += along; episode.shortfall += episode.pace > 0 ? Math.max(0, episode.pace - along) / episode.pace : speed / episode.stopScale;
        episode.quiet = episode.pace === 0 && speed < .15 && sample.standing ? episode.quiet + 1 : 0;
        episode.quietMax = Math.max(episode.quietMax, episode.quiet);
        return { reward: rate * world.dt - (failed ? Math.max(o.fallPenalty ?? 0, (1 + o.uprightCredit) * episode.program.seconds + 1) : 0),
          ended: failed ? 'terminated' : episode.ticks >= limit ? 'truncated' : null };
      }, world.dt);
      return { observation: state.inference.observation.slice(), reward: played.reward, ...(o.trace ? { samples } : {}),
        terminated: played.ended === 'terminated' || played.ended === 'done', truncated: played.ended === 'truncated',
        info: { along: episode.along / episode.ticks, command: episode.pace, down, corridor: episode.maxOff,
          shortfall: episode.shortfall / episode.ticks, quiet: episode.quietMax / world.hz, seconds: episode.ticks / world.hz,
          worldSteps: played.steps, worldSeconds: played.seconds } };
    };
    await reset();
    return { observationSize: TRAVEL_LAYOUT.inputs.length, actionSize: TRAVEL_LAYOUT.outputs.length,
      layout: { ...TRAVEL_LAYOUT, interval: learner.interval }, reset, step, entries, rejected,
      rests: rests.map(({ snapshot, ...recipe }) => recipe),
      samples: () => episode.samples, observation: () => state.inference.observation.slice(), reading: physical,
      program: () => ({ program: episode.program, start: { id: episode.start.id, time: episode.start.time }, began: episode.began, delivered: episode.next,
        warmup: episode.start.kind === 'rest' ? null : { at: rest.time, orders: go(episode.start.pace) } }),
      dispose: () => built.dispose(), harness: { name: 'Node lone world Option Mind', engine: o.engine ?? DEFAULT_ENGINE,
        hz: world.hz, balance: 0, model: o.model, loadout, seed: o.seed, heading, gusts: !!o.gusts } };
  } catch (error) { built.dispose(); throw error; }
}
