/**
 * **A native action's cycle ends** (`nativeCycle`, `tests/fixtures/native-actions.mjs`; the core
 * stand, Node, Rapier, 120 Hz): a kick, a whole-body strike and the two low strikes are admitted,
 * end in the ledger whatever their ending, give back every reservation, and leave the body up. The
 * phases each passes and whether it completes are measured apart
 * (`tests/native-action-cycles-capability.test.mjs`).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { nativeCycle } from "./fixtures/native-actions.mjs";

for (const kind of ["kick", "whole", "low", "low-wide"]) test(`a native ${kind} is admitted, ends and gives its body back up`, async () => {
  const cycle = await nativeCycle(kind);
  assert.equal(cycle.admitted, true);
  assert.deepEqual([cycle.actions.length, cycle.ledger.length], [0, 1], JSON.stringify(cycle));
  assert.ok(cycle.ledger[0].ending?.kind, JSON.stringify(cycle.ledger[0]));
  assert.deepEqual(cycle.reservations, {});
  assert.equal(cycle.down, false);
});
