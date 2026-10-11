import test from 'node:test';
import assert from 'node:assert/strict';
import { deserialize } from 'node:v8';
import { recoveryEnvironment } from '../research/stand-up-environment.mjs';
import { beamEvaluator } from '../research/stand-up-beam.mjs';

test('overlapping recovery search preserves the exact committed prefix and keeps lookahead outside its clock', async () => {
  const e = await recoveryEnvironment(), standing = e.observe().joints.map(j => j.angle);
  let evaluator;
  try {
    await e.fall();
    const node = { checkpoint: e.save() }, seed = { configuration: { model: 'workshop-fighter' } };
    const config = { advance: 12, window: 24, lookahead: 24 };
    evaluator = await beamEvaluator(seed, node, config, standing);
    const original = e.result().elapsed, one = evaluator.evaluate(evaluator.initial, true);
    evaluator.evaluate(evaluator.initial.map(v => 1 - v));
    const two = evaluator.evaluate(evaluator.initial, true);
    const { checkpoint: firstCheckpoint, ...first } = one, { checkpoint: secondCheckpoint, ...second } = two;
    assert.deepEqual(second, first);
    assert.deepEqual(deserialize(secondCheckpoint).saved.state, deserialize(firstCheckpoint).saved.state);
    assert.equal(one.rows.length, 48);
    assert.equal(one.result.success, false);
    e.restore(one.checkpoint);
    assert.ok(Math.abs(e.result().elapsed - original - config.advance / 120) < 1e-12);
    for (const row of one.rows.slice(config.advance)) assert.deepEqual(e.step(row.action).observation, row.observation);
    assert.deepEqual(e.result(), one.result);
    e.restore(secondCheckpoint);
    for (const row of two.rows.slice(config.advance)) assert.deepEqual(e.step(row.action).observation, row.observation);
    assert.deepEqual(e.result(), two.result);
  } finally { evaluator?.dispose(); e.dispose(); }
});
