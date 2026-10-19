/**
 * **How many touches a walk and a guard make** (`src/core/touches.ts`), measured on the Node core
 * stand (Rapier, 120 Hz, balance 0 %), and not a gate (`tests/experimental.json`): twenty strides
 * or more in a 10 s walk, a touch a footfall; and the skeleton's guard rests each forearm on its
 * trunk.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { humanSpec } from "../src/core/human/spec.ts";
import { modelSpec } from "../src/core/models.ts";
import { watchTouches } from "../src/core/touches.ts";
import { labActor } from "../src/lab/actor.ts";
import { startStance } from "../src/lab/stance-mode.ts";
import { coreStand } from "./harness/core-stand.mjs";

const all = () => true;

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
    // A foot down may be let off within a step, so a touch that lasts only while it is pushed lands again: never fewer.
    assert.ok(heard.pushed.length >= feet.length, `${heard.pushed.length} touches while pushed, ${feet.length} in contact`);
    assert.ok(heard.pushed.every((touch) => touch.on === null && touch.of.segment.spec.name.startsWith("foot.")));
  } finally { stance.dispose(); stand.dispose(); }
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
