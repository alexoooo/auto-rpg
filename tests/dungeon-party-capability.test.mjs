// How a companion walks to where it is sent and back on call, measured and not a gate
// (`tests/experimental.json`): Node, core world, Rapier, 120 Hz.
import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { DungeonRun } from "../src/dungeon/run.ts";
import { clearSegment, distance, walkable } from "../src/dungeon/map.ts";
import { classicDungeon } from "./fixtures/classic-dungeon.mjs";
import { freshEngine } from "./harness/core-stand.mjs";

/** A run on its own scene, with nothing drawn. */
async function crypt(map, options = {}) {
  const scene = new Scene(new NullEngine());
  const run = new DungeonRun(scene, { seed: 42, engine: await freshEngine(), visuals: false, layout: map, ...options });
  return { run, dispose: () => { run.dispose(); scene.dispose(); } };
}
// Actors are compared by id: a failed `assert.equal` of two actors prints a diff of the whole scene they reach.
const seconds = (run, s) => { for (let i = 0; i < s * run.world.hz && run.status === "playing"; i++) run.step(); };

/** A floor point `metres` from the start with a clear line to it, on the first bearing that has one. */
function floorAway(map, metres, bearing = 0) {
  for (let i = 0; i < 16; i++) {
    const angle = bearing + i * Math.PI / 8;
    const at = { x: map.start.x + Math.sin(angle) * metres, z: map.start.z + Math.cos(angle) * metres };
    if (walkable(map, at, 0.7, true) && clearSegment(map, map.start, at, 0.7, true)) return at;
  }
  throw new Error("no floor");
}

test("a_party_order_goes_to_the_selected_member_and_a_companion_regroups_on_call", async () => {
  const map = classicDungeon(42); map.spawns = [];
  const { run, dispose } = await crypt(map, { companions: ["workshop-rogue", "workshop-rogue"] });
  try {
    assert.deepEqual(run.party.map(m => [m.id, m.model]),
      [["hero", "workshop-fighter"], ["ally-0", "workshop-rogue"], ["ally-1", "workshop-rogue"]]);
    assert.deepEqual([...run.selected], ["hero", "ally-0", "ally-1"], "everybody is selected until the person picks");
    assert.equal(run.actors[0].id, "hero", "the hero is the first actor");
    seconds(run, 1);
    const heroStart = run.hero.feet(), ally1Start = run.party[2].feet();
    const post = floorAway(map, 3);
    run.select(["ally-0"]);
    run.commands.order = { kind: "attack-move", destination: post }; run.commands.revision++;
    // About 4.5 m of route round the hero at a Rogue's 0.4 m/s: there by 12.5 s (Node, core world, Rapier, 120 Hz).
    seconds(run, 16);
    const ally0 = run.party[1], ally1 = run.party[2];
    assert.ok(distance(ally0.feet(), post) < 0.6, `ally-0 is at the post: ${distance(ally0.feet(), post)}`);
    assert.equal(ally0.order.kind, "idle", "arriving ends the order");
    assert.deepEqual(ally0.post, post, "and leaves the companion holding where it was sent");
    assert.ok(distance(run.hero.feet(), heroStart) < 0.3, "the unselected hero stayed where it was");
    assert.ok(distance(ally1.feet(), ally1Start) < 0.3, "and so did the unselected companion, already beside the hero");
    run.select(["ally-0"]); run.regroup();
    seconds(run, 10);
    assert.equal(ally0.post, null);
    assert.ok(distance(ally0.feet(), run.hero.feet()) < 3.2, `called back, ally-0 walks to the hero: ${distance(ally0.feet(), run.hero.feet())}`);
    assert.ok(run.party.every(m => m.alive), "nobody fell");
  } finally { dispose(); }
});
