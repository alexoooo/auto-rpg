import assert from "node:assert/strict";
import test from "node:test";

import { assertWarriorWarriorLocomotionCorpus,
  runWarriorWarriorLocomotionCorpus } from "../scripts/warrior-warrior-locomotion.mjs";

test("Warrior_and_Warrior_close_and_retreat_without_a_clinch_heap_or_air_walk", async () => {
  const report = assertWarriorWarriorLocomotionCorpus(await runWarriorWarriorLocomotionCorpus());
  assert.deepEqual(report.cells.map(({ id }) => id),
    ["warrior-warrior-active-left", "warrior-warrior-active-right"]);
  assert.deepEqual(report.cells.map(({ schedulerOrder }) => schedulerOrder),
    ["left-then-right", "right-then-left"]);
  for (const cell of report.cells) {
    assert.ok(cell.summary.minimumRangeM >= cell.footprintSeparationM -
      report.fixture.maximumFootprintPenetrationM, cell.id);
    assert.ok(cell.summary.closureM >= report.fixture.minimumClosureM, cell.id);
    assert.ok(cell.summary.retreatM >= report.fixture.minimumRetreatM, cell.id);
    assert.equal(cell.combatEvents.reduce((sum, { damage }) => sum + damage, 0), 0, cell.id);
    assert.ok(cell.combatEvents.length > 0,
      `${cell.id} did not physically reach the passive fist-contact envelope`);
    assert.equal(cell.samples.every(({ left, right }) =>
      left.locomotion.state === "supported" && right.locomotion.state === "supported"), true, cell.id);
  }

  for (const mutate of [
    (cell) => { cell.summary.minimumRangeM = 0; },
    (cell) => { cell.samples[0].left.locomotion.state = "fallen"; },
    (cell) => { cell.summary.retreatM = 0; },
  ]) {
    const forged = structuredClone(report); mutate(forged.cells[0]);
    assert.throws(() => assertWarriorWarriorLocomotionCorpus(forged),
      /Warrior\/Warrior supported locomotion failed/);
  }
  const duplicate = structuredClone(report);
  duplicate.cells[1] = structuredClone(duplicate.cells[0]);
  assert.throws(() => assertWarriorWarriorLocomotionCorpus(duplicate),
    /exact two-cell matrix changed/);
});
