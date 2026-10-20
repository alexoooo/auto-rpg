/** The Crypt delegates physical route execution to the common Mind role (Node, Rapier, 120 Hz). */
import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { DungeonRun } from "../src/dungeon/run.ts";
import { generateCryptDungeon } from "../src/dungeon/crypt-dungeon.ts";
import { clearSegment, distance, walkable } from "../src/dungeon/map.ts";
import { doorApproach } from "../src/dungeon/door-approach.ts";
import { navigationPath } from "../src/core/mind/navigation.ts";
import { CLASSIC } from "../src/core/mind/config.ts";
import { freshEngine } from "./harness/core-stand.mjs";

async function crypt(layout) {
  const engine = new NullEngine(), scene = new Scene(engine);
  const run = new DungeonRun(scene, { seed: layout.seed, layout, engine: await freshEngine(), visuals: false, mind: () => CLASSIC });
  return { run, dispose() { run.dispose(); scene.dispose(); engine.dispose(); } };
}

test("humanoids follow destination orders on several generated Crypts through the common navigator", async () => {
  for (const seed of [2, 7, 11]) {
    const map = generateCryptDungeon(seed).map; map.spawns = []; map.encounters = [];
    const goal = Array.from({ length: 8 }, (_, i) => ({ x: map.start.x + Math.sin(i * Math.PI / 4) * 1.3, z: map.start.z + Math.cos(i * Math.PI / 4) * 1.3 }))
      .find(point => walkable(map, point, .7, true) && clearSegment(map, map.start, point, .7, true));
    assert.ok(goal, `seed ${seed}: fixture has no clear destination`);
    const trial = await crypt(map), { run } = trial;
    try {
      assert.ok(navigationPath(run.hero.feet(), goal, run.level.sensedSolids, run.hero.radius).length, `seed ${seed}: fixture has no route`);
      run.commands.order = { kind: "attack-move", destination: goal }; run.commands.revision++;
      while (run.clock < 10 && (run.hero.order.kind !== "idle" || run.clock === 0)) run.step();
      const gap = distance(run.hero.feet(), goal);
      assert.equal(run.hero.order.kind, "idle", `seed ${seed}: order incomplete after ${run.clock}s; gap ${gap}m, limit .4m; ${JSON.stringify(run.hero.navigation)}`);
      assert.ok(gap <= .4, `seed ${seed}: arrival ${gap}m exceeds .4m`);
      assert.deepEqual(run.hero.fighter.senses().solids, run.level.sensedSolids);
    } finally { trial.dispose(); }
  }
});

test("a destination through a closed door first requests its reachable opening side", async () => {
  const size = 13, floor = new Uint8Array(size * size);
  for (let z = 5; z <= 7; z++) for (let x = 1; x <= 11; x++) floor[z * size + x] = 1;
  const map = { seed: 1, size, floor, rooms: [], doors: [{ id: 0, point: { x: 6, z: 6 }, axis: "x", open: false }],
    start: { x: 2, z: 6 }, exit: { x: 11, z: 6 }, spawns: [] };
  const trial = await crypt(map), { run } = trial, goal = { x: 10, z: 6 };
  try {
    assert.deepEqual(navigationPath(run.hero.feet(), goal, run.level.sensedSolids, run.hero.radius), [], "a closed physical door blocks the route");
    assert.deepEqual(doorApproach(map, run.level.sensedSolids, run.hero.feet(), goal, run.hero.radius), { door: 0, point: { x: 4, z: 6 } });
    run.commands.order = { kind: "attack-move", destination: goal }; run.commands.revision++;
    while (run.clock < 1 && !run.hero.opening && !map.doors[0].open) run.step();
    assert.equal(run.hero.opening?.door, 0);
    assert.deepEqual(run.hero.plan.move, { kind: "place", points: [{ x: 4, z: 6 }], near: .2 });
    assert.equal(map.doors[0].open, false, "selecting an interaction cannot open a distant door");
    while (run.clock < 12 && !map.doors[0].open) run.step();
    assert.equal(map.doors[0].open, true, `body did not reach the opening side: ${JSON.stringify(run.hero.navigation)}`);
    assert.equal(run.hero.opening, null);
    assert.deepEqual(run.hero.plan.move, { kind: "place", points: [goal], near: .4 });
    assert.ok(navigationPath(run.hero.feet(), goal, run.level.sensedSolids, run.hero.radius).length);
  } finally { trial.dispose(); }
});
