/**
 * **What a body sounds of** (`src/audio/body-sounds.ts`): its touches as cues, and its air. A walk
 * is heard a footfall a stride, in the voice of what the walker is made of, and standing not at
 * all; a fall is heard louder than any footfall; two bodies meeting are heard once, in the softer
 * one's voice; a body beside the heard ones is heard meeting them and not by itself; a segment
 * sounds as what it holds; and a body's air is its fastest point's, a
 * club's end in a blow (Node core stand, Rapier, 120 Hz, balance 0 %).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Scene } from "@babylonjs/core/scene.js";
import { airOf, hearTouches } from "../src/audio/body-sounds.ts";
import { substanceOf, swishStrength } from "../src/audio/cues.ts";
import { buildBody } from "../src/core/build/build-body.ts";
import { heldPoint } from "../src/core/build/rigid.ts";
import { centreOfToRef, pointOfToRef } from "../src/core/control/support.ts";
import { modelSpec } from "../src/core/human/spec.ts";
import { rulebook } from "../src/core/rules/rulebook.ts";
import { createWorld } from "../src/core/world.ts";
import { labActor } from "../src/lab/actor.ts";
import { throwBlow, watchBlow } from "../src/lab/blow.ts";
import { LAB_BLOWS } from "../src/lab/blows.ts";
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
  const fist = make("fist", lone("fist", "hand.right", 1, { substance: "bone" }), 0), target = make("target", lone("target", "trunk", 3, { substance: "wood" }), 0.5);
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

test("a body beside the heard ones is heard meeting them, and not by itself", async () => {
  // The pair, one of the two heard and the other beside it: their meeting, once, told from the heard one.
  for (const [own, other] of [["fist", "target"], ["target", "fist"]]) {
    const p = await pair();
    try {
      const heard = [];
      hearTouches(p.world, [p[own]], (cue) => heard.push(cue.key), [p[other]]);
      p.world.step(60);
      assert.deepEqual(heard, [`${own}:${other}`]);
    } finally { p.dispose(); }
  }
  // Two balls let fall on a floor, 2 m apart: the heard one's landing, and not the landing of the one beside it.
  const scene = new Scene(new NullEngine());
  const world = createWorld(scene, await freshEngine());
  try {
    world.physics.addFixedBox([0, -0.5, 0], [20, 1, 20]);
    const [own, other] = ["own", "other"].map((id, k) => ({ id, built: buildBody(lone(id, "trunk", 3, { substance: "wood" }), world, { position: [2 * k, 0.5, 0] }) }));
    const heard = [], all = [];
    hearTouches(world, [own], (cue) => heard.push(cue.key), [other]);
    hearTouches(world, [own, other], (cue) => all.push(cue.key));
    world.step(120);
    assert.ok(heard.length >= 1 && heard.every((key) => key === "own:ground"), heard.join(" "));
    assert.deepEqual([...new Set(all)].sort(), ["other:ground", "own:ground"]);
  } finally { world.dispose(); scene.dispose(); }
});

test("a segment sounds as what it holds, and else as what its body is made of", async () => {
  const stored = LAB_BLOWS[0];
  const made = async (spec, names) => {
    const stand = await coreStand(spec);
    try { return names.map((name) => substanceOf(stand.built, stand.built.segments.get(name))); } finally { stand.dispose(); }
  };
  const names = ["hand.right", "hand.left", "foot.left", "head"];
  assert.deepEqual(await made(modelSpec("workshop-fighter"), names), ["flesh", "flesh", "flesh", "flesh"]);
  assert.deepEqual(await made(modelSpec("workshop-rogue"), names), ["flesh", "flesh", "flesh", "flesh"]);
  assert.deepEqual(await made(modelSpec("crypt-skeleton"), names), ["bone", "bone", "bone", "bone"]);
  assert.deepEqual(await made(loadoutSpec({ model: stored.model, right: "club", left: "empty", boots: true, armour: true }), names), ["wood", "flesh", "flesh", "flesh"]);
  assert.deepEqual(await made(loadoutSpec({ model: "crypt-skeleton", right: "empty", left: "club", boots: true, armour: true }), names), ["bone", "wood", "bone", "bone"]);
  await assert.rejects(made(lone("ball", "ball", 1), ["ball"]), /ball does not say what it is made of/);
});

test("a body's air is its club's end in a blow", async () => {
  const stored = LAB_BLOWS[0];
  const spec = loadoutSpec({ model: stored.model, right: "club", left: "empty", boots: true, armour: true });
  const stand = await coreStand(spec, { ground: true, hz: 120 });
  const actor = labActor(stand.built, stand.world);
  const blow = throwBlow(actor, { hand: stored.hand, strike: stored.strike, place: stored.place, band: stored.band });
  const watch = watchBlow(actor, blow, rulebook("arena"));
  const air = airOf(stand.built), at = new Vector3(), fastest = { speed: 0, at: new Vector3(), hand: new Vector3() };
  const hand = stand.built.segments.get(`hand.${stored.hand}`);
  // The club's swell's far end, in the body's frame: with the hand's velocity and spin, how fast it moves.
  const held = spec.held.find((h) => h.segment === hand.spec.name), end = heldPoint(held, held.item.shapes[1].to).value;
  const velocity = new Vector3(), spin = new Vector3(), lever = new Vector3(), centre = new Vector3();
  let peak = 0, landed = false;
  // Both are read at the steps after the pushes begin and before the blow lands.
  stand.world.afterStep(() => {
    landed ||= watch.reading.blows.length > 0;
    if (blow.time < blow.pushing || landed) return;
    const speed = air(at);
    if (speed > fastest.speed) { fastest.speed = speed; fastest.at.copyFrom(at); fastest.hand.copyFrom(hand.node.position); }
    hand.body.linearVelocityToRef(velocity);
    hand.body.angularVelocityToRef(spin);
    pointOfToRef(hand, end, lever).subtractInPlace(centreOfToRef(hand, centre));
    peak = Math.max(peak, velocity.addInPlace(Vector3.Cross(spin, lever)).length());
  });
  try {
    for (let i = 0; i < stand.seconds(5) && !landed && !blow.body.view.down; i++) stand.step(1);
    assert.ok(landed && peak > 15, `the blow lands, its club's end at ${peak} m/s`);
    // The two turn the same lever by quaternions a float32 from unit, each its own way.
    assert.ok(Math.abs(fastest.speed - peak) < 1e-5, `${fastest.speed} m/s of air, the club's end at ${peak}`);
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
      // A foot, swung through a step: fastest in the shuttle's half-turns (read on this stand: 2.47 m/s
      // round the circle, 4.20 m/s in the shuttle).
      assert.ok(fastest > 2 && swishStrength(fastest) === 0, `${id}: its fastest point at ${fastest} m/s`);
    } finally { run.dispose(); stand.dispose(); }
  }
});
