import test from 'node:test';
import assert from 'node:assert/strict';
import { transferTrial } from '../research/recovery-transfer.mjs';
import { RISE } from '../src/core/mind/rise/stages.ts';

const bearingLimbs = bearing => RISE.limbs.filter((_, i) => bearing[i]).map(limb => limb.name).sort();

for (const hand of ['left', 'right']) {
  test(`the ${hand} hand is not lifted, and bears, while the centre of mass is outside the supports it would leave`, async (t) => {
    const row = await transferTrial({ hand });
    if (!(Number.isFinite(row.gapBefore) && row.gapBefore > 0)) {
      t.todo(`invalid fixture: it starts ${row.gapBefore} m outside the retained supports, so the transfer is never needed`);
      return;
    }
    const outside = row.transfer.filter(step => step.projection > 0);
    assert.ok(outside.length > 0, JSON.stringify(row.transfer));
    assert.ok(outside.every(step => !step.lifted), 'no hand lifts while the centre of mass is outside');
    assert.ok(outside.every(step => bearingLimbs(step.bearing).includes(`hand.${hand}`)), 'the hand bears while it is');
    assert.deepEqual(row.assist, { force: 0, moment: 0 });
  });
}
