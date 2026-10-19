import test from 'node:test';
import assert from 'node:assert/strict';
import { transferTrial } from '../research/recovery-transfer.mjs';
import { RISE } from '../src/core/mind/rise/stages.ts';

const bearingLimbs = bearing => RISE.limbs.filter((_, i) => bearing[i]).map(limb => limb.name).sort();

for (const hand of ['left', 'right']) {
  test(`${hand} hand unloads only over three real supports without external assistance`, async () => {
    const row = await transferTrial({ hand });
    assert.ok(Number.isFinite(row.gapBefore) && row.gapBefore > 0, 'the fixture starts outside the retained supports');
    assert.ok(row.released && row.released.seconds > 0 && row.released.seconds < 3, JSON.stringify(row));
    const waiting = row.transfer.slice(0, -1);
    assert.ok(waiting.some(step => step.projection > 0 && bearingLimbs(step.bearing).includes(`hand.${hand}`)), 'the departing hand supports the body while transfer is needed');
    assert.ok(waiting.every(step => !step.lifted), 'the hand remains retained until the release step');
    assert.ok(waiting.filter(step => step.projection > 0).every(step => bearingLimbs(step.bearing).includes(`hand.${hand}`)), 'the hand is not unloaded while the COM is outside the retained supports');
    assert.equal(row.released.projection, 0, 'actual COM enters the contracted retained support outline');
    const bearing = [`hand.${hand === 'left' ? 'right' : 'left'}`, 'shin.left', 'shin.right'];
    assert.deepEqual(bearingLimbs(row.released.bearing), bearing);
    const last = row.transfer.at(-1);
    assert.deepEqual({ ...last, bearing: bearingLimbs(last.bearing) }, { projection: 0, lifted: true, bearing });
    assert.ok(row.peak < 2, 'support transfer does not fling the body');
    assert.deepEqual(row.assist, { force: 0, moment: 0 });
    assert.equal(row.phase, 'settle', 'releasing a limb alone is not completion of the stage');
  });
}
