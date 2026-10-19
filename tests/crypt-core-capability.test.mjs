// How the Crypt's bodies fight and move, measured and not a gate (`tests/experimental.json`): a
// fight that ends inside 30 s with blows landed both ways, a walker that brings a waiting enemy
// up and lets it be held, and a party that walks off and back on its feet (Node, core world,
// Rapier, 120 Hz).
import test from "node:test";
import assert from "node:assert/strict";
import { woundsBy } from "./fixtures/blows.mjs";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { DungeonRun, LEVELS, WAKE_METRES } from "../src/dungeon/run.ts";
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

/**
 * The generated level with stated edits, for the rule that holds an enemy that waits (`LEVELS`): its first spawn kept,
 * and a second put on floor `between` m from it, or none; the start moved to floor 15.5 m from the first, inside
 * `WAKE_METRES` and beyond an enemy's sight, and inside `WAKE_METRES` of the second, or beyond `LEVELS.rest` of it,
 * as `both` says. `far` is the floor nearest the start by a path that is farther than `LEVELS.rest` from every spawn.
 */
function restFixture(seed, between = null, both = true) {
  const map = generateLevel(seed).map, spawn = map.spawns[0], floor = [];
  for (let x = 0; x < map.size; x++) for (let z = 0; z < map.size; z++) if (walkable(map, { x, z }, 0.7, true)) floor.push({ x, z });
  const starts = (spawns) => floor.filter(p => Math.abs(distance(p, spawns[0]) - 15.5) < 0.3 &&
    (spawns.length < 2 || (both ? distance(p, spawns[1]) < WAKE_METRES - 0.3 : distance(p, spawns[1]) > LEVELS.rest + 0.5)));
  const seconds = between === null ? [null] : floor.filter(p => Math.abs(distance(p, spawn) - between) < 0.3);
  let best = null;
  for (const second of seconds) {
    const spawns = second ? [spawn, second] : [spawn];
    const fars = floor.filter(p => spawns.every(s => distance(s, p) > LEVELS.rest + 0.7));
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

test("a_fight_in_the_crypt_starts_and_ends", async () => {
  const { run, dispose } = await crypt(2, faceToFace(2, 4));
  try {
    const enemy = run.enemies[0];
    assert.ok(enemy.fighter, "the first enemy is built: the party stands 4 m from it");
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

test("a_body_walking_up_to_where_an_enemy_waits_has_it_built_and_a_held_one_let_go", async () => {
  const { map } = restFixture(1, 8, false);
  const { run, dispose } = await crypt(1, map, { enemy: () => "workshop-fighter" });
  try {
    const [walker, waiting] = run.enemies, gap = () => distance(walker.feet(), waiting.feet()), toHome = () => distance(walker.feet(), waiting.home);
    seconds(run, 1);
    assert.deepEqual([walker.fighter !== null, waiting.fighter !== null], [true, false], "the party is near the first alone");
    assert.ok(distance(run.hero.feet(), waiting.home) > LEVELS.rest && gap() > LEVELS.clear, "and far from the second, as the first is");
    // The run's state, set by hand: an enemy that saw the party at `to` walks there while it is alerted, and home after.
    const send = (to) => { walker.lastSeen = to ? { ...to } : null; walker.alertedUntil = to ? run.clock + 60 : 0; };
    send(waiting.home);
    assert.ok(until(run, () => waiting.fighter !== null, 30), `the one waiting is built as the walker nears: ${toHome().toFixed(2)} m`);
    assert.ok(toHome() < LEVELS.company && toHome() > LEVELS.company - 0.3, `at ${LEVELS.company} m of where it waits, and no sooner: ${toHome()}`);
    assert.equal(waiting.held, false, "and is not held with the walker beside it");
    send(null);
    assert.ok(until(run, () => waiting.held, 30), `it is held once the walker has gone home: ${gap().toFixed(2)} m`);
    assert.ok(gap() > LEVELS.clear && gap() < LEVELS.clear + 0.3, `at ${LEVELS.clear} m and no sooner: ${gap()}`);
    send(waiting.home);
    assert.ok(until(run, () => !waiting.held, 30), `and let go as the walker nears again: ${gap().toFixed(2)} m`);
    assert.ok(gap() < LEVELS.company && gap() > LEVELS.company - 0.3, `at ${LEVELS.company} m: ${gap()}`);
    assert.equal(walker.held, false, "the walker was never held: the party stayed near it");
  } finally { dispose(); }
});

/**
 * The floor nearest `from` by a path that is between `least` and `most` m from `at`, by a path that
 * keeps `wide` m from `at`, or as far as `from` is if nearer: a walker crossing a body that lies there may trip on it.
 */
function floorBetween(map, at, from, least, most, wide) {
  wide = Math.min(wide, distance(from, at) - 0.01);
  const clear = (a, b) => { for (let i = 0; i <= 20; i++) if (distance({ x: a.x + (b.x - a.x) * i / 20, z: a.z + (b.z - a.z) * i / 20 }, at) < wide) return false; return true; };
  let best = null;
  for (let x = 0; x < map.size; x++) for (let z = 0; z < map.size; z++) {
    const p = { x, z }, d = distance(p, at);
    if (d <= least || d >= most || !walkable(map, p, 0.7, true) || (best && distance(p, from) >= best.length)) continue;
    const route = findPath(map, from, p, 0.35);
    if (!route.length || !route.every((q, i) => clear(i ? route[i - 1] : from, q))) continue;
    if (!best || route.length < best.length) best = { p, length: route.length };
  }
  if (!best) throw new Error("no floor");
  return best.p;
}

test("nobody_in_the_fight_is_held_with_the_party_near", async () => {
  // The rule reads before physics, so the near line leaves a margin for one step's walk.
  const NEAR = WAKE_METRES - .05, found = [];
  for (const seed of [1, 2, 4, 5]) {
    const { map, far } = restFixture(seed);
    const { run, dispose } = await crypt(seed, map, { companions: ["workshop-fighter", "workshop-fighter", "workshop-fighter"] });
    try {
      const enemy = run.enemies[0], wrong = [];
      let held = 0, near = 0;
      const check = run.world.beforeStep(() => {
        const party = run.party.filter(member => member.alive).map(member => member.feet());
        for (const enemy of run.enemies) {
          if (!enemy.alive) continue;
          if (enemy.held) held++;
          const nearest = Math.min(...party.map(p => distance(p, enemy.feet())));
          if (nearest < NEAR) {
            near++;
            if (!enemy.fighter || enemy.held) wrong.push([run.world.steps, enemy.id, nearest]);
          }
        }
      });
      try {
        seconds(run, 1);
        assert.ok(near > 0, "the initial party is physically inside the near line");
        assert.deepEqual(wrong, [], "nearby living enemies are built and awake");
        const away = floorBetween(map, enemy.home, far, LEVELS.rest + 3.5, LEVELS.rest + 5, 1.2);
        assert.ok(walkUntil(run, away, () => enemy.alive && enemy.held, 60), JSON.stringify({ seed, phase: "rest", feet: run.party.map(p => p.feet()) }));
        const beforeReturn = near;
        assert.ok(walkUntil(run, map.start, () => !enemy.held, 60), JSON.stringify({ seed, phase: "wake" }));
        seconds(run, 5);
        assert.ok(near > beforeReturn, "the returning party physically crosses the near line");
        found.push({ seed, wrong: wrong.slice(0, 3), held, near });
      } finally { check.dispose(); }
    } finally { dispose(); }
  }
  assert.deepEqual(found.map(({ seed, wrong }) => ({ seed, wrong })), [1, 2, 4, 5].map(seed => ({ seed, wrong: [] })));
  assert.ok(found.every(({ held, near }) => held > 0 && near > 0), "each fixture exercises held and nearby living bodies");
});
