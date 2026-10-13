import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { recoveryEnvironment } from '../research/stand-up-environment.mjs';
import { acceptanceEnvironment, evaluateAcceptanceCase, rejectAssistedAction, summarizeAcceptance } from '../research/stand-up-acceptance.mjs';
import { unassistedAudit, unassistedResult } from '../research/stand-up-unassisted.mjs';

test('unassisted gate rejects an assisted action through real force and moment calls', async () => {
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

test('a saved fall preserves physical state and elapsed time across controller choices and rejects requested assistance', async () => {
  const manifest = JSON.parse(readFileSync(new URL('../research/stand-up-acceptance/cases.json', import.meta.url)));
  const c = manifest.cases[0];
  assert.equal(manifest.cases.length, 16);
  const e = await acceptanceEnvironment(c.configuration);
  try {
    const saved = gunzipSync(readFileSync(new URL(`../research/stand-up-acceptance/${c.file}`, import.meta.url)));
    e.restore(saved);
    const initial = e.observe(), clock = e.result();
    const traces = [];
    for (const controller of ['standard', 'optimized', 'standard']) {
      e.restore(saved);
      e.selectComparison(controller);
      assert.deepEqual(e.observe(), initial);
      assert.deepEqual(e.result(), clock, 'a new policy cannot restart the recovery clock');
      traces.push(Array.from({ length: 24 }, () => e.step()));
    }
    assert.deepEqual(traces[0], traces[2], 'controller ordering cannot change a continuation');
    assert.notDeepEqual(traces[0], traces[1], 'different real controllers exercise different actions');
  } finally { e.dispose(); }
  const rejected = await evaluateAcceptanceCase(c, manifest, ({ channels }) => () => ({
    kind: 'muscles', activation: channels.map(() => 0), velocity: channels.map(() => 0),
    assist: { force: [0, 1, 0], moment: [0, 0, 0] },
  }));
  assert.equal(rejected.result.success, false);
  assert.equal(rejected.result.failure, 'external actuation');
  assert.equal(rejected.steps, 0);
  const floating = await rejectAssistedAction(c, manifest);
  assert.equal(floating.checkpointSha256, rejected.checkpointSha256);
  assert.equal(floating.initialObservationSha256, rejected.initialObservationSha256);
});
