/** One travel actor over scripted game orders (a direction at a pace, a place, a stop), from quiet rest or physically reached moving states.
 * Every prefix uses the configured Option Mind. Snapshots retain physics, perception, orders,
 * native gait and learner state. Rewards read post-step COM velocity, physical falls and the
 * requested line. A failed prefix is reported and excluded; a fall costs more than any
 * episode earns, and leaving the corridor ends one. Explicit scripts use the same mechanism as the curriculum.
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
import { GOING } from '../../../src/skills/locomotion/move-part.ts';
import { STOCK_GAITS } from '../../../src/skills/locomotion/gaits.ts';
import { TRAVEL_LAYOUT } from '../../../src/skills/locomotion/learned-run.ts';
import { isOrders } from '../../../src/minds/orders.ts';
import { decide, untilAsked } from '../../learner-adapter.mjs';

const tanh = value => { const t = exp(-2 * Math.abs(value)); return (value < 0 ? -1 : 1) * (1 - t) / (1 + t); };

export async function travelEnvironment(configuration) {
  const o = { model: 'man', seed: 1, heading: 0, warmPaces: [1, 2, 3, 4, 4.5],
    starts: [2, 3, 4, 5, 5.25, 5.5, 5.75, 7, 7.25, 7.5, 7.75, 9],
    restTimes: [1],
    reserve: .3, overspeedCost: .1, uprightCredit: .15, sideCost: .1, corridorCost: .05, effortCost: .005,
    // From `reach` s after a pace order, each m/s its last second's mean falls short of the pace costs `lateCost` a second;
    // from `stopReach` s after a stop order, each m/s of speed over `still` does.
    lateCost: 0, reach: 4, stopReach: Infinity, still: .15,
    ...configuration };
  if (!o.settings || !Array.isArray(o.scripts) || !o.scripts.length) throw Error('Travel training needs a record and order scripts');
  const validProgram = p => p && typeof p === 'object' && typeof p.start === 'string' && p.start.length > 0 && Array.isArray(p.cues) && p.cues.length > 0
    && Number.isFinite(p.seconds) && p.seconds > 0 && (p.weight === undefined || Number.isFinite(p.weight) && p.weight > 0)
    && p.cues.every((c, i) => c && Number.isFinite(c.at) && c.at >= 0 && c.at < p.seconds && (i === 0 || c.at >= p.cues[i - 1].at)
      && isOrders(c.orders) && (c.orders.move === null || c.orders.move.kind === 'direct' && Number.isFinite(c.orders.pace) && c.orders.pace > 0
        || c.orders.move.kind === 'place'));
  if (!o.scripts.every(validProgram)) throw Error('Travel scripts need ordered direct-movement, place or stop cues and positive durations and weights');
  for (const name of ['warmPaces', 'starts', 'restTimes']) if (!Array.isArray(o[name]) || !o[name].length || !o[name].every(x => Number.isFinite(x) && x > 0))
    throw Error(`Travel ${name} must contain positive finite values`);
  if (!Number.isFinite(o.heading) || o.headings !== undefined && (!Array.isArray(o.headings) || !o.headings.length || !o.headings.every(Number.isFinite)))
    throw Error('Travel headings must be finite angles');
  for (const name of ['reserve', 'overspeedCost', 'uprightCredit', 'sideCost', 'corridorCost', 'effortCost', 'lateCost', 'reach', 'still'])
    if (!Number.isFinite(o[name]) || o[name] < 0) throw Error(`Travel ${name} must be finite and nonnegative`);
  if (!(o.stopReach >= 0)) throw Error('Travel stopReach must be nonnegative');
  if (o.loadouts !== undefined && (!Array.isArray(o.loadouts) || !o.loadouts.length)) throw Error('Travel loadouts must be a nonempty list');
  const heading = o.headings ? o.headings[(o.seed >>> 0) % o.headings.length] : o.heading;
  // A rest can face away from the order (`yaws`, rad) and stand lowered (`lowers`, m), facing the order as it settles.
  for (const name of ['yaws', 'lowers']) if (o[name] !== undefined && (!Array.isArray(o[name]) || !o[name].length || !o[name].every(Number.isFinite)))
    throw Error(`Travel ${name} must be finite values`);
  const yaw = o.yaws ? o.yaws[(o.seed >>> 0) % o.yaws.length] : 0;
  const lower = o.lowers ? o.lowers[Math.floor((o.seed >>> 0) / 5) % o.lowers.length] : 0;
  const rotation = heading - o.heading, cr = cos(rotation), sr = sin(rotation);
  const turn = v => ({ x: v.x * cr + v.z * sr, z: v.z * cr - v.x * sr });
  // A heading variation rotates the body and its complete order programs together: a place's points about where the episode begins.
  const scripts = rotation === 0 ? o.scripts : o.scripts.map(p => ({ ...p, cues: p.cues.map(c => ({ ...c, orders: {
    ...c.orders, move: c.orders.move === null ? null : c.orders.move.kind === 'place' ? { ...c.orders.move, points: c.orders.move.points.map(turn) }
      : { ...c.orders.move, direction: turn(c.orders.move.direction) },
    face: c.orders.face === null ? null : turn(c.orders.face),
  } })) }));
  const tuning = JSON.parse(readFileSync(o.settings, 'utf8'));
  if (!tuning.learned?.travel || !tuning.envelope) throw Error('Travel training needs its single actor and an explicit development envelope');
  const loadout = o.loadouts ? o.loadouts[(o.seed >>> 0) % o.loadouts.length] : o.loadout ?? { left: 'empty', right: 'empty' };
  const base = defaultMind(o.model);
  const mind = { ...base, tuning: { ...base.tuning, parts: { ...base.tuning?.parts, legs: { ...GOING,
    gaits: STOCK_GAITS.map(gait => gait.legs.kind === 'walk-run' ? { ...gait, legs: { ...gait.legs, tuning } } : gait) } } } };
  const built = await LONE_WORLD.build({ kind: 'lone', engine: o.engine ?? DEFAULT_ENGINE, lone: {
    model: o.model, mind, floorSize: 400, balance: 0, heading: heading + yaw, seed: o.seed, loadout,
    script: yaw === 0 && lower === 0 ? [] : [{ at: 0, orders: { move: null, face: { x: sin(heading), z: cos(heading) }, ...(lower > 0 ? { lower } : {}) } }],
    ...(o.gusts ? { gusts: true } : {}),
  } });
  if ('refused' in built) throw Error(built.refused);
  try {
    // The report's mind uses recovery-wrapped Move; the run is its one gait with a learner.
    const states = built.body.minded.state.mind.skills.legs.legs.gaits.filter(gait => gait?.learner);
    if (states.length !== 1) throw Error('Travel training requires one learned travel gait');
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
          command: state.inference.command, phase: state.motion.run.phase, action: state.inference.action.slice(),
          touching: Object.fromEntries(feet.map(foot => [foot.side, foot.contactParts.some(part => part.chain.every(joint => joint.attached())
            && body.built.physics.contactsOf(part.segment.body).some(c => groundContact(c, .5)))])) } } : {}),
        ...(o.trace ? { segments: parts.map(p => ({ name: p.spec.name, position: [p.pose.position.x, p.pose.position.y, p.pose.position.z],
          rotation: [p.pose.rotation.x, p.pose.rotation.y, p.pose.rotation.z, p.pose.rotation.w] })) } : {}) };
    };
    const rests = [], times = [...new Set(o.restTimes)].sort((a, b) => a - b);
    for (const requested of times) {
      // At rest the braced gait has the legs; the run's learner asks once an order hands them to it.
      while (world.time < requested - world.dt / 2) world.step();
      const sample = physical();
      if (sample.down || !sample.standing || Math.hypot(velocity.x, velocity.z) >= .15)
        throw Error(`Travel fixture did not reach quiet rest at ${requested} s`);
      rests.push({ id: times.length === 1 ? 'rest' : `rest/${requested}`, kind: 'rest', requested,
        snapshot: LONE_WORLD.save(built), time: world.time, centre: sample.centre });
    }
    const starts = [...rests], rejected = [], entries = [];
    const fromRest = p => p.start === 'rest' || p.start.startsWith('rest/'), movingStarts = scripts.some(p => !fromRest(p));
    // A warm-up that reaches none of its starts is played again from the next rest.
    if (movingStarts) for (const pace of o.warmPaces) for (const from of rests) {
      if (entries.some(entry => entry.pace === pace)) break;
      LONE_WORLD.load(built, from.snapshot); built.state.script.orders = go(pace);
      const history = [], origin = from.centre;
      let fell = false, maxOff = 0;
      for (const requested of [...new Set(o.starts)].sort((a, b) => a - b)) {
        while (!fell && maxOff <= 1 && (world.time < requested - world.dt / 2 || !pending(learner))) {
          world.step(); const sample = physical(); history.push(sample); fell ||= sample.down;
          maxOff = Math.max(maxOff, Math.abs((centre.x - origin[0]) * forward.z - (centre.z - origin[2]) * forward.x));
          if (fell || maxOff > 1) break;
        }
        const window = history.slice(-world.hz), speed = window.reduce((n, s) => n + s.velocity[0] * forward.x + s.velocity[2] * forward.z, 0) / world.hz;
        if (fell || maxOff > 1 || window.length !== world.hz || speed < pace || !pending(learner)) {
          rejected.push({ pace, from: from.id, requested, time: world.time, speed, down: fell, corridor: maxOff });
          continue;
        }
        const support = feet.filter(foot => foot.contactParts.some(part => part.chain.every(joint => joint.attached())
          && body.built.physics.contactsOf(part.segment.body).some(c => groundContact(c, .5)))).map(foot => foot.side);
        const entry = { id: `${pace}/${requested}`, pace, requested, time: world.time, warmed: from.time, speed, phase: state.motion.run.phase, support };
        starts.push({ ...entry, kind: 'moving', snapshot: LONE_WORLD.save(built) }); entries.push(entry);
      }
    }
    // A body that reaches no moving start plays the episodes from rest alone; it has none to play when every one is moving.
    const played = entries.length ? scripts : scripts.filter(fromRest);
    if (!played.length) throw Error(`Travel fixtures reached no moving starts: ${JSON.stringify(rejected)}`);
    let word = o.seed >>> 0, episode;
    const random = () => { word = (Math.imul(word, 1664525) + 1013904223) >>> 0; return word / 4294967296; };
    const pick = values => values[Math.floor(random() * values.length)];
    const totalWeight = played.reduce((sum, p) => sum + (p.weight ?? 1), 0);
    const pickProgram = () => {
      let draw = random() * totalWeight;
      for (const p of played) if ((draw -= p.weight ?? 1) < 0) return p;
      return played.at(-1);
    };
    const reset = async given => {
      const program = given?.program ?? pickProgram();
      if (!validProgram(program)) throw Error('A travel episode names ordered movement/stop cues and a positive duration');
      const candidates = program.start === 'rest' ? rests : program.start === 'moving' ? starts.filter(s => s.kind === 'moving') : starts.filter(s => s.id === program.start);
      if (!candidates.length) throw Error(`Travel episode start is unreached: ${program.start}`);
      const start = pick(candidates); LONE_WORLD.load(built, start.snapshot); physical();
      episode = { program, start, began: world.time, next: 0, ticks: 0, requested: forward, line: forward, place: null, pace: start.pace ?? 0,
        origin: { x: centre.x, z: centre.z }, origin0: { x: centre.x, z: centre.z }, corridorEnabled: program.corridor !== false, maxOff: 0,
        along: 0, shortfall: 0, quiet: 0, quietMax: 0, stopScale: Math.max(1, Math.hypot(velocity.x, velocity.z)), samples: [],
        ordered: 0, alongs: [], window: 0, late: 0, down: false, effort: 0, steps: null };
      deliver();
      // A start whose gait is not yet the run plays until the run's learner first asks.
      if (untilAsked(learner, tick) !== 'asked') throw Error(`Travel episode from ${start.id} ended before its learner asked`);
      return learner.inputs.slice();
    };
    const deliver = () => {
      while (episode.next < episode.program.cues.length && Math.round(episode.program.cues[episode.next].at * world.hz) <= episode.ticks) {
        const cue = episode.program.cues[episode.next++];
        let orders = cue.orders;
        if (orders.move?.kind === 'place') {
          // A place's points are where the episode began plus their offsets; its line is from where the body is to the way's end.
          const points = orders.move.points.map(p => ({ x: episode.origin0.x + p.x, z: episode.origin0.z + p.z })), end = points.at(-1);
          orders = { ...orders, move: { ...orders.move, points } };
          const dx = end.x - centre.x, dz = end.z - centre.z, length = Math.hypot(dx, dz);
          Object.assign(episode.origin, { x: centre.x, z: centre.z });
          episode.place = { points, near: orders.move.near };
          if (length > 0) episode.line = episode.requested = { x: dx / length, z: dz / length };
          episode.pace = Infinity; episode.ordered = episode.ticks;
        } else if (orders.move?.kind === 'direct') {
          episode.place = null;
          const d = orders.move.direction, length = Math.hypot(d.x, d.z);
          if (!(length > 0)) throw Error('Travel direction must be nonzero');
          if (episode.requested.x !== d.x / length || episode.requested.z !== d.z / length || cue.line === 'start')
            Object.assign(episode.origin, { x: centre.x, z: centre.z });
          if (episode.pace !== (orders.pace ?? 4)) episode.ordered = episode.ticks;
          episode.requested = episode.line = { x: d.x / length, z: d.z / length }; episode.pace = orders.pace ?? 4;
        } else { episode.place = null; if (episode.pace !== 0) episode.ordered = episode.ticks; episode.pace = 0; episode.stopScale = Math.max(1, Math.hypot(velocity.x, velocity.z)); }
        if (cue.corridor !== undefined) episode.corridorEnabled = cue.corridor;
        // Snapshot loads mutate live orders in place; the curriculum owns its separate copy.
        built.state.script.orders = structuredClone(orders);
      }
    };
    const step = (action, { squashed = false } = {}) => {
      if (!Array.isArray(action) || action.length !== TRAVEL_LAYOUT.outputs.length || !action.every(Number.isFinite)
        || squashed && action.some(x => Math.abs(x) > 1)) throw Error('Travel needs one finite bounded action per named output');
      const samples = o.trace ? [] : null;
      const applied = squashed ? action.slice() : action.map(tanh);
      episode.down = false; episode.effort = applied.reduce((n, v) => n + v * v, 0) / applied.length; episode.steps = samples;
      const played = decide(learner, applied, tick, world.dt);
      const down = episode.down;
      return { observation: state.inference.observation.slice(), reward: played.reward, ...(o.trace ? { samples } : {}),
        terminated: played.ended === 'terminated' || played.ended === 'done', truncated: played.ended === 'truncated',
        info: { along: episode.along / episode.ticks, command: episode.pace, down, corridor: episode.maxOff,
          shortfall: episode.shortfall / episode.ticks, late: episode.late / world.hz, quiet: episode.quietMax / world.hz, seconds: episode.ticks / world.hz,
          worldSteps: played.steps, worldSeconds: played.seconds } };
    };
    /**
     * Going to a place, what the game asks this step: the way toward the next point of the
     * navigator's route there (the place's own points before it plans one), at the speed the run
     * is asked (`inference.command`, the speed rule's); once it asks none, standing still, a stop.
     */
    function placeAsk() {
      const ask = state.inference.command, route = body.minded?.report?.navigation?.route ?? [];
      const next = route.length ? route[0] : episode.place.points.find(p => Math.hypot(p.x - centre.x, p.z - centre.z) > episode.place.near) ?? episode.place.points.at(-1);
      const dx = next.x - centre.x, dz = next.z - centre.z, length = Math.hypot(dx, dz);
      if (ask > 0 && length > 0) { episode.requested = { x: dx / length, z: dz / length }; episode.pace = ask; }
      else if (episode.pace !== 0) { episode.pace = 0; episode.ordered = episode.ticks; episode.stopScale = Math.max(1, Math.hypot(velocity.x, velocity.z)); }
    }
    /** How far the body is off the way to a place, m: from the nearest of its legs, from where the order found the body through its points. */
    function offWay() {
      let least = Infinity, from = episode.origin;
      for (const to of episode.place.points) {
        const dx = to.x - from.x, dz = to.z - from.z, l2 = dx * dx + dz * dz;
        const t = l2 > 0 ? Math.max(0, Math.min(1, ((centre.x - from.x) * dx + (centre.z - from.z) * dz) / l2)) : 0;
        least = Math.min(least, Math.hypot(centre.x - from.x - t * dx, centre.z - from.z - t * dz)); from = to;
      }
      return least;
    }
    /** One world step of the episode: its cues, its reward under the action in force (`episode.effort`), and its ending. */
    function tick() {
        const limit = Math.round(episode.program.seconds * world.hz), effort = episode.effort;
        deliver(); world.step(); const sample = physical(); episode.steps?.push(sample); if (o.trace) episode.samples.push(sample); episode.ticks++;
        if (episode.place) placeAsk();
        const d = episode.requested, along = velocity.x * d.x + velocity.z * d.z, cross = velocity.x * d.z - velocity.z * d.x, l = episode.line;
        const off = episode.place ? offWay() : Math.abs((centre.x - episode.origin.x) * l.z - (centre.z - episode.origin.z) * l.x);
        if (episode.corridorEnabled) episode.maxOff = Math.max(episode.maxOff, off);
        episode.down ||= sample.down;
        const speed = Math.hypot(velocity.x, velocity.z), target = episode.pace + o.reserve;
        episode.alongs.push(along); episode.window += along - (episode.alongs.length > world.hz ? episode.alongs[episode.alongs.length - 1 - world.hz] : 0);
        const since = (episode.ticks - episode.ordered) / world.hz;
        const late = episode.pace > 0 ? (since >= o.reach ? Math.max(0, episode.pace - episode.window / world.hz) : 0)
          : since >= o.stopReach ? Math.max(0, speed - o.still) : 0;
        episode.late += late;
        const progress = episode.pace > 0 ? Math.max(0, Math.min(1, along / target))
          : .5 * Math.max(0, 1 - speed / episode.stopScale) + .5 * exp(-((speed / .3) ** 2));
        // Every cost only takes credit away, so an upright episode never scores under zero and a fall,
        // costing more than any episode earns, ranks under all of them; leaving the corridor ends the
        // episode, losing the credit the rest of it would have earned.
        const rate = Math.max(0, progress + o.uprightCredit * Math.max(0, Math.min(1, state.inference.observation[9]))
          - o.sideCost * cross ** 2 - o.corridorCost * off ** 2 - o.effortCost * effort
          - (episode.pace > 0 ? o.overspeedCost * Math.max(0, along - target) ** 2 : 0) - o.lateCost * late);
        const failed = episode.down || episode.maxOff > 1;
        episode.along += along; episode.shortfall += episode.pace > 0 ? Math.max(0, episode.pace - along) / episode.pace : speed / episode.stopScale;
        episode.quiet = episode.pace === 0 && speed < .15 && sample.standing ? episode.quiet + 1 : 0;
        episode.quietMax = Math.max(episode.quietMax, episode.quiet);
        return { reward: rate * world.dt - (episode.down ? Math.max(o.fallPenalty ?? 0, (1 + o.uprightCredit) * episode.program.seconds + 1) : 0),
          ended: failed ? 'terminated' : episode.ticks >= limit ? 'truncated' : null };
    }
    await reset();
    return { observationSize: TRAVEL_LAYOUT.inputs.length, actionSize: TRAVEL_LAYOUT.outputs.length,
      layout: { ...TRAVEL_LAYOUT, interval: learner.interval }, reset, step, entries, rejected,
      rests: rests.map(({ snapshot, ...recipe }) => recipe),
      samples: () => episode.samples, observation: () => state.inference.observation.slice(), reading: physical,
      program: () => ({ program: episode.program, start: { id: episode.start.id, time: episode.start.time }, began: episode.began, delivered: episode.next,
        warmup: episode.start.kind === 'rest' ? null : { at: episode.start.warmed, orders: go(episode.start.pace) } }),
      dispose: () => built.dispose(), harness: { name: 'Node lone world Option Mind', engine: o.engine ?? DEFAULT_ENGINE,
        hz: world.hz, balance: 0, model: o.model, loadout, seed: o.seed, heading, gusts: !!o.gusts } };
  } catch (error) { built.dispose(); throw error; }
}
