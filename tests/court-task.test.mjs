/**
 * **The court task's floor** (`research/court-task.mjs`; Node, core world, Rapier, 120 Hz, Balance
 * 0): the Duellist, a Warrior with sword and buckler, gets round the obstacle court's central column
 * to its swing's window on a Warrior that stands behind it, and stays up.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { courtTask } from "../research/court-task.mjs";

test("the Duellist gets round the court's column to its window and stays up", async () => {
  const row = await courtTask({ model: "workshop-fighter", gap: 4, side: "left", target: "still", seconds: 25 });
  assert.notEqual(row.arrived, null, `never in its window: ${JSON.stringify(row)}`);
  assert.equal(row.falls, 0, JSON.stringify(row));
});
