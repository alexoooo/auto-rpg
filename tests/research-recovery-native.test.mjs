/**
 * **The shoe sole the stand-up research reads** (`recoverySoleTrial`, `research/stand-up-sole.mjs`):
 * it carries and releases each character's load without gaining energy. Native tracking of a
 * recorded recovery is `research-recovery-native-capability.test.mjs`'s, since it needs a
 * demonstration that stands.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { recoverySoleTrial } from '../research/stand-up-sole.mjs';

test('the actual shoe sole carries and releases both character loads without energy growth', async () => {
  for (const model of ['workshop-fighter', 'workshop-rogue']) {
    const row = await recoverySoleTrial({ model, weightShare: 1 });
    assert.equal(row.pass, true, JSON.stringify(row));
    assert.equal(row.replay, true);
    assert.ok(row.loaded.compression > row.final.compression);
    assert.ok(row.loaded.compression < row.sole.depth);
  }
});
