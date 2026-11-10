/** Residual muscle control around the retained gait, for development and pretraining.
 * Node core stand, explicit engine, 120 Hz, Balance 0, empty hands in guard. Fresh bodies warm
 * through the ordinary gait before each training episode. A from-rest development screen includes
 * that walk-in; complete travel confirmation also requires stops, loadouts and fresh conditions.
 * Configuration's optional `braking` file overrides the running cycle's braking settings.
 * `cycleTuning` supplies immutable running-cycle overrides for joint trajectory searches.
 * `rewardPace` selects the training target without changing the order. Progress credit is capped
 * at the target; stopping tracks total horizontal speed. `fallPenalty` covers falls and corridor exits.
 * `controlTrace` pairs the run's phase change with the contact input of that control decision.
 * One learner (`Learner`) decides every 1/30 s: the trained residual's request, answered by the
 * trainer through the learning adapter (`research/learner-adapter.mjs`); its frozen teachers decide
 * at the same requests. `frozenSteeringPolicy` steers the run's cycle while a residual learns
 * individual joint corrections, optionally over a frozen reference. Rewards are credit per second,
 * scaled to the 30 decisions a second they were tuned per decision at; a fall or corridor exit
 * costs `fallPenalty` once.
 * `speeds` samples episode orders; `warm` samples independent physically played warm-up orders.
 * `warmStarts` samples verified pairs of warm-up pace and elapsed time instead of their product.
 * `cacheWarmStarts` restores reached native stand snapshots on fresh bodies between episodes;
 * explicit warm-up pairs are played once before the environment becomes ready.
 * `warmPolicy` answers the learner during moving-start setup; `stopOnReset` issues a stop
 * after that reached state is restored, leaving the episode budget entirely for braking.
 * `paceRelativeShare` widens shortfall credit with the movement controller's commanded pace.
 */
import '../../../tests/harness/preload-data.mjs';
import { readFileSync } from 'node:fs';
import { coreStand, saveStand, loadStand } from '../../../tests/harness/core-stand.mjs';
import { stockBody } from '../../../src/app/stock-body.ts';
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
import { learnedRunFeatures, steeringFrom, STEERING_LAYOUT } from './learned-run-steering.mjs';
import { recoveryNetwork } from '../../../src/core/math/learning/recovery-network.ts';
import { act, ask, learnerOf, restart, start } from '../../../src/core/math/learning/learner.ts';
import { decide } from '../../learner-adapter.mjs';
import { passiveToeBody } from './passive-toe-body.mjs';
import { conditionToeStand } from './toe-conditioning.mjs';

const ROLES = Object.freeze(['stance', 'swing']);
const JOINTS = Object.freeze(['hip flexion', 'hip abduction', 'hip internal rotation', 'knee flexion', 'ankle dorsiflexion', 'ankle inversion']);
export const RESIDUAL_LAYOUT = Object.freeze({ interval: 1 / 30,
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
    case 'steering': return STEERING_LAYOUT;
    default: throw Error('a travel residual controls velocity, activation, reference or cycle steering');
  }
}
const tanh = value => {
  const t = exp(-2 * Math.abs(value));
  return (value < 0 ? -1 : 1) * (1 - t) / (1 + t);
};

export async function residualEnvironment(configuration = {}) {
  const o = { model: 'workshop-fighter', engine: DEFAULT_ENGINE, pace: 4.2, seconds: 8,
    starts: [1.8, 3.5, 6], settle: 1, speedReward: 'tracking', fallPenalty: 5, fromRestShare: 0, speedWidth: 1, actionAt: 0, fallRule: 'physical', residual: 'velocity', scale: 2, seed: 1, ...configuration };
  const layout = residualLayout(o.residual);
  if (o.cacheWarmStarts !== undefined && typeof o.cacheWarmStarts !== 'boolean')
    throw Error('warm-start caching is boolean');
  if (o.cacheWarmStarts && o.toeConditioning)
    throw Error('warm-start snapshots require native engine joints and contact settings');
  if (o.cacheWarmStarts && o.speeds && !o.warm && !o.warmStarts && o.fromRestShare < 1)
    throw Error('cached moving starts need a finite set of warm-up speeds');
  const warmCache = new Map();
  if (o.stopOnReset && (!o.warmPolicy || o.fromRestShare !== 0))
    throw Error('braking resets require a frozen warm policy and moving starts only');
  const warmPolicy = o.warmPolicy ? recoveryNetwork(JSON.parse(readFileSync(o.warmPolicy, 'utf8'))) : null;
  if (o.speeds && (!Array.isArray(o.speeds) || o.speeds.length !== 2
    || !o.speeds.every(Number.isFinite) || o.speeds[0] < 0 || o.speeds[1] < o.speeds[0]))
    throw Error('training speeds are an ordered nonnegative range');
  if (o.warm && (!Array.isArray(o.warm) || !o.warm.length || !o.warm.every(x => Number.isFinite(x) && x > 0)))
    throw Error('warm-up speeds are finite and positive');
  if (o.warmStarts !== undefined && (!Array.isArray(o.warmStarts) || !o.warmStarts.length
    || !o.warmStarts.every(row => Number.isFinite(row.pace) && row.pace > 0 && Number.isFinite(row.start) && row.start >= 0)))
    throw Error('warm starts pair a finite positive pace with a finite nonnegative time');
  if (o.paceRelativeShare !== undefined && !(Number.isFinite(o.paceRelativeShare) && o.paceRelativeShare > 0))
    throw Error('pace-relative shortfall share is finite and positive');
  if (!['tracking', 'progress'].includes(o.speedReward)) throw Error('residual speed reward is tracking or progress');
  const rewardPace = o.rewardPace ?? o.pace;
  if (!Number.isFinite(rewardPace) || o.speedReward === 'progress' && rewardPace <= 0)
    throw Error('residual reward pace is finite, and positive for progress credit');
  if (o.speedReward === 'progress' && o.rewardPace === undefined && o.speeds?.[0] === 0)
    throw Error('sampled progress targets are positive');
  if (!Number.isFinite(o.fallPenalty) || o.fallPenalty < 0) throw Error('residual failure penalty is finite and nonnegative');
  if (!(o.settle > 0) || !Number.isFinite(o.settle)) throw Error('residual settling time is finite and positive');
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
  const stride = o.stride ? JSON.parse(readFileSync(o.stride, 'utf8')) : undefined;
  if (o.steeringPolicy !== undefined) throw Error('a frozen steering actor is `frozenSteeringPolicy`, with `hasted` where it ran hasted');
  const frozenSteeringData = o.frozenSteeringPolicy ? JSON.parse(readFileSync(o.frozenSteeringPolicy, 'utf8')) : null;
  if (frozenSteeringData && (o.residual === 'steering' || frozenSteeringData.actions !== 12
    || frozenSteeringData.layers?.[0]?.weights?.[0]?.length !== STEERING_LAYOUT.inputs.length))
    throw Error('a frozen steering teacher needs the steering layout beside a joint residual');
  const frozenSteering = frozenSteeringData ? recoveryNetwork(frozenSteeringData) : null;
  const referencePolicy = o.referencePolicy ? recoveryNetwork(JSON.parse(readFileSync(o.referencePolicy, 'utf8'))) : null;
  if (referencePolicy && (!(o.residual === 'steering' || frozenSteering) || !(o.referenceScale >= 0) || !Number.isFinite(o.referenceScale)))
    throw Error('a frozen reference policy accompanies steering with a finite nonnegative referenceScale');
  if (o.bodyVariant !== undefined && o.bodyVariant !== 'passive-toes') throw Error('unknown residual body variant');
  const original = modelSpec(o.model);
  const spec = o.bodyVariant === 'passive-toes' ? passiveToeBody(original) : original;
  const guard = guardPosture(spec), leg = legOf(spec);
  const ends = Object.fromEntries(['left', 'right'].map(side => [side, footOn(spec, side)]));
  const names = Object.fromEntries(['left', 'right'].map(side => [side, JOINTS.map(name => {
    const [joint, ...motion] = name.split(' '); return `${joint}.${side} ${motion.join(' ')}`;
  })]));
  const up = new Vector3(), forward = new Vector3(), spin = new Vector3();
  const centre = new Vector3(), velocity = new Vector3(), work = new Vector3(), physicalTurn = new Quaternion();
  const contactPoint = new Vector3(), contactVelocity = new Vector3(), contactSpin = new Vector3();
  let stand = null, host = null, body, skill, root, channels, control, observation, goal, learner, native = null;
  const still = Object.freeze(new Array(12).fill(0)), warmAnswer = warmPolicy ?? (() => still);
  let physicalParts, physicalRoot, mass, rootInverse, runView, steeringFeatures;
  let randomState = o.seed >>> 0;
  const random = () => ((randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0) / 4294967296);
  let episode = { steps: 0, ticks: 0, along: 0, maxOff: 0 };
  const reading = () => {
    const s = body.view.stance;
    massCentreToRef(physicalParts, mass, centre, work, velocity);
    physicalRoot.pose.rotation.multiplyToRef(rootInverse, physicalTurn);
    return { time: (Math.round(stand.world.time * stand.world.hz) - stand.seconds(o.settle)) / stand.world.hz,
      centre: [centre.x, centre.y, centre.z], velocity: [velocity.x, velocity.y, velocity.z], root: { ...physicalTurn },
      control: { centre: [s.centre.x, s.centre.y, s.centre.z], velocity: [s.velocity.x, s.velocity.y, s.velocity.z], root: { ...body.view.root.rotation } },
      phase: skill.state.run.phase, running: skill.state.walkRun.running,
      ...(o.controlTrace ? { controlDecision: control.lastDecision } : {}),
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
            velocity: [contactVelocity.x, contactVelocity.y, contactVelocity.z],
            pairs: contact.pairs.map(pair => {
              const owner = foot.rigid.owners[pair.mine];
              contactPoint.set(...pair.point);
              motionAtToRef(foot, contactPoint, contactVelocity, contactSpin);
              return { mine: pair.mine, region: owner?.kind === 'region' ? owner.region.name : owner?.kind,
                point: [...pair.point], normal: [...pair.normal], impulse: pair.impulse,
                velocity: [contactVelocity.x, contactVelocity.y, contactVelocity.z] };
            }) };
        })];
      })), footSensors: Object.fromEntries(['left', 'right'].map(side => [side, s.ends[ends[side]].touching])),
      passiveContacts: Object.fromEntries(spec.joints.filter(joint => joint.dofs.every(dof => dof.passive)).map(joint =>
        [joint.child, body.built.physics.contactsOf(body.built.segments.get(joint.child).body).filter(contact => contact.other === null)
          .map(contact => ({ impulse: contact.impulse, normal: [...contact.normal], point: [...contact.point] }))])),
      footMotion: Object.fromEntries(['left', 'right'].map(side => {
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
    const command = control.stopOrder ? 0 : o.warm || o.warmStarts ? control.asked?.[0] ?? o.pace : o.pace;
    const s = view.stance, phase = skill.state.run.phase, h = skill.state.walkRun.heading;
    const fx = sin(h), fz = cos(h), rx = fz, rz = -fx;
    const side = phase < .5 ? 'left' : 'right', mirror = side === 'left' ? 1 : -1;
    up.set(0, 1, 0).applyRotationQuaternionToRef(view.root.rotation, up);
    forward.set(0, 0, 1).applyRotationQuaternionToRef(view.root.rotation, forward);
    const horizontal = Math.max(1e-9, Math.sqrt(forward.x * forward.x + forward.z * forward.z));
    root.body.angularVelocityToRef(spin);
    observation.length = 0;
    observation.push(command, skill.state.run.pace, sin(4 * Math.PI * phase), cos(4 * Math.PI * phase),
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
    if (referencePolicy) control.referenceObservation = observation.slice();
    if (frozenSteering) control.steeringObservation = steeringFeatures(view, h,
      command, skill.state.walkRun.spin, skill.state.run).slice();
    if (o.residual === 'steering') observation.splice(0, observation.length,
      ...steeringFeatures(view, h, command, skill.state.walkRun.spin, skill.state.run));
  };
  const reset = async given => {
    dispose();
    if (o.speeds) o.pace = given?.pace ?? o.speeds[0] + random() * (o.speeds[1] - o.speeds[0]);
    const fromRest = given?.fromRest ?? (given?.start === undefined && o.fromRestShare > 0 && random() < o.fromRestShare);
    const warmStart = !fromRest && given?.start === undefined && o.warmStarts
      ? o.warmStarts[Math.floor(random() * o.warmStarts.length)] : null;
    const startAt = fromRest ? 0 : given?.start ?? warmStart?.start ?? o.starts[Math.floor(random() * o.starts.length)];
    if (!Number.isFinite(startAt) || startAt < 0) throw Error('a residual episode needs a finite running start time');
    stand = await coreStand(spec, { ground: true, groundSize: 400, posture: guard, engine: o.engine });
    if (o.toeConditioning) await conditionToeStand(stand, o.toeConditioning);
    host = stockBody(stand.built, stand.world, { servoSeconds: .1, measuring: true,
      assist: balanceCeiling(0, balancePercent(rulebook('arena'))) });
    body = host.driver; root = rootSegment(body.built);
    const physical = uprightness(body.built);
    runView = Object.create(body.view, { down: { get: () => physical.fallen() } });
    physicalParts = [...stand.built.segments.values()]; mass = massOf(physicalParts);
    physicalRoot = rootSegment(stand.built); rootInverse = Quaternion.Inverse(physicalRoot.rest);
    channels = Object.fromEntries(['left', 'right'].map(side => [side, names[side].map(name => body.muscles.channel(name))]));
    steeringFeatures = learnedRunFeatures(body);
    skill = walkRun(body, { ...WALK_RUN, run: at, swerve: swerve ?? WALK_RUN.swerve,
      ...(o.hasted !== undefined ? { hasted: o.hasted } : {}) }, running,
      { stride, braking, entry: o.entry, trim: o.trim, steer: o.residual === 'steering'
        ? () => steeringFrom(control.action) : frozenSteering ? () => steeringFrom(control.frozenSteerAction) : undefined });
    control = { asked: null, stopOrder: false, action: new Array(12).fill(0), referenceAction: new Array(12).fill(0), referenceObservation: [],
      frozenSteerAction: new Array(12).fill(0), steeringObservation: [],
      reference: { left: new Array(6).fill(0), right: new Array(6).fill(0) }, lineX: 0 };
    observation = []; goal = null; learner = learnerOf(layout.inputs.length, layout.interval, { running: false, trained: false }); native = null;
    /** The learner's request from this step's observation; the frozen teachers decide with it. */
    const request = () => {
      for (let i = 0; i < observation.length; i++) learner.inputs[i] = observation[i];
      if (referencePolicy) control.referenceAction = referencePolicy(control.referenceObservation);
      if (frozenSteering) control.frozenSteerAction = frozenSteering(control.steeringObservation);
    };
    /** One control step: the answer in force acts, then the step's observation may ask for the next. */
    const commandsOf = (view, dt) => {
      const answer = act(learner, native);
      for (let i = 0; i < 12; i++) control.action[i] = answer[i] ?? 0;
      if (o.controlTrace) control.lastDecision = {
        time: view.time - o.settle, runningBefore: skill.state.walkRun.running, phaseBefore: skill.state.run.phase,
        previousTouch: { ...skill.state.run.touching },
        sensed: Object.fromEntries(['left', 'right'].map(side => [side, {
          touching: view.stance.ends[ends[side]].touching, middle: { ...view.stance.ends[ends[side]].middle },
        }])), velocity: { ...view.stance.velocity },
      };
      const d = skill.goal(o.fallRule === 'physical' ? runView : view, { walk: control.asked, face: 0 }, dt);
      if (o.controlTrace) Object.assign(control.lastDecision, { phaseAfter: skill.state.run.phase,
        runningAfter: skill.state.walkRun.running, waited: skill.state.run.waited, cadence: skill.state.run.steer.cadence });
      observe(view);
      if (d.kind === 'drive') {
        const side = skill.state.run.phase < .5 ? 'left' : 'right', opposite = side === 'left' ? 'right' : 'left';
        const pushes = d.pushes.map(push => {
          if (o.residual === 'steering' && !referencePolicy) return push;
          let i = names[side].indexOf(push.channel);
          if (i < 0) { const other = names[opposite].indexOf(push.channel); i = other < 0 ? -1 : other + 6; }
          if (i < 0) return push;
          const action = view.time >= o.settle + o.actionAt ? (referencePolicy ? control.referenceAction[i] : control.action[i]) : 0;
          if (o.residual !== 'reference' && !referencePolicy) return applyResidual(push, action);
          const physical = i < 6 ? side : opposite, channel = i % 6;
          const before = control.reference[physical][channel];
          // Smooth physical-channel offsets across role changes; track their rate as well as their displacement.
          const offset = before + Math.min(1, 30 * dt) * (action * (referencePolicy ? o.referenceScale : o.scale) - before);
          control.reference[physical][channel] = offset;
          let speed = push.speed + offset / running.settle + (offset - before) / dt;
          if (referencePolicy && o.residual === 'velocity' && view.time >= o.settle + o.actionAt && control.action[i] !== 0)
            speed += control.action[i] * o.scale;
          return { ...push, speed, sense: speed >= 0 ? 1 : -1 };
        });
        return { posture: { ...guard, ...d.posture }, pushes, stance: null };
      }
      goal = d.goal ?? goal;
      return { posture: guard, pushes: [], stance: view.time > 0 ? goal : null };
    };
    body.drive((view, dt) => {
      const commands = commandsOf(view, dt);
      if (ask(learner, dt) && learner.running) request();
      return commands;
    });
    const setup = [];
    const warmPace = fromRest ? o.pace : given?.warmPace ?? warmStart?.pace
      ?? (o.warm ? o.warm[Math.floor(random() * o.warm.length)] : o.pace);
    const cacheKey = fromRest ? 'rest' : `${warmPace}/${startAt}`;
    const cached = o.cacheWarmStarts ? warmCache.get(cacheKey) : null;
    native = warmAnswer;
    if (cached) {
      const local = { goal: null };
      loadStand(stand.world, { host: host.state, skill: skill.state, control, observation, learner, local }, cached);
      goal = local.goal;
    } else {
      if (o.trace) for (let i = 0; i < stand.seconds(o.settle); i++) { stand.step(); setup.push(reading()); }
      else stand.step(stand.seconds(o.settle));
      control.lineX = body.view.stance.centre.x;
      massCentreToRef(physicalParts, mass, centre, work, velocity); control.physicalLineX = centre.x;
      control.asked = [warmPace, 0];
      start(learner);
      stand.step(stand.seconds(startAt));
    }
    massCentreToRef(physicalParts, mass, centre, work, velocity);
    const rejectSetup = message => { const error = new Error(message, { cause: { setup } }); dispose(); throw error; };
    if (o.fallRule === 'physical' ? host.down : body.view.down) rejectSetup(`residual fixture is down at ${startAt}s`);
    if (!fromRest && !skill.state.walkRun.running) rejectSetup(`residual fixture did not enter its run at ${startAt}s`);
    if (!fromRest && Math.abs(centre.x - control.physicalLineX) > 1)
      rejectSetup(`residual fixture left its corridor at ${startAt}s`);
    if (fromRest && Math.hypot(body.view.stance.velocity.x, body.view.stance.velocity.z) > .15)
      rejectSetup(`residual from-rest fixture is still moving: stance ${Math.hypot(body.view.stance.velocity.x, body.view.stance.velocity.z)} m/s, physical ${Math.hypot(velocity.x, velocity.z)} m/s after ${o.settle}s`);
    if (o.cacheWarmStarts && !cached) warmCache.set(cacheKey,
      saveStand(stand.world, { host: host.state, skill: skill.state, control, observation, learner, local: { goal } }));
    // The episode's first request reads its own order: one step on it, which answers a warm-up request and asks.
    control.asked = [o.pace, 0];
    restart(learner);
    stand.step(1);
    native = null;
    episode = { steps: 0, ticks: 0, along: 0, maxOff: 0, everRan: skill.state.walkRun.running, fromRest,
      warmStart: { pace: warmPace, start: startAt } };
    if (o.stopOnReset) { control.asked = null; control.stopOrder = true; }
    return learner.inputs.slice();
  };
  const step = (action, { squashed = false } = {}) => {
    if (!Array.isArray(action) || action.length !== 12 || !action.every(Number.isFinite)) throw Error('residual control needs twelve finite actions');
    if (squashed && action.some(x => Math.abs(x) > 1)) throw Error('squashed residual actions exceed one');
    const samples = o.trace ? [] : null, dt = stand.world.dt, ticks = Math.round(o.seconds * stand.world.hz);
    let down = false, off = 0;
    const played = decide(learner, squashed ? action : action.map(tanh), () => {
      stand.step(1);
      episode.everRan ||= skill.state.walkRun.running;
      episode.ticks++;
      samples?.push(reading());
      massCentreToRef(physicalParts, mass, centre, work, velocity);
      const along = velocity.z; off = Math.abs(centre.x - control.physicalLineX);
      episode.along += along; episode.maxOff = Math.max(episode.maxOff, off);
      down ||= o.fallRule === 'physical' ? host.down : body.view.down;
      const failed = down || off > 1, stopped = episode.everRan && !skill.state.walkRun.running && !control.stopOrder;
      const effort = control.action.reduce((sum, x) => sum + x * x, 0) / 12;
      const currentRewardPace = o.rewardPace ?? o.pace;
      const target = control.stopOrder ? 0 : o.paceRelativeShare ? skill.pace : currentRewardPace;
      const trackedSpeed = control.stopOrder ? Math.sqrt(velocity.x ** 2 + velocity.z ** 2) : along;
      const width = o.paceRelativeShare && trackedSpeed < target ? Math.max(.1, o.paceRelativeShare * target) : o.speedWidth;
      const speedCredit = o.speedReward === 'progress' && !control.stopOrder ? Math.min(1, along / currentRewardPace)
        : exp(-(((trackedSpeed - target) / width) ** 2));
      const rate = speedCredit + .15 * up.y - .1 * velocity.x ** 2 - .05 * off ** 2 - .005 * effort;
      return { reward: rate * 30 * dt - (failed ? o.fallPenalty : 0),
        ended: failed || stopped ? 'terminated' : episode.ticks >= ticks ? 'truncated' : null };
    }, dt);
    episode.steps++;
    return { observation: observation.slice(), reward: played.reward, ...(samples ? { samples } : {}),
      terminated: played.ended === 'terminated', truncated: played.ended === 'truncated',
      info: { along: episode.along / episode.ticks, command: o.pace, down, corridor: episode.maxOff,
        ...(o.warmStarts ? { warmStart: episode.warmStart } : {}),
        seconds: episode.ticks / stand.world.hz, fromRest: episode.fromRest, worldSteps: played.steps, worldSeconds: played.seconds } };
  };
  if (o.cacheWarmStarts && o.warmStarts) {
    const pace = o.pace;
    for (const warm of o.warmStarts) await reset({ fromRest: false, start: warm.start, warmPace: warm.pace, pace });
  }
  await reset();
  return { observationSize: layout.inputs.length, actionSize: layout.outputs.length, layout, reset, step, reading,
    dispose() { dispose(); warmCache.clear(); },
    halt() { control.asked = null; control.stopOrder = true; },
    harness: Object.freeze({ model: o.model, engine: o.engine, hz: stand.world.hz, delay: stand.world.delay,
      ...(o.bodyVariant ? { bodyVariant: o.bodyVariant } : {}),
      ...(o.toeConditioning ? { toeConditioning: Object.freeze({ ...o.toeConditioning }) } : {}),
      settle: o.settle,
      actuation: stand.world.actuation, balance: 0, loadout: 'empty', posture: 'guard', fallRule: o.fallRule, actionAt: o.actionAt,
      fallPenalty: o.fallPenalty,
      speedReward: o.speedReward,
      ...(o.rewardPace === undefined ? {} : { rewardPace }),
      residual: o.residual, scale: o.scale, entry: o.entry ?? 'landing', trim: o.trim ?? 'continuous' }) };
}
