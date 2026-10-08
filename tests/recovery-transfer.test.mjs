import test from 'node:test';
import assert from 'node:assert/strict';
import { transferTrial } from '../research/recovery-transfer.mjs';

test('either hand unloads only over three real supports without external assistance', {
  todo: "the open hand bears on its palm's measured hull, and this support was tuned on the open capsule",
}, async () => {
  for (const hand of ['left', 'right']) {
    const row = await transferTrial({ hand });
    assert.ok(row.gapBefore > .03, JSON.stringify(row));
    assert.ok(row.released && row.released.seconds > .1 && row.released.seconds < 3, JSON.stringify(row));
    assert.equal(row.released.projection, 0, 'actual COM enters the contracted retained support outline');
    assert.deepEqual(row.released.bearing, hand === 'left'
      ? [true, false, false, true, true, false] : [true, true, false, true, false, false]);
    assert.ok(row.peak < 2, 'support transfer does not fling the body');
    assert.deepEqual(row.assist, { force: 0, moment: 0 });
    assert.equal(row.phase, 'settle', 'releasing a limb alone is not completion of the stage');
  }
});
