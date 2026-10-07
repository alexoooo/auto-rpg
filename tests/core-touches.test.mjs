/**
 * **New touches** (`src/core/touches.ts`): a watched segment the solver pushed on another watched
 * body, or on something fixed, has touched it, closing at the speed the step before left it and
 * priced from the masses the contact meets. A ball dropped on the ground; a fist sent into a body,
 * priced as its blow is; a Warrior walking, a touch a footfall while a touch lasts as long as the
 * contact; a body that is not watched; a body's own segments; and the segments and the contacts a
 * reader asks for (Node core stand, Rapier, 120 Hz, balance 0 %).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Scene } from "@babylonjs/core/scene.js";
import { buildBody } from "../src/core/build/build-body.ts";
import { humanSpec } from "../src/core/human/spec.ts";
import { modelSpec } from "../src/core/models.ts";
import { watchBlows } from "../src/core/rules/blows.ts";
import { createPool } from "../src/core/rules/pool.ts";
import { rulebook } from "../src/core/rules/rulebook.ts";
import { STANDARD_GRAVITY } from "../src/core/spec/constants.ts";
import { watchTouches } from "../src/core/touches.ts";
import { createWorld } from "../src/core/world.ts";
import { labActor } from "../src/lab/actor.ts";
import { startStance } from "../src/lab/stance-mode.ts";
import { lone } from "./fixtures/lone.mjs";
import { coreStand, freshEngine } from "./harness/core-stand.mjs";

const RULES = rulebook("dungeon");
const all = () => true;

test("a ball dropped on the ground touches it once, with its own kinetic energy", async () => {
  const kg = 2, stand = await coreStand(lone("ball", "ball", kg), { position: [0, 0.5, 0] });
  try {
    const ball = stand.built.segments.get("ball"), body = { built: stand.built };
    const heard = [];
    const watch = watchTouches(stand.world, [body], { lasts: "contact", counts: all },
      (touch) => heard.push({ touch, priced: watch.priced(touch), before: falling }));
    // Read after the watch is: as a touch is heard, this is the fall's speed the step before.
    let falling = 0;
    stand.world.afterStep(() => { falling = -ball.body.linearVelocityToRef(new Vector3()).y; });
    stand.step(stand.seconds(1));
    assert.equal(heard.length, 1, "it lands once, and at rest for the rest of the second lands no more");
    const [{ touch, priced, before }] = heard;
    assert.deepEqual([touch.of.body, touch.of.segment, touch.on], [body, ball, null]);
    assert.ok(Math.hypot(touch.normal[0], touch.normal[1] + 1, touch.normal[2]) < 1e-6, `${touch.normal}: from the ball into the ground`);
    assert.ok(Math.hypot(touch.point[0], touch.point[2]) < 1e-6 && Math.abs(touch.point[1]) < 0.03, `${touch.point} m, under the ball`);
    // It fell from 0.45 m to within what one step covers.
    const most = Math.sqrt(2 * STANDARD_GRAVITY.value * 0.45);
    assert.ok(before > 0.9 * most && before <= most, `${before} m/s of at most ${most}`);
    assert.ok(Math.abs(touch.closing - before) < 1e-9, `${touch.closing} m/s closing, falling at ${before}`);
    assert.equal(priced.onKg, Infinity, "nothing moves the ground");
    assert.ok(Math.abs(priced.ofKg - kg) < 1e-9, `${priced.ofKg} kg`);
    assert.ok(Math.abs(priced.energy - kg * before * before / 2) < 1e-9, `${priced.energy} J`);
    assert.ok(touch.time > 0.25 && touch.time < 0.35, `${touch.time} s`);
    // Thrown up 20 cm, it has parted from the ground, and lands again.
    ball.body.applyImpulse(new Vector3(0, 2 * kg, 0), ball.node.position.add(new Vector3(0, 0.05, 0)));
    stand.step(stand.seconds(1));
    assert.equal(heard.length, 2);
    assert.ok(Math.abs(heard[1].touch.closing - 2) < 0.1, `${heard[1].touch.closing} m/s`);
    watch.dispose();
    ball.body.applyImpulse(new Vector3(0, 2 * kg, 0), ball.node.position.add(new Vector3(0, 0.05, 0)));
    stand.step(stand.seconds(1));
    assert.equal(heard.length, 2, "disposed, it hears nothing");
  } finally { stand.dispose(); }
});

/** A 1 kg fist and a 3 kg trunk, weightless, 0.5 m apart along z, the fist sent at the trunk at 6 m/s through its centre. */
async function pair() {
  const scene = new Scene(new NullEngine());
  const world = createWorld(scene, await freshEngine(), { gravity: false });
  const make = (id, spec, z, side) => ({ id, side, built: buildBody(spec, world, { position: [0, 1, z] }), pool: createPool(spec, RULES) });
  const fist = make("fist", lone("fist", "hand.right", 1), 0, "party"), target = make("target", lone("target", "trunk", 3), 0.5, "enemy");
  const hand = fist.built.segments.get("hand.right");
  hand.body.applyImpulse(new Vector3(0, 0, 6), hand.node.position.add(new Vector3(0, 0.05, 0)));
  return { world, fist, target, dispose: () => { world.dispose(); scene.dispose(); } };
}

test("a touch between two bodies is priced as a blow is", async () => {
  const p = await pair();
  try {
    const blows = watchBlows(p.world, [p.fist, p.target], RULES);
    const heard = [];
    const touches = watchTouches(p.world, [p.fist, p.target], { lasts: "pushed", counts: all },
      (touch) => heard.push({ touch, priced: touches.priced(touch) }));
    p.world.step(60);
    const [blow, ...more] = blows.blows;
    assert.ok(blow && more.length === 0, `${blows.blows.length} blows`);
    // Each of the two met the other: a touch each way, in the bodies' order.
    assert.deepEqual(heard.map(({ touch }) => [touch.of.body.id, touch.of.segment.spec.name, touch.on.body.id, touch.on.segment.spec.name]),
      [["fist", "hand.right", "target", "trunk"], ["target", "trunk", "fist", "hand.right"]]);
    const [{ touch, priced }, back] = heard;
    assert.deepEqual([touch.time, touch.point, touch.normal, touch.closing], [blow.time, blow.point, blow.normal, blow.closing]);
    assert.deepEqual(priced, { ofKg: blow.sides[0].kg, onKg: blow.sides[1].kg, energy: blow.energy });
    assert.ok(Math.abs(priced.ofKg - 1) < 1e-6 && Math.abs(priced.onKg - 3) < 1e-6 && Math.abs(touch.closing - 6) < 1e-6, JSON.stringify(priced));
    // The same touch from the other side: the normal the other way, the masses changed about, the energy the same.
    assert.ok(Math.hypot(...back.touch.normal.map((n, k) => n + touch.normal[k])) < 1e-9, `${back.touch.normal}`);
    assert.ok(Math.abs(back.touch.closing - touch.closing) < 1e-9 && Math.abs(back.priced.energy - priced.energy) < 1e-9
      && Math.abs(back.priced.ofKg - 3) < 1e-6 && Math.abs(back.priced.onKg - 1) < 1e-6, JSON.stringify(back.priced));
    // Outside the step it landed in, a touch is priced from the bodies as they now stand: here, as they stood.
    assert.deepEqual(touches.priced(touch), priced);
  } finally { p.dispose(); }
});

test("a walk is a touch a footfall while a touch lasts as long as the contact", async () => {
  const stand = await coreStand(humanSpec("workshop-fighter"));
  const stance = startStance(labActor(stand.built, stand.world));
  try {
    const body = { built: stand.built };
    const heard = { contact: [], pushed: [] };
    for (const lasts of ["contact", "pushed"]) watchTouches(stand.world, [body], { lasts, counts: all }, (touch) => heard[lasts].push(touch));
    stand.step(stand.seconds(3));
    assert.deepEqual([heard.contact.length, heard.pushed.length], [0, 0], "standing, built on its feet, it touches nothing anew");
    stance.orders.forward = 0.2;
    stand.step(stand.seconds(10));
    const { strides, fallen } = stance.frame(), feet = heard.contact.map((touch) => touch.of.segment.spec.name);
    assert.ok(!fallen && strides >= 20, `${strides} strides`);
    assert.ok(heard.contact.every((touch) => touch.on === null && touch.of.segment.spec.name.startsWith("foot.")), `${[...new Set(feet)]}`);
    assert.ok(feet.length >= strides - 2 && feet.length <= strides, `${feet.length} touches in ${strides} strides`);
    assert.ok(feet.every((foot, i) => i === 0 || foot !== feet[i - 1]), `the feet take turns: ${feet.join(" ")}`);
    // A foot down is pushed on in most of its steps and not all, so a touch that lasts only while it is pushed lands again.
    assert.ok(heard.pushed.length > strides + 5, `${heard.pushed.length} touches while pushed, in ${strides} strides`);
  } finally { stance.dispose(); stand.dispose(); }
});

test("a body that is not watched is no touch", async () => {
  const p = await pair();
  try {
    const heard = [], asked = [];
    watchTouches(p.world, [p.fist], { lasts: "contact", counts: (of, on) => { asked.push([of, on]); return true; } }, (touch) => heard.push(touch));
    p.world.step(60);
    const trunk = p.target.built.segments.get("trunk").body.linearVelocityToRef(new Vector3());
    assert.ok(trunk.z > 1, `the fist met the trunk, which goes on at ${trunk.z} m/s`);
    assert.deepEqual([heard.length, asked.length], [0, 0]);
  } finally { p.dispose(); }
});

test("a body's own segments touch, read from each of the two, unless they do not count", async () => {
  const stand = await coreStand(modelSpec("crypt-skeleton"));
  const stance = startStance(labActor(stand.built, stand.world));
  try {
    const body = { built: stand.built }, own = [], others = [];
    watchTouches(stand.world, [body], { lasts: "contact", counts: all }, (touch) => own.push(touch));
    watchTouches(stand.world, [body], { lasts: "contact", counts: (of, on) => on?.body !== of.body }, (touch) => others.push(touch));
    // Taking its guard, each forearm of the skeleton comes to rest on its trunk.
    stand.step(stand.seconds(1));
    const pairs = own.map((touch) => `${touch.of.segment.spec.name} on ${touch.on?.segment.spec.name}`).sort();
    assert.deepEqual(pairs, ["forearm.left on middleTrunk", "forearm.right on middleTrunk", "middleTrunk on forearm.left", "middleTrunk on forearm.right"]);
    assert.ok(own.every((touch) => touch.on.body === body));
    assert.equal(others.length, 0);
  } finally { stance.dispose(); stand.dispose(); }
});

test("only the bodies that read are read, and a contact that does not count is no touch", async () => {
  const p = await pair();
  try {
    const named = [], refused = [];
    watchTouches(p.world, [p.fist, p.target], { reads: (body) => body === p.target, lasts: "contact", counts: all }, (touch) => named.push(touch));
    watchTouches(p.world, [p.fist, p.target], { lasts: "contact", counts: (of) => of.body !== p.fist }, (touch) => refused.push(touch));
    p.world.step(60);
    // The two met once, and each watch reads it from the trunk's side alone.
    for (const heard of [named, refused]) {
      assert.deepEqual(heard.map((touch) => [touch.of.segment.spec.name, touch.on.segment.spec.name]), [["trunk", "hand.right"]]);
    }
  } finally { p.dispose(); }
});
