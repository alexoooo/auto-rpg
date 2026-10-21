/**
 * **The court** (`research/court-task.mjs`; Node, core world, Rapier, 120 Hz, Balance 0): the
 * Duellist, a Warrior and a Rogue with sword and buckler, from either spawn of the obstacle court 4
 * and 6 m from a Warrior behind the central column that stands or walks to and fro, reaches its
 * swing's window within 15 s, without a fall.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { courtTask } from "../research/court-task.mjs";

for (const model of ["workshop-fighter", "workshop-rogue"]) for (const gap of [4, 6]) for (const side of ["left", "right"]) for (const target of ["still", "moving"]) {
  test(`${model} reaches its window round the column from the ${side} at ${gap} m, its target ${target}`, async () => {
    const row = await courtTask({ model, gap, side, target, seconds: 15 });
    assert.notEqual(row.arrived, null, `not in its window by 15 s: ${JSON.stringify(row)}`);
    assert.equal(row.falls, 0, JSON.stringify(row));
  });
}
