/** Residual muscle control around the retained gait, for development and pretraining.
 * Node core stand, explicit engine, 120 Hz, Balance 0, empty hands in guard. Fresh bodies warm
 * through the ordinary gait before each training episode. A from-rest development screen includes
 * that walk-in; complete travel confirmation also requires stops, loadouts and fresh conditions.
 * Configuration's optional `braking` file overrides the running cycle's braking settings.
 * `cycleTuning` supplies immutable running-cycle overrides for joint trajectory searches.
 */
import '../../../tests/harness/preload-data.mjs';
import { readFileSync } from 'node:fs';
import { coreStand } from '../../../tests/harness/core-stand.mjs';
import { commandedBody } from '../../../src/app/commanded-body.ts';
import { modelSpec } from '../../../src/core/bodies/models.ts';
import { Quaternion, Vector3 } from '../../../src/core/math/vector.ts';
import { massCentreToRef, massOf, motionAtToRef } from '../../../src/core/bodies/read-motion.ts';
import { sin, cos, exp } from '../../../src/core/math/real.ts';
import { DEFAULT_ENGINE } from '../../../src/core/physics/engines.ts';
import { rootSegment } from '../../../src/core/bodies/read-body.ts';
import { uprightness } from '../../../src/control/ground.ts';
import { footOn } from '../../../src/control/support.ts';
import { guardPosture } from '../../../src/skills/guard/guard.ts';
import { walkRun, WALK_RUN, WALK_RUN_CYCLE } from '../../../src/skills/locomotion/walk-run.ts';
import { runCycleSettings } from '../../../src/skills/locomotion/cycle-run.ts';
import { legOf } from '../../../src/skills/locomotion/gait-scale.ts';
import { balanceCeiling, balancePercent, rulebook } from '../../../src/combat/rulebook.ts';
import { learnedRunSteering } from './learned-run-steering.mjs';

const ROLES = Object.freeze(['stance', 'swing']);
const JOINTS = Object.freeze(['hip flexion', 'hip abduction', 'hip internal rotation', 'knee flexion', 'ankle dorsiflexion', 'ankle inversion']);
export const RESIDUAL_LAYOUT = Object.freeze({
  inputs: Object.freeze(['command', 'playback', 'phase sin', 'phase cos', 'forward speed', 'side speed', 'vertical speed',
    'up forward', 'up side', 'up vertical', 'facing sin', 'facing cos', 'spin forward', 'spin side', 'spin up', 'height', 'cross track',
    ...ROLES.flatMap(role => [`${role} contact`, `${role} foot forward`, `${role} foot side`, `${role} foot height`,
      ...JOINTS.flatMap(joint => [`${role} ${joint} angle`, `${role} ${joint} speed`])])]),
  outputs: Object.freeze(ROLES.flatMap(role => JOINTS.map(joint => `${role} ${joint} velocity`))),
});
const ACTIVATION_LAYOUT = Object.freeze({ ...RESIDUAL_LAYOUT,
  outputs: Object.freeze(ROLES.flatMap(role => JOINTS.map(joint => `${role} ${joint} activation`))),
});
const REFERENCE_LAYOUT = Object.freeze({ ...RESIDUAL_LAYOUT,
  outputs: Object.freeze(ROLES.flatMap(role => JOINTS.map(joint => `${role} ${joint} reference`))),
});
/** The observation and action names for the selected bounded muscle correction. */
export function residualLayout(kind = 'velocity') {
  switch (kind) {
    case 'velocity': return RESIDUAL_LAYOUT;
    case 'activation': return ACTIVATION_LAYOUT;
    case 'reference': return REFERENCE_LAYOUT;
    default: throw Error('a travel residual controls velocity, activation or reference');
  }
}
const tanh = value => {
  const t = exp(-2 * Math.abs(value));
  return (value < 0 ? -1 : 1) * (1 - t) / (1 + t);
};

export async function residualEnvironment(configuration = {}) {
  const o = { model: 'workshop-fighter', engine: DEFAULT_ENGINE, pace: 4.2, seconds: 8,
    starts: [1.8, 3.5, 6], fromRestShare: 0, speedWidth: 1, actionAt: 0, fallRule: 'physical', residual: 'velocity', scale: 2, seed: 1, ...configuration };
  const layout = residualLayout(o.residual);
  if (!(o.scale >= 0) || !Number.isFinite(o.scale)) throw Error('residual scale is finite and nonnegative');
  const applyResidual = o.residual === 'activation'
    ? (push, action) => ({ ...push, level: Math.max(0, Math.min(1, push.level + action * o.scale)) })
    : (push, action) => {
      if (!Number.isFinite(push.speed)) return push;
      const speed = push.speed + action * o.scale;
      return { ...push, speed, sense: speed >= 0 ? 1 : -1 };
    };
  if (!(o.actionAt >= 0) || !Number.isFinite(o.actionAt)) throw Error('residual onset is finite and nonnegative');
  if (!['posture', 'physical'].includes(o.fallRule)) throw Error('residual fall rule is posture or physical');
  if (!(o.fromRestShare >= 0 && o.fromRestShare <= 1) || !(o.speedWidth > 0) || !Number.isFinite(o.speedWidth))
    throw Error('residual training needs a from-rest share in [0,1] and a finite positive speed width');
  const { at, swerve, ...cycle } = JSON.parse(readFileSync(o.settings, 'utf8'));
  const running = runCycleSettings(o.cycleTuning, runCycleSettings(cycle, WALK_RUN_CYCLE));
  const braking = o.braking ? runCycleSettings(JSON.parse(readFileSync(o.braking, 'utf8')), running) : running;
  const stride = JSON.parse(readFileSync(o.stride, 'utf8'));
  const steeringPolicy = o.steeringPolicy ? JSON.parse(readFileSync(o.steeringPolicy, 'utf8')) : null;
  const spec = modelSpec(o.model), guard = guardPosture(spec), leg = legOf(spec);
  const ends = Object.fromEntries(['left', 'right'].map(side => [side, footOn(spec, side)]));
  const names = Object.fromEntries(['left', 'right'].map(side => [side, JOINTS.map(name => {
    const [joint, ...motion] = name.split(' '); return `${joint}.${side} ${motion.join(' ')}`;
  })]));
  const up = new Vector3(), forward = new Vector3(), spin = new Vector3();
  const centre = new Vector3(), velocity = new Vector3(), work = new Vector3(), physicalTurn = new Quaternion();
  const contactPoint = new Vector3(), contactVelocity = new Vector3(), contactSpin = new Vector3();
  let stand = null, host = null, body, skill, root, channels, control, observation, goal;
  let physicalParts, physicalRoot, mass, rootInverse, runView;
  let randomState = o.seed >>> 0;
  const random = () => ((randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0) / 4294967296);
  let episode = { steps: 0, ticks: 0, along: 0, maxOff: 0 };
  const reading = () => {
    const s = body.view.stance;
    massCentreToRef(physicalParts, mass, centre, work, velocity);
    physicalRoot.pose.rotation.multiplyToRef(rootInverse, physicalTurn);
    return { time: (Math.round(stand.world.time * stand.world.hz) - stand.world.hz) / stand.world.hz,
      centre: [centre.x, centre.y, centre.z], velocity: [velocity.x, velocity.y, velocity.z], root: { ...physicalTurn },
      control: { centre: [s.centre.x, s.centre.y, s.centre.z], velocity: [s.velocity.x, s.velocity.y, s.velocity.z], root: { ...body.view.root.rotation } },
      phase: skill.state.run.phase, running: skill.state.walkRun.running,
      ...(o.actuationTrace ? { actuation: { pace: skill.state.run.pace, trim: skill.state.run.trim, lean: skill.state.run.lean,
        channels: Object.values(channels).flat().map(i => ({ name: host.muscles.channels[i].name,
          angle: host.muscles.angle(i), speed: host.muscles.speed(i), requested: host.muscles.velocity[i],
          activation: host.muscles.activation[i], torque: host.muscles.pulled[i],
          negative: host.muscles.bounds.negative[i], positive: host.muscles.bounds.positive[i] })) } } : {}),
      ...(o.stanceTrace ? { stance: structuredClone(s) } : {}),
      down: o.fallRule === 'physical' ? host.down : body.view.down, postureDown: body.view.down, physicalDown: host.down, lineX: control.physicalLineX,
      ...(o.contacts ? { feet: Object.fromEntries(['left', 'right'].map(side => {
        const foot = body.built.segments.get(ends[side]);
        return [side, body.built.physics.contactsOf(foot.body).filter(contact => contact.other === null).map(contact => {
          contactPoint.set(...contact.point);
          motionAtToRef(foot, contactPoint, contactVelocity, contactSpin);
          return { point: [...contact.point], normal: [...contact.normal], impulse: contact.impulse,
            velocity: [contactVelocity.x, contactVelocity.y, contactVelocity.z] };
        })];
      })), footMotion: Object.fromEntries(['left', 'right'].map(side => {
        const foot = body.built.segments.get(ends[side]);
        motionAtToRef(foot, foot.pose.position, contactVelocity, contactSpin);
        return [side, { position: [foot.pose.position.x, foot.pose.position.y, foot.pose.position.z],
          velocity: [contactVelocity.x, contactVelocity.y, contactVelocity.z],
          spin: [contactSpin.x, contactSpin.y, contactSpin.z] }];
      })) } : {}),
      ...(o.poses ? { parts: physicalParts.map(part => ({ name: part.spec.name, position: { ...part.pose.position },
        rotation: { ...part.pose.rotation }, ...(part.toes ? { bend: part.toes.bend } : {}) })) } : {}) };
  };
  const dispose = () => { host?.dispose(); stand?.dispose(); host = null; stand = null; };
  const observe = view => {
    const s = view.stance, phase = skill.state.run.phase, h = skill.state.walkRun.heading;
    const fx = sin(h), fz = cos(h), rx = fz, rz = -fx;
    const side = phase < .5 ? 'left' : 'right', mirror = side === 'left' ? 1 : -1;
    up.set(0, 1, 0).applyRotationQuaternionToRef(view.root.rotation, up);
    forward.set(0, 0, 1).applyRotationQuaternionToRef(view.root.rotation, forward);
    const horizontal = Math.max(1e-9, Math.sqrt(forward.x * forward.x + forward.z * forward.z));
    root.body.angularVelocityToRef(spin);
    observation.length = 0;
    observation.push(control.stopOrder ? 0 : o.pace, skill.state.run.pace, sin(4 * Math.PI * phase), cos(4 * Math.PI * phase),
      s.velocity.x * fx + s.velocity.z * fz, mirror * (s.velocity.x * rx + s.velocity.z * rz), s.velocity.y,
      up.x * fx + up.z * fz, mirror * (up.x * rx + up.z * rz), up.y,
      mirror * (forward.x * rx + forward.z * rz) / horizontal, (forward.x * fx + forward.z * fz) / horizontal,
      mirror * (spin.x * fx + spin.z * fz), spin.x * rx + spin.z * rz, mirror * spin.y,
      (s.centre.y - Math.min(s.ends[ends.left].middle.y, s.ends[ends.right].middle.y)) / leg,
      mirror * (s.centre.x - control.lineX) / leg);
    for (const roleSide of [side, side === 'left' ? 'right' : 'left']) {
      const foot = s.ends[ends[roleSide]], dx = foot.middle.x - s.centre.x, dz = foot.middle.z - s.centre.z;
      observation.push(foot.touching ? 1 : 0, (dx * fx + dz * fz) / leg, mirror * (dx * rx + dz * rz) / leg,
        (foot.middle.y - s.centre.y) / leg);
      for (const i of channels[roleSide]) observation.push(body.muscles.angle(i), body.muscles.speed(i) / 10);
    }
  };
  const reset = async given => {
    dispose();
    const fromRest = given?.fromRest ?? (given?.start === undefined && o.fromRestShare > 0 && random() < o.fromRestShare);
    const start = fromRest ? 0 : given?.start ?? o.starts[Math.floor(random() * o.starts.length)];
    if (!Number.isFinite(start) || start < 0) throw Error('a residual episode needs a finite running start time');
    stand = await coreStand(spec, { ground: true, groundSize: 400, posture: guard, engine: o.engine });
    host = commandedBody(stand.built, stand.world, { servoSeconds: .1, measuring: true,
      assist: balanceCeiling(0, balancePercent(rulebook('arena'))) });
    body = host.driver; root = rootSegment(body.built);
    const physical = uprightness(body.built);
    runView = Object.create(body.view, { down: { get: () => physical.fallen() } });
    physicalParts = [...stand.built.segments.values()]; mass = massOf(physicalParts);
    physicalRoot = rootSegment(stand.built); rootInverse = Quaternion.Inverse(physicalRoot.rest);
    channels = Object.fromEntries(['left', 'right'].map(side => [side, names[side].map(name => body.muscles.channel(name))]));
    skill = walkRun(body, { ...WALK_RUN, run: at, swerve: swerve ?? WALK_RUN.swerve,
      ...(steeringPolicy ? { hasted: steeringPolicy.hasted } : {}) }, running,
      { stride, braking, entry: o.entry, trim: o.trim, steer: steeringPolicy ? learnedRunSteering(body, steeringPolicy) : undefined });
    control = { asked: null, stopOrder: false, action: new Array(12).fill(0), reference: { left: new Array(6).fill(0), right: new Array(6).fill(0) }, lineX: 0 };
    observation = []; goal = null;
    body.drive((view, dt) => {
      const d = skill.goal(o.fallRule === 'physical' ? runView : view, { walk: control.asked, face: 0 }, dt);
      observe(view);
      if (d.kind === 'drive') {
        const side = skill.state.run.phase < .5 ? 'left' : 'right', opposite = side === 'left' ? 'right' : 'left';
        const pushes = d.pushes.map(push => {
          let i = names[side].indexOf(push.channel);
          if (i < 0) { const other = names[opposite].indexOf(push.channel); i = other < 0 ? -1 : other + 6; }
          if (i < 0) return push;
          const action = view.time >= 1 + o.actionAt ? control.action[i] : 0;
          if (o.residual !== 'reference') return applyResidual(push, action);
          const physical = i < 6 ? side : opposite, channel = i % 6;
          const before = control.reference[physical][channel];
          // Smooth physical-channel offsets across role changes; track their rate as well as their displacement.
          const offset = before + Math.min(1, 30 * dt) * (action * o.scale - before);
          control.reference[physical][channel] = offset;
          const speed = push.speed + offset / running.settle + (offset - before) / dt;
          return { ...push, speed, sense: speed >= 0 ? 1 : -1 };
        });
        return { posture: { ...guard, ...d.posture }, pushes, stance: null };
      }
      goal = d.goal ?? goal;
      return { posture: guard, pushes: [], stance: view.time > 0 ? goal : null };
    });
    stand.step(stand.seconds(1)); control.lineX = body.view.stance.centre.x;
    massCentreToRef(physicalParts, mass, centre, work, velocity); control.physicalLineX = centre.x;
    control.asked = [o.pace, 0]; stand.step(stand.seconds(start));
    if ((o.fallRule === 'physical' ? host.down : body.view.down) || (!fromRest && !skill.state.walkRun.running)) throw Error(`residual fixture did not enter its run at ${start}s`);
    if (fromRest && Math.hypot(body.view.stance.velocity.x, body.view.stance.velocity.z) > .15)
      throw Error('residual from-rest fixture is still moving');
    episode = { steps: 0, ticks: 0, along: 0, maxOff: 0, everRan: skill.state.walkRun.running, fromRest };
    return observation.slice();
  };
  const step = (action, { squashed = false } = {}) => {
    if (!Array.isArray(action) || action.length !== 12 || !action.every(Number.isFinite)) throw Error('residual control needs twelve finite actions');
    if (squashed && action.some(x => Math.abs(x) > 1)) throw Error('squashed residual actions exceed one');
    for (let i = 0; i < 12; i++) control.action[i] = squashed ? action[i] : tanh(action[i]);
    const samples = o.trace ? [] : null;
    let down = false, off = 0, along = 0;
    for (let k = 0; k < 4; k++) {
      stand.step(1);
      episode.everRan ||= skill.state.walkRun.running;
      episode.ticks++;
      samples?.push(reading());
      massCentreToRef(physicalParts, mass, centre, work, velocity);
      along = velocity.z; off = Math.abs(centre.x - control.physicalLineX);
      episode.along += along; episode.maxOff = Math.max(episode.maxOff, off);
      down ||= o.fallRule === 'physical' ? host.down : body.view.down;
      if (down || off > 1 || (episode.everRan && !skill.state.walkRun.running && !control.stopOrder)) break;
    }
    episode.steps++;
    const effort = control.action.reduce((sum, x) => sum + x * x, 0) / 12;
    const reward = exp(-(((along - (control.stopOrder ? 0 : o.pace)) / o.speedWidth) ** 2)) + .15 * up.y - .1 * velocity.x ** 2 - .05 * off ** 2
      - .005 * effort - (down || off > 1 ? 5 : 0);
    return { observation: observation.slice(), reward, ...(samples ? { samples } : {}), terminated: down || off > 1 || (episode.everRan && !skill.state.walkRun.running && !control.stopOrder),
      truncated: episode.steps >= o.seconds * 30,
      info: { along: episode.along / episode.ticks, command: o.pace, down, corridor: episode.maxOff,
        seconds: episode.ticks / stand.world.hz, fromRest: episode.fromRest } };
  };
  await reset();
  return { observationSize: layout.inputs.length, actionSize: layout.outputs.length, layout, reset, step, reading, dispose,
    halt() { control.asked = null; control.stopOrder = true; },
    harness: Object.freeze({ model: o.model, engine: o.engine, hz: stand.world.hz, delay: stand.world.delay,
      actuation: stand.world.actuation, balance: 0, loadout: 'empty', posture: 'guard', fallRule: o.fallRule, actionAt: o.actionAt,
      residual: o.residual, scale: o.scale, entry: o.entry ?? 'landing', trim: o.trim ?? 'continuous' }) };
}
