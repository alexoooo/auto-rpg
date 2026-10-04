import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { constrainedMass, attachmentRows } from "../src/core/build/constrained-mass.ts";
import { articulatedMass } from "../src/core/build/articulated-mass.ts";
import { contactMass } from "../src/core/build/contact-mass.ts";
import { modelSpec } from "../src/core/human/spec.ts";
import { armed } from "../src/core/human/grip.ts";
import { woodenClub } from "../src/core/items/club.ts";
import { createEquipment } from "../src/core/equipment.ts";
import { createWorld } from "../src/core/world.ts";
import { coreStand, freshEngine, saveStand, loadStand } from "./harness/core-stand.mjs";

const close = (a, b, tolerance, label) => assert.ok(Math.abs(a - b) < tolerance, `${label}: ${a} vs ${b}`);
const frame = (position) => ({ position, rotation: [0, 0, 0, 1] });

test("maximal constraint mobility agrees with the floating tree model for every segment of three anatomies", async () => {
  for (const model of ["workshop-fighter", "workshop-rogue", "crypt-skeleton"]) {
    const stand = await coreStand(armed(modelSpec(model), "right", woodenClub()), { gravity: false, ground: false });
    try {
      const tree = contactMass(stand.built), constraints = articulatedMass(stand.built);
      for (const posed of [false, true]) {
        if (posed) {
          // Read the freely moving body's nonreference frames without assuming a prescribed pose.
          stand.built.segments.get("hand.right").body.applyTorqueImpulse(new Vector3(0.003, 0.002, -0.004));
          stand.step(12);
        }
        tree.update(); constraints.update();
        const channels = [...stand.built.joints.values()].reduce((sum, j) => sum + j.dofs.length, 0);
        assert.equal(constraints.report().freedoms, 6 + channels);
        for (const segment of stand.built.segments.values()) {
          const at = segment.node.position.add(new Vector3(0.04, 0.06, -0.03)).asArray();
          const a = tree.mobility(segment, at), b = constraints.mobility(segment.body, at);
          for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
            close(a[r][c], b[r][c], (posed ? 1e-5 : 1e-7) * (1 + Math.abs(a[r][c])), `${model}/${segment.spec.name}/${posed}/${r}/${c}`);
          }
          close(tree.along(segment, at, [1, 2, -3]), constraints.along(segment.body, at, [1, 2, -3]), (posed ? 1e-5 : 1e-7) * tree.along(segment, at, [1, 2, -3]), "directional mass");
        }
      }
    } finally { stand.dispose(); }
  }
});

async function loop(hz = 3840) {
  const rendering = new NullEngine(), scene = new Scene(rendering);
  const world = createWorld(scene, await freshEngine(), { hz, gravity: false, actuation: "directional" });
  const holder = (name, at) => {
    const node = new TransformNode(name, scene); node.position.set(...at); node.rotationQuaternion = Quaternion.Identity();
    return world.physics.addBody(node, [], { mass: 1, centre: [0, 0, 0], moments: [0.001, 0.001, 0.001], orientation: Quaternion.Identity() });
  };
  const left = holder("left", [-0.1, 1, 0]), right = holder("right", [0.1, 1.2, 0]);
  world.physics.addJoint(left, right, { anchorParent: [0.1, 0.1, 0], anchorChild: [-0.1, -0.1, 0],
    frameParent: Quaternion.Identity(), frameChild: Quaternion.Identity(), limits: [[-1, 1], [-1, 1], [-1, 1]] });
  const item = createEquipment(world, { id: "shared", item: woodenClub(), pose: frame([0, 0.9, 0]), capture: { distance: 0.002, rotationError: 0.00001 },
    grips: [
      { name: "left", body: left, bodyFrame: frame([0.1, 0, 0]), itemFrame: frame([0, 0.1, 0]) },
      { name: "right", body: right, bodyFrame: frame([-0.1, 0, 0]), itemFrame: frame([0, 0.3, 0]) },
    ] });
  item.tryGrip("left"); item.tryGrip("right");
  const anchors = () => {
    const a = new Vector3(0.1, 0.1, 0), b = new Vector3(-0.1, -0.1, 0);
    a.applyRotationQuaternionToRef(left.node.rotationQuaternion, a).addInPlace(left.node.position);
    b.applyRotationQuaternionToRef(right.node.rotationQuaternion, b).addInPlace(right.node.position);
    return attachmentRows(left, right, a.asArray(), b.asArray(), false);
  };
  const bodies = [left, right, item.body], mass = constrainedMass(bodies, () => [...anchors(), ...item.motionConstraints()]);
  return { world, item, bodies, mass, anchors, dispose() { item.dispose(); world.dispose(); scene.dispose(); rendering.dispose(); } };
}

function pointVelocity(body, at) {
  const centre = new Vector3(...body.massProperties.centre);
  centre.applyRotationQuaternionToRef(body.node.rotationQuaternion, centre).addInPlace(body.node.position);
  const r = new Vector3(...at).subtract(centre);
  return body.linearVelocityToRef(new Vector3()).add(Vector3.Cross(body.angularVelocityToRef(new Vector3()), r)).asArray();
}

test("closed-loop mass predicts the item's impulse response with both grips and after either release", async (t) => {
  const records = [];
  for (const release of [null, "left", "right", "both"]) {
    const f = await loop();
    try {
      if (release) for (const side of release === "both" ? ["left", "right"] : [release]) f.item.release(side);
      f.mass.update();
      assert.equal(f.mass.report().rank, release === null ? 12 : release === "both" ? 3 : 9);
      const at = [0.05, 1.4, 0.08], impulse = [0.04, 0.08, 0.1], K = f.mass.mobility(f.item.body, at);
      const prediction = K.map((row) => row.reduce((sum, v, k) => sum + v * impulse[k], 0));
      const snapshot = saveStand(f.world, {});
      const push = () => {
        f.item.body.applyImpulse(new Vector3(...impulse), new Vector3(...at)); f.world.step(3);
        return pointVelocity(f.item.body, at);
      };
      const measured = push(), size = Math.hypot(...prediction);
      for (let k = 0; k < 3; k++) close(measured[k], prediction[k], 0.015 * size, `${release}/${k}`);
      records.push({ release, predicted: prediction, measured, mass: f.mass.along(f.item.body, at, impulse) });
      loadStand(f.world, {}, snapshot); assert.deepEqual(push(), measured);
      // Mobility is a frozen pose until update, even while the engine moves on.
      assert.deepEqual(f.mass.mobility(f.item.body, at), K);
    } finally { f.dispose(); }
  }
  t.diagnostic(JSON.stringify(records));
  assert.ok(records[0].mass > records[1].mass * 1.01);
  assert.ok(records[0].mass > records[2].mass * 1.01);
  assert.ok(records[3].mass < Math.min(records[1].mass, records[2].mass));
});

test("redundant constraints do not add mass, and release and restore update the model's topology", async () => {
  const f = await loop(120);
  try {
    const at = [0, 1.4, 0], duplicated = constrainedMass(f.bodies, () => [...f.anchors(), ...f.item.motionConstraints(), ...f.item.motionConstraints()]);
    assert.throws(() => f.mass.along(f.item.body, at, [1, 0, 0]), /update/);
    f.mass.update(); duplicated.update();
    const initial = f.mass.mobility(f.item.body, at), snapshot = saveStand(f.world, {});
    assert.equal(duplicated.report().rank, f.mass.report().rank);
    const copy = duplicated.mobility(f.item.body, at);
    initial.flat().forEach((v, i) => close(v, copy.flat()[i], 1e-12, "redundant row"));
    f.item.release("left"); f.mass.update();
    assert.notDeepEqual(f.mass.mobility(f.item.body, at), initial);
    loadStand(f.world, {}, snapshot); f.mass.update(); assert.deepEqual(f.mass.mobility(f.item.body, at), initial);
    assert.throws(() => constrainedMass([f.item.body, f.item.body], () => []), /duplicate/);
    assert.throws(() => f.mass.along(f.item.body, at, [0, 0, 0]), /nonzero/);
    assert.throws(() => f.mass.along({}, at, [1, 0, 0]), /unregistered/);
    assert.throws(() => f.mass.mobility(f.item.body, [NaN, 0, 0]), /nonfinite/);
  } finally { f.dispose(); }
});
