import test from 'node:test';
import assert from 'node:assert/strict';
import { feedbackRecipe, feedbackTrial, FEEDBACK_PARAMETERS } from '../research/stand-up-feedback.mjs';
import witness from '../research/stand-up-feedback-seed.json' with { type: 'json' };
import { recoveryEnvironment } from '../research/stand-up-environment.mjs';
import { modelSpec } from '../src/core/models.ts';
import { RISE, stageFaults } from '../src/core/mind/rise/stages.ts';

test('feedback recipe defaults preserve actual baseline continuation and custom recipes cannot share snapshots', async () => {
  const spec = modelSpec('workshop-fighter'), recipe = feedbackRecipe(spec);
  const ordinary = await recoveryEnvironment(), explicit = await recoveryEnvironment({ recipe });
  try {
    await ordinary.fall({ degrees: 90 }); await explicit.fall({ degrees: 90 });
    assert.deepEqual(explicit.measure(), ordinary.measure());
    for (let i = 0; i < 180; i++) assert.deepEqual(explicit.step(), ordinary.step());
    assert.throws(() => ordinary.restore(explicit.save()), /configuration/);
    const before = explicit.save(), expected = Array.from({ length: 24 }, () => explicit.step());
    explicit.restore(before);
    assert.deepEqual(Array.from({ length: 24 }, () => explicit.step()), expected);
  } finally { explicit.dispose(); ordinary.dispose(); }
  assert.ok(Object.isFrozen(recipe) && Object.isFrozen(recipe.progress));
  for (const value of [0, -1, NaN, Infinity]) {
    assert.ok(stageFaults({ ...RISE, progress: { settleSpeed: value } }, spec).some(s => s.includes('progress')));
  }
  assert.throws(() => feedbackRecipe(spec, Array(FEEDBACK_PARAMETERS.length).fill(NaN)), /invalid/);
});

test('the portable slow witness reproduces a complete fresh-fall recovery through the actual host', async () => {
  assert.deepEqual(witness.feedback.parameters, FEEDBACK_PARAMETERS);
  const replay = await feedbackTrial(witness.configuration, witness.feedback.u);
  assert.deepEqual(replay.result, witness.result);
  assert.equal(replay.result.success, true);
  assert.ok(replay.result.seconds > 6, 'this seed does not satisfy the fast-recovery requirement');
});
