/**
 * **The buckler task's floor** (`research/buckler-task.mjs`; Node, core world, Rapier, 120 Hz,
 * Balance 0): a sword's swing at a Warrior with sword and buckler covering by prediction commits and
 * reaches it, each swing's record names what it met first, and the defender stays up.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { bucklerSummary, bucklerTask } from "../research/buckler-task.mjs";

test("a swing at a covering Warrior commits and reaches it, and the defender stays up", async () => {
  const row = await bucklerTask({ model: "workshop-fighter", angle: 0, at: "middle", seconds: 8 }), summary = bucklerSummary(row);
  assert.ok(summary.swings > 0, `the fixture never committed a swing: ${JSON.stringify(summary)}`);
  assert.ok(summary.touched > 0, `no swing reached the defender: ${JSON.stringify(summary)}`);
  assert.ok(row.swings.every((swing) => !swing.touched || typeof swing.first === "string"), JSON.stringify(row.swings));
  assert.equal(summary.down, false, JSON.stringify(summary));
});
