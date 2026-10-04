// What a crypt run sounds of (`hearRun`, `src/dungeon/hearing.ts`): the touches and the air of
// every body it has built, while the party sees the cell the body stands in and at no other time,
// a touch on a wall and a body built on the way among them; and a run that is heard is the same
// run (Node, core world, Rapier, 120 Hz).
import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Scene } from "@babylonjs/core/scene.js";
import { airOf, hearTouches } from "../src/audio/body-sounds.ts";
import { centreOfToRef } from "../src/core/control/support.ts";
import { hearRun } from "../src/dungeon/hearing.ts";
import { cellKey, distance } from "../src/dungeon/map.ts";
import { DungeonRun, WAKE_METRES } from "../src/dungeon/run.ts";
import { freshEngine } from "./harness/core-stand.mjs";

/** Where the hero starts along the hall: off a cell's centre, so that no cell is at the very edge of its sight. */
const START = 6.4;
/**
 * One hall, 35 m by 3 m, with no door: the hero near one end, and an enemy `metres` along it, in
 * a clear line. An enemy sees 14 m and the party 12 m, so one between the two walks at the hero
 * while the party does not see the cell it stands in.
 */
function hall(metres) {
  const size = 41, floor = new Uint8Array(size * size);
  for (let z = 19; z <= 21; z++) for (let x = 3; x <= 37; x++) floor[z * size + x] = 1;
  return { seed: 1, size, floor, doors: [], rooms: [{ id: 0, centre: { x: 20, z: 20 }, min: { x: 3, z: 19 }, max: { x: 37, z: 21 } }],
    start: { x: START, z: 20 }, exit: { x: 37, z: 20 }, spawns: [{ x: START + metres, z: 20 }] };
}

async function crypt(map) {
  const scene = new Scene(new NullEngine());
  const run = new DungeonRun(scene, { seed: 42, engine: await freshEngine(), visuals: false, layout: map });
  return { run, dispose: () => { run.dispose(); scene.dispose(); } };
}
const seconds = (run, s) => { for (let i = 0; i < s * run.world.hz; i++) run.step(); };
/** Where every segment of every built body is, to the bit. */
const poses = (run) => run.actors.flatMap((actor) => actor.fighter
  ? [...actor.fighter.built.segments.values()].map(({ node }) => [...node.position.asArray(), ...node.rotationQuaternion.asArray()]) : []);
const sees = (run) => (point) => run.visible.has(cellKey(run.map, point));
/**
 * Every touch of `actors`, whoever sees it, as `hearTouches` gives it: its cue at the run's time,
 * whether the party saw the cell its body stood in as it fell, and the touch.
 */
function everyTouch(run, actors, into) {
  const seen = sees(run);
  return hearTouches(run.world, actors.map((actor) => ({ id: actor.id, built: actor.fighter.built, actor })),
    (cue, touch) => into.push({ cue: { time: run.clock, ...cue }, seen: seen(touch.of.body.actor.feet()), touch }));
}

test("a_run_is_heard_while_the_party_sees_where_a_body_stands_and_at_no_other_time_and_is_the_same_run", async () => {
  // The enemy starts 1.5 m beyond the party's sight, and 1.4 m short of the cell it is seen in.
  const heard = await crypt(hall(13.5)), deaf = await crypt(hall(13.5));
  try {
    const { run } = heard, [hero, enemy] = run.actors;
    assert.deepEqual([hero.id, enemy.id, enemy.fighter !== null], ["hero", "enemy-0", true], "the enemy is built from the start");
    const seen = sees(run), cues = [], all = [];
    const hearing = hearRun(run, (cue) => cues.push({ time: run.clock, ...cue }));
    const every = everyTouch(run, [hero, enemy], all);
    const airs = () => { const given = []; hearing.airs((id, speed, at) => given.push({ id, speed, at: { x: at.x, z: at.z } })); return given; };
    const air = airOf(enemy.fighter.built), at = new Vector3();

    seconds(run, 2);
    assert.ok(!seen(enemy.feet()), "the enemy walks where the party does not see");
    assert.deepEqual(airs().map(({ id }) => id), ["hero"], "and its air is not given");
    seconds(run, 8);
    assert.ok(seen(enemy.feet()), "then it has come into sight");
    const [, its] = airs();
    assert.deepEqual(its, { id: "enemy-0", speed: air(at), at: { x: at.x, z: at.z } }, "and its air is its fastest point's");

    const unseen = all.filter((one) => !one.seen), inSight = all.filter((one) => one.seen);
    assert.ok(unseen.length >= 8 && inSight.length >= 8, `${unseen.length} touches out of sight and ${inSight.length} in it`);
    assert.deepEqual(new Set(all.map(({ cue }) => `${cue.key} ${cue.kind}`)), new Set(["enemy-0:ground bone"]), "all of them the skeleton's footfalls");
    assert.deepEqual(cues, inSight.map(({ cue }) => cue), "what is heard is what a body in sight sounded of");

    // Heard twice over, the run is the run nobody hears.
    seconds(deaf.run, 10);
    assert.deepEqual(poses(run), poses(deaf.run));
    hearing.dispose(); every.dispose();
    const before = cues.length;
    seconds(run, 2);
    assert.equal(cues.length, before, "disposed, it hears nothing more");
  } finally { heard.dispose(); deaf.dispose(); }
});

test("a_body_thrown_at_a_wall_in_sight_is_heard_on_the_wall", async () => {
  const { run, dispose } = await crypt(hall(6));
  try {
    const [hero, enemy] = run.actors, seen = sees(run), cues = [], all = [];
    const hearing = hearRun(run, (cue) => cues.push({ time: run.clock, ...cue }));
    const every = everyTouch(run, [hero, enemy], all);
    seconds(run, 1.2);
    // 60 N s at the skeleton's upper trunk, at a side wall 1.5 m off.
    const trunk = enemy.fighter.built.segments.get("upperTrunk");
    trunk.body.applyImpulse(new Vector3(0, 0, 60), centreOfToRef(trunk, new Vector3()));
    seconds(run, 3);
    // A side wall's face is square to z, and a touch's normal runs from the body into it.
    const walls = all.filter(({ touch }) => touch.on === null && touch.normal[2] > 0.9);
    assert.ok(walls.length >= 3, `${walls.length} touches on the wall`);
    assert.ok(walls.every(({ touch }) => touch.of.body.actor === enemy), "all of them the thrown body's");
    assert.ok(walls.some(({ cue }) => !seen(cue.point)), "the point of a touch on a wall is in no cell the party sees");
    assert.ok(all.every((one) => one.seen), "and the body is in sight throughout");
    assert.deepEqual(cues, all.map(({ cue }) => cue), "so every touch is heard, the wall's among them");
    hearing.dispose(); every.dispose();
  } finally { dispose(); }
});

test("a_body_built_on_the_way_is_heard_from_then_on_once_and_the_run_is_the_same_run", async () => {
  // Past where an enemy is built: it waits unbuilt until the hero has walked nearer.
  const heard = await crypt(hall(WAKE_METRES + 0.3)), deaf = await crypt(hall(WAKE_METRES + 0.3));
  try {
    const { run } = heard, [hero, enemy] = run.actors, cues = [];
    assert.equal(enemy.fighter, null, "the enemy is not built yet");
    const hearing = hearRun(run, (cue) => cues.push({ time: run.clock, ...cue }));
    assert.deepEqual((() => { const ids = []; hearing.airs((id) => ids.push(id)); return ids; })(), ["hero"]);
    for (const { commands } of [run, deaf.run]) { commands.order = { kind: "attack-move", destination: { x: 11, z: 20 } }; commands.revision++; }
    // It is built at 2.6 s, sees the hero at 14 m and walks at it: in sight, and heard, by 10.1 s.
    seconds(run, 12);
    assert.ok(enemy.fighter !== null && distance(hero.feet(), enemy.feet()) < 12, `the enemy is built, and ${distance(hero.feet(), enemy.feet())} m off`);
    const by = (key) => cues.filter((cue) => cue.key === key);
    assert.ok(by("hero:ground").length >= 20, `${by("hero:ground").length} of the hero's footfalls`);
    assert.ok(by("enemy-0:ground").length >= 3, `${by("enemy-0:ground").length} of the enemy's`);
    assert.ok(by("enemy-0:ground").every((cue) => cue.kind === "bone"));
    // A listener left behind when the next is made would give each of its touches a second time.
    assert.equal(new Set(cues.map((cue) => JSON.stringify(cue))).size, cues.length, "no touch is heard twice");
    const ids = []; hearing.airs((id) => ids.push(id));
    assert.deepEqual(ids, ["hero", "enemy-0"], "and its air is given with the hero's");

    seconds(deaf.run, 12);
    assert.deepEqual(poses(run), poses(deaf.run), "heard through a listener made again, the run is the run nobody hears");
    hearing.dispose();
  } finally { heard.dispose(); deaf.dispose(); }
});
