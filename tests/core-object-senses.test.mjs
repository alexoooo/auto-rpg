import test from "node:test";
import assert from "node:assert/strict";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { modelSpec } from "../src/core/models.ts";
import { createObjectSenses } from "../src/core/mind/object-senses.ts";
import { createPolicyBody } from "../src/core/mind/direct.ts";
import { clockSenses } from "../src/core/mind/senses.ts";
import { coreStand, saveStand, loadStand } from "./harness/core-stand.mjs";

async function fixture(delay = 2) {
  const stand = await coreStand(modelSpec("workshop-fighter"), { pinned: "lowerTrunk", actuation: "directional" });
  const node = new TransformNode("moving-object", stand.scene);
  node.position.set(3, 2, 0); node.rotationQuaternion = Quaternion.Identity();
  const body = stand.world.physics.addBody(node, [{ kind: "sphere", centre: [0.1, 0, 0], radius: 0.05 }], {
    mass: 2, centre: [0.1, 0, 0], moments: [0.02, 0.03, 0.04], orientation: Quaternion.Identity(),
  });
  const definition = { id: "target", owner: "foe", body, points: { tip: [0.2, 0, 0] } };
  const observer = createObjectSenses(stand.world, [definition], delay), clock = clockSenses(stand.world);
  const state = { seen: null };
  const controlled = createPolicyBody(stand.built, stand.world, (model) => ({ name: "object-watcher", state,
    step(observation) { state.seen = observation.senses.objects; return { kind: "torque", torque: model.channels.map(() => 0) }; },
  }), { senses: () => ({ ...clock(), objects: observer.read() }) });
  return { stand, body, observer, controlled, state, definition,
    dispose() { controlled.dispose(); observer.dispose(); stand.dispose(); } };
}

function actual(body, time) {
  const p = new Vector3(...body.massProperties.centre).applyRotationQuaternion(body.node.rotationQuaternion).addInPlace(body.node.position);
  return { id: "target", owner: "foe", points: { tip: [0.2, 0, 0] }, time, mass: body.massProperties.mass,
    position: body.node.position.asArray(), rotation: body.node.rotationQuaternion.asArray(), centre: p.asArray(),
    velocity: body.linearVelocityToRef(new Vector3()).asArray(), spin: body.angularVelocityToRef(new Vector3()).asArray() };
}

test("external object poses, point models and sample times reach the policy through the declared delay", async () => {
  const f = await fixture(), history = [];
  try {
    f.body.applyImpulse(new Vector3(0.4, 0.2, 0), new Vector3(3.1, 2, 0));
    f.body.applyTorqueImpulse(new Vector3(0, 0, 0.04));
    f.definition.points.tip[0] = 99;
    for (let i = 0; i < 8; i++) {
      history.push(actual(f.body, f.stand.world.time)); f.stand.step();
      const expected = history[Math.max(0, i - 2)];
      // Initial delay slots precede the test's applied impulse.
      if (i >= 2) assert.deepEqual(f.state.seen, [expected]);
    }
    const reading = f.observer.read()[0];
    assert.equal(reading.time, history[5].time);
    assert.notDeepEqual(reading, history[7]);
    assert.throws(() => { reading.points.tip[0] = 5; }, TypeError);
    assert.throws(() => { f.state.seen[0].velocity[0] = 5; }, TypeError);
    assert.equal("body" in reading, false);
    assert.equal("node" in reading, false);
    assert.deepEqual(reading.points.tip, [0.2, 0, 0]);
  } finally { f.dispose(); }
});

test("object delay state replays in place and in another world without refreshing a cache", async () => {
  const f = await fixture(), other = await fixture();
  try {
    f.body.applyImpulse(new Vector3(0.4, 0.2, 0), new Vector3(3.1, 2, 0));
    f.stand.step(6);
    const states = (x) => ({ controller: x.controlled.state, objects: x.observer.state });
    const saved = saveStand(f.stand.world, states(f)), atSave = f.observer.read();
    const branch = (x) => { x.stand.step(15); return { reading: x.observer.read(), body: x.controlled.observe(), state: saveStand(x.stand.world, states(x)).state }; };
    const expected = branch(f);
    loadStand(f.stand.world, states(f), saved); assert.deepEqual(f.observer.read(), atSave); assert.deepEqual(branch(f), expected);
    loadStand(other.stand.world, states(other), saved); assert.deepEqual(other.observer.read(), atSave); assert.deepEqual(branch(other), expected);
  } finally { f.dispose(); other.dispose(); }
});

test("object sensing validates identity and geometry before registering a world hook", async () => {
  const f = await fixture();
  try {
    assert.throws(() => createObjectSenses(f.stand.world, [f.definition], 0.5), /whole steps/);
    assert.throws(() => createObjectSenses(f.stand.world, [f.definition, f.definition]), /identity/);
    assert.throws(() => createObjectSenses(f.stand.world, [{ ...f.definition, points: { tip: [NaN, 0, 0] } }]), /point/);
    const saved = f.observer.read(); f.observer.dispose(); f.stand.step(3);
    assert.deepEqual(f.observer.read(), saved);
  } finally { f.dispose(); }
});
