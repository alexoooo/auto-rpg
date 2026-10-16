import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { recoveryEnvironment } from '../research/stand-up-environment.mjs';
import { acceptanceEnvironment, rejectAssistedAction, summarizeAcceptance } from '../research/stand-up-acceptance.mjs';
import { unassistedAudit, unassistedResult } from '../research/stand-up-unassisted.mjs';

test('unassisted gate rejects an assisted action through real force and moment calls', {
  todo: "the legs are the run's (`owner-run-body`: hip x2.49, knee x1.58, calf x2.75, leg speed x1.98), and under Balance 100 the fixture's push no longer fells the body (`rejectAssistedAction`)",
}, async () => {
  const negative = await rejectAssistedAction();
  assert.equal(negative.identity.balance, 100);
  assert.equal(negative.result.success, false);
  assert.equal(negative.result.failure, 'external actuation');
  assert.deepEqual(negative.result.externalActuation.map(e => [e.segment, e.method]),
    [['lowerTrunk', 'applyForce'], ['lowerTrunk', 'applyTorque']]);
  assert.ok(negative.result.externalActuation.every(e => e.value.some(v => v !== 0)));
});

test('engine audit catches direct bypass, moments, impulses and pinning even with Balance zero', async () => {
  const e = await recoveryEnvironment();
  const audit = unassistedAudit(e.stand.built, () => e.stand.world.steps);
  try {
    for (let i = 0; i < 12; i++) e.step();
    audit.check();
    const root = e.stand.built.segments.get('lowerTrunk').body;
    root.applyForce(new Vector3(1, 0, 0), new Vector3());
    root.applyForce(new Vector3(-1, 0, 0), new Vector3());
    root.applyTorque(new Vector3(0, 1, 0));
    root.applyImpulse(new Vector3(0, 0, 1), new Vector3());
    root.applyTorqueImpulse(new Vector3(0, 0, 1));
    root.setFixed(true);
    assert.equal(e.body.assist.meter.force, 0, 'the Assist meter alone misses direct engine calls');
    assert.deepEqual(audit.events.map(v => v.method),
      ['applyForce', 'applyForce', 'applyTorque', 'applyImpulse', 'applyTorqueImpulse', 'setFixed']);
    assert.throws(() => audit.check(), /rejected external actuation/);
    assert.deepEqual(unassistedResult({ success: true, assisted: false, failure: null }, audit.events),
      { success: false, assisted: false, failure: 'external actuation', externalActuation: audit.events });
    e.step();
    assert.throws(() => audit.check(), /rejected external actuation/, 'a later quiet step does not erase help');
  } finally { audit.dispose(); e.dispose(); }
});

test('failure-inclusive statistics cannot turn a few successful episodes into a fast median', () => {
  const row = (seconds, success, failure = null) => ({ result: { seconds, success, failure, fell: true, assisted: false, effortViolation: 0, externalActuation: [] } });
  assert.deepEqual(summarizeAcceptance([row(2, true), row(4, false), row(null, false), row(7, true)]), {
    cases: 4, within6: 1, within12: 2, within35: 2, failureInclusiveMedian: null,
    medianMeaning: 'not reached; failures are infinity', rejectedExternalActuation: 0,
  });
  assert.equal(summarizeAcceptance([row(null, true), row(NaN, true), row(-1, true), row(36, true)]).within35, 0);
});

test('current comparison controllers preserve a newly captured fall and its clock', async () => {
  const e = await acceptanceEnvironment({ model: 'workshop-fighter', held: 'empty' });
  try {
    await e.fall();
    const saved = e.save(), initial = e.observe(), clock = e.result(), traces = [];
    assert.equal(clock.fell, true);
    for (const controller of ['support-recovery', 'step-up', 'support-recovery']) {
      e.restore(saved); e.selectComparison(controller);
      assert.deepEqual(e.observe(), initial);
      assert.deepEqual(e.result(), clock);
      const trace = [];
      let driven = 0;
      for (let step = 0; step < 10 * e.stand.world.hz && driven < 24; step++) {
        const row = e.step(); trace.push(row);
        if (row.action.kind === 'muscles' && row.action.activation.some(value => value > 0)) driven++;
      }
      assert.equal(driven, 24, 'the continuation must reach muscle-driven recovery after settling');
      traces.push(trace);
    }
    assert.deepEqual(traces[0], traces[2]);
    assert.notDeepEqual(traces[0], traces[1]);
  } finally { e.dispose(); }
});
