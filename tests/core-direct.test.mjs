import test from "node:test";
import assert from "node:assert/strict";
import { modelSpec as humanSpec } from "../src/core/models.ts";
import { createMind } from "../src/core/mind/minds.ts";
import { createPolicyBody } from "../src/core/mind/direct.ts";
import { checkedAction } from "../src/core/mind/actions.ts";
import { saveState } from "../src/core/state.ts";
import { coreStand, saveStand, loadStand } from "./harness/core-stand.mjs";
import { Duel } from "../src/arena/duel.ts";
import { createBody } from "../src/core/body.ts";

// Experiment gains: a 0.1 s position-error decay, capped at 3 rad/s and full activation.
const config = { kind: "direct", targets: { "elbow.right flexion": 0.6 }, seconds: 0.1, speed: 3, activation: 1 };
const wiring = { name: "direct", orders: () => null };

test("a replacement mind reaches and holds through the public path without fighter fields", async () => {
  for (const model of ["workshop-fighter", "workshop-rogue", "crypt-skeleton"]) {
    const stand = await coreStand(humanSpec(model), { ground: false, pinned: "lowerTrunk", actuation: "directional" });
    const minded = createMind(stand.built, stand.world, config, wiring), body = minded.body;
    try {
      assert.equal(minded.kind, "direct");
      for (const field of ["view", "envelope", "drive", "skills"]) assert.equal(field in body, false);
      const read = () => body.observe().joints.find((j) => j.name === "elbow.right flexion");
      const before = read().angle;
      stand.step(240);
      assert.ok(Math.abs(read().angle - 0.6) < 0.025, `${model}: reached ${read().angle}`);
      assert.ok(Math.abs(read().angle - before) > 0.5);
      stand.step(120);
      assert.ok(Math.abs(read().angle - 0.6) < 0.025, `${model}: held ${read().angle}`);
      const state = JSON.stringify(saveState(body.state));
      for (const field of ["stance", "staged", "skills", "motor"]) assert.ok(!state.includes(`"${field}"`));
      const snapshot = saveStand(stand.world, { body: body.state });
      stand.step(13);
      const branch = body.observe();
      loadStand(stand.world, { body: body.state }, snapshot);
      stand.step(13);
      assert.deepEqual(body.observe(), branch);
      body.setLevel("limp");
      const idle = saveState(body.state);
      stand.step(12);
      assert.equal(body.has, "nobody");
      assert.equal(body.state.mind.steps, idle.mind.steps);
      assert.equal(body.state.mind.idles, 1);
      assert.ok(body.observe().joints.every((j) => j.effort === 0));
      body.setLevel("full");
      stand.step();
      assert.equal(body.state.mind.steps, idle.mind.steps + 1);
      body.dispose();
      const count = body.state.mind.steps;
      stand.step(3);
      assert.equal(body.state.mind.steps, count);
      for (const joint of stand.built.joints.values()) for (let k = 0; k < joint.dofs.length; k++) assert.ok(joint.joint.motorStepImpulse(k) === 0);
    } finally { body.dispose(); stand.dispose(); }
  }
});

test("policy observations and models cannot mutate physics or another observation", async () => {
  const stand = await coreStand(humanSpec("workshop-fighter"), { actuation: "directional" });
  let description, seen;
  const body = createPolicyBody(stand.built, stand.world, (model) => {
    description = model;
    return { name: "observer", state: {}, step(observation) {
      seen = observation;
      return { kind: "velocity", activation: model.channels.map(() => 0), velocity: model.channels.map(() => 0) };
    } };
  });
  try {
    stand.step(10);
    const original = body.observe();
    assert.throws(() => { original.segments[0].position[0] = 100; }, TypeError);
    assert.throws(() => { description.channels[0].max = 100; }, TypeError);
    assert.throws(() => { seen.joints[0].angle = 100; }, TypeError);
    assert.deepEqual(body.observe(), original);
    assert.ok(original.contacts.length > 0, "actual ground contact is observed");
    assert.ok(original.contacts.some((c) => c.fixed !== null));
    const angles = original.joints.map((j) => j.angle);
    body.setLevel("limp"); stand.step(20);
    assert.notDeepEqual(body.observe().joints.map((j) => j.angle), angles, "idle observations read current physics");
    assert.deepEqual(original.joints.map((j) => j.angle), angles, "earlier readings stay detached");
  } finally { body.dispose(); stand.dispose(); }
});

test("invalid actions are rejected as a whole and accepted actions own their arrays", () => {
  for (const action of [
    { kind: "velocity", activation: [1, NaN], velocity: [0, 0] },
    { kind: "velocity", activation: [1, 2], velocity: [0, 0] },
    { kind: "velocity", activation: [1, 1], velocity: [0, NaN] },
    { kind: "velocity", activation: [1], velocity: [0, 0] },
    { kind: "torque", torque: [0, Infinity] }, { kind: "torque", torque: Array(2) },
    { kind: "velocity", activation: [1, 1], velocity: Array(2) }, { kind: "other" },
  ]) assert.throws(() => checkedAction(action, 2));
  const velocity = [Infinity, -Infinity], activation = [1, 0.5];
  const accepted = checkedAction({ kind: "velocity", velocity, activation }, 2);
  activation[0] = 0; velocity[0] = 0;
  assert.deepEqual(accepted, { kind: "velocity", activation: [1, 0.5], velocity: [Infinity, -Infinity] });
});

test("a direct torque policy saturates at the same muscle bounds", async () => {
  const stand = await coreStand(humanSpec("workshop-fighter"), { ground: false, pinned: "lowerTrunk", actuation: "directional" });
  const body = createPolicyBody(stand.built, stand.world, (model) => ({ name: "torque", state: {},
    step: () => ({ kind: "torque", torque: model.channels.map((_, i) => i % 2 ? -1e6 : 1e6) }) }));
  try {
    stand.step();
    const joints = body.observe().joints;
    assert.ok(joints.some((j) => Math.abs(j.effort) > 1));
    for (let i = 0; i < joints.length; i++) {
      const j = joints[i];
      assert.equal(i % 2 ? j.positive : j.negative, 0);
      assert.ok(j.effort <= j.positive + 1e-3 && j.effort >= -j.negative - 1e-3);
    }
  } finally { body.dispose(); stand.dispose(); }
});

test("a game hosts a direct mind alongside its fighter and restores both", async () => {
  const stand = await coreStand(humanSpec("workshop-fighter"), { position: [100, 0, 0] });
  const duel = new Duel(stand.world, { left: "workshop-fighter", right: "workshop-rogue", minds: { left: config }, balance: { left: 0, right: 0 } });
  try {
    assert.equal(duel.duelists.left.minded.kind, "direct");
    assert.equal(duel.duelists.right.minded.kind, "recipe-fighter");
    assert.equal("view" in duel.duelists.left.body, false);
    stand.step(20);
    const saved = duel.save();
    stand.step(17);
    const expected = [duel.duelists.left.body.observe(), duel.duelists.right.body.observe()];
    duel.load(saved); stand.step(17);
    assert.deepEqual([duel.duelists.left.body.observe(), duel.duelists.right.body.observe()], expected);
  } finally { duel.dispose(); stand.dispose(); }
});

test("rejecting a controller leaves no orphaned control hook", async () => {
  const stand = await coreStand(humanSpec("workshop-fighter"));
  try {
    assert.throws(() => createMind(stand.built, stand.world, { ...config, targets: { missing: 1 } }, wiring), /invalid joint target/);
    assert.doesNotThrow(() => stand.step(2));
    for (const joint of stand.built.joints.values()) for (let k = 0; k < joint.dofs.length; k++) assert.ok(joint.joint.motorStepImpulse(k) === 0);
  } finally { stand.dispose(); }
});

test("extracted physical readings keep the reference controller's arithmetic and sampling", async () => {
  const stand = await coreStand(humanSpec("workshop-fighter"));
  const body = createBody(stand.built, stand.world, { servoSeconds: 0.1 });
  try {
    for (let i = 0; i < 40; i++) {
      stand.step();
      assert.deepEqual(body.physical.centre, body.view.stance.centre);
      assert.deepEqual(body.physical.head, body.view.head);
    }
    body.setLevel("limp");
    stand.step(20);
    assert.deepEqual(body.physical.centre, body.view.stance.centre);
    assert.deepEqual(body.physical.head, body.view.head);
    assert.notDeepEqual(body.observe().centre, [body.physical.centre.x, body.physical.centre.y, body.physical.centre.z]);
  } finally { body.dispose(); stand.dispose(); }
});
