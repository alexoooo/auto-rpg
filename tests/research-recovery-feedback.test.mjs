/**
 * **The stand-up feedback search's recipes** (`research/stand-up-feedback.mjs`), on the Node core
 * stand, Rapier: a default recipe plays as the baseline, a custom one refuses another's snapshot, and
 * the Lab's visible setup falls as the search's does. Whether the recorded witness still stands the
 * body is `research-recovery-feedback-capability.test.mjs`'s.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { feedbackRecipe, feedbackTrial, FEEDBACK_PARAMETERS } from '../research/stand-up-feedback.mjs';
import witness from '../research/stand-up-feedback-seed.json' with { type: 'json' };
import { recoveryEnvironment } from '../research/stand-up-environment.mjs';
import { SEARCH_FALL } from '../src/lab/stance-mode.ts';
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

test('the portable witness names the feedback parameters the search reads', () => {
  assert.deepEqual(witness.feedback.parameters, FEEDBACK_PARAMETERS);
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
    while (reference.stand.world.steps < 480) reference.step();
    stand.step(480);
    assert.deepEqual(shoves, [[240, SEARCH_FALL.impulse], [264, SEARCH_FALL.impulse]]);
    assert.match(String(actor.body.has), /recovery/);
    const poses = built => [...built.segments].map(([name, s]) => [name, s.node.position.asArray(), s.node.rotationQuaternion.asArray()]);
    assert.deepEqual(poses(stand.built), poses(reference.stand.built));
    assert.deepEqual([...actor.body.muscles.velocity], [...reference.body.muscles.velocity]);
  } finally { reference.dispose(); stance.dispose(); stand.dispose(); }
});
