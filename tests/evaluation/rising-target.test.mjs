import "../harness/preload-data.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { targetGates } from "../../src/evaluation/rising.ts";
import { buildFall, risingReport } from "../../src/app/node/evaluation.ts";

test("Warrior unproduced fall is excluded from recovery statistics and leaves coverage incomplete", () => {
  const saved = readFileSync(new URL("../../assets/evaluations/rising-target/2026-11-05T111931-5c41b664-6e921c71.jsonl", import.meta.url), "utf8").trim().split("\n").map(JSON.parse);
  const rows = saved.slice(1).filter(row => row.condition.model === "workshop-fighter" && row.condition.loadout.left === "buckler" && row.condition.loadout.right === "club").map(row => ({...row.condition, ...row.reading}));
  assert.equal(rows.length, 16, "saved fixture must contain every direction");
  assert.equal(rows.filter(row => row.takeover === null).length, 1);
  const falls = rows.map(row => ({degrees: row.degrees, made: row.takeover !== null, time: row.stood ? row.verified : null}));
  assert.deepEqual(targetGates(falls, 11.25).gates, {complete: false, within: false, cardinals: false, median: false});
  const [group] = risingReport(rows, true).groups;
  assert.deepEqual({all: group.all, exercised: group.exercised, stood: group.stood, within: group.within, noTakeover: group.noTakeover, meets: group.meets}, {all:16, exercised:15, stood:15, within:14, noTakeover:1, meets:false});
  assert.deepEqual(targetGates(falls.map(row => ({...row, made:false, time:null})), 11.25).gates, {complete:false, within:false, cardinals:false, median:false});
  assert.equal(targetGates(falls.slice(1), 11.25).gates.complete, false);
});


test("held Warrior club-and-buckler shove escalates to an actual fall", async () => {
  const { MINDS } = await import("../../src/app/catalog.ts");
  const built = await buildFall({model:"workshop-fighter", loadout:{left:"buckler",right:"club"}, seed:1, start:"shoved", degrees:213.75, balance:0, grit:0, gusts:false, target:true, mind:MINDS.option.config}, "rapier");
  assert.ok(!("refused" in built), "the observed missing-fall recipe must construct");
  try {
    while (!built.ended) { built.world.step(); built.afterStep(); }
    assert.notEqual(built.reading().takeover, null, "the fixture must establish a fall before recovery can be judged");
  } finally { built.dispose(); }
});
