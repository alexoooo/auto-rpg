/**
 * **The blade task's floor** (`research/blade-task.mjs`; Node, core world, Rapier, 120 Hz, Balance
 * 0): a Warrior with sword and buckler whose only blow is its sword hand's recipe strike commits a
 * swing at a standing Warrior's trunk, its blade meets the target's body, and it stays up.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { bladeSummary, bladeTask } from "../research/blade-task.mjs";

test("a sword hand's swing commits, meets the target's body and leaves its striker up", async () => {
  const row = await bladeTask({ model: "workshop-fighter", style: "swing", mark: "middle", seconds: 8 }), summary = bladeSummary(row);
  assert.ok(summary.swings > 0, `the fixture never committed a swing: ${JSON.stringify(summary)}`);
  assert.ok(row.blows.length > 0, `the blade met nothing: ${JSON.stringify(summary)}`);
  assert.equal(summary.felled, false, JSON.stringify(summary));
});
