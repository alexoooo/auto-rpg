import test from "node:test";
import assert from "node:assert/strict";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { modelSpec } from "../src/core/human/spec.ts";
import { woodenClub } from "../src/core/items/club.ts";
import { equipHands } from "../src/core/human/equipment.ts";
import { createMotionBody } from "../src/core/mind/motion.ts";
import { checkedMotionCommand } from "../src/core/control/tasks.ts";
import { coreStand, saveStand, loadStand } from "./harness/core-stand.mjs";

const zero = [0, 0, 0], models = ["workshop-fighter", "workshop-rogue", "crypt-skeleton"];
const posture = (model) => model.channels.map((c) => ({ channel: c.name, angle: Math.max(c.min, Math.min(c.max, 0)),
  rate: 0, acceleration: 0, seconds: 0.2, weight: 0.03 }));
const feedback = (target, weight = 1) => ({ target, velocity: zero, acceleration: zero, seconds: 0.15, weight });

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
  } finally { f.dispose(); }
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
