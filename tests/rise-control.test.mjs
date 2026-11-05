import "./harness/preload-data.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { coreStand } from "./harness/core-stand.mjs";
import { modelHolding, modelSpec } from "../src/core/models.ts";
import { commandedBody } from "../src/core/mind/host.ts";
import { riseLimbs } from "../src/core/recovery/rise/limbs.ts";
import { servoAsk } from "../src/core/control/servo.ts";
import { Vector3 } from "../src/core/math/vector.ts";

test("loaded held support follows item contact without moving a nearby hand's target", async () => {
  const stand = await coreStand(modelHolding("workshop-fighter", { left: "empty", right: "sword" }), { gravity: false, ground: false });
  let own;
  const host = commandedBody(stand.built, stand.world, {}, [(body) => {
    own = body;
    return { name: "held support point", state: {}, wants: () => false, begin() {}, end() {}, step() {} };
  }]);
  try {
    const index = own.spec.ends.findIndex(end => end.name === "hand.right"), hand = own.built.segments.get("hand.right");
    assert.ok(hand.rigid.shapes.length > 1, "the fixture holds an item on the hand's rigid body");
    const geometric = riseLimbs(own);
    geometric.read(-10, false);
    const at = geometric.limbs[index].work.at.clone(), ground = at.y - .005;
    const held = hand.rigid.owners.findIndex(owner => owner.kind === "held");
    assert.ok(held >= 0, "the fixture has an item-owned collider");
    const contacts = [
      { impulse: 1, point: [at.x, ground, at.z + .1], normal: [0, -1, 0] },
      { impulse: 3, point: [at.x, ground, at.z + .3], normal: [0, -1, 0] },
      { impulse: 0, point: [at.x + 10, ground, at.z], normal: [0, -1, 0] },
    ].map(contact => ({ ...contact, pairs: [{ mine: held, impulse: contact.impulse }] }));
    const built = { ...own.built, physics: { contactsOf: (body, accepts) => body === hand.body && accepts(null) ? contacts : [] } };
    const plain = riseLimbs({ ...own, built });
    plain.read(ground, false);
    assert.ok(plain.limbs[index].work.patch.at.subtract(at).length() < 1e-12, "geometric support keeps the hand's end as its force patch");
    const limbs = riseLimbs({ ...own, built }, { heldSupport: "loaded" });
    limbs.read(ground, false);
    const expected = new Vector3(at.x, ground, at.z + .25), actual = limbs.limbs[index].work.patch.at;
    assert.ok(actual.subtract(expected).length() < 1e-12, `loaded point ${actual.asArray()}, expected ${expected.asArray()}`);
    assert.ok(limbs.limbs[index].work.at.subtract(at).length() < 1e-12, "a nearby hand keeps its geometric motion target");
    const goals = Float64Array.from(own.muscles.channels, (_, i) => own.muscles.angle(i));
    assert.equal(limbs.bear(index, goals, 2, ground, 1), true);
    assert.equal(limbs.limbs[index].task.bearing, true);
    for (const contact of contacts) contact.pairs[0].mine = 0;
    limbs.read(ground, false);
    assert.ok(limbs.limbs[index].work.patch.at.subtract(at).length() < 1e-12,
      "the hand's own loaded collider keeps its geometric support point");
    for (const contact of contacts) contact.pairs[0].mine = held;
    const lower = ground - .1;
    for (const contact of contacts) contact.point[1] = lower;
    limbs.read(lower, false);
    assert.ok(limbs.limbs[index].work.at.subtract(new Vector3(at.x, lower, at.z + .25)).length() < 1e-12,
      "a hand held above the ground keeps the loaded contact as its motion target");
    contacts.splice(0);
    limbs.read(ground, false);
    assert.ok(limbs.limbs[index].work.at.subtract(at).length() < 1e-12, "without load, the hand keeps its geometric fallback");
    assert.ok(limbs.limbs[index].work.patch.at.subtract(at).length() < 1e-12, "without load, the force patch uses the geometric fallback");
  } finally { host.dispose(); stand.dispose(); }
});

test("bearing posture accelerations use the joint turning map, including damping and transfer", async () => {
  const stand = await coreStand(modelSpec("workshop-fighter"), { gravity: false, ground: false, posture: {
    "shoulder.left flexion": .6, "shoulder.left abduction": .8, "shoulder.left internal rotation": .4,
    "hip.left flexion": 1, "hip.left abduction": .4, "hip.left internal rotation": .4,
  } });
  let own;
  const host = commandedBody(stand.built, stand.world, {}, [(body) => {
    own = body;
    return { name: "bearing coordinates", state: {}, wants: () => false, begin() {}, end() {}, step() {} };
  }]);
  try {
    for (const name of ["shoulder.left", "hip.left"]) {
      const joint = stand.built.joints.get(name);
      joint.child.body.applyTorqueImpulse(new Vector3(.03, -.05, .04));
    }
    stand.step();
    const muscles = own.muscles, limbs = riseLimbs(own);
    const goals = Float64Array.from(muscles.channels, (_, i) => muscles.angle(i) + [.1, -.2, .05][i % 3]);
    assert.ok(muscles.channels.some((_, i) => Math.abs(muscles.rate(i)) > 1e-8), "the fixture exercises damping at nonzero joint rates");
    let different = false;
    limbs.read(-10, false);
    for (const name of ["hand.left", "shin.left"]) {
      const index = own.spec.ends.findIndex(end => end.name === name), end = own.spec.ends[index], limb = limbs.limbs[index];
      for (const transfer of [false, true]) {
        limbs.bear(index, goals, 2, -10, 1, transfer);
        const seconds = i => !transfer && end.takes.includes(muscles.channels[i].name) ? .1 : .5;
        const reference = servoAsk(muscles, i => goals[i], .5, stand.world.dt,
          { seconds, rate: () => 0, acceleration: () => 0 });
        for (let k = 0; k < limb.memory.channels.length; k++) {
          const i = limb.memory.channels[k], rate = 1 / seconds(i);
          const unmapped = rate * rate * (goals[i] - muscles.angle(i)) - 2 * rate * muscles.rate(i);
          different ||= Math.abs(unmapped - reference.accel[i]) > 1e-6;
          assert.ok(Math.abs(limb.work.toward[k] - reference.accel[i]) < 1e-10,
            `${name}, transfer ${transfer}, ${muscles.channels[i].name}: bearing ${limb.work.toward[k]}, servo ${reference.accel[i]}`);
          if (end.takes.includes(muscles.channels[i].name)) assert.ok(Number.isNaN(limb.work.ahead[k]));
          else assert.equal(limb.work.ahead[k], limb.work.toward[k]);
        }
      }
    }
    assert.ok(different, "the compound poses distinguish joint-angle and motor-axis accelerations");
  } finally { host.dispose(); stand.dispose(); }
});
