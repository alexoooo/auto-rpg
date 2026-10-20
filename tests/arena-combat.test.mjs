/**
 * **A bout's contacts read whole** (`research/arena-combat.mjs`): the reading of a capped arena bout
 * (Node, core world, Rapier, 120 Hz). How often a mind lands is `arena-combat-capability`'s.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { combatTrial } from '../research/arena-combat.mjs';

test('the complete autonomous bout path exposes pressure and actual damage without contact-only strike credit', async () => {
  // Both sides are ordered to walk into each other, empty-handed, and never to attack. Clubs held
  // upright meet first at the hands that hold them, and slide there, a contact that breaks every
  // half second. From 3.6 m apart the bare-handed pair meet and stay pressed together for over a
  // second at a time on both sides, which the reading must find; when a run of it counts as an
  // episode is `arena-combat-scoring`'s.
  const hug = (side, x) => ({ step: 0, side, orders: { move: { kind: "direct", direction: { x, z: 0 } }, face: null, attack: null } });
  const row = await combatTrial({ left: 'classic', right: 'classic', recipe: { capSeconds: 12, gap: 3.6 }, tape: [hug('left', 1), hug('right', -1)] });
  assert.equal(row.harness.engine, 'rapier-coordinate');
  assert.equal(row.recipe.recoverySeconds, null);
  assert.ok(row.meanCentreGap > 0 && Number.isFinite(row.minimumCentreGap));
  for (const side of ['left', 'right']) {
    const out = row.sides[side];
    assert.ok(out.pressureSeconds > 2 && out.pressureOnly.longest > 1, `the fixture did not reach its case: ${JSON.stringify(out)}`);
    assert.equal(out.pressureOnly.longest, out.longestPressure);
    assert.equal(out.driven, 0, 'the hugging fixture is contact without a driven closing blow');
    assert.equal(out.drivenDamage, 0);
    assert.ok(out.incomingDamage > 0 && out.incidentalDamage > 0);
    assert.deepEqual(out.assist, { force: 0, moment: 0 });
  }
});
