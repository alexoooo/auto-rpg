import test from "node:test";
import assert from "node:assert/strict";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { modelSpec } from "../src/core/models.ts";
import { woodenClub } from "../src/core/items/club.ts";
import { equipHands } from "../src/core/human/equipment.ts";
import { createMotionBody } from "../src/core/mind/motion.ts";
import { checkedMotionCommand } from "../src/core/control/tasks.ts";
import { buildBody } from "../src/core/build/build-body.ts";
import { coupledDynamics } from "../src/core/build/coupled-dynamics.ts";
import { createSenses } from "../src/core/mind/senses.ts";
import { coreStand, saveStand, loadStand } from "./harness/core-stand.mjs";

const zero = [0, 0, 0], models = ["workshop-fighter", "workshop-rogue", "crypt-skeleton"];
const posture = (model) => model.channels.map((c) => ({ channel: c.name, angle: Math.max(c.min, Math.min(c.max, 0)),
  rate: 0, acceleration: 0, seconds: 0.2, weight: 0.03 }));
const feedback = (target, weight = 1) => ({ target, velocity: zero, acceleration: zero, seconds: 0.15, weight });

test("motion policies act on detached delayed senses and replay the observed target", async () => {
  const stand = await coreStand(modelSpec(models[0]), { pinned: "lowerTrunk", actuation: "directional" });
  const second = buildBody(modelSpec(models[1]), stand.world, { position: [2, 0, 0] });
  const hub = createSenses(stand.world, 3);
  const senses = hub.add({ id: "self", side: "a", built: stand.built, out: () => false });
  hub.add({ id: "target", side: "b", built: second, out: () => false });
  const state = { seen: null, targets: [] };
  const body = createMotionBody(stand.built, stand.world, (model) => ({ name: "sensed-motion", state,
    step(observation) {
      const target = observation.senses.others[0];
      assert.equal(target.id, "target");
      assert.equal(target.model, second.spec.model);
      assert.throws(() => { target.centre[1] = 99; }, TypeError);
      const position = [0.3, target.centre[1] + 0.2, 0.3];
      state.seen = observation.senses; state.targets.push(position);
      return { joints: posture(model), frames: [{ id: "track", frame: { kind: "segment", name: "hand.right" },
        at: zero, translation: feedback(position) }], grips: [] };
    },
  }), { items: [], grants: [], fixed: [stand.built.segments.get("lowerTrunk").body], capacity: 1, effortCost: 1e-6, senses });
  try {
    stand.step(8);
    const states = { body: body.state, senses: hub.state }, saved = saveStand(stand.world, states);
    const branch = () => { stand.step(24); return { observation: body.observe(), state: saveStand(stand.world, states).state }; };
    const first = branch();
    assert.notDeepEqual(state.targets[0], state.targets.at(-1), "the falling target changes the requested hand path");
    assert.ok(body.muscles.activation.some((v) => v > 0));
    loadStand(stand.world, states, saved); hub.show();
    assert.deepEqual(branch(), first);
  } finally { body.dispose(); hub.dispose(); second.dispose(); stand.dispose(); }
});

async function fixture(name) {
  const stand = await coreStand(modelSpec(name), { ground: false, pinned: "lowerTrunk", actuation: "directional" });
  const items = ["left", "right"].map((side) => equipHands(stand.world, stand.built, {
    id: side, item: woodenClub(), primary: side, grips: [{ side, at: zero }],
    capture: { distance: 0.002, rotationError: 0.00001 }, ccd: true,
  }));
  const goals = items.map((item, k) => ({ id: item.id, frame: { kind: "item", id: item.id }, at: zero,
    translation: feedback(item.node.position.add(new Vector3(0, 0.08, 0.08)).asArray()),
    orientation: feedback(Quaternion.RotationAxis(Vector3.Up(), k === 0 ? -0.1 : 0.1).multiply(item.node.rotationQuaternion).asArray(), 0.2),
  }));
  let command, description;
  const policyState = { steps: 0, idles: 0 };
  const body = createMotionBody(stand.built, stand.world, (model) => {
    description = model;
    command = checkedMotionCommand({ joints: posture(model), frames: goals, grips: [] }, model);
    return { name: "two-item-tracking", state: policyState, idle() { policyState.idles++; }, step() { policyState.steps++; return command; } };
  }, { items, grants: items.map((item) => ({ item, grip: item.id })), fixed: [stand.built.segments.get("lowerTrunk").body], capacity: 4, effortCost: 1e-6 });
  return { stand, items, goals, body, description, policyState,
    setCommand(next) { command = next; }, command: () => command,
    dispose() { body.dispose(); for (const item of items) item.dispose(); stand.dispose(); } };
}

test("one motion owner tracks two independently held items on every anatomy with bounded muscles", async (t) => {
  const rows = [];
  for (const name of models) {
    const f = await fixture(name);
    try {
      f.stand.step(360);
      const errors = f.items.map((item, k) => Vector3.Distance(item.node.position, new Vector3(...f.goals[k].translation.target)));
      errors.forEach((error) => assert.ok(error < 0.005, `${name}: ${error}`));
      assert.ok(f.body.muscles.activation.every((v) => v >= 0 && v <= 1));
      for (const item of f.items) assert.ok(item.observe().grips[0].distance < 0.002);
      assert.equal(f.body.assist.meter.force, 0);
      assert.equal(f.body.assist.meter.moment, 0);
      rows.push({ name, errors });
    } finally { f.dispose(); }
  }
  t.diagnostic(JSON.stringify(rows));
});

test("motion policy state, item dynamics and reports replay across an idle interval", async () => {
  const f = await fixture(models[0]);
  try {
    f.stand.step(80);
    const states = { body: f.body.state }, saved = saveStand(f.stand.world, states);
    const branch = () => {
      f.body.setLevel("limp"); f.stand.step(4); f.body.setLevel("full"); f.stand.step(40);
      return { observation: f.body.observe(), state: saveStand(f.stand.world, states).state };
    };
    const first = branch(); loadStand(f.stand.world, states, saved); assert.deepEqual(branch(), first);
    assert.equal(f.policyState.idles, 1);
  } finally { f.dispose(); }
});

test("invalid motion requests cannot release a grip before validation finishes", async () => {
  const f = await fixture(models[0]);
  try {
    assert.throws(() => { f.description.frames[0].name = "changed"; }, TypeError);
    const command = f.command(), before = f.stand.world.physics.save();
    f.setCommand({ ...command, frames: [{ ...command.frames[0], translation: feedback([NaN, 0, 0]) }],
      grips: [{ item: "left", grip: "left", attached: false }] });
    assert.throws(() => f.stand.step(), /invalid motion vector/);
    assert.equal(f.items[0].observe().grips[0].attached, true);
    assert.deepEqual(f.stand.world.physics.save(), before);
    f.setCommand({ ...command, supports: [{ frame: { kind: "segment", name: "unknown" }, mode: "free" }],
      grips: [{ item: "left", grip: "left", attached: false }] });
    assert.throws(() => f.stand.step(), /invalid support request/);
    assert.equal(f.items[0].observe().grips[0].attached, true);
    assert.deepEqual(f.stand.world.physics.save(), before);
    const twice = { ...command, frames: [command.frames[0], { ...command.frames[0], id: "another-point", at: [0, 0.2, 0] }] };
    assert.equal(checkedMotionCommand(twice, f.description).frames.length, 2, "multiple objectives may address the same frame");
    for (const centres of [
      [{ id: "centre", frames: [{ kind: "segment", name: "absent" }], translation: feedback(zero) }],
      [{ id: "centre", frames: [command.frames[0].frame, command.frames[0].frame], translation: feedback(zero) }],
      [{ id: command.frames[0].id, frames: [command.frames[0].frame], translation: feedback(zero) }],
      [{ id: "centre", frames: [command.frames[0].frame], translation: { ...feedback(zero), axes: ["x", "x"] } }],
    ]) {
      f.setCommand({ ...command, centres, grips: [{ item: "left", grip: "left", attached: false }] });
      assert.throws(() => f.stand.step(), /invalid motion/);
      assert.equal(f.items[0].observe().grips[0].attached, true);
      assert.deepEqual(f.stand.world.physics.save(), before);
    }
  } finally { f.dispose(); }
});

test("a centre objective tracks unequal physical masses on selected axes and replays", async () => {
  const f = await fixture(models[0]);
  const members = [f.stand.built.segments.get("hand.left").body, f.items[0].body];
  const centre = () => {
    const sum = new Vector3(), total = members.reduce((s, b) => s + b.massProperties.mass, 0);
    for (const b of members) sum.addInPlace(new Vector3(...b.massProperties.centre).applyRotationQuaternion(b.node.rotationQuaternion).addInPlace(b.node.position).scale(b.massProperties.mass / total));
    return sum.asArray();
  };
  try {
    assert.notEqual(members[0].massProperties.mass, members[1].massProperties.mass);
    const target = [centre()[0] - 0.04, 1000, -1000];
    const goal = { id: "loaded-hand", frames: [{ kind: "segment", name: "hand.left" }, { kind: "item", id: "left" }],
      translation: { ...feedback(target), axes: ["x"] } };
    const command = checkedMotionCommand({ joints: posture(f.description), frames: [], centres: [goal], grips: [] }, f.description);
    goal.frames[0].name = "absent"; goal.translation.axes[0] = "z"; target[0] = 99;
    f.setCommand(command); f.stand.step(240);
    assert.ok(Math.abs(centre()[0] - command.centres[0].translation.target[0]) < 0.005);
    assert.ok(Math.abs(centre()[1]) < 10 && Math.abs(centre()[2]) < 10, "unselected axes do not chase the distant targets");
    assert.ok(f.body.report().errors.find((e) => e.id === "loaded-hand").position < 0.005);
    assert.equal(f.body.assist.meter.force, 0); assert.equal(f.body.assist.meter.moment, 0);
    const states = { body: f.body.state }, saved = saveStand(f.stand.world, states);
    const branch = () => { f.stand.step(60); return { observation: f.body.observe(), state: saveStand(f.stand.world, states).state }; };
    const expected = branch(); loadStand(f.stand.world, states, saved); assert.deepEqual(branch(), expected);
  } finally { f.dispose(); }
});

test("a whole free body's centre goal remains unreachable without external thrust", async () => {
  const stand = await coreStand(modelSpec(models[0]), { ground: false, gravity: false, actuation: "directional" });
  const state = { target: null };
  const body = createMotionBody(stand.built, stand.world, (model) => ({ name: "unreachable-centre", state, step(observation) {
    state.target ??= observation.centre.map((v) => v + 1);
    return { joints: [], frames: [], grips: [], centres: [{ id: "whole", frames: model.frames, translation: feedback(state.target) }] };
  } }), { items: [], grants: [], fixed: [], capacity: 1, effortCost: 1e-6 });
  try {
    const dynamics = coupledDynamics(stand.built, zero), members = [...stand.built.segments.values()].map((s) => s.body);
    const mass = members.reduce((sum, b) => sum + b.massProperties.mass, 0);
    const before = body.observe().centre;
    for (let step = 0; step < 20; step++) {
      dynamics.update();
      const torque = Array(dynamics.channels).fill(0), base = dynamics.solve(torque);
      for (let axis = 0; axis < 3; axis++) {
        const row = dynamics.motionRow(members.map((b) => ({ body: b,
          point: new Vector3(...b.massProperties.centre).applyRotationQuaternion(b.node.rotationQuaternion).addInPlace(b.node.position).asArray(),
          linear: [0, 1, 2].map((k) => k === axis ? b.massProperties.mass / mass : 0), angular: zero })));
        for (let i = 0; i < torque.length; i++) {
          torque[i] = 1; const acceleration = dynamics.solve(torque); torque[i] = 0;
          const response = row.coefficients.reduce((sum, v, k) => sum + v * (acceleration[k] - base[k]), 0);
          assert.ok(Math.abs(response) < 1e-12, `internal torque ${i}, axis ${axis}: ${response}`);
        }
      }
      stand.step();
    }
    const after = body.observe().centre;
    assert.ok(after.every((v, k) => Math.abs(v - before[k]) < 1e-5), JSON.stringify({ before, after }));
    assert.ok(Math.abs(body.report().errors[0].position - Math.sqrt(3)) < 1e-5);
    assert.equal(body.assist.meter.force, 0); assert.equal(body.assist.meter.moment, 0);
  } finally { body.dispose(); stand.dispose(); }
});

test("an unreachable frame objective remains a bounded measured miss", async () => {
  const f = await fixture(models[0]);
  try {
    const command = f.command(), item = f.items[0];
    const target = item.node.position.add(new Vector3(0, 0, 5));
    f.setCommand({ ...command, frames: [{ id: "unreachable", frame: { kind: "item", id: item.id }, at: zero, translation: feedback(target.asArray()) }] });
    f.stand.step(240);
    assert.ok(Vector3.Distance(item.node.position, target) > 3);
    assert.ok(f.body.muscles.activation.every((v) => Number.isFinite(v) && v >= 0 && v <= 1));
    assert.ok(f.body.observe().segments.every((s) => [...s.position, ...s.velocity, ...s.spin].every(Number.isFinite)));
    const report = f.body.state.mind.tracking;
    assert.ok(report.residual > 1);
    assert.ok(report.errors[0].position > 3);
    assert.equal(report.errors[0].orientation, null, "position-only goals add no orientation demand");
  } finally { f.dispose(); }
});
