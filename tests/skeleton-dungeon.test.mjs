// A skeleton as the dungeon's hero: it stands up in a run, walks, and does not wound itself doing
// so. A light biped that buzzes at rest loses health to its own contacts, and this is where that
// would show.
import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";

import { DungeonRun } from "../src/dungeon/run.ts";
import { createHeadlessArena } from "./harness/golem-headless-arena.mjs";

const advance = (scene, frames) => {
  for (let i = 0; i < frames; i++) {
    scene._renderId++;
    scene._advancePhysicsEngineStep(1000 / 60);
  }
};

test("a_skeleton_hero_walks_the_dungeon", async () => {
  const arena = await createHeadlessArena({ populateDefaultGeometry: false });
  const run = new DungeonRun(arena.scene, 42, "skeleton-warrior", false);
  const observer = arena.scene.onBeforePhysicsObservable.add(() => run.step(1 / 240));
  try {
    advance(arena.scene, 300);
    const modules = new Set(run.hero.body.visualParts().map((part) => part.moduleId));
    assert.ok(modules.has("locomotion.skeleton") && modules.has("head.skull"),
      `the hero is built of ${[...modules].join(", ")}`);
    const start = run.hero.body.feetPosition().clone();
    run.commands.setMode({ keyboard: true, facing: false }); run.commands.right = 1;
    advance(arena.scene, 60);
    const moved = Vector3.Distance(start, run.hero.body.feetPosition());
    assert.ok(moved > 0.5, `the skeleton hero strafed ${moved.toFixed(3)} m`);
    assert.equal(run.hero.body.vitality, 1);
  } finally { arena.scene.onBeforePhysicsObservable.remove(observer); run.dispose(); arena.dispose(); }
});
