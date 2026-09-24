import test from "node:test";
import assert from "node:assert/strict";
import { createHeadlessArena } from "./harness/golem-headless-arena.mjs";
import { DungeonRun } from "../src/dungeon/run.ts";
import { buildDungeonWorld } from "../src/dungeon/world.ts";
import { walkable } from "../src/dungeon/map.ts";
import { deriveLocomotionFootprint } from "../src/supported-locomotion-runtime.ts";
import { distance, findPath, generateDungeon } from "../src/dungeon/map.ts";
import { CONFIG } from "../src/config.ts";
import { Combat } from "../src/combat.ts";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { PhysicsEventType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";

test("real dungeon bodies have unique IDs, traverse a doorway and survive teardown/restart", async () => {
  const arena = await createHeadlessArena({ populateDefaultGeometry: false });
  let run;
  try {
    run = new DungeonRun(arena.scene, 42, "default", true);
    assert.equal(run.actors.length, 9);
    run.present();
    assert.ok(run.hero.meshes.some(({ mesh }) => mesh.isVisible));
    for (const actor of run.actors.slice(1)) assert.ok(actor.meshes.every(({ mesh }) => !mesh.isVisible), "fog hides physical meshes as well as cosmetic shells");
    for (const actor of run.actors) for (const other of run.actors) if (actor !== other) {
      const ids = new Set(actor.body.limbs.map(l => l.key));
      assert.ok(other.body.limbs.every(l => !ids.has(l.key)), "actors cannot share part IDs");
    }
    const target = run.map.rooms.find(r => distance(r.centre, run.map.start) === 16).centre;
    run.commands.order = { kind: "force", points: [target], drawing: false }; run.commands.revision++;
    const observer = arena.scene.onBeforePhysicsObservable.add(() => run.step(1 / CONFIG.world.physicsHz));
    const started = performance.now();
    for (let i = 0; i < 60 * 12; i++) {
      arena.scene._renderId++;
      try { arena.scene._advancePhysicsEngineStep(1000 / 60); }
      catch (error) { console.log(run.actors.map(a => ({ id: a.id, at: a.body.feetPosition().asArray(), facing: a.body.view.self.facing,
        command: [a.intent.forward, a.intent.strafe, a.intent.turn], target: a.target?.id }))); throw error; }
      if (distance(run.hero.body.feetPosition(), run.map.start) > 10) break;
    }
    console.log("dungeon physical traversal", { simulated: run.clock, wallMs: performance.now() - started,
      at: run.hero.body.feetPosition().asArray(), hp: run.hero.body.vitality });
    assert.ok(distance(run.hero.body.feetPosition(), run.map.start) > 8, "force movement must leave the starting room");
    assert.ok(run.map.doors.some(d => d.open));
    assert.ok(run.hero.body.alive);
    assert.ok(run.actors.every(a => Number.isFinite(a.body.feetPosition().x)));
    assert.ok(findPath(run.map, run.hero.body.feetPosition(), run.map.exit, run.hero.radius).length);
    arena.scene.onBeforePhysicsObservable.remove(observer);
    run.dispose(); run = null;
    // Rebuild in a fresh scene, exactly like the page: shared scene palettes belong to the scene.
  } finally { run?.dispose(); arena.dispose(); }
  const second = await createHeadlessArena({ populateDefaultGeometry: false });
  try { const next = new DungeonRun(second.scene, 42, "default", false); assert.equal(next.hero.body.vitality, 1); next.dispose(); }
  finally { second.dispose(); }
});

test("several real enemies acquire and physically fight the hero, with faction-correct hit attribution", async () => {
  const arena = await createHeadlessArena({ populateDefaultGeometry: false });
  const map = generateDungeon(42);
  map.spawns[0] = { x: map.start.x - 2, z: map.start.z + 3 };
  map.spawns[1] = { x: map.start.x + 2, z: map.start.z + 3 };
  const run = new DungeonRun(arena.scene, 42, "default", false, map);
  try {
    run.commands.order = { kind: "lock", target: "enemy-0" }; run.commands.revision++;
    arena.scene.onBeforePhysicsObservable.add(() => run.step(1 / CONFIG.world.physicsHz));
    const attackers = new Set(), victims = new Set(); let damage = 0;
    const previous = new Map();
    for (let i = 0; i < 60 * 25 && run.status === "playing"; i++) {
      arena.scene._renderId++; arena.scene._advancePhysicsEngineStep(1000 / 60);
      for (const actor of run.actors) {
        if (actor !== run.hero && actor.target === run.hero) attackers.add(actor.id);
        const hit = actor.combat.lastHit;
        if (!hit || previous.get(actor.id) === hit) continue;
        previous.set(actor.id, hit);
        if (hit.damage > 0) { damage += hit.damage; victims.add(hit.key.split(".golem")[0]); }
        assert.ok(actor === run.hero ? hit.targetId.startsWith("enemy-") : hit.targetId === "hero", "no friendly-fire damage reports");
      }
    }
    console.log("dungeon group encounter", { attackers: [...attackers], victims: [...victims], damage, status: run.status, clock: run.clock });
    assert.ok(attackers.has("enemy-0") && attackers.has("enemy-1"));
    assert.ok(damage > 0, "real physical weapons must wound combatants");
    assert.ok(victims.size > 0);
  } finally { run.dispose(); arena.dispose(); }
});

test("a run ends at the exit without clearing enemies, and death freezes authority", async () => {
  const arena = await createHeadlessArena({ populateDefaultGeometry: false });
  const map = generateDungeon(7); map.exit = { ...map.start };
  const run = new DungeonRun(arena.scene, 7, "default", false, map);
  try {
    run.step(1 / CONFIG.world.physicsHz); assert.equal(run.status, "won");
    assert.equal(run.actors.filter(a => a !== run.hero && a.body.alive).length, 8);
    const clock = run.clock; run.step(1); assert.equal(run.clock, clock);
    run.status = "playing"; map.exit = { x: 25, z: 25 };
    for (const limb of run.hero.body.limbs) limb.health = 0;
    run.step(1 / CONFIG.world.physicsHz); assert.equal(run.status, "dead");
    const stopped = run.clock; run.step(1); assert.equal(run.clock, stopped);
  } finally { run.dispose(); arena.dispose(); }
});

test("mouse-facing-only exploration reaches the exit using revealed frontiers", async () => {
  // 42 is the seed this test has always run. Seed 1 stalls against a corridor wall without the slide
  // in `resolveGroupMoves`, seed 2 on a room corner without the `STALL` replan in `follow`, and seed 0
  // when `findPath` leaves only from the body's own point rather than also from its cell's middle.
  // The cursor (9, 60) was chosen for 42; the others were measured with that same cursor.
  for (const seed of [42, 1, 2, 0]) {
    const arena = await createHeadlessArena({ populateDefaultGeometry: false });
    const map = generateDungeon(seed); map.spawns = [];
    const run = new DungeonRun(arena.scene, seed, "default", false, map);
    try {
      run.commands.setMode({ keyboard: false, facing: true });
      run.commands.cursor = { x: 9, z: 60 };
      arena.scene.onBeforePhysicsObservable.add(() => run.step(1 / CONFIG.world.physicsHz));
      for (let i = 0; i < 60 * 120 && run.status === "playing"; i++) {
        arena.scene._renderId++; arena.scene._advancePhysicsEngineStep(1000 / 60);
      }
      assert.equal(run.status, "won", JSON.stringify({ seed, at: run.hero.body.feetPosition().asArray(), goal: run.hero.goal,
        route: run.hero.route, exit: map.exit, doors: map.doors.map(d => d.open), explored: run.explored.size }));
    } finally { run.dispose(); arena.dispose(); }
  }
});

test("contact resolution wounds an unselected actor and attributes its parry", async () => {
  const arena = await createHeadlessArena({ populateDefaultGeometry: false });
  const run = new DungeonRun(arena.scene, 42, "default", false);
  let combat;
  try {
    const selected = run.actors[1], struck = run.actors[2]; run.hero.target = selected;
    const source = run.hero.body.strikers[0];
    // Real body, target anatomy, mass and damage path; a stated synthetic arrival isolates routing.
    const weapon = { kind: "club", effectorId: "routing-probe", hand: "primary", impactMassKg: 4,
      body: source.body, spent: false, velocityAt: () => new Vector3(0, 0, 12),
      edgeDirection: () => new Vector3(0, 0, 1), bladeDirection: () => new Vector3(0, 1, 0),
      tipPosition: () => new Vector3(0, 0, 0) };
    combat = new Combat("left", [weapon]); combat.advance(1);
    const limb = struck.body.limbs.find(l => !l.guarding && !l.fatal);
    const before = limb.health, untouched = selected.body.vitality;
    const event = { collider: source.body, collidedAgainst: limb.part.body, type: PhysicsEventType.COLLISION_STARTED,
      point: limb.part.mesh.position.clone(), normal: new Vector3(0, 0, 1), distance: 0, impulse: 0 };
    combat.attach(selected.body);
    source.body.getCollisionObservable().notifyObservers(event);
    assert.equal(limb.health, before, "the unchanged duel attachment cannot score against another body");
    combat.attachResolver(body => [selected, struck].find(a => a.body.limbs.some(l => l.part.body === body))?.body ?? null);
    source.body.getCollisionObservable().notifyObservers(event);
    assert.ok(limb.health < before); assert.equal(selected.body.vitality, untouched);
    assert.equal(combat.lastHit.targetId, struck.id); assert.equal(combat.lastHit.key, limb.key);
    const shield = run.actors.find(a => a !== run.hero && a.body.limbs.some(l => a.body.parriedBy(l.part.body)));
    assert.ok(shield, "fixture must contain a real shield");
    const guard = shield.body.limbs.find(l => shield.body.parriedBy(l.part.body));
    combat.attachResolver(() => shield.body); combat.advance(1);
    source.body.getCollisionObservable().notifyObservers({ ...event, collidedAgainst: guard.part.body, point: guard.part.mesh.position.clone() });
    assert.ok(combat.lastHit.key.startsWith("block:")); assert.equal(combat.lastHit.targetId, shield.id);
  } finally { combat?.dispose(); run.dispose(); arena.dispose(); }
});

test("force movement goes around an occupied floor point instead of stopping to duel", async () => {
  const arena = await createHeadlessArena({ populateDefaultGeometry: false });
  const map = generateDungeon(42); map.spawns = [{ x: 12, z: 9 }];
  const run = new DungeonRun(arena.scene, 42, "default", false, map);
  try {
    run.actors[1].body.stopFighting(); // A real, stationary opponent blocking the direct route.
    run.actors[1].combat.stop();
    run.commands.order = { kind: "force", points: [{ x: 17, z: 9 }], drawing: false }; run.commands.revision++;
    arena.scene.onBeforePhysicsObservable.add(() => run.step(1 / CONFIG.world.physicsHz));
    for (let i = 0; i < 60 * 9; i++) {
      arena.scene._renderId++; arena.scene._advancePhysicsEngineStep(1000 / 60);
      if (run.hero.body.feetPosition().x > 16) break;
    }
    assert.ok(run.hero.body.feetPosition().x > 16, `blocked at ${run.hero.body.feetPosition().asArray()}`);
  } finally { run.dispose(); arena.dispose(); }
});

test("a_footprint_that_starts_inside_the_dungeon_solid_may_leave_it_and_nothing_else", async () => {
  // Physical contact session 02: a body fallen against a dungeon wall rises off it. The solid's sweep
  // used to refuse any path that began inside it; now a path is clear once it is clear and must end
  // clear, and a path from open floor is judged exactly as before.
  const arena = await createHeadlessArena({ populateDefaultGeometry: false });
  try {
    const map = generateDungeon(42);
    const { registry } = buildDungeonWorld(arena.scene, map, false);
    const foot = deriveLocomotionFootprint({ radiusM: 0.4, heightM: 1.8, provenance: { profileId: "dungeon-wall",
      source: "golem-bind-geometry", measuredAt: "physical contact session 02 fixture" } });
    const open = { x: map.start.x, y: 0.5, z: map.start.z };
    assert.ok(walkable(map, open, foot.radiusM, true), "the fixture's start is not open floor");
    // Walk east from the start until the footprint first stops being walkable, and go two of the
    // sweep's 0.15 m samples further in: the sweep never sampled its start, so a footprint less than
    // one sample deep could already leave, and only a deeper one tells the two rules apart.
    let inside = null;
    for (let x = open.x; x < map.size; x += 0.05) {
      if (!walkable(map, { x, z: open.z }, foot.radiusM, true)) { inside = { x: x + 0.3, y: 0.5, z: open.z }; break; }
    }
    assert.ok(inside && !walkable(map, inside, foot.radiusM, true), "found no wall band east of the start");
    const none = new Set();
    assert.equal(registry.allowedFraction(inside, open, foot, none), 1, "the footprint could not leave the solid");
    assert.equal(registry.allowedFraction(inside, inside, foot, none), 0, "a point inside the solid read clear");
    assert.ok(registry.allowedFraction(open, inside, foot, none) < 1, "open floor walked into the solid");
  } finally { arena.dispose(); }
});
