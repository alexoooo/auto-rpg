/**
 * **How far the assist holds a pulled body** (`src/core/control/assist.ts`), measured and not a
 * gate (`tests/experimental.json`): a steady pull the soles cannot hold fells the Warrior, and its
 * assist holds it. Node stand, Rapier, 120 Hz; the Warrior, unarmed.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { pulled } from "./fixtures/assist-pull.mjs";

test("a_pull_the_soles_cannot_hold_fells_a_body_and_the_assist_holds_it", async () => {
  const alone = await pulled(null);
  assert.ok(alone.fallen && alone.low < 0.5, `it fell: ${JSON.stringify(alone)}`);
  assert.ok(alone.far > 1, `it travelled ${alone.far} m`);
  assert.ok(alone.recoveries >= 5, `it took ${alone.recoveries} recovery steps`);
  // The fixture reaches the path: the soles missed what the stance asked.
  assert.ok(alone.missed > 0.05, `the soles missed ${alone.missed} weights`);
  assert.deepEqual(alone.mean, [0, 0]);

  const helped = await pulled({ force: 0.25, moment: 0.065 });
  assert.ok(!helped.fallen && helped.low > 0.5, `it held: ${JSON.stringify(helped)}`);
  assert.ok(helped.far < 0.15, `it travelled ${helped.far} m`);
  assert.equal(helped.recoveries, 0);
  const [force, moment] = helped.mean;
  // What the soles miss, well within the ceiling: no more is given than the stance asks.
  assert.ok(force > 0 && force < 0.5 * 0.25 * helped.weight && moment > 0 && moment < 0.5 * 0.065 * helped.weight, `it was given ${force} N and ${moment} N m on average`);

  // The force alone keeps it up, stepping: the legs carry the moment the assist does not give.
  const pushed = await pulled({ force: 0.25, moment: 0 });
  assert.ok(!pushed.fallen && pushed.low > 0.5, `under the force alone: ${JSON.stringify(pushed)}`);
  assert.equal(pushed.mean[1], 0, "and is given no moment");
  // The moment alone does not hold it: no moment stands in for the force its soles miss, and it is given no force.
  const turned = await pulled({ force: 0, moment: 0.065 });
  assert.ok(turned.fallen && turned.recoveries > 0, `under the moment alone: ${JSON.stringify(turned)}`);
  assert.equal(turned.mean[0], 0, "and is given no force");
});
