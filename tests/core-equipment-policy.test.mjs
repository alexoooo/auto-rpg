import test from "node:test";
import assert from "node:assert/strict";
import { createEquipment } from "../src/core/equipment.ts";
import { woodenClub } from "../src/core/items/club.ts";
import { modelSpec } from "../src/core/human/spec.ts";
import { equipmentPort } from "../src/core/mind/equipment-port.ts";
import { checkedBodyAction } from "../src/core/mind/body-actions.ts";
import { createPolicyBody } from "../src/core/mind/direct.ts";
import { coreStand, saveStand, loadStand } from "./harness/core-stand.mjs";

const identity = [0, 0, 0, 1];
const frame = (position, rotation = identity) => ({ position, rotation });

async function fixture() {
  const stand = await coreStand(modelSpec("workshop-fighter"), { gravity: false, ground: false, pinned: "lowerTrunk", actuation: "directional" });
  const right = stand.built.segments.get("hand.right").body, left = stand.built.segments.get("hand.left").body;
  const definition = { id: "club", item: woodenClub(), pose: frame(right.node.position.asArray(), right.node.rotationQuaternion.asArray()),
    capture: { distance: 0.002, rotationError: 0.00001 },
    grips: [
      { name: "right", body: right, bodyFrame: frame([0, 0, 0]), itemFrame: frame([0, 0, 0]) },
      { name: "left", body: left, bodyFrame: frame([0, 0, 0]), itemFrame: frame([0, 0.1, 0]) },
    ] };
  const item = createEquipment(stand.world, definition);
  const port = equipmentPort([{ item, grip: "right" }]);
  return { stand, item, port, definition, dispose() { item.dispose(); stand.dispose(); } };
}

test("a detached policy commands a granted grip, observes the result and replays release with its own memory", async () => {
  const f = await fixture();
  let description, seen;
  const options = { equipment: f.port };
  const body = createPolicyBody(f.stand.built, f.stand.world, (model) => {
    description = model;
    const state = { steps: 0 }, torque = model.channels.map(() => 0);
    return { name: "grip-policy", state, step(observation) {
      seen = observation;
      return { kind: "body", actuators: { kind: "torque", torque },
        grips: [{ item: "club", grip: "right", attached: state.steps++ === 0 }] };
    } };
  }, options);
  // Configuration is captured during construction, not read from a mutable options object each step.
  options.equipment = equipmentPort([]);
  try {
    assert.deepEqual(description.equipment.map((i) => [i.id, i.grips.map((g) => g.name)]), [["club", ["right"]]]);
    assert.equal("body" in description.equipment[0], false);
    assert.equal("node" in description.equipment[0], false);
    assert.throws(() => { description.equipment[0].grips[0].itemFrame.position[0] = 2; }, TypeError);
    const saved = saveStand(f.stand.world, { body: body.state });
    f.stand.step();
    assert.equal(seen.equipment[0].grips[0].attached, false, "policy reads before its command");
    assert.equal(body.observe().equipment[0].grips[0].attached, true);
    const initialObservation = seen, frozen = JSON.stringify(seen);
    f.stand.step();
    assert.equal(body.observe().equipment[0].grips[0].attached, false);
    const branch = body.observe();
    loadStand(f.stand.world, { body: body.state }, saved);
    f.stand.step(2);
    assert.deepEqual(body.observe(), branch);
    assert.equal(body.state.mind.steps, 2);
    assert.equal(JSON.stringify(initialObservation), frozen, "earlier equipment observations remain detached");
    assert.notEqual(JSON.stringify(seen), frozen, "a later observation reflects the earlier capture");
    body.setLevel("limp"); f.stand.step();
    assert.equal(body.state.mind.steps, 2, "idle does not execute equipment requests");
  } finally { body.dispose(); f.dispose(); }
});

test("one invalid grip rejects a whole policy action before either muscles or other grips change", async () => {
  const f = await fixture();
  assert.equal(f.item.tryGrip("right"), true);
  const body = createPolicyBody(f.stand.built, f.stand.world, (model) => ({ name: "invalid-grip-policy", state: {},
    step: () => ({ kind: "body", actuators: { kind: "velocity", activation: model.channels.map(() => 1), velocity: model.channels.map(() => 3) },
      grips: [{ item: "club", grip: "right", attached: false }, { item: "club", grip: "left", attached: true }] }),
  }), { equipment: f.port });
  try {
    const activation = [...body.muscles.activation], velocity = [...body.muscles.velocity], pose = f.item.observe();
    assert.throws(() => f.stand.step(), /not a granted grip/);
    assert.deepEqual([...body.muscles.activation], activation);
    assert.deepEqual([...body.muscles.velocity], velocity);
    assert.deepEqual(f.item.observe(), pose);
    assert.equal(f.stand.world.steps, 0);
  } finally { body.dispose(); f.dispose(); }
});

test("equipment validation copies requests and rejects sparse, duplicate, unknown and ungranted actions", async () => {
  const f = await fixture();
  try {
    const command = { kind: "body", actuators: { kind: "torque", torque: [0] }, grips: [{ item: "club", grip: "right", attached: true }] };
    const checked = checkedBodyAction(command, 1, f.port);
    command.grips[0].attached = false; command.actuators.torque[0] = 3;
    assert.equal(checked.grips[0].attached, true); assert.equal(checked.actuators.torque[0], 0);
    assert.throws(() => { checked.grips[0].attached = false; }, TypeError);
    assert.throws(() => checkedBodyAction(command, 1), /no equipment/);
    for (const grips of [Array(1), [{ item: "other", grip: "right", attached: true }], [{ item: "club", grip: "right", attached: 1 }]]) {
      assert.throws(() => checkedBodyAction({ ...command, grips }, 1, f.port), /granted grip/);
    }
    assert.throws(() => checkedBodyAction({ ...command, grips: [command.grips[0], command.grips[0]] }, 1, f.port), /duplicate/);
    assert.throws(() => equipmentPort([{ item: f.item, grip: "missing" }]), /unknown equipment grip/);
    assert.throws(() => equipmentPort([{ item: f.item, grip: "right" }, { item: f.item, grip: "right" }]), /duplicate/);
    const duplicate = createEquipment(f.stand.world, f.definition);
    try { assert.throws(() => equipmentPort([{ item: f.item, grip: "right" }, { item: duplicate, grip: "left" }]), /duplicate item identity/); }
    finally { duplicate.dispose(); }
    const unreachable = equipmentPort([{ item: f.item, grip: "left" }]);
    unreachable.apply(unreachable.check([{ item: "club", grip: "left", attached: true }]));
    assert.equal(unreachable.observe()[0].grips[0].attached, false, "permission does not override geometric reachability");
  } finally { f.dispose(); }
});

test("one policy controls independent left and right items on each body model", async () => {
  for (const model of ["workshop-fighter", "workshop-rogue", "crypt-skeleton"]) {
    const stand = await coreStand(modelSpec(model), { gravity: false, ground: false, pinned: "lowerTrunk", actuation: "directional" });
    const items = ["left", "right"].map((side) => {
      const hand = stand.built.segments.get(`hand.${side}`).body;
      return createEquipment(stand.world, { id: side, item: woodenClub(), pose: frame(hand.node.position.asArray(), hand.node.rotationQuaternion.asArray()),
        capture: { distance: 0.002, rotationError: 0.00001 },
        grips: [{ name: "primary", body: hand, bodyFrame: frame([0, 0, 0]), itemFrame: frame([0, 0, 0]) }] });
    });
    const equipment = equipmentPort(items.map((item) => ({ item, grip: "primary" })));
    const body = createPolicyBody(stand.built, stand.world, (description) => {
      const state = { steps: 0 }, torque = description.channels.map(() => 0);
      return { name: "two-item-policy", state, step() {
        const first = state.steps++ === 0;
        return { kind: "body", actuators: { kind: "torque", torque },
          grips: [{ item: "left", grip: "primary", attached: first }, { item: "right", grip: "primary", attached: true }] };
      } };
    }, { equipment });
    try {
      stand.step();
      assert.deepEqual(body.observe().equipment.map((i) => [i.id, i.grips[0].attached]), [["left", true], ["right", true]]);
      const saved = saveStand(stand.world, { body: body.state });
      stand.step();
      const branch = body.observe();
      assert.deepEqual(branch.equipment.map((i) => [i.id, i.grips[0].attached]), [["left", false], ["right", true]]);
      loadStand(stand.world, { body: body.state }, saved); stand.step();
      assert.deepEqual(body.observe(), branch);
      assert.ok(Math.abs(items.reduce((sum, i) => sum + i.body.engineMass(), 0) - 2 * woodenClub().mass.value) < 1e-6);
    } finally { body.dispose(); for (const item of items) item.dispose(); stand.dispose(); }
  }
});
