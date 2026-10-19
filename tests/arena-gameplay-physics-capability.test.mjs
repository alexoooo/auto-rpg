/**
 * **How the arena's gameplay physics recovers and strikes** (`recoveryCycle`, `strikeCycle`,
 * `research/arena-control-trials.mjs`), measured on the Node arena Duel, the default engine, 120 Hz,
 * and not a gate (`tests/experimental.json`): the Warrior stands from four fall directions and walks
 * off, and both hands land on a real collider and come back three times. What holds whatever the
 * ending is `arena-gameplay-physics.test.mjs`'s.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_ENGINE } from '../src/core/engine/engines.ts';
import { recoveryCycle, strikeCycle } from '../research/arena-control-trials.mjs';

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
