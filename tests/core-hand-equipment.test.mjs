import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { modelSpec as humanSpec } from "../src/core/human/spec.ts";
import { armed } from "../src/core/human/grip.ts";
import { equipHands } from "../src/core/human/equipment.ts";
import { heldPoint } from "../src/core/build/rigid.ts";
import { woodenClub } from "../src/core/items/club.ts";
import { createDirectBody } from "../src/core/mind/direct.ts";
import { coreStand, saveStand, loadStand } from "./harness/core-stand.mjs";

const definition = (side) => ({ id: `club.${side}`, item: woodenClub(), primary: side,
  grips: [{ side, at: [0, 0, 0] }, { side: side === "left" ? "right" : "left", at: [0, 0.1, 0] }],
  capture: { distance: 0.002, rotationError: 0.00001 }, ccd: true });

test("separate equipment uses either anatomical grasp without duplicating mass or moving the other hand", async () => {
  for (const model of ["workshop-fighter", "workshop-rogue", "crypt-skeleton"]) for (const side of ["left", "right"]) {
    const spec = humanSpec(model), stand = await coreStand(spec, { gravity: false, ground: false });
    let item;
    try {
      const before = [...stand.built.segments.values()].map((s) => [s.node.position.asArray(), s.node.rotationQuaternion.asArray()]);
      item = equipHands(stand.world, stand.built, definition(side));
      assert.deepEqual([...stand.built.segments.values()].map((s) => [s.node.position.asArray(), s.node.rotationQuaternion.asArray()]), before);
      const tip = new Vector3(...item.spec.points.swellTo.value);
      tip.applyRotationQuaternionToRef(item.node.rotationQuaternion, tip).addInPlace(item.node.position);
      const expected = heldPoint(armed(spec, side, item.spec).held[0], item.spec.points.swellTo).value;
      assert.ok(Vector3.Distance(tip, new Vector3(...expected)) < 1e-7, `${model}/${side}: anatomical tip ${tip.asArray()} vs ${expected}`);
      const mass = [...stand.built.segments.values()].reduce((sum, s) => sum + s.body.engineMass(), 0) + item.body.engineMass();
      const expectedMass = spec.segments.reduce((sum, s) => sum + s.mass.value, 0) + item.spec.mass.value;
      assert.ok(Math.abs(mass - expectedMass) < 1e-5);
      const other = side === "left" ? "right" : "left";
      assert.equal(item.tryGrip(other), false, "the second hand must physically reach the item");
      assert.deepEqual(item.observe().grips.map((g) => g.attached), [true, false]);
      stand.step(5);
      assert.ok(item.observe().grips[0].distance < 0.002);
      const saved = saveStand(stand.world, {});
      const branch = () => {
        const velocity = item.body.linearVelocityToRef(new Vector3()).asArray();
        const spin = item.body.angularVelocityToRef(new Vector3()).asArray();
        item.release(side);
        assert.deepEqual(item.body.linearVelocityToRef(new Vector3()).asArray(), velocity);
        assert.deepEqual(item.body.angularVelocityToRef(new Vector3()).asArray(), spin);
        stand.step(10);
        return item.observe();
      };
      const first = branch(); loadStand(stand.world, {}, saved); assert.deepEqual(branch(), first);
    } finally { item?.dispose(); stand.dispose(); }
  }
});

test("initial hand placement rejects compound equipment and construction after stepping", async () => {
  const spec = humanSpec("workshop-fighter");
  for (const compound of [false, true]) {
    const stand = await coreStand(compound ? armed(spec, "right", woodenClub()) : spec, { gravity: false, ground: false });
    try {
      if (!compound) stand.step();
      const nodes = stand.scene.transformNodes.length;
      assert.throws(() => equipHands(stand.world, stand.built, definition("right")), compound ? /compound equipment/ : /initial world/);
      assert.equal(stand.scene.transformNodes.length, nodes);
    } finally { stand.dispose(); }
  }
});

test("independent actuator feedback moves two anatomical items against gravity", async () => {
  for (const model of ["workshop-fighter", "workshop-rogue", "crypt-skeleton"]) {
    const stand = await coreStand(humanSpec(model), { ground: false, pinned: "lowerTrunk", actuation: "directional" });
    const items = ["left", "right"].map((side) => equipHands(stand.world, stand.built, definition(side)));
    const body = createDirectBody(stand.built, stand.world, { kind: "direct", seconds: 0.05, speed: 3, activation: 1,
      targets: { "elbow.left flexion": 0.6, "elbow.right flexion": 0.4 } });
    try {
      const start = items.map((item) => item.observe().position);
      stand.step(240);
      const joints = body.observe().joints;
      for (const [side, target] of [["left", 0.6], ["right", 0.4]]) {
        const reading = joints.find((j) => j.name === `elbow.${side} flexion`);
        assert.ok(Math.abs(reading.angle - target) < 0.025, `${model}/${side}: ${reading.angle}`);
      }
      for (let i = 0; i < items.length; i++) {
        const reading = items[i].observe();
        assert.ok(Vector3.Distance(new Vector3(...start[i]), new Vector3(...reading.position)) > 0.1);
        assert.ok(reading.grips[0].distance < 0.002, `${model}: ${JSON.stringify(reading.grips)}`);
      }
      stand.step(120);
      for (const [side, target] of [["left", 0.6], ["right", 0.4]]) {
        const reading = body.observe().joints.find((j) => j.name === `elbow.${side} flexion`);
        assert.ok(Math.abs(reading.angle - target) < 0.025);
      }
    } finally { body.dispose(); for (const item of items) item.dispose(); stand.dispose(); }
  }
});
