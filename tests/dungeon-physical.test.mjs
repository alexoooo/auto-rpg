import test from "node:test";
import assert from "node:assert/strict";
import { createHeadlessArena } from "./harness/golem-headless-arena.mjs";
import { DungeonRun } from "../src/dungeon/run.ts";
import { buildDungeonWorld } from "../src/dungeon/world.ts";
import { walkable } from "../src/dungeon/map.ts";
import { deriveLocomotionFootprint } from "../src/supported-locomotion-runtime.ts";
import { distance, findPath } from "../src/dungeon/map.ts";
import { generateLevel } from "../src/dungeon/level.ts";
import { classicDungeon } from "./fixtures/classic-dungeon.mjs";
import { CONFIG } from "../src/config.ts";
import { Combat, arrivalReadFraction } from "../src/combat.ts";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { PhysicsEventType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";

test("real dungeon bodies have unique IDs, traverse a doorway and survive teardown/restart", async () => {
  const arena = await createHeadlessArena({ populateDefaultGeometry: false });
  let run;
  try {
    run = new DungeonRun(arena.scene, 42, "default", true, classicDungeon(42));
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
  try { const next = new DungeonRun(second.scene, 42, "default", false, classicDungeon(42)); assert.equal(next.hero.body.vitality, 1); next.dispose(); }
  finally { second.dispose(); }
});

test("several real enemies acquire and physically fight the hero, with faction-correct hit attribution", async () => {
  const arena = await createHeadlessArena({ populateDefaultGeometry: false });
  const map = classicDungeon(42);
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
  const map = classicDungeon(7); map.exit = { ...map.start };
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
    const map = classicDungeon(seed); map.spawns = [];
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

test("the_hero_explores_generated_levels_to_their_exits", async () => {
  // The default biped on two levels, and the widest hero on one. Node headless harness: the biped
  // wins seed 1 at 37.3 simulated seconds, and seed 7 at 63.1 -- a level where it once stood on the
  // clearance arc of a rock corner for good, handed the same blocked leg by every replan (see the
  // stall branch of `DungeonRun.follow`). Seeds 1-20 win at 30.6 to 86.2. The multileg wins seed 1
  // at 147.6, touring most of the level at about 1 m/s with the exit in the far corner, hence its
  // cap (seeds 2-5: 49.5 to 155.8). Two biped seeds and not three: this file runs beside
  // `the_planner_drives_a_real_bout...` in `tests/golem-mind.test.mjs`, whose wall-clock budget
  // reads the suite's load, and a third tipped it over.
  for (const [seed, build, cap] of [[1, "default", 120], [7, "default", 120], [1, "multileg", 240]]) {
    const arena = await createHeadlessArena({ populateDefaultGeometry: false });
    const map = generateLevel(seed).map; map.spawns = [];
    const run = new DungeonRun(arena.scene, seed, build, false, map);
    try {
      run.commands.setMode({ keyboard: false, facing: true });
      run.commands.cursor = { x: map.exit.x, z: map.exit.z + 30 };
      arena.scene.onBeforePhysicsObservable.add(() => run.step(1 / CONFIG.world.physicsHz));
      for (let i = 0; i < 60 * cap && run.status === "playing"; i++) {
        arena.scene._renderId++; arena.scene._advancePhysicsEngineStep(1000 / 60);
      }
      assert.equal(run.status, "won", JSON.stringify({ seed, build, at: run.hero.body.feetPosition().asArray(),
        exit: map.exit, explored: run.explored.size, doors: map.doors.map((d) => d.open) }));
    } finally { run.dispose(); arena.dispose(); }
  }
});

test("a_run_with_no_layout_plays_the_generated_level_for_its_seed", async () => {
  for (const seed of [5, 9]) {
    const arena = await createHeadlessArena({ populateDefaultGeometry: false });
    const run = new DungeonRun(arena.scene, seed, "default", false);
    try { assert.deepEqual(run.map, generateLevel(seed).map); }
    finally { run.dispose(); arena.dispose(); }
  }
});

test("contact resolution wounds an unselected actor and attributes its parry", async () => {
  const arena = await createHeadlessArena({ populateDefaultGeometry: false });
  const run = new DungeonRun(arena.scene, 42, "default", false, classicDungeon(42));
  let combat;
  try {
    const selected = run.actors[1], struck = run.actors[2]; run.hero.target = selected;
    const source = run.hero.body.strikers[0];
    // Real body, target anatomy, mass and damage path; a stated synthetic arrival isolates routing.
    const weapon = { kind: "club", effectorId: "routing-probe", hand: "primary",
      body: source.body, spent: false, velocityAt: () => new Vector3(0, 0, 12),
      edgeDirection: () => new Vector3(0, 0, 1), bladeDirection: () => new Vector3(0, 1, 0),
      tipPosition: () => new Vector3(0, 0, 0) };
    combat = new Combat("left", [weapon]); combat.advance(1);
    // The same 12 m/s under an `"arrival"` reading, which reads the body as the step began rather
    // than `velocityAt`, and bills `arrivalReadFraction` of it: the body is moved at 12 over that
    // fraction and sampled the way a solver step samples it. The hero's own `Combat` watches the
    // same body and samples it too, so it is stopped: only the probe may score.
    run.hero.combat.stop();
    const share = CONFIG.combat.contactReading === "arrival" ? arrivalReadFraction(weapon.kind) : 1;
    source.body.setLinearVelocity(new Vector3(0, 0, 12 / share));
    source.body.setAngularVelocity(new Vector3(0, 0, 0));
    arena.scene.onBeforePhysicsObservable.notifyObservers(arena.scene);
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
  const map = classicDungeon(42); map.spawns = [{ x: 12, z: 9 }];
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

test("an_enemy_nobody_is_near_sleeps_and_wakes_before_it_could_see_the_hero", async () => {
  // One enemy, at the centre of the room 22.6 m from the start: beyond `DORMANCY.sleepMetres` (18),
  // so it sleeps once the first second is out. The hero then walks to it through the room at (25, 9).
  const arena = await createHeadlessArena({ populateDefaultGeometry: false });
  const map = classicDungeon(42); map.spawns = [{ x: 25, z: 25 }];
  const run = new DungeonRun(arena.scene, 42, "default", false, map);
  try {
    const enemy = run.actors[1], apart = () => distance(run.hero.body.feetPosition(), enemy.body.feetPosition());
    const frame = () => { arena.scene._renderId++; arena.scene._advancePhysicsEngineStep(1000 / 60); };
    arena.scene.onBeforePhysicsObservable.add(() => run.step(1 / CONFIG.world.physicsHz));
    const syncing = enemy.bodies.map(body => body.disableSync);
    for (let i = 0; i < 60 * 1.5; i++) frame();
    assert.ok(enemy.dormant, `an unalerted enemy ${apart().toFixed(1)} m away, at home, is awake`);
    assert.ok(enemy.bodies.every(body => body.disableSync), "a sleeper's transforms are still copied back every step");
    assert.ok(enemy.body.limbs.every(limb => enemy.bodies.includes(limb.part.body)), "the sleeping enemy's bodies were not all collected");
    // Every body of it, to the bit: a sleeping enemy that still drifted would be simulated after all. Read from
    // Havok, not from the meshes: a sleeper's meshes are no longer synced, so they would hold still regardless.
    const hk = arena.scene.getPhysicsEngine().getPhysicsPlugin()._hknp;
    const pose = () => enemy.bodies.map(body => hk.HP_Body_GetQTransform(body._pluginData.hpBodyId)[1].flat());
    const held = pose();
    for (let i = 0; i < 60; i++) frame();
    assert.deepEqual(pose(), held, "a sleeping enemy's bodies moved");
    assert.ok(enemy.body.view.clock < run.clock - 0.5, "a sleeping enemy is still observed and driven every step");
    run.commands.order = { kind: "force", points: [{ x: 25, z: 9 }, { x: 25, z: 25 }], drawing: false }; run.commands.revision++;
    // Read after every substep rather than every frame: a body that woke and slept again inside one
    // frame is invisible to a frame-rate reading.
    let wokeAt = null, wakes = 0, sleptInSight = null, was = enemy.dormant;
    arena.scene.onAfterPhysicsObservable.add(() => {
      if (was && !enemy.dormant) { wakes++; wokeAt ??= apart(); }
      if (enemy.dormant && apart() <= 14) sleptInSight ??= apart();
      was = enemy.dormant;
    });
    for (let i = 0; i < 60 * 30 && !enemy.target; i++) frame();
    assert.equal(sleptInSight, null, `the enemy slept ${sleptInSight?.toFixed(1)} m from the hero, within its sight`);
    assert.ok(wokeAt !== null && wokeAt > 14, `the enemy woke at ${wokeAt?.toFixed(1)} m`);
    assert.equal(wakes, 1, "the enemy went back to sleep as the hero came on");
    assert.deepEqual(enemy.bodies.map(body => body.disableSync), syncing, "waking did not restore each body's sync");
    assert.equal(enemy.target, run.hero, "the woken enemy never saw the hero");
    // Woken, it is a working body: it leaves home for the hero.
    for (let i = 0; i < 60 * 6 && distance(enemy.body.feetPosition(), enemy.home) < 1; i++) frame();
    assert.ok(distance(enemy.body.feetPosition(), enemy.home) >= 1, "the woken enemy never left home");
    assert.ok(enemy.body.alive && Number.isFinite(enemy.body.feetPosition().x));
    assert.equal(enemy.combat.now, run.hero.combat.now, "the enemy's combat clock lost the time it slept");
  } finally { run.dispose(); arena.dispose(); }
});

test("a_sleeper_wakes_for_a_neighbour_walking_up_and_the_pair_sleeps_once_both_are_home", async () => {
  // Two enemies far from the hero: one at home in the room at (25, 25), 22.6 m from the start, and
  // one sent from the room at (41, 25) to a home 3 m from the first, so that it walks up to a sleeper.
  const arena = await createHeadlessArena({ populateDefaultGeometry: false });
  const map = classicDungeon(42); map.spawns = [{ x: 25, z: 25 }, { x: 41, z: 25 }];
  const run = new DungeonRun(arena.scene, 42, "default", false, map);
  try {
    const [, sleeper, walker] = run.actors, home = { x: 28, z: 25 };
    assert.ok(walkable(map, home, walker.radius), "the walker's new home is not open floor");
    walker.home = home;
    let wakes = 0, wokeBeside = null, was = sleeper.dormant;
    arena.scene.onBeforePhysicsObservable.add(() => run.step(1 / CONFIG.world.physicsHz));
    arena.scene.onAfterPhysicsObservable.add(() => {
      if (was && !sleeper.dormant) { wakes++; wokeBeside ??= distance(sleeper.body.feetPosition(), walker.body.feetPosition()); }
      was = sleeper.dormant;
    });
    const frame = () => { arena.scene._renderId++; arena.scene._advancePhysicsEngineStep(1000 / 60); };
    for (let i = 0; i < 60 * 1.5; i++) frame();
    assert.ok(sleeper.dormant && !walker.dormant, "the sleeper is awake, or the walker asleep before it set out");
    for (let i = 0; i < 60 * 40 && !(walker.dormant && sleeper.dormant && wakes); i++) frame();
    assert.equal(wakes, 1, "the sleeper did not wake exactly once for the body walking up to it");
    assert.ok(wokeBeside < 4, `the sleeper woke with the walker ${wokeBeside?.toFixed(1)} m away`);
    assert.ok(walker.dormant && sleeper.dormant, "two neighbours resting at home kept each other awake");
    assert.equal(sleeper.combat.now, run.hero.combat.now);
    assert.equal(walker.combat.now, run.hero.combat.now);
  } finally { run.dispose(); arena.dispose(); }
});

test("a_footprint_that_starts_inside_the_dungeon_solid_may_leave_it_and_nothing_else", async () => {
  // Physical contact session 02: a body fallen against a dungeon wall rises off it. The solid's sweep
  // used to refuse any path that began inside it; now a path is clear once it is clear and must end
  // clear, and a path from open floor is judged exactly as before.
  const arena = await createHeadlessArena({ populateDefaultGeometry: false });
  try {
    const map = classicDungeon(42);
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
