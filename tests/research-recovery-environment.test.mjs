import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { deserialize, serialize } from 'node:v8';
import { recoveryEnvironment } from '../research/stand-up-environment.mjs';

test('recovery actions reject invalid arrays atomically and copy accepted commands', async () => {
  const e = await recoveryEnvironment();
  try {
    const n = e.channels.length;
    const action = { kind: 'muscles', activation: Array(n).fill(0), velocity: Array(n).fill(0), handPoses: {} };
    e.act(action); action.activation[0] = 1;
    assert.equal(e.experiment.action.activation[0], 0);
    const before = structuredClone(e.experiment);
    for (const invalid of [
      { ...action, activation: Array(n) }, { ...action, velocity: Array(n) },
      { ...action, velocity: Array(n).fill(NaN) }, { ...action, activation: Array(n).fill(2) },
      { ...action, handPoses: { left: 'unknown' } }, { kind: 'unknown' },
    ]) {
      assert.throws(() => e.act(invalid));
      assert.deepEqual(e.experiment, before);
    }
    assert.deepEqual(e.result(), { fell: false, success: false, failure: null, firstDown: null,
      takeover: null, handover: null, seconds: null, fromFirstDown: null, elapsed: 0,
      effortViolation: 0, assisted: false, quiet: 0 });
  } finally { e.dispose(); }
});

test('actual fallen-state continuations restore commands, observations and complete state independently of candidate order', async () => {
  const e = await recoveryEnvironment(), fresh = await recoveryEnvironment();
  try {
    await e.fall(); const initial = e.save(), n = e.channels.length;
    const one = { kind: 'muscles', activation: Array(n).fill(.2), velocity: Array(n).fill(1), handPoses: { left: 'fist' } };
    const two = { kind: 'muscles', activation: Array(n).fill(.7), velocity: Array(n).fill(-1), handPoses: { left: 'open' } };
    const run = (env, action) => {
      const trace = [];
      for (let i = 0; i < 32; i++) trace.push(env.step(action));
      return { trace, state: deserialize(env.save()).saved.state };
    };
    const a = run(e, one);
    e.restore(initial); run(e, two); e.restore(initial);
    assert.deepEqual(run(e, one), a);
    fresh.restore(initial); assert.deepEqual(run(fresh, one), a);
    assert.equal(a.trace.at(-1).result.fell, true);
    assert.equal(a.trace.at(-1).result.success, false);
    for (const field of ['specSha', 'sourceSha', 'environmentSha', 'revision']) {
      const invalid = deserialize(initial); invalid.identity[field] = 'incompatible';
      assert.throws(() => fresh.restore(serialize(invalid)), /configuration/, field);
      assert.deepEqual(deserialize(fresh.save()).saved.state, a.state, 'rejected checkpoints change nothing');
    }
  } finally { fresh.dispose(); e.dispose(); }
});

test('a complete staged recovery action tape reproduces physical handover and host walking', async () => {
  const e = await recoveryEnvironment();
  try {
    await e.fall({ degrees: 90 });
    const initial = e.save(), tape = [], expected = createHash('sha256');
    for (let step = 0; step < 4800; step++) {
      const row = e.step(); tape.push(row.action); expected.update(JSON.stringify(row.observation));
      if (row.result.success || row.result.failure) break;
    }
    const outcome = e.result();
    assert.equal(outcome.success, true);
    assert.equal(outcome.fell, true);
    assert.equal(outcome.failure, null);
    assert.equal(outcome.assisted, false);
    assert.ok(outcome.seconds > 6, 'a slow baseline is not a fast-recovery result');
    assert.ok(outcome.elapsed >= outcome.seconds + 3, 'success includes the host standing and walking tail');
    e.restore(initial);
    const actual = createHash('sha256');
    for (const action of tape) actual.update(JSON.stringify(e.step(action).observation));
    assert.equal(actual.digest('hex'), expected.digest('hex'));
    assert.deepEqual(e.result(), outcome);
  } finally { e.dispose(); }
});

test('opposite target commands turn a fallen body joint in opposite directions through physical actuation', async () => {
  const e = await recoveryEnvironment();
  try {
    await e.fall({ degrees: 90 });
    const initial = e.save(), observation = e.observe(), channel = e.channels.findIndex(c => c.name === 'elbow.left flexion');
    const outcomes = [];
    for (const target of [-.8, .7]) {
      e.restore(initial);
      const angles = observation.joints.map((j, i) => Math.max(e.channels[i].min, Math.min(e.channels[i].max, j.angle)));
      angles[channel] = target;
      for (let k = 0; k < 24; k++) e.step({ kind: 'targets', angles, response: .1, speed: 3, activation: 1 });
      outcomes.push(e.observe().joints[channel]);
      assert.equal(e.result().assisted, false);
    }
    assert.ok(outcomes[0].rate < -1 && outcomes[1].rate > 1);
    assert.ok(outcomes[1].angle - outcomes[0].angle > .2);
    e.restore(initial);
    const angles = observation.joints.map((j, i) => Math.max(e.channels[i].min, Math.min(e.channels[i].max, j.angle)));
    angles[channel] = 1.5;
    for (let k = 0; k < 48; k++) e.step({ kind: 'targets', angles, response: .05, speed: 6, activation: 1 });
    assert.ok(e.observe().joints[channel].angle > 1.3, 'the reference-relative elbow range includes deep flexion');
    assert.equal(e.channels[channel].max, e.body.muscles.channels[channel].dof.spec.max.value);
  } finally { e.dispose(); }
});


test('assisted actions clip the actual wrench, replay it exactly and clear it when omitted', async () => {
  const e = await recoveryEnvironment({ balance: 25 });
  try {
    const action = { kind: 'muscles', activation: Array(e.channels.length).fill(0),
      velocity: Array(e.channels.length).fill(0), assist: { force: [0, 1e6, 0], moment: [1e6, 0, 0] } };
    for (const assist of [{ force: [0,NaN,0], moment: [0,0,0] },
      { force: Array(3), moment: [0,0,0] }, { force: [0,0], moment: [0,0,0] }]) {
      const before = structuredClone(e.experiment);
      assert.throws(() => e.act({ ...action, assist }));
      assert.deepEqual(e.experiment, before);
    }
    const saved = e.save(), first = e.step(action);
    assert.deepEqual(first.action.assist, { force: [0,e.body.assist.most.force,0], moment: [e.body.assist.most.moment,0,0] });
    assert.equal(first.result.assisted, true);
    e.restore(saved);
    assert.deepEqual(e.step(first.action).observation, first.observation);
    const { assist, ...plain } = action;
    e.step(plain);
    assert.deepEqual(e.body.assist.given.force.asArray(), [0,0,0]);
    assert.deepEqual(e.body.assist.given.moment.asArray(), [0,0,0]);
    const unassisted = await recoveryEnvironment();
    try {
      unassisted.step(action);
      assert.deepEqual(unassisted.body.assist.given.force.asArray(), [0,0,0]);
      assert.deepEqual(unassisted.body.assist.given.moment.asArray(), [0,0,0]);
      assert.equal(unassisted.result().assisted, false);
    } finally { unassisted.dispose(); }
  } finally { e.dispose(); }
});
