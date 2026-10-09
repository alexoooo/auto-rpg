// One person orders a party in the dungeon. The hero and its companions are
// bodies on one side (`src/dungeon/run.ts`); a mouse order goes to the selected members only,
// a companion with none holds where it was sent or walks after the hero, and enemies go for
// whichever member they see nearest (Node, core world, Rapier, 120 Hz).
import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { companionSpawn } from "../src/dungeon/party-placement.ts";
import { DungeonRun } from "../src/dungeon/run.ts";
import { orderLabel } from "../src/dungeon/commands.ts";
import { clearSegment, distance, walkable } from "../src/dungeon/map.ts";
import { CLASSIC, RECIPE_FIGHTER } from "../src/core/mind/config.ts";
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

test("a_party_member_plays_the_mind_the_run_is_given_for_its_model_and_an_enemy_its_models_own", async () => {
  const map = classicDungeon(42); map.spawns = [floorAway(map, 3)];
  // The Rogue rising by stages (Classic) where its model lies still once down; an enemy Rogue nearby, which the party stirs.
  const { run, dispose } = await crypt(map, { companions: ["workshop-rogue"], enemy: () => "workshop-rogue", minds: { "workshop-rogue": CLASSIC } });
  try {
    seconds(run, 1);
    const minds = Object.fromEntries(run.actors.map((actor) => [actor.id, actor.fighter?.mind]));
    assert.deepEqual(minds, { hero: RECIPE_FIGHTER, "ally-0": CLASSIC, "enemy-0": RECIPE_FIGHTER });
    // The mind each plays is the one it names: the ally's sub-mind is the staged rise, the enemy's lies.
    assert.deepEqual(run.actors.map((actor) => actor.fighter.minded.kind), ["fighter", "fighter", "fighter"]);
  } finally { dispose(); }
  // The control: given none, the Rogue in the party lies too.
  const plain = await crypt(map, { companions: ["workshop-rogue"] });
  try { assert.deepEqual(plain.run.party.map((member) => member.fighter.mind), [RECIPE_FIGHTER, RECIPE_FIGHTER]); } finally { plain.dispose(); }
});

test("a_dungeon_order_reads_as_its_label", () => {
  // Every kind, so a missing or swapped case fails, and `never` makes a new kind a compile error.
  assert.equal(orderLabel({ kind: "idle" }, null, true), "standing");
  assert.equal(orderLabel({ kind: "idle" }, null, false), "with you");
  assert.equal(orderLabel({ kind: "idle" }, { x: 1, z: 1 }, false), "holding");
  assert.equal(orderLabel({ kind: "lock", target: "enemy-0" }, null, false), "fighting");
  assert.equal(orderLabel({ kind: "attack-move", destination: { x: 1, z: 1 } }, null, false), "attack-moving");
  assert.equal(orderLabel({ kind: "force", points: [{ x: 1, z: 1 }], drawing: false }, null, false), "force-moving");
});

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

test("an_enemy_goes_for_the_party_member_it_sees_nearest", async () => {
  const map = classicDungeon(42);
  const ally = companionSpawn(map, [map.start]);
  // Past the companion on the line from the start, so the companion is nearer and both are in sight.
  const away = { x: ally.x - map.start.x, z: ally.z - map.start.z }, length = Math.hypot(away.x, away.z);
  const enemy = { x: ally.x + away.x / length * 2, z: ally.z + away.z / length * 2 };
  assert.ok(walkable(map, enemy, 0.7, true), "the fixture's enemy stands on floor");
  map.spawns = [enemy];
  const control = await crypt(structuredClone(map)), party = await crypt(map, { companions: ["workshop-rogue"] });
  try {
    // One step runs perception once. Alone, the enemy sees the hero; with a companion nearer, the companion.
    control.run.step(); party.run.step();
    assert.equal(control.run.enemies[0].target?.id, "hero");
    assert.equal(party.run.enemies[0].target?.id, "ally-0");
    assert.equal(party.run.party[1].target?.id, "enemy-0", "and the companion takes it on");
  } finally { party.dispose(); control.dispose(); }
});

test("a_run_is_lost_with_the_whole_party_and_won_by_any_member_at_the_exit", async () => {
  const map = classicDungeon(7); map.exit = { x: 25, z: 25 }; map.spawns = [];
  const { run, dispose } = await crypt(map, { companions: ["workshop-rogue"] });
  const kill = (actor) => actor.fighter.pool.wound({ part: "head", damage: 100, clean: true });
  try {
    kill(run.hero);
    assert.equal(run.hero.alive, false);
    run.step();
    assert.equal(run.status, "playing", "a companion still standing keeps the run going");
    assert.equal(run.leader.id, "ally-0", "and the camera follows it");
    map.exit = run.party[1].feet();
    run.step();
    assert.equal(run.status, "won");
    run.status = "playing"; map.exit = { x: 25, z: 25 };
    kill(run.party[1]);
    run.step();
    assert.equal(run.status, "dead");
    const clock = run.clock;
    run.step(); run.advance(1);
    assert.ok(Math.abs(run.clock - clock - run.world.dt) < 1e-12, "a step still steps the world, and an ended run owes no steps");
  } finally { dispose(); }
});
