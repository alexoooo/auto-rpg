import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { frozenEvaluator, verifyFrozenEvaluator } from '../../scripts/frozen-evaluator.mjs';

verifyFrozenEvaluator();
const { acceptanceEnvironment, evaluateAcceptanceCase, digest } =
  await import(new URL('research/stand-up-acceptance.mjs', frozenEvaluator));

test('a saved fall preserves physical state and elapsed time across controller choices and rejects requested assistance', async () => {
  const manifest = JSON.parse(readFileSync(new URL('research/stand-up-acceptance/cases.json', frozenEvaluator)));
  const c = manifest.cases[0];
  assert.equal(manifest.cases.length, 16);
  const e = await acceptanceEnvironment(c.configuration);
  try {
    const saved = gunzipSync(readFileSync(new URL(`research/stand-up-acceptance/${c.file}`, frozenEvaluator)));
    assert.equal(digest(readFileSync(new URL(`research/stand-up-acceptance/${c.file}`, frozenEvaluator))), c.sha256);
    e.restore(saved);
    assert.equal(digest(JSON.stringify(e.observe())), c.observationSha256);
    const initial = e.observe(), clock = e.result();
    const traces = [];
    for (const controller of ['support-recovery', 'step-up', 'support-recovery']) {
      e.restore(saved);
      e.selectComparison(controller);
      assert.deepEqual(e.observe(), initial);
      assert.deepEqual(e.result(), clock, 'a new policy cannot restart the recovery clock');
      const trace = [];
      let driven = 0;
      for (let step = 0; step < 10 * e.stand.world.hz && driven < 24; step++) {
        const row = e.step(); trace.push(row);
        if (row.action.kind === 'muscles' && row.action.activation.some(value => value > 0)) driven++;
      }
      assert.equal(driven, 24, 'the continuation must reach muscle-driven recovery after settling');
      traces.push(trace);
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
});

test('a saved fall replays its recorded baseline to the bit', async () => {
  const manifest = JSON.parse(readFileSync(new URL('research/stand-up-acceptance/cases.json', frozenEvaluator)));
  const c = manifest.cases.find(c => c.reference.result.success);
  assert.ok(c, 'the baseline completes at least one case');
  assert.deepEqual(await evaluateAcceptanceCase(c, manifest), c.reference);
});
