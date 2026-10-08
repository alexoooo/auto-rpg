import test from "node:test";
import assert from "node:assert/strict";
import { mirrorTrial } from "../research/reptile-motion.mjs";

test("autonomous reptiles approach, bite and withdraw without falling across starting gaps", async () => {
  for (const gap of [1.5, 2, 3]) {
    const row = await mirrorTrial(gap), message = JSON.stringify({ ...row, hits: row.hits.length });
    assert.deepEqual(row.falls, [null, null], message);
    assert.equal(row.seconds, 30, message);
    assert.ok(row.bites.every(bite => bite.launched >= 1 && bite.returned >= 1), message);
    const driven = row.hits.filter(hit => hit.sides.some(side => side.part === "jaw" && side.jawRate < 0
      && (side.before === "swing" || side.phase === "swing")));
    assert.ok(driven.length >= 1 && driven[0].time < 12, message);
    assert.ok(driven.every(hit => hit.energy > 0 && hit.closing > 0 && hit.sides.every(side => side.damage > 0)), message);
    for (const assist of row.assist) assert.deepEqual(assist, { steps: 0, force: 0, moment: 0 });
  }
});
