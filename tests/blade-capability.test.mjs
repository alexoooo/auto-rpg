/**
 * **A cut that wounds** (`research/blade-task.mjs`; Node, core world, Rapier, 120 Hz, Balance 0): a
 * Warrior and a Rogue with sword and buckler swing their sword hand's recipe strike at a standing
 * Warrior's head and trunk. On each, the median blow of the edge on the trunk or head carries at
 * least a third of what empties the Warrior's head at the rulebook's price of an edge, the striker
 * stays up, and every swing returns within a second.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { bladeSummary, bladeTask } from "../research/blade-task.mjs";
import { modelSpec } from "../src/core/models.ts";
import { partHitPoints } from "../src/core/rules/pool.ts";
import { rulebook } from "../src/core/rules/rulebook.ts";

const rules = rulebook("arena");
/** A third of the Warrior's head, as joules of edge. */
const WOUNDS = partHitPoints(modelSpec("workshop-fighter")).get("head").value / 3 * rules.unit.value / rules.worth.edge.value;

for (const model of ["workshop-fighter", "workshop-rogue"]) for (const mark of ["high", "middle"]) {
  test(`${model}'s swing at the ${mark} mark cuts with the edge, stays up and returns`, async () => {
    const row = await bladeTask({ model, style: "swing", mark, seconds: 12 }), summary = bladeSummary(row);
    assert.ok(summary.swings > 0, `no swing was thrown: ${JSON.stringify(summary)}`);
    assert.ok(summary.aligned > 0, `no edge met the trunk or head: ${JSON.stringify(summary)}`);
    assert.ok(summary.energy >= WOUNDS, `median edge ${summary.energy.toFixed(2)} J against ${WOUNDS.toFixed(2)} J`);
    assert.equal(summary.felled, false, JSON.stringify(summary));
    assert.ok(summary.longestReturn !== null && summary.longestReturn <= 1, `longest return ${summary.longestReturn} s against 1 s`);
  });
}
