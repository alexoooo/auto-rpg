import test from "node:test";
import assert from "node:assert/strict";
import { evaluationFixtures, SPLITS } from "../research/lab/experiments.mjs";

test("selection fixture expansion preserves the measured mirror protocol", () => {
  const rows = evaluationFixtures("selection", 2);
  assert.equal(rows.length, 16);
  assert.deepEqual(rows[0], { build: "default", opponentBuild: "default", opponent: "golem-planner", seed: 200000 });
  assert.deepEqual(rows.at(-1), { build: "ram-blade", opponentBuild: "ram-blade", opponent: "golem-brawler", seed: 210301 });
  assert.throws(() => evaluationFixtures("invented"), /split/);
  assert.throws(() => evaluationFixtures("selection", 0), /repeats/);
});

test("teacher students reserve opponents absent from both demonstrations and ordinary training", () => {
  const trained = new Set([...SPLITS.train.opponents, "golem-champion"]);
  for (const split of ["student-confirmation", "student-dual-confirmation"]) {
    const rows = evaluationFixtures(split, 4, true);
    assert.ok(rows.every((r) => !trained.has(r.opponent)));
    assert.ok(rows.length * 2 >= 64);
  }
});

test("maul confirmation tests varied opposing bodies on unique independent seeds", () => {
  const rows = evaluationFixtures("maul-confirmation", 4, true);
  assert.equal(rows.length * 2, 96);
  assert.ok(rows.every((r) => r.build === "maul" && r.seed >= 2600000));
  assert.deepEqual([...new Set(rows.map((r) => r.opponentBuild))], ["default", "maul", "mace", "two-blades"]);
  assert.equal(new Set(rows.map((r) => r.seed)).size, rows.length);
});

test("fresh confirmation seed offsets preserve the entire matchup matrix", () => {
  const original = evaluationFixtures("confirmation", 4, false);
  const fresh = evaluationFixtures("confirmation", 4, false, 3000000);
  assert.deepEqual(fresh, original.map((r) => ({ ...r, seed: r.seed + 3000000 })));
  for (const invalid of [-1, 0.5, NaN, Infinity]) {
    assert.throws(() => evaluationFixtures("confirmation", 4, false, invalid), /seed offset/);
  }
});
