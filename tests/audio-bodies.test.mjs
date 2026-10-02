/**
 * **What a body sounds of** (`src/audio/body-sounds.ts`): its touches as cues, and its air. A walk
 * is heard a footfall a stride, in the voice of what the walker is made of, and standing not at
 * all; a fall is heard louder than any footfall; two bodies meeting are heard once, in the softer
 * one's voice; a segment sounds as what it holds; and a body's air is its fastest point's, a
 * club's end in a blow (Node core stand, Rapier, 120 Hz, balance 0 %).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Scene } from "@babylonjs/core/scene.js";
import { airOf, hearTouches } from "../src/audio/body-sounds.ts";
import { surfaceOf, swishStrength } from "../src/audio/cues.ts";
import { buildBody } from "../src/core/build/build-body.ts";
import { modelSpec } from "../src/core/human/spec.ts";
import { createWorld } from "../src/core/world.ts";
import { labActor } from "../src/lab/actor.ts";
import { throwBlow } from "../src/lab/blow.ts";
import { LAB_BLOWS } from "../src/lab/blows.ts";
import { watchClubBlow } from "../src/lab/club-blow.ts";
import { loadoutSpec } from "../src/lab/loadout.ts";
import { startRun } from "../src/lab/run-mode.ts";
import { startStance } from "../src/lab/stance-mode.ts";
import { TRACKS, trackOf } from "../src/lab/track.ts";
import { lone } from "./fixtures/lone.mjs";
import { coreStand, freshEngine } from "./harness/core-stand.mjs";

/** `model` on its feet under the lab's stance, heard: every cue with the touch it is of. */
async function heardStance(model) {
  const stand = await coreStand(modelSpec(model));
  const stance = startStance(labActor(stand.built, stand.world));
  const heard = [];
  const hearing = hearTouches(stand.world, [{ id: "body", built: stand.built }], (cue, touch) => heard.push({ cue, touch }));
  return { stand, stance, heard, dispose: () => { hearing.dispose(); stance.dispose(); stand.dispose(); } };
}

for (const [model, voice] of [["workshop-fighter", "body"], ["crypt-skeleton", "bone"]]) {
  test(`${model}'s walk is heard a footfall a stride, and its standing is silent`, async () => {
    const { stand, stance, heard, dispose } = await heardStance(model);
    try {
      stand.step(stand.seconds(3));
      assert.equal(heard.length, 0, "standing, built on its feet, it makes no sound");
      stance.orders.forward = 0.2;
      stand.step(stand.seconds(10));
      const { strides, fallen } = stance.frame(), feet = heard.map(({ touch }) => touch.of.segment.spec.name);
      assert.ok(!fallen && strides >= 20, `${strides} strides`);
      assert.ok(heard.length >= strides - 2 && heard.length <= strides, `${heard.length} cues in ${strides} strides`);
      assert.deepEqual([...new Set(feet)].sort(), ["foot.left", "foot.right"]);
      assert.ok(feet.every((foot, i) => i === 0 || foot !== feet[i - 1]), `the feet take turns: ${feet.join(" ")}`);
      assert.deepEqual([...new Set(heard.map(({ cue }) => `${cue.key} ${cue.kind}`))], [`body:ground ${voice}`]);
      // A footfall is quiet beside a blow, and where the foot met the ground.
      for (const { cue, touch } of heard) {
        assert.ok(cue.strength >= 0.0125 && cue.strength < 0.1, `${cue.strength}`);
        assert.deepEqual(cue.point, { x: touch.point[0], z: touch.point[2] });
      }
    } finally { dispose(); }
  });
}

test("a fall is heard louder than any footfall", async () => {
  const walk = await heardStance("workshop-fighter");
  let footfall = 0;
  try {
    walk.stance.orders.forward = 0.2;
    walk.stand.step(walk.stand.seconds(5));
    footfall = Math.max(...walk.heard.map(({ cue }) => cue.strength));
    assert.ok(walk.heard.length > 5 && footfall < 0.1, `${walk.heard.length} footfalls, the loudest ${footfall}`);
  } finally { walk.dispose(); }
  const { stand, stance, heard, dispose } = await heardStance("workshop-fighter");
  try {
    stand.step(stand.seconds(1));
    // From the front, harder than its steps catch.
    stance.shove(120, 180);
    stand.step(stand.seconds(3));
    assert.ok(stance.frame().fallen, "it is down");
    // What lands hardest is no foot, and which part it is turns on how the body went down.
    const landing = heard.filter(({ touch }) => !touch.of.segment.spec.name.startsWith("foot."));
    const loudest = landing.reduce((a, b) => a.cue.strength >= b.cue.strength ? a : b);
    assert.ok(landing.length >= 5 && loudest.cue.strength > 0.5 && loudest.cue.strength > 5 * footfall,
      `${landing.length} parts land, the ${loudest.touch.of.segment.spec.name} at ${loudest.cue.strength}, a footfall at ${footfall}`);
    assert.deepEqual([...new Set(heard.map(({ cue }) => `${cue.key} ${cue.kind}`))], ["body:ground body"]);
  } finally { dispose(); }
});

/** A 1 kg fist of bone and a 3 kg trunk of wood, weightless, 0.5 m apart along z, the fist sent at the trunk at 6 m/s through its centre. */
async function pair() {
  const scene = new Scene(new NullEngine());
  const world = createWorld(scene, await freshEngine(), { gravity: false });
  const make = (id, spec, z) => ({ id, built: buildBody(spec, world, { position: [0, 1, z] }) });
  const fist = make("fist", lone("fist", "hand.right", 1, { surface: "bone" }), 0), target = make("target", lone("target", "trunk", 3, { surface: "wood" }), 0.5);
  const hand = fist.built.segments.get("hand.right");
  hand.body.applyImpulse(new Vector3(0, 0, 6), hand.node.position.add(new Vector3(0, 0.05, 0)));
  return { world, fist, target, dispose: () => { world.dispose(); scene.dispose(); } };
}

test("two bodies meeting are heard once, from the earlier of them, in the softer one's voice", async () => {
  for (const order of [["fist", "target"], ["target", "fist"]]) {
    const p = await pair();
    try {
      const heard = [];
      hearTouches(p.world, order.map((id) => p[id]), (cue, touch) => heard.push({ cue, touch }));
      p.world.step(60);
      assert.equal(heard.length, 1, `${heard.length} cues`);
      const [{ cue, touch }] = heard;
      assert.deepEqual([touch.of.body.id, touch.on.body.id], order);
      // 1 kg on 3 kg at 6 m/s: three quarters of a kilogram's 18 J, 13.5 J of the 60 a cue is all of.
      assert.deepEqual({ ...cue, strength: 0, point: 0 }, { key: order.join(":"), kind: "bone", strength: 0, point: 0 });
      assert.ok(Math.abs(cue.strength - Math.sqrt(13.5 / 60)) < 1e-4, `${cue.strength}`);
      assert.ok(Math.abs(cue.point.x) < 1e-6 && cue.point.z > 0.03 && cue.point.z < 0.5, JSON.stringify(cue.point));
    } finally { p.dispose(); }
  }
});

test("a segment sounds as what it holds, and else as what its body is made of", async () => {
  const stored = LAB_BLOWS[0];
  const surfaces = async (spec, names) => {
    const stand = await coreStand(spec);
    try { return names.map((name) => surfaceOf(stand.built, stand.built.segments.get(name))); } finally { stand.dispose(); }
  };
  const names = ["hand.right", "hand.left", "foot.left", "head"];
  assert.deepEqual(await surfaces(modelSpec("workshop-fighter"), names), ["flesh", "flesh", "flesh", "flesh"]);
  assert.deepEqual(await surfaces(modelSpec("workshop-rogue"), names), ["flesh", "flesh", "flesh", "flesh"]);
  assert.deepEqual(await surfaces(modelSpec("crypt-skeleton"), names), ["bone", "bone", "bone", "bone"]);
  assert.deepEqual(await surfaces(loadoutSpec({ model: stored.model, right: "club", left: "empty", boots: true, armour: true }), names), ["wood", "flesh", "flesh", "flesh"]);
  assert.deepEqual(await surfaces(loadoutSpec({ model: "crypt-skeleton", right: "empty", left: "club", boots: true, armour: true }), names), ["bone", "wood", "bone", "bone"]);
  await assert.rejects(surfaces(lone("ball", "ball", 1), ["ball"]), /ball does not say what it is made of/);
});

test("a body's air is its club's end in a blow", async () => {
  const stored = LAB_BLOWS[0];
  const stand = await coreStand(loadoutSpec({ model: stored.model, right: "club", left: "empty", boots: true, armour: true }), { ground: true, hz: 120 });
  const blow = throwBlow(labActor(stand.built, stand.world), stored.strike, stored.distance);
  const watch = watchClubBlow(stand.built, stand.world, blow, stored.distance, stored.hand);
  const air = airOf(stand.built), at = new Vector3(), fastest = { speed: 0, at: new Vector3(), hand: new Vector3() };
  const hand = stand.built.segments.get(`hand.${stored.hand}`);
  // Read after the watch is: in the step the blow lands, the watch has it, and its peak is of the steps before.
  stand.world.afterStep(() => {
    const speed = air(at);
    if (blow.time >= blow.pushing && !watch.landed && speed > fastest.speed) { fastest.speed = speed; fastest.at.copyFrom(at); fastest.hand.copyFrom(hand.node.position); }
  });
  try {
    for (let i = 0; i < stand.seconds(5) && !watch.landed && !watch.fell; i++) stand.step(1);
    assert.ok(watch.landed && watch.peak > 15, `the blow lands, its club's end at ${watch.peak} m/s`);
    // The two turn the same lever by quaternions a float32 from unit, each its own way.
    assert.ok(Math.abs(fastest.speed - watch.peak) < 1e-5, `${fastest.speed} m/s of air, the club's end at ${watch.peak}`);
    const reach = Vector3.Distance(fastest.at, fastest.hand);
    assert.ok(reach > 0.4 && reach < 1, `the fastest point is ${reach} m from the hand's node`);
    assert.ok(swishStrength(fastest.speed) > 0.9, `${swishStrength(fastest.speed)} of its air`);
  } finally { watch.dispose(); blow.dispose(); stand.dispose(); }
});

test("a walker's air is under what a swish begins at, round both tracks", async () => {
  for (const id of ["circle", "shuttle"]) {
    const stand = await coreStand(modelSpec("workshop-fighter"), { ground: true });
    const run = startRun(labActor(stand.built, stand.world), trackOf(TRACKS[id].pieces));
    const air = airOf(stand.built), at = new Vector3();
    let fastest = 0;
    // From the first second on: the body's first steps take its arms from its reference pose to its guard.
    stand.world.afterStep(() => { if (stand.world.time > 1) fastest = Math.max(fastest, air(at)); });
    try {
      stand.step(stand.seconds(26));
      assert.ok(!run.frame().fallen && run.frame().travelled > 5, `${run.frame().travelled} m round`);
      // A foot, swung through a step: fastest in the shuttle's half-turns.
      assert.ok(fastest > 3 && swishStrength(fastest) === 0, `${id}: its fastest point at ${fastest} m/s`);
    } finally { run.dispose(); stand.dispose(); }
  }
});
