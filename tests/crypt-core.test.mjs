// The Crypt (`src/dungeon/run.ts`): a seeded crypt loads, its bodies stand in it, and a
// fight starts and ends; its doors are fixed boxes in the world until they open; a run is lost
// when its party is down, in whatever step that is (Node, core world, Rapier, 120 Hz).
import test from "node:test";
import assert from "node:assert/strict";
import { woundsBy } from "./fixtures/blows.mjs";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { centreOfToRef } from "../src/core/control/support.ts";
import { DungeonRun, REST, WAKE_METRES } from "../src/dungeon/run.ts";
import { generateLevel } from "../src/dungeon/level.ts";
import { clearSegment, distance, findPath, walkable } from "../src/dungeon/map.ts";
import { freshEngine } from "./harness/core-stand.mjs";

async function crypt(seed, layout, options = {}) {
  const scene = new Scene(new NullEngine());
  const run = new DungeonRun(scene, { seed, engine: await freshEngine(), visuals: false, layout, ...options });
  return { run, scene, dispose: () => { run.dispose(); scene.dispose(); } };
}
const seconds = (run, s) => { for (let i = 0; i < s * run.world.hz && run.status === "playing"; i++) run.step(); };

/** The generated level with one stated edit: the start moved to floor `gap` m from the first spawn, in its sight. */
function faceToFace(seed, gap) {
  const map = generateLevel(seed).map, spawn = map.spawns[0];
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8, at = { x: spawn.x + Math.sin(a) * gap, z: spawn.z + Math.cos(a) * gap };
    if (walkable(map, at, 0.7, true) && clearSegment(map, spawn, at, 0.35, true)) { map.start = at; return map; }
  }
  throw new Error("no floor");
}

test("a_seeded_crypt_loads_and_its_bodies_stand_in_it", async () => {
  const { run, dispose } = await crypt(1);
  try {
    const near = run.enemies.filter(e => distance(e.home, run.map.start) < WAKE_METRES);
    assert.ok(near.length > 0 && near.length < run.enemies.length, `the fixture has enemies on both sides of the wake line: ${near.length} of ${run.enemies.length}`);
    for (const enemy of run.enemies) {
      assert.equal(enemy.fighter !== null, near.includes(enemy), `${enemy.id} is built exactly when the party is within ${WAKE_METRES} m`);
    }
    seconds(run, 2);
    assert.equal(run.status, "playing");
    for (const actor of run.actors.filter(a => a.fighter)) {
      const { body } = actor.fighter;
      assert.equal(body.view.down, false, `${actor.id} is on its feet`);
      assert.ok(body.view.head.y > 1, `${actor.id}'s head is up: ${body.view.head.y}`);
      assert.ok(distance(actor.feet(), actor.home) < 1, `and it stood where it was built: ${distance(actor.feet(), actor.home)}`);
    }
  } finally { dispose(); }
});

test("a_fight_in_the_crypt_starts_and_ends", async () => {
  const { run, dispose } = await crypt(1, faceToFace(1, 3.5));
  try {
    const enemy = run.enemies[0];
    assert.ok(enemy.fighter, "the first enemy is built: the party stands 3.5 m from it");
    for (let i = 0; i < 30 * run.world.hz && enemy.alive; i++) run.step();
    assert.ok(woundsBy(run.blows, run.hero.id, enemy.id) > 0 && woundsBy(run.blows, enemy.id, run.hero.id) > 0, "blows land both ways, and wound");
    // A fall or an emptied pool ends a body's fight (`DungeonActor.alive`).
    assert.equal(enemy.alive, false, `and the fight ends inside 30 s: ${run.clock.toFixed(1)} s`);
    assert.ok(run.hero.alive, "with the hero standing");
    // A body out of the fight goes limp at the next step: its assist withdrawn, and nothing driving it from then on.
    // One still in the fight keeps its own.
    run.step();
    assert.deepEqual([enemy.fighter.body.assist.withdrawn, run.hero.fighter.body.assist.withdrawn], [true, false]);
    assert.deepEqual([enemy.limp, run.hero.limp], [true, false]);
    const views = () => [enemy, run.hero].map(a => a.fighter.body.view.time), [left, then] = views();
    seconds(run, 2);
    assert.equal(views()[0], left, "its control takes no step again");
    assert.ok(views()[1] > then + 1.9, "while the hero's goes on");
    const head = enemy.fighter.built.segments.get("head").node.position, root = enemy.fighter.body.muscles.dynamics.root.segment.node.position;
    assert.ok(head.y < 0.6, `it lies on the floor: its head at ${head.y} m`);
    assert.deepEqual(enemy.feet(), { x: root.x, z: root.z }, "and it is where its root lies");
    assert.equal(run.status, "playing", "the rest of the crypt is still to come");
  } finally { dispose(); }
});

/**
 * The generated level with stated edits, for the rule that holds an enemy at rest (`REST`): its first spawn kept,
 * and a second put on floor `between` m from it, or none; the start moved to floor 15.5 m from the first, inside
 * `WAKE_METRES` and beyond an enemy's sight, and inside `WAKE_METRES` of the second, or beyond `REST.metres` of it,
 * as `both` says. `far` is the floor nearest the start by a path that is farther than `REST.metres` from every spawn.
 */
function restFixture(seed, between = null, both = true) {
  const map = generateLevel(seed).map, spawn = map.spawns[0], floor = [];
  for (let x = 0; x < map.size; x++) for (let z = 0; z < map.size; z++) if (walkable(map, { x, z }, 0.7, true)) floor.push({ x, z });
  const starts = (spawns) => floor.filter(p => Math.abs(distance(p, spawns[0]) - 15.5) < 0.3 &&
    (spawns.length < 2 || (both ? distance(p, spawns[1]) < WAKE_METRES - 0.3 : distance(p, spawns[1]) > REST.metres + 0.5)));
  const seconds = between === null ? [null] : floor.filter(p => Math.abs(distance(p, spawn) - between) < 0.3);
  let best = null;
  for (const second of seconds) {
    const spawns = second ? [spawn, second] : [spawn];
    const fars = floor.filter(p => spawns.every(s => distance(s, p) > REST.metres + 0.7));
    for (const start of starts(spawns)) for (const far of fars) {
      if (distance(start, far) > 6 || (best && distance(start, far) >= best.length)) continue;
      const route = findPath(map, start, far, 0.35);
      if (route.length && (!best || route.length < best.length)) best = { spawns, start, far, length: route.length };
    }
  }
  if (!best) throw new Error("no floor");
  map.spawns = best.spawns; map.start = best.start;
  return { map, far: best.far };
}
/** Step until `done` or for `most` s: whether it came to be. */
function until(run, done, most) {
  for (let i = 0; i < most * run.world.hz && run.status === "playing" && !done(); i++) run.step();
  return done();
}
/** Order the hero to `to`, and step until `done` or for `most` s: whether it came to be. */
function walkUntil(run, to, done, most) {
  run.commands.order = { kind: "attack-move", destination: to }; run.commands.revision++;
  return until(run, done, most);
}
const poses = (actor) => [...actor.fighter.built.segments.values()].flatMap(s => [...s.node.position.asArray(), ...s.node.rotationQuaternion.asArray()]);

test("an_enemy_at_rest_is_held_while_the_party_is_far_and_let_go_before_it_can_see_it", async () => {
  const { map, far } = restFixture(1);
  const { run, dispose } = await crypt(1, map);
  try {
    const [enemy] = run.enemies, start = { ...map.start }, apartNow = () => distance(run.hero.feet(), enemy.feet());
    seconds(run, 1);
    assert.ok(enemy.fighter && !enemy.held, `built with the party ${apartNow().toFixed(1)} m off, and not held inside ${REST.metres} m`);
    assert.ok(walkUntil(run, far, () => enemy.held, 30), `it is held once the party has walked off: ${apartNow().toFixed(1)} m`);
    assert.ok(apartNow() > REST.metres && apartNow() < REST.metres + 0.5, `at ${REST.metres} m and no sooner: ${apartNow()}`);
    // Held, it stands as it stood to the bit, nothing drives it, and it is still in the fight.
    const stood = poses(enemy), time = enemy.fighter.body.view.time;
    seconds(run, 1);
    assert.deepEqual(poses(enemy), stood);
    assert.equal(enemy.fighter.body.view.time, time);
    assert.deepEqual([enemy.alive, enemy.limp], [true, false]);
    // Let go as the party comes back, beyond its sight, and driven afresh: it stands, and its view moves on.
    assert.ok(walkUntil(run, start, () => !enemy.held, 30), `it is let go as the party comes back: ${apartNow().toFixed(1)} m`);
    assert.ok(apartNow() < WAKE_METRES && apartNow() > WAKE_METRES - 0.5, `at ${WAKE_METRES} m and no later: ${apartNow()}`);
    const then = run.clock;
    seconds(run, 3);
    assert.equal(enemy.held, false, "and is not held again while the party stays inside the farther line");
    assert.ok(enemy.fighter.body.view.time > then + 2.9, "its control steps again");
    assert.ok(enemy.alive && enemy.fighter.body.view.head.y > 1, `and it is on its feet: head at ${enemy.fighter.body.view.head.y} m`);
    assert.notDeepEqual(poses(enemy), stood, "no longer fixed");
  } finally { dispose(); }
});

test("two_enemies_at_rest_side_by_side_are_held_together", async () => {
  const { map, far } = restFixture(1, 3);
  const { run, dispose } = await crypt(1, map);
  try {
    seconds(run, 1);
    assert.deepEqual(run.enemies.map(e => [e.fighter !== null, e.held]), [[true, false], [true, false]], "both are built, and neither held");
    assert.ok(distance(run.enemies[0].feet(), run.enemies[1].feet()) < REST.company, "each within the other's company distance");
    assert.ok(walkUntil(run, far, () => run.enemies.every(e => e.held), 30), `both are held once the party is far: ${run.enemies.map(e => e.held)}`);
  } finally { dispose(); }
});

test("a_body_walking_up_to_where_an_enemy_waits_has_it_built_and_a_held_one_let_go", async () => {
  const { map } = restFixture(1, 8, false);
  const { run, dispose } = await crypt(1, map, { enemy: () => "workshop-fighter" });
  try {
    const [walker, waiting] = run.enemies, gap = () => distance(walker.feet(), waiting.feet()), toHome = () => distance(walker.feet(), waiting.home);
    seconds(run, 1);
    assert.deepEqual([walker.fighter !== null, waiting.fighter !== null], [true, false], "the party is near the first alone");
    assert.ok(distance(run.hero.feet(), waiting.home) > REST.metres && gap() > REST.clear, "and far from the second, as the first is");
    // The run's state, set by hand: an enemy that saw the party at `to` walks there while it is alerted, and home after.
    const send = (to) => { walker.lastSeen = to ? { ...to } : null; walker.alertedUntil = to ? run.clock + 60 : 0; };
    send(waiting.home);
    assert.ok(until(run, () => waiting.fighter !== null, 30), `the one waiting is built as the walker nears: ${toHome().toFixed(2)} m`);
    assert.ok(toHome() < REST.company && toHome() > REST.company - 0.3, `at ${REST.company} m of where it waits, and no sooner: ${toHome()}`);
    assert.equal(waiting.held, false, "and is not held with the walker beside it");
    send(null);
    assert.ok(until(run, () => waiting.held, 30), `it is held once the walker has gone home: ${gap().toFixed(2)} m`);
    assert.ok(gap() > REST.clear && gap() < REST.clear + 0.3, `at ${REST.clear} m and no sooner: ${gap()}`);
    send(waiting.home);
    assert.ok(until(run, () => !waiting.held, 30), `and let go as the walker nears again: ${gap().toFixed(2)} m`);
    assert.ok(gap() < REST.company && gap() > REST.company - 0.3, `at ${REST.company} m: ${gap()}`);
    assert.equal(walker.held, false, "the walker was never held: the party stayed near it");
  } finally { dispose(); }
});

test("a_closed_door_is_a_wall_until_it_opens", async () => {
  const { run, scene, dispose } = await crypt(1);
  try {
    const door = run.map.doors.find(d => !d.open);
    assert.ok(door, "the fixture has a closed door");
    const radius = 0.1, node = new TransformNode("ball", scene);
    node.position.set(door.point.x, 3, door.point.z); node.rotationQuaternion = Quaternion.Identity();
    const moment = 0.4 * radius * radius;
    run.world.physics.addBody(node, [{ kind: "sphere", centre: [0, 0, 0], radius }],
      { mass: 1, centre: [0, 0, 0], moments: [moment, moment, moment], orientation: Quaternion.Identity() });
    run.world.step(run.world.hz);
    assert.ok(Math.abs(node.position.y - 2.5 - radius) < 0.02, `a ball dropped on the closed door rests on its top: ${node.position.y}`);
    run.level.openNearby([door.point]);
    assert.equal(door.open, true);
    run.world.step(run.world.hz);
    assert.ok(node.position.y < 2 * radius, `opened, the door is gone and the ball on the floor: ${node.position.y}`);
  } finally { dispose(); }
});

test("a_run_is_lost_when_its_last_member_falls_in_whatever_step_that_is", async () => {
  // One hall, the hero alone in it: its one enemy waits unbuilt, far beyond `WAKE_METRES`.
  const size = 41, floor = new Uint8Array(size * size);
  for (let z = 19; z <= 21; z++) for (let x = 3; x <= 37; x++) floor[z * size + x] = 1;
  const hall = () => ({ seed: 1, size, floor: floor.slice(), doors: [], rooms: [{ id: 0, centre: { x: 20, z: 20 }, min: { x: 3, z: 19 }, max: { x: 37, z: 21 } }],
    start: { x: 6, z: 20 }, exit: { x: 37, z: 20 }, spawns: [{ x: 33, z: 20 }] });
  // The party looks about it every 0.2 s, 24 steps: felled a step later each time, the hero is first
  // found down in every step of that round, the one the party looks in among them.
  const ended = [];
  for (let late = 0; late < 24; late++) {
    const { run, dispose } = await crypt(42, hall());
    try {
      run.step(60 + late);
      const trunk = run.hero.fighter.built.segments.get("upperTrunk");
      // 200 N s at the upper trunk, from the side: it does not keep its feet.
      trunk.body.applyImpulse(new Vector3(0, 0, 200), centreOfToRef(trunk, new Vector3()));
      seconds(run, 3);
      ended.push([late, run.status, run.visible.size > 0]);
    } finally { dispose(); }
  }
  assert.deepEqual(ended, Array.from({ length: 24 }, (_, late) => [late, "dead", true]), "lost each time, and what the party last saw stands");
});
