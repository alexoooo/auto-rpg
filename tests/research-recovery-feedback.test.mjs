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


test('the visible Lab setup applies the search shoves on the same steps and enters the same recovery', async () => {
  const { labAddress, labHref, recoveryAddress } = await import('../src/lab/scenarios.ts');
  const { loadoutSpec } = await import('../src/lab/loadout.ts');
  const { labActor } = await import('../src/lab/actor.ts');
  const { startStance } = await import('../src/lab/stance-mode.ts');
  const { coreStand } = await import('./harness/core-stand.mjs');
  const { guardPosture } = await import('../src/core/skills/guard.ts');
  const { balanceCeiling, balancePercent, rulebook } = await import('../src/core/rules/rulebook.ts');
  const address = recoveryAddress(labAddress('?scenario=stance&model=workshop-rogue&right=club&balance=20&hz=480'),'witness');
  assert.deepEqual(labAddress(labHref(address)), address);
  const spec = loadoutSpec(address), recipe = feedbackRecipe(spec, witness.feedback.u);
  const stand = await coreStand(spec, { engine: 'rapier-coordinate', groundSize: 40, posture: guardPosture(spec) });
  const actor = labActor(stand.built, stand.world, { mind: address.mind, recoveryRecipe: recipe,
    assist: balanceCeiling(0, balancePercent(rulebook('arena'))) });
  const shoves = [];
  const stance = startStance(actor, (_, impulse) => shoves.push([stand.world.steps, impulse.length()]), true);
  const reference = await recoveryEnvironment({ spec, recipe });
  try {
    await reference.fall();
    while (reference.stand.world.steps < 400) reference.step();
    stand.step(400);
    assert.deepEqual(shoves, [[240, 60], [264, 60]]);
    assert.match(String(actor.body.has), /recovery/);
    const poses = built => [...built.segments].map(([name, s]) => [name, s.node.position.asArray(), s.node.rotationQuaternion.asArray()]);
    assert.deepEqual(poses(stand.built), poses(reference.stand.built));
    assert.deepEqual([...actor.body.muscles.velocity], [...reference.body.muscles.velocity]);
  } finally { reference.dispose(); stance.dispose(); stand.dispose(); }
});
