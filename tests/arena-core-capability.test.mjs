/**
 * **How the arena's default bout fights** (`src/arena/duel.ts`), measured and not a gate
 * (`tests/experimental.json`): the Warrior against the Rogue under their own minds, played to the
 * cap (Node, core world, Rapier, 120 Hz).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { addArenaSolids } from "../src/arena/room.ts";
import { CAP_SECONDS, Duel } from "../src/arena/duel.ts";
import { createWorld } from "../src/core/world.ts";
import { woundsBy } from "./fixtures/blows.mjs";
import { freshEngine } from "./harness/core-stand.mjs";

test("in_a_bout_in_the_arena_blows_land_both_ways_and_wound", async () => {
  const scene = new Scene(new NullEngine()), world = createWorld(scene, await freshEngine());
  addArenaSolids(world.physics);
  const duel = new Duel(world, { left: "workshop-fighter", right: "workshop-rogue" });
  try {
    assert.ok(duel.run(CAP_SECONDS + 1), "the bout is decided by its cap");
    assert.ok(woundsBy(duel.blows, "left", "right") > 0 && woundsBy(duel.blows, "right", "left") > 0, "blows land both ways, and wound");
  } finally { duel.dispose(); world.dispose(); scene.dispose(); }
});
