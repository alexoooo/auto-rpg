/**
 * **The buckler against a blade** (`research/buckler-task.mjs`; Node, core world, Rapier, 120 Hz,
 * Balance 0): the Duellist's cover, a Warrior and a Rogue with sword and buckler facing their
 * attacker head on and 45 degrees either way, struck by a sword's swing at the head, the trunk and
 * the sword arm, standing in guard and with its own swing under way. Of the attacker's swings that
 * reach it, its buckler meets at least four of five before its body does.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { bucklerSummary, bucklerTask } from "../research/buckler-task.mjs";

for (const model of ["workshop-fighter", "workshop-rogue"]) for (const own of [false, true]) {
  test(`${model}'s buckler meets four of five swings${own ? " with its own swing under way" : ""}`, { timeout: 3600_000 }, async () => {
    const cells = [];
    for (const angle of [-45, 0, 45]) for (const at of ["high", "middle", "upperArm.right"]) cells.push(bucklerSummary(await bucklerTask({ model, angle, at, own })));
    const touched = cells.reduce((sum, cell) => sum + cell.touched, 0), met = cells.reduce((sum, cell) => sum + cell.met, 0);
    assert.ok(touched > 0, `no swing reached the defender: ${JSON.stringify(cells)}`);
    assert.ok(met >= .8 * touched, `the buckler met ${met} of ${touched}: ${JSON.stringify(cells.map(({ angle, at, touched, met, firsts }) => ({ angle, at, touched, met, firsts })))}`);
  });
}
