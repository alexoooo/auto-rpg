// The Crypt on the core (`src/dungeon/run.ts`): a seeded crypt loads, its bodies stand in it, and a
// fight starts and ends; its doors are fixed boxes in the core world until they open (Node, core
// world, Rapier, 120 Hz).
import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { Quaternion } from "@babylonjs/core/Maths/math.vector.js";
import { DungeonRun, WAKE_METRES } from "../src/dungeon/run.ts";
import { generateLevel } from "../src/dungeon/level.ts";
import { clearSegment, distance, walkable } from "../src/dungeon/map.ts";
import { freshEngine } from "./harness/core-stand.mjs";

async function crypt(seed, layout) {
  const scene = new Scene(new NullEngine());
  const run = new DungeonRun(scene, { seed, engine: await freshEngine(), visuals: false, layout });
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
      const { body, skills } = actor.fighter;
      assert.equal(skills.report.fallen, false, `${actor.id} is on its feet`);
      assert.ok(body.view.head.y > 1, `${actor.id}'s head is up: ${body.view.head.y}`);
      assert.ok(distance(actor.feet(), actor.home) < 1, `and it stood where it was built: ${distance(actor.feet(), actor.home)}`);
    }
  } finally { dispose(); }
});

test("a_fight_in_the_crypt_starts_and_ends", async () => {
  const { run, dispose } = await crypt(1, faceToFace(1, 4));
  try {
    const enemy = run.enemies[0];
    assert.ok(enemy.fighter, "the first enemy is built: the party stands 4 m from it");
    for (let i = 0; i < 30 * run.world.hz && enemy.alive; i++) run.step();
    const wounds = (from, to) => run.blows.filter(b => !b.clash && b.attacker === from.id && b.target === to.id)
      .reduce((sum, b) => sum + b.damage, 0);
    assert.ok(wounds(run.hero, enemy) > 0 && wounds(enemy, run.hero) > 0, "blows land both ways, and wound");
    // A fallen body is out of the fight until the core can rise (`DungeonRun`), and an emptied pool ends
    // one too (`dungeon-party`).
    assert.equal(enemy.alive, false, `and the fight ends inside 30 s: ${run.clock.toFixed(1)} s`);
    assert.ok(run.hero.alive, "with the hero standing");
    assert.equal(run.status, "playing", "the rest of the crypt is still to come");
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
