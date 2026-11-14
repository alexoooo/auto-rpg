import "../harness/preload-data.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildFall, risingReport } from "../../src/app/node/evaluation.ts";
import { DEFAULT_ENGINE } from "../../src/core/physics/engines.ts";

test("Warrior unproduced fall is excluded from recovery statistics", () => {
  // The Warrior's sixteen fresh falls holding the club and the buckler, each a played row's condition and reading.
  const rows = readFileSync(new URL("./fixtures/warrior-club-buckler-falls.jsonl", import.meta.url), "utf8").trim().split("\n").map(JSON.parse);
  assert.equal(rows.length, 16, "saved fixture must contain every direction");
  assert.equal(rows.filter(row => row.takeover === null).length, 1);
  const [group] = risingReport(rows, true).groups;
  const stood = rows.filter(row => row.takeover !== null).map(row => row.stood ? row.verified : 30);
  assert.deepEqual({all: group.all, exercised: group.exercised, stood: group.stood, within: group.within, noTakeover: group.noTakeover, mean: group.mean},
    {all:16, exercised:15, stood:15, within:14, noTakeover:1, mean: stood.reduce((sum, time) => sum + time, 0) / stood.length});
});


test("held Warrior club-and-buckler shove escalates to an actual fall", async () => {
  const { MINDS } = await import("../../src/app/catalog.ts");
  const built = await buildFall({model:"man", loadout:{left:"buckler",right:"club"}, seed:1, start:"shoved", degrees:213.75, balance:0, grit:0, gusts:false, target:true, mind:MINDS.option.config}, DEFAULT_ENGINE);
  assert.ok(!("refused" in built), "the observed missing-fall recipe must construct");
  try {
    while (!built.ended) { built.world.step(); built.afterStep(); }
    assert.ok(built.state.shoves > 1, "the fixture must hold its first shove, or escalation is not exercised");
    assert.notEqual(built.reading().takeover, null, "the fixture must establish a fall before recovery can be judged");
  } finally { built.dispose(); }
});
