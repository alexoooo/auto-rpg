// The dungeon's enemies: a family by weight, then a build of it. The pool reads the research pool and never widens it.
import test from "node:test";
import assert from "node:assert/strict";

import { DUNGEON_ENEMIES, drawEnemy } from "../src/dungeon/enemies.ts";
import { bodyFamily, moduleFamily } from "../src/golem/family.ts";
import { NAMED_BUILDS, namedBuild } from "../src/golem/roster.ts";
import { mulberry32 } from "../src/rng.ts";
import { DungeonRun } from "../src/dungeon/run.ts";
import { createHeadlessArena } from "./harness/golem-headless-arena.mjs";

test("every_dungeon_enemy_is_a_build_the_game_can_stand_up", () => {
  for (const { family, builds } of DUNGEON_ENEMIES) {
    assert.ok(builds.length > 0, `${family} has no builds`);
    for (const { name } of builds) {
      const build = namedBuild(name);
      assert.ok(build, `${name} is not a build the game can pick`);
      assert.equal(bodyFamily(build.setup), family, `${name} is filed under ${family}`);
    }
  }
});

test("the_enemy_draw_reaches_every_family_in_its_weights", () => {
  const random = mulberry32(1), draws = 20_000, seen = new Map();
  for (let i = 0; i < draws; i++) { const name = drawEnemy(random); seen.set(name, (seen.get(name) ?? 0) + 1); }
  const total = DUNGEON_ENEMIES.reduce((sum, f) => sum + f.weight, 0);
  for (const { family, weight, builds } of DUNGEON_ENEMIES) {
    const share = builds.reduce((n, b) => n + (seen.get(b.name) ?? 0), 0) / draws;
    assert.ok(Math.abs(share - weight / total) < 0.02, `${family}: ${(share * 100).toFixed(1)} % of draws, against a weight of ${weight / total}`);
    for (const { name } of builds) assert.ok(seen.get(name) > 0, `${name} is never drawn`);
  }
  assert.equal([...seen.keys()].length, DUNGEON_ENEMIES.reduce((n, f) => n + f.builds.length, 0), "a name was drawn from no family");
});

test("the_research_pool_is_not_the_dungeon_pool", () => {
  // The research tests and `research/` schedule over these twelve; the dungeon reads them and never widens them.
  assert.deepEqual(NAMED_BUILDS.map(b => b.name), ["default", "two-blades", "mace", "maul", "whip", "fists", "ram-capped",
    "ram-blade", "wheel", "multileg", "plated", "pitch-blade"]);
  assert.ok(NAMED_BUILDS.every(b => bodyFamily(b.setup) === "golem"), "a body of another family is in the research pool");
  // No human is drawn until a level with one has been measured against the same level with none, on the owner's
  // machine: each skins about 130,000 vertices on the CPU every frame.
  assert.deepEqual(DUNGEON_ENEMIES.map(f => f.family), ["golem", "skeleton"]);
});

test("a_generated_run_spawns_more_than_one_family", async () => {
  // The pool's own tests cannot see which list `DungeonRun` draws from; a real run can. The family is read from the
  // body that was built, its locomotion module's, not from the name that was drawn.
  const families = new Map();
  for (let seed = 1; seed <= 10; seed++) {
    const arena = await createHeadlessArena({ populateDefaultGeometry: false });
    try {
      const run = new DungeonRun(arena.scene, seed, "default", false);
      try {
        assert.equal(run.actors.length, run.map.spawns.length + 1, `seed ${seed}: one body a spawn, and the hero`);
        for (const enemy of run.actors.slice(1)) {
          const legs = enemy.body.visualParts().find(p => p.slot === "locomotion"), family = moduleFamily(legs.moduleId);
          assert.equal(family, bodyFamily(namedBuild(enemy.name).setup), `seed ${seed}: ${enemy.name} was built as a ${family}`);
          families.set(family, (families.get(family) ?? 0) + 1);
        }
      } finally { run.dispose(); }
    } finally { arena.dispose(); }
  }
  assert.ok((families.get("golem") ?? 0) >= 2 && (families.get("skeleton") ?? 0) >= 2, `spawned ${JSON.stringify([...families])}`);
});
