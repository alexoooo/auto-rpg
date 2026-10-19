/**
 * **How the stand-up research's recovery environment recovers** (`recoveryEnvironment`,
 * `research/stand-up-environment.mjs`), on the Node core stand, Rapier, and not a gate
 * (`tests/experimental.json`): from a 90-degree fall the host's staged recovery stands the body and
 * walks it on, and its tape replays that; and a fallen elbow commanded either way turns faster than
 * 1 rad/s. What a tape and a command hold whatever their ending is
 * `research-recovery-environment.test.mjs`'s.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { recoveryEnvironment } from '../research/stand-up-environment.mjs';

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
