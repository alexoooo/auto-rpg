import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_ENGINE, loadEngine } from '../src/core/engine/engines.ts';
import { buildBout } from '../research/bout.mjs';
import { recoveryCycle, strikeCycle } from '../research/arena-control-trials.mjs';
import { saveState } from '../src/core/state.ts';

test('the gameplay profile recovers a Warrior from four real fall directions and resumes walking', async () => {
  for (const direction of [0, 1, 2, 3]) {
    const row = await recoveryCycle({ engine: DEFAULT_ENGINE, held: 'empty', direction });
    assert.equal(row.harness.engine, DEFAULT_ENGINE);
    assert.equal(row.success, true, JSON.stringify(row));
    assert.deepEqual(row.assist, { force: 0, moment: 0 });
  }
});

test('both Warrior hands still strike real contacts and return on gameplay physics', async () => {
  for (const mode of ['hit', 'miss']) {
    const row = await strikeCycle({ engine: DEFAULT_ENGINE, held: 'empty', hand: 'alternate', mode });
    assert.equal(row.fell, false);
    for (const hand of ['left', 'right']) assert.ok(row.returned[hand] >= 3, JSON.stringify(row));
    if (mode === 'hit') for (const hand of ['left', 'right'])
      assert.ok(row.impacts.some(i => i.hand === hand && i.closing > 0), JSON.stringify(row));
    else assert.deepEqual(row.impacts, []);
  }
});

test('unlimited recovery keeps a grounded opponent sensed and forks the whole bout beyond a minute down', async () => {
  const physicsEngine = await loadEngine();
  const slack = { kind: 'direct', targets: {}, seconds: .1, speed: 3, activation: 0 };
  const recipe = { left: 'workshop-fighter', right: 'workshop-fighter', gap: 8, capSeconds: 70,
    held: { left: 'empty', right: 'empty' }, recoverySeconds: null, minds: { left: slack, right: slack } };
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
