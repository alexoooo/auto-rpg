// One person orders a party in the dungeon (session 06, orders). The hero and its companions are
// bodies on one side; a mouse order goes to the selected members only, a companion with none holds
// where it was sent or walks after the hero, and enemies go for whichever member they see nearest.
import test from "node:test";
import assert from "node:assert/strict";
import { createHeadlessArena } from "./harness/golem-headless-arena.mjs";
import { companionSpawn, DungeonRun } from "../src/dungeon/run.ts";
import { asOrders, orderLabel } from "../src/dungeon/commands.ts";
import { clearSegment, distance, walkable } from "../src/dungeon/map.ts";
import { classicDungeon } from "./fixtures/classic-dungeon.mjs";
import { CONFIG } from "../src/config.ts";

const flat = (p) => ({ x: p.x, z: p.z });
const frames = (arena, run, seconds) => {
  for (let i = 0; i < 60 * seconds && run.status === "playing"; i++) { arena.scene._renderId++; arena.scene._advancePhysicsEngineStep(1000 / 60); }
};

/** A floor point `metres` from the start with a clear line to it, on the first bearing that has one. */
function floorAway(map, metres, bearing = 0) {
  for (let i = 0; i < 16; i++) {
    const angle = bearing + i * Math.PI / 8;
    const at = { x: map.start.x + Math.sin(angle) * metres, z: map.start.z + Math.cos(angle) * metres };
    if (walkable(map, at, 0.7, true) && clearSegment(map, map.start, at, 0.7, true)) return at;
  }
  throw new Error("no floor");
}

test("a_dungeon_order_reads_as_the_arena_s_orders", () => {
  // Every kind, so a missing or swapped case fails, and `never` makes a new kind a compile error.
  assert.equal(asOrders({ kind: "idle" }), null);
  assert.deepEqual(asOrders({ kind: "lock", target: "enemy-3" }), { target: "enemy-3", destination: null });
  assert.deepEqual(asOrders({ kind: "attack-move", destination: { x: 4, z: 5 } }), { target: { x: 4, z: 5 }, destination: null });
  assert.deepEqual(asOrders({ kind: "force", points: [{ x: 1, z: 2 }, { x: 6, z: 7 }], drawing: false }),
    { target: null, destination: { x: 6, z: 7 } });
  assert.equal(asOrders({ kind: "force", points: [], drawing: true }), null);
  assert.equal(orderLabel({ kind: "idle" }, null, true), "standing");
  assert.equal(orderLabel({ kind: "idle" }, null, false), "with you");
  assert.equal(orderLabel({ kind: "idle" }, { x: 1, z: 1 }, false), "holding");
  assert.equal(orderLabel({ kind: "lock", target: "enemy-0" }, null, false), "fighting");
  assert.equal(orderLabel({ kind: "attack-move", destination: { x: 1, z: 1 } }, null, false), "attack-moving");
  assert.equal(orderLabel({ kind: "force", points: [{ x: 1, z: 1 }], drawing: false }, null, false), "force-moving");
});

test("a_party_order_goes_to_the_selected_member_and_a_companion_regroups_on_call", async () => {
  const arena = await createHeadlessArena({ populateDefaultGeometry: false });
  const map = classicDungeon(42); map.spawns = [];
  const run = new DungeonRun(arena.scene, 42, "default", false, map, undefined, ["default", "default"]);
  try {
    assert.deepEqual(run.party.map(m => m.id), ["hero", "ally-0", "ally-1"]);
    assert.deepEqual([...run.selected], ["hero", "ally-0", "ally-1"], "everybody is selected until the person picks");
    assert.equal(run.actors[0], run.hero, "the hero is still the first actor");
    arena.scene.onBeforePhysicsObservable.add(() => run.step(1 / CONFIG.world.physicsHz));
    frames(arena, run, 1);
    const heroStart = flat(run.hero.body.feetPosition()), ally1Start = flat(run.party[2].body.feetPosition());
    const post = floorAway(map, 4.5);
    run.select(["ally-0"]);
    run.commands.order = { kind: "attack-move", destination: post }; run.commands.revision++;
    frames(arena, run, 9);
    const ally0 = run.party[1], ally1 = run.party[2];
    assert.ok(distance(ally0.body.feetPosition(), post) < 0.6, `ally-0 is at the post: ${distance(ally0.body.feetPosition(), post)}`);
    assert.equal(ally0.order.kind, "idle", "arriving ends the order");
    assert.deepEqual(ally0.post, post, "and leaves the companion holding where it was sent");
    assert.ok(distance(run.hero.body.feetPosition(), heroStart) < 0.3, "the unselected hero stayed where it was");
    assert.ok(distance(ally1.body.feetPosition(), ally1Start) < 0.3, "and so did the unselected companion, already beside the hero");
    run.select(["ally-0"]); run.regroup();
    frames(arena, run, 9);
    assert.equal(ally0.post, null);
    assert.ok(distance(ally0.body.feetPosition(), run.hero.body.feetPosition()) < 3.2,
      `called back, ally-0 walks to the hero: ${distance(ally0.body.feetPosition(), run.hero.body.feetPosition())}`);
    // The whole party sent to one point: the hero takes the point, the others the slots about it, and
    // every one arrives. Sent to the point itself, all but one would crowd it and never arrive.
    run.select(null);
    const meet = floorAway(map, 4, Math.PI / 2);
    run.commands.order = { kind: "attack-move", destination: meet }; run.commands.revision++;
    frames(arena, run, 10);
    assert.deepEqual(run.party.map(m => m.order.kind), ["idle", "idle", "idle"], "everybody arrived");
    assert.ok(distance(run.hero.body.feetPosition(), meet) < 0.6, "the hero stands on the point it was given");
    assert.ok(distance(ally0.post, meet) > 1 && distance(ally1.post, meet) > 1 && distance(ally0.post, ally1.post) > 1);
  } finally { run.dispose(); arena.dispose(); }
});

test("an_enemy_goes_for_the_party_member_it_sees_nearest", async () => {
  const arena = await createHeadlessArena({ populateDefaultGeometry: false });
  const map = classicDungeon(42);
  const ally = companionSpawn(map, [map.start]);
  // Past the companion on the line from the start, so the companion is nearer and both are in sight.
  const away = { x: ally.x - map.start.x, z: ally.z - map.start.z }, length = Math.hypot(away.x, away.z);
  const enemy = { x: ally.x + away.x / length * 2, z: ally.z + away.z / length * 2 };
  assert.ok(walkable(map, enemy, 0.7, true), "the fixture's enemy stands on floor");
  map.spawns = [enemy];
  const control = new DungeonRun(arena.scene, 42, "default", false, structuredClone(map));
  const run = new DungeonRun(arena.scene, 42, "default", false, map, undefined, ["default"]);
  try {
    // One step runs perception once. Alone, the enemy sees the hero; with a companion nearer, the companion.
    control.step(1 / CONFIG.world.physicsHz); run.step(1 / CONFIG.world.physicsHz);
    assert.equal(control.enemies[0].target, control.hero);
    assert.equal(run.enemies[0].target, run.party[1]);
    assert.equal(run.party[1].target, run.enemies[0], "and the companion takes it on");
  } finally { run.dispose(); control.dispose(); arena.dispose(); }
});

test("a_run_is_lost_with_the_whole_party_and_won_by_any_member_at_the_exit", async () => {
  const arena = await createHeadlessArena({ populateDefaultGeometry: false });
  const map = classicDungeon(7); map.exit = { x: 25, z: 25 };
  const run = new DungeonRun(arena.scene, 7, "default", false, map, undefined, ["default"]);
  try {
    for (const limb of run.hero.body.limbs) limb.health = 0;
    run.step(1 / CONFIG.world.physicsHz);
    assert.equal(run.status, "playing", "a companion still standing keeps the run going");
    assert.equal(run.leader, run.party[1], "and the camera follows it");
    map.exit = flat(run.party[1].body.feetPosition());
    run.step(1 / CONFIG.world.physicsHz);
    assert.equal(run.status, "won");
    run.status = "playing"; map.exit = { x: 25, z: 25 };
    for (const limb of run.party[1].body.limbs) limb.health = 0;
    run.step(1 / CONFIG.world.physicsHz);
    assert.equal(run.status, "dead");
  } finally { run.dispose(); arena.dispose(); }
});
