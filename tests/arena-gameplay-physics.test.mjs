/**
 * **The arena's gameplay physics** (`research/arena-control-trials.mjs`), on the Node arena Duel, the
 * default engine, 120 Hz: a fall is taken into recovery unassisted, strikes are thrown and come back,
 * and a whole bout with a grounded side forks. How often a fall is stood and walked off, and how often
 * a strike lands, is `arena-gameplay-physics-capability.test.mjs`'s.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_ENGINE, loadEngine } from '../src/core/engine/engines.ts';
import { buildBout } from '../research/bout.mjs';
import { recoveryCycle, strikeCycle } from '../research/arena-control-trials.mjs';
import { saveState } from '../src/core/state.ts';

test('the gameplay profile takes a fallen Warrior into its recovery, unassisted, whatever its ending', async () => {
  const row = await recoveryCycle({ engine: DEFAULT_ENGINE, held: 'empty', direction: 0 }), [trial] = row.trials;
  assert.equal(row.harness.engine, DEFAULT_ENGINE);
  assert.ok(trial?.fell, `the fixture did not reach its case: the shove did not fell the Warrior: ${JSON.stringify(row)}`);
  assert.ok(trial.stages.length > 0 && trial.stages.every(Number.isInteger), JSON.stringify(trial));
  assert.equal(trial.success, trial.completed && trial.walk !== null && !trial.walk.fell && trial.walk.steps > 0 && trial.walk.travel > .15);
  assert.deepEqual(row.assist, { force: 0, moment: 0 });
});

test('both Warrior hands throw and return their strikes on gameplay physics, and a strike at empty space touches nothing', async () => {
  for (const mode of ['hit', 'miss']) {
    const row = await strikeCycle({ engine: DEFAULT_ENGINE, held: 'empty', hand: 'alternate', mode });
    assert.equal(row.failed, 0, JSON.stringify(row));
    for (const hand of ['left', 'right']) assert.ok(row.thrown[hand] >= 1 && row.returned[hand] >= 1, JSON.stringify(row));
    if (mode === 'miss') assert.deepEqual([row.contactSteps, row.impacts], [0, []]);
  }
});

test('unlimited recovery keeps a grounded opponent sensed and forks the whole bout beyond a minute down', async () => {
  const physicsEngine = await loadEngine();
  const slack = { kind: 'direct', targets: {}, seconds: .1, speed: 3, activation: 0 };
  const recipe = { left: 'workshop-fighter', right: 'workshop-fighter', gap: 8, capSeconds: 70,
    loadouts: { left: { left: "empty", right: 'empty' }, right: { left: "empty", right: 'empty' } }, recoverySeconds: null, minds: { left: slack, right: slack } };
  const a = await buildBout(recipe, { physicsEngine }), b = await buildBout(recipe, { physicsEngine });
  try {
    a.world.step(65 * 120);
    assert.equal(a.duel.verdict, null);
    for (const side of ['left', 'right']) {
      assert.equal(a.duel.duelists[side].body.down, true);
      assert.equal(a.duel.eliminated(side), false);
      assert.ok(a.duel.state.recovery[side] > 60);
      const other = a.duel.state.senses[side];
      assert.ok(other, 'grounded sides remain registered in the common senses');
    }
    const saved = a.duel.save(); b.duel.load(saved);
    a.world.step(120); b.world.step(120);
    assert.deepEqual(saveState(a.duel.state), saveState(b.duel.state));
    a.world.step(4 * 120);
    assert.equal(a.duel.verdict.ending, 'time', 'injury and the bout cap still end continuing bouts');
  } finally { a.dispose(); b.dispose(); }
});
