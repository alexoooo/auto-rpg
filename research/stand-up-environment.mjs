import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { serialize, deserialize } from 'node:v8';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { coreStand, saveStand, loadStand } from '../tests/harness/core-stand.mjs';
import { modelSpec } from '../src/core/models.ts';
import { armedWith } from '../src/core/items/held.ts';
import { createBody } from '../src/core/body.ts';
import { driveFighter, fighterBody } from '../src/core/mind/fighter.ts';
import { LAB_PRESETS } from '../src/lab/scenarios.ts';
import { startStance } from '../src/lab/stance-mode.ts';
import { guardPosture } from '../src/core/skills/guard.ts';
import { supportRecovery } from '../src/core/mind/rise/support-recovery.ts';
import { dynamicRise } from '../src/core/mind/rise/dynamic.ts';
import { observeBody } from '../src/core/observation.ts';
import { clockSenses } from '../src/core/mind/senses.ts';
import { footStatesOf, readSupport } from '../src/core/control/support.ts';
import { recoveryReady } from '../src/core/control/recovery-ready.ts';
import { deepFreeze } from '../src/core/state.ts';
import { balanceCeiling, balancePercent, rulebook } from '../src/core/rules/rulebook.ts';

// Recovery acceptance and the host's verification tail, in seconds and metres.
const VERIFY = Object.freeze({ slow: .1, minUpNormal: .9, quiet: .5, standing: 2, walking: 1,
  displacement: .1, soleUp: .9, rootUp: .9 });
const sha = value => createHash('sha256').update(value).digest('hex');
const artifact = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  .dependencies['@dimforge/rapier3d-simd-compat'].replace(/^file:/, '');
const artifactSha = sha(readFileSync(new URL(`../${artifact}`, import.meta.url)));
const sourceHash = createHash('sha256');
for (const name of readdirSync(new URL('../src/core/', import.meta.url), { recursive: true }).filter(n => n.endsWith('.ts')).sort()) {
  sourceHash.update(name.replaceAll('\\', '/'));
  sourceHash.update(readFileSync(new URL(`../src/core/${name.replaceAll('\\', '/')}`, import.meta.url)));
}
for (const name of ['actor', 'stance-mode', 'scenarios', 'recovery-recipe']) sourceHash.update(readFileSync(new URL(`../src/lab/${name}.ts`, import.meta.url)));
const sourceSha = sourceHash.digest('hex');
const encoded = v => v === Infinity ? '+inf' : v === -Infinity ? '-inf' : v;
const decoded = v => v === '+inf' ? Infinity : v === '-inf' ? -Infinity : v;

/** An action is copied before it can enter saved state; invalid values change nothing. */
export function checkRecoveryAction(action, channels) {
  if (action?.kind === 'host' && Object.keys(action).length === 1) return { kind: 'host' };
  const assist = action?.assist;
  if (assist !== undefined && (!assist || !['force', 'moment'].every(k => Array.isArray(assist[k])
    && assist[k].length === 3 && Array.from(assist[k]).every(Number.isFinite)))) throw new Error('invalid recovery assist');
  const help = assist === undefined ? {} : { assist: { force: [...assist.force], moment: [...assist.moment] } };
  if (action?.kind === 'muscles') {
    if (!Array.isArray(action.velocity) || !Array.isArray(action.activation)
      || action.velocity.length !== channels.length || action.activation.length !== channels.length
      || Array.from(action.velocity).some(v => !(Number.isFinite(v) || v === '+inf' || v === '-inf'))
      || Array.from(action.activation).some(v => !Number.isFinite(v) || v < 0 || v > 1)) throw new Error('invalid recovery muscle action');
    const handPoses = action.handPoses ?? {};
    if (Object.entries(handPoses).some(([side, pose]) => !['left', 'right'].includes(side) || !['open', 'fist', 'grip'].includes(pose)))
      throw new Error('invalid recovery hand pose');
    return { kind: 'muscles', velocity: [...action.velocity], activation: [...action.activation], handPoses: { ...handPoses }, ...help };
  }
  if (action?.kind === 'targets') {
    if (!Array.isArray(action.angles) || action.angles.length !== channels.length
      || Array.from(action.angles).some((v, i) => !Number.isFinite(v) || v < channels[i].min || v > channels[i].max)
      || !(action.response > 0) || !Number.isFinite(action.response) || !(action.speed > 0) || !Number.isFinite(action.speed)
      || !Number.isFinite(action.activation) || action.activation < 0 || action.activation > 1)
      throw new Error('invalid recovery target action');
    return { kind: 'targets', angles: [...action.angles], response: action.response, speed: action.speed, activation: action.activation, ...help };
  }
  throw new Error('unknown recovery action');
}

/** A real Lab body and host with a research action override inside the ordinary muscle path. */
export async function recoveryEnvironment({ model = 'workshop-fighter', held = 'empty', baseline = 'support-recovery', spec: suppliedSpec, recipe, balance = 0 } = {}) {
  if (!['support-recovery', 'dynamic-rise'].includes(baseline)) throw new Error('unknown recovery baseline');
  if (recipe && baseline !== 'support-recovery') throw new Error('a recipe belongs to support recovery');
  recipe = recipe ? deepFreeze(structuredClone(recipe)) : undefined;
  const spec = armedWith(suppliedSpec ?? modelSpec(model), 'right', held);
  const stand = await coreStand(spec, { engine: 'rapier-coordinate', groundSize: 40, posture: guardPosture(spec), actuation: 'symmetric' });
  const { world, built } = stand;
  const ceiling = balanceCeiling(balance, balancePercent(rulebook('arena')));
  const config = { ...LAB_PRESETS.script.config, subs: [] }, wiring = { name: 'lab', orders: () => null, assist: ceiling };
  const assistForce = new Vector3(), assistMoment = new Vector3();
  const linearBefore = new Vector3(), angularBefore = new Vector3();
  const meter = () => ({ seconds: 0, activeSeconds: 0, forcePeak: 0, momentPeak: 0,
    forceIntegral: 0, momentIntegral: 0, forceSaturatedSeconds: 0, momentSaturatedSeconds: 0,
    positiveWork: 0, negativeWork: 0 });
  const experiment = { mode: 'baseline', action: null, lastAction: null, actionStep: -1,
    firstDown: null, takeover: null, quiet: 0, handover: null, walkFrom: null, success: false,
    failure: null, effortViolation: 0, assisted: false,
    assistance: { preparation: meter(), recovery: meter(), host: meter() } };
  let channels, legacy, port;
  const recovery = (own, view, into) => {
    legacy = baseline === 'support-recovery' ? supportRecovery(own, view, into, recipe) : dynamicRise(own, view, into);
    const muscles = own.muscles;
    channels = muscles.channels.map(c => ({ name: c.name, min: c.dof.spec.min.value,
      max: c.dof.spec.max.value, bind: c.dof.spec.bind.value,
      positive: c.positive.peak, negative: c.negative.peak }));
    port = { legacy: legacy.state, active: false };
    return { name: 'offline recovery', state: port,
      wants(senses) {
        if (experiment.mode === 'baseline') return legacy.wants(senses);
        return experiment.action !== null && experiment.action.kind !== 'host';
      },
      begin() { port.active = true; experiment.takeover ??= into.time; if (experiment.mode === 'baseline') legacy.begin(); },
      end() { port.active = false; if (experiment.mode === 'baseline') legacy.end(); },
      step(senses, dt) {
        if (experiment.mode === 'baseline') legacy.step(senses, dt);
        else {
          const action = experiment.action;
          if (action.kind === 'muscles') {
            muscles.activation.set(action.activation);
            for (let i = 0; i < channels.length; i++) muscles.velocity[i] = decoded(action.velocity[i]);
            own.built.handPoses.request(Object.entries(action.handPoses).map(([hand, pose]) => ({ hand, pose })));
          } else if (action.kind === 'targets') {
            muscles.activation.fill(action.activation);
            for (let i = 0; i < channels.length; i++) {
              const c = muscles.channels[i], start = i - c.index;
              let speed = 0;
              for (let k = 0; k < c.joint.dofs.length; k++) speed += muscles.turning(i, k)
                * Math.max(-action.speed, Math.min(action.speed, (action.angles[start + k] - muscles.angle(start + k)) / action.response));
              muscles.velocity[i] = speed;
            }
            own.built.handPoses.request(['left', 'right'].map(hand => ({ hand, pose: 'open' })));
          } else throw new Error('a host action cannot own recovery');
          own.assist.ask(assistForce.set(...(action.assist?.force ?? [0, 0, 0])),
            assistMoment.set(...(action.assist?.moment ?? [0, 0, 0])));
        }
        experiment.lastAction = { kind: 'muscles', velocity: Array.from(muscles.velocity, encoded),
          activation: [...muscles.activation], handPoses: Object.fromEntries(Object.entries(own.built.handPoses.state)
            .map(([side, p]) => [side, p.requested])) };
        experiment.actionStep = into.steps;
      } };
  };
  const body = createBody(built, world, { ...fighterBody(config, wiring), subs: [recovery] });
  let skills;
  const actor = { body, world, drive(script) { return skills = driveFighter(body, world, config, { ...wiring, script }); }, dispose() { body.dispose(); } };
  const stance = startStance(actor);
  const observe = observeBody(built, body.muscles, world, clockSenses(world), undefined, () => body.down, true);
  const feet = footStatesOf(built), middle = new Vector3(), up = new Vector3(), turn = new Quaternion();
  const root = built.segments.get('lowerTrunk'), inverseRoot = Quaternion.Inverse(root.rest);
  const footUps = feet.map(f => Vector3.UpReadOnly.applyRotationQuaternionToRef(Quaternion.Inverse(f.segment.rest), new Vector3()));
  const states = { body: body.state, skills: skills.state, orders: stance.orders, experiment };
  const identity = { harness: 'Node Stance Lab recovery search', model, held, baseline, recipeSha: recipe ? sha(JSON.stringify(recipe)) : null, hz: world.hz,
    engine: world.physics.engine, revision: world.physics.revision, artifact, artifactSha, sourceSha,
    environmentSha: sha(readFileSync(new URL('./stand-up-environment.mjs', import.meta.url))), specSha: sha(JSON.stringify(spec)),
    actuation: world.actuation, balance, channels };
  const save = () => serialize({ identity, saved: saveStand(world, states) });
  const restore = bytes => {
    const checkpoint = deserialize(bytes);
    assert.deepEqual(checkpoint.identity, identity, 'recovery checkpoint configuration must match');
    loadStand(world, states, checkpoint.saved);
  };
  const act = action => {
    const checked = checkRecoveryAction(action, channels);
    experiment.action = checked; experiment.mode = 'action';
  };
  const measure = () => {
    const o = observe();
    root.node.rotationQuaternion.multiplyToRef(inverseRoot, turn);
    up.set(0, 1, 0).applyRotationQuaternionToRef(turn, up);
    const rootUp = up.y;
    readSupport(feet, feet, middle);
    const soleUp = feet.map((f, i) => {
      up.copyFrom(footUps[i]).applyRotationQuaternionToRef(f.segment.node.rotationQuaternion, up); return up.y;
    });
    const supports = feet.map(f => ({ segment: f.segment.spec.name,
      corners: o.contacts.filter(c => c.segment === f.segment.spec.name && c.fixed !== null
        && c.impulse > 0 && Math.abs(c.normal[1]) >= VERIFY.minUpNormal)
        .flatMap(c => c.patch.filter(p => p.distance <= 0 && Math.abs(p.normal[1]) >= VERIFY.minUpNormal).map(p => p.point)) }));
    const ready = rootUp >= VERIFY.rootUp && soleUp.every(v => v >= VERIFY.soleUp) && recoveryReady(o, supports, VERIFY);
    return { observation: o, rootUp, soleUp, ready };
  };
  const step = (action, { automaticHandover = false } = {}) => {
    if (action !== undefined) act(action);
    if (experiment.handover !== null) {
      if (experiment.mode === 'action') act({ kind: 'host' });
      if (world.time - experiment.handover >= VERIFY.standing) {
        experiment.walkFrom ??= observe().centre;
        stance.orders.forward = .3;
      }
    } else if (automaticHandover && (experiment.quiet >= VERIFY.quiet
      || (experiment.mode === 'action' && experiment.action?.assist && measure().ready))) act({ kind: 'host' });
    const before = world.steps;
    root.body.linearVelocityToRef(linearBefore); root.body.angularVelocityToRef(angularBefore);
    world.step();
    const { observation: o, rootUp, soleUp, ready } = measure();
    const help = experiment.assistance[experiment.takeover === null ? 'preparation'
      : body.has === 'command' ? 'host' : 'recovery'];
    const force = body.assist.given.force, moment = body.assist.given.moment;
    const f = force.length(), m = moment.length(), segment = o.segments.find(s => s.name === 'lowerTrunk');
    help.seconds += world.dt; if (f > 0 || m > 0) help.activeSeconds += world.dt;
    help.forcePeak = Math.max(help.forcePeak, f); help.momentPeak = Math.max(help.momentPeak, m);
    help.forceIntegral += f*world.dt; help.momentIntegral += m*world.dt;
    if (f > 0 && f >= body.assist.most.force*(1-1e-10)) help.forceSaturatedSeconds += world.dt;
    if (m > 0 && m >= body.assist.most.moment*(1-1e-10)) help.momentSaturatedSeconds += world.dt;
    // Trapezoidal external work uses root COM velocities on either side of the solver step.
    const work = world.dt*.5*(force.x*(linearBefore.x+segment.velocity[0])
      + force.y*(linearBefore.y+segment.velocity[1]) + force.z*(linearBefore.z+segment.velocity[2])
      + moment.x*(angularBefore.x+segment.spin[0]) + moment.y*(angularBefore.y+segment.spin[1])
      + moment.z*(angularBefore.z+segment.spin[2]));
    help.positiveWork += Math.max(0,work); help.negativeWork += Math.min(0,work);
    if (o.down) experiment.firstDown ??= world.time;
    const recoveryHelp = experiment.mode === 'action' && experiment.actionStep === before
      && (body.assist.given.force.lengthSquared() > 0 || body.assist.given.moment.lengthSquared() > 0);
    experiment.quiet = ready && !recoveryHelp ? experiment.quiet + world.dt : 0;
    const issued = experiment.actionStep === before ? structuredClone(experiment.lastAction) : { kind: 'host' };
    if (balance > 0 && issued.kind === 'muscles') issued.assist = { force: body.assist.given.force.asArray(), moment: body.assist.given.moment.asArray() };
    if (experiment.firstDown !== null && experiment.handover === null && experiment.quiet >= VERIFY.quiet
      && body.has === 'command') experiment.handover = world.time;
    if (experiment.handover !== null) {
      if (o.down || body.has !== 'command') experiment.failure ??= 'fell after handover';
      if (world.time - experiment.handover >= VERIFY.standing + VERIFY.walking && !experiment.failure) {
        const from = experiment.walkFrom, to = o.centre;
        const distance = from ? Math.hypot(to[0] - from[0], to[2] - from[2]) : 0;
        if (distance >= VERIFY.displacement) experiment.success = true;
        else experiment.failure = 'host walking displacement';
      }
    }
    for (const j of o.joints) {
      if (![j.angle, j.rate, j.speed, j.effort, j.positive, j.negative].every(Number.isFinite)) {
        experiment.failure ??= 'nonfinite joint actuation'; continue;
      }
      experiment.effortViolation = Math.max(experiment.effortViolation,
        j.effort > 0 ? j.effort - j.positive : -j.effort - j.negative);
    }
    if (body.assist.meter.force !== 0 || body.assist.meter.moment !== 0) experiment.assisted = true;
    if (o.segments.some(s => [...s.position, ...s.rotation, ...s.velocity, ...s.spin].some(v => !Number.isFinite(v))))
      experiment.failure ??= 'nonfinite physics';
    return { action: issued, observation: o, rootUp, soleUp, ready, result: result() };
  };
  const result = () => ({ fell: experiment.firstDown !== null, success: experiment.success && (balance > 0 || !experiment.assisted) && experiment.effortViolation < .0001,
    failure: experiment.failure, firstDown: experiment.firstDown, takeover: experiment.takeover, handover: experiment.handover,
    seconds: experiment.handover === null || experiment.takeover === null ? null : experiment.handover - experiment.takeover,
    fromFirstDown: experiment.handover === null || experiment.firstDown === null ? null : experiment.handover - experiment.firstDown,
    elapsed: experiment.takeover === null ? 0 : world.time - experiment.takeover, effortViolation: experiment.effortViolation,
    assisted: experiment.assisted, quiet: experiment.quiet });
  return { stand, body, stance, channels, identity, experiment, legacy, observe, measure, act, step, save, restore, result,
    async fall({ kind = 'lab', degrees = 0, impulse = 60, separation = .2, settleSteps = 0 } = {}) {
      if (!(impulse > 0) || !Number.isFinite(impulse) || !(separation > 0) || !Number.isFinite(separation)
        || !Number.isSafeInteger(settleSteps) || settleSteps < 0) throw new Error('invalid fall recipe');
      for (let i = 0; i < 240; i++) step();
      assert.equal(body.down, false, 'the recovery host starts standing');
      const mass = [...built.segments.values()].reduce((sum, s) => sum + s.rigid.mass, 0);
      stance.shove(kind === 'lab' ? impulse : 1.5 * mass, degrees); step();
      if (kind === 'lab') { for (let i = 1; i < Math.round(separation * world.hz); i++) step(); stance.shove(impulse, degrees); step(); }
      for (let i = 0; i < 360 && experiment.takeover === null; i++) step();
      for (let i = 0; i < settleSteps; i++) step();
      return result();
    },
    dispose() { stance.dispose(); stand.dispose(); } };
}
