/**
 * **A native path action's life**, on the core stand (`nativeJab`, `tests/fixtures/native-actions.mjs`):
 * a jab of either hand, empty or with a club, ends in the ledger whatever its ending, keeps the other
 * hand covering on every step, moves its hand, and gives its effector back. Whether it completes
 * within its deadline is measured apart (`tests/action-native-path-capability.test.mjs`).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { nativeJab } from "./fixtures/native-actions.mjs";

for (const side of ["left", "right"]) for (const held of ["empty", "club"]) test(`a ${side} native path action with ${held} keeps the other guard, ends and gives its hand back`, async () => {
  const jab = await nativeJab(side, held);
  assert.equal(jab.uncovered, 0, "the other hand keeps covering during the attack");
  assert.ok(jab.motion > .01, `the hand physically moves ${jab.motion} m`);
  assert.deepEqual([jab.actions.length, jab.ledger.length], [0, 1], JSON.stringify(jab.ledger));
  assert.ok(jab.ledger[0].ending?.kind, JSON.stringify(jab.ledger[0]));
  // Withdrawing a committed request does not cut its stroke short.
  if (jab.ledger[0].committed) assert.ok(jab.committed >= 10, `${jab.committed} steps committed`);
  assert.deepEqual([jab.holder, jab.reservation], ["default", undefined]);
});
