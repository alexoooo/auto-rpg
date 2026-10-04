import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { contactMotionRows } from "../src/core/control/contact-motion.ts";
import { freshEngine } from "./harness/core-stand.mjs";

async function capsule({ gap = 0, gravity = true, sphere = false } = {}) {
  const rendering = new NullEngine(), scene = new Scene(rendering);
  const physics = (await freshEngine()).createPhysics({ hz: 120, gravity });
  physics.addFixedBox([0, -0.5, 0], [5, 1, 5]);
  const node = new TransformNode("capsule", scene);
  node.position.set(0, 0.05 + gap, 0); node.rotationQuaternion = Quaternion.Identity();
  const body = physics.addBody(node, [sphere ? { kind: "sphere", centre: [0, 0, 0], radius: 0.05 }
    : { kind: "capsule", from: [0, 0, -0.3], to: [0, 0, 0.3], radius: 0.05 }], {
    mass: 1, centre: [0, 0, 0], moments: sphere ? [0.001, 0.001, 0.001] : [0.04, 0.04, 0.0005], orientation: Quaternion.Identity(),
  });
  return { body, physics, node, dispose() { physics.dispose(); scene.dispose(); rendering.dispose(); } };
}
const closing = (row, velocity) => row.reduce((sum, value, k) => sum + value * velocity[k], 0);

test("a flat capsule's endpoint contacts constrain tilt while retaining rolling, yaw, sliding and lift-off", async () => {
  const f = await capsule();
  try {
    f.physics.step(1 / 120);
    const manifolds = f.physics.contactManifoldsOf(f.body, (other) => other === null);
    assert.equal(manifolds.length, 1);
    const [manifold] = manifolds;
    assert.ok(manifold.points.length >= 2, "an averaged point loses the capsule's span");
    assert.ok(manifold.impulse > 0);
    assert.ok(manifold.normal[1] < -0.99);
    const span = manifold.points.map((p) => p.point[2]);
    assert.ok(Math.max(...span) - Math.min(...span) > 0.59);
    const rows = contactMotionRows(manifold, f.node.position.asArray());
    const tilt = rows.map(({ row }) => closing(row, [1, 0, 0, 0, 0, 0]));
    assert.ok(Math.min(...tilt) < -0.29 && Math.max(...tilt) > 0.29, "tilt opens one end and closes the other");
    for (const motion of [[0, 0, 1, 0, 0, 0], [0, 1, 0, 0, 0, 0], [0, 0, 0, 1, 0, 0]]) {
      // The solver's single-precision normal is within two millionths of vertical.
      assert.ok(rows.every(({ row }) => Math.abs(closing(row, motion)) < 2e-6), `normal geometry: ${JSON.stringify({ motion, rows })}`);
    }
    assert.ok(rows.every(({ row }) => closing(row, [0, 0, 0, 0, 1, 0]) < -0.99), "lifting opens both contacts");
    const reference = [0.17, 0.21, -0.13], spin = [0.2, -0.5, 0.7], velocity = [1, 2, 3];
    for (const reading of contactMotionRows(manifold, reference)) {
      const r = reading.point.map((v, k) => v - reference[k]);
      const at = [velocity[0] + spin[1] * r[2] - spin[2] * r[1],
        velocity[1] + spin[2] * r[0] - spin[0] * r[2], velocity[2] + spin[0] * r[1] - spin[1] * r[0]];
      const direct = at.reduce((sum, v, k) => sum + v * manifold.normal[k], 0);
      assert.ok(Math.abs(closing(reading.row, [...spin, ...velocity]) - direct) < 1e-12);
    }
    const before = f.physics.save();
    f.physics.step(1 / 120);
    const next = f.physics.contactManifoldsOf(f.body);
    f.physics.load(before); f.physics.step(1 / 120);
    assert.deepEqual(f.physics.contactManifoldsOf(f.body), next);
  } finally { f.dispose(); }
});

test("speculative geometry remains distinct from support and readers preserve filtering errors", async () => {
  const f = await capsule({ gap: 0.01, gravity: false });
  try {
    f.physics.step(1 / 120);
    const manifolds = f.physics.contactManifoldsOf(f.body);
    assert.equal(manifolds.length, 1);
    assert.equal(manifolds[0].impulse, 0);
    assert.ok(manifolds[0].points.every((p) => p.distance > 0.009 && p.distance < 0.011));
    assert.deepEqual(f.physics.contactManifoldsOf(f.body, () => false), []);
    const error = new Error("filter fault");
    assert.throws(() => f.physics.contactManifoldsOf(f.body, () => { throw error; }), (caught) => caught === error);
    assert.throws(() => f.physics.contactManifoldsOf(f.body, () => { f.physics.contactsOf(f.body); return true; }), /contacts are read/);
    assert.throws(() => f.physics.contactsOf(f.body, () => { f.physics.contactManifoldsOf(f.body); return true; }), /contacts are read/);
    assert.deepEqual(f.physics.contactManifoldsOf(f.body), manifolds, "a failed read leaves the next read usable");
    manifolds[0].points[0].point[0] = 999;
    assert.notEqual(f.physics.contactManifoldsOf(f.body)[0].points[0].point[0], 999, "reading cannot mutate the solver");
  } finally { f.dispose(); }
});

test("dynamic contact manifolds retain body identity and opposite normal conventions", async () => {
  const f = await capsule();
  try {
    const node = new TransformNode("upper", f.node.getScene());
    node.position.set(0, 0.15, 0); node.rotationQuaternion = Quaternion.Identity();
    const upper = f.physics.addBody(node, [{ kind: "capsule", from: [0, 0, -0.3], to: [0, 0, 0.3], radius: 0.05 }], {
      mass: 1, centre: [0, 0, 0], moments: [0.04, 0.04, 0.0005], orientation: Quaternion.Identity(),
    });
    f.physics.step(1 / 120);
    const lowerRead = f.physics.contactManifoldsOf(f.body, (other) => other === upper);
    const upperRead = f.physics.contactManifoldsOf(upper, (other) => other === f.body);
    assert.equal(lowerRead.length, 1); assert.equal(upperRead.length, 1);
    assert.equal(lowerRead[0].other, upper); assert.equal(upperRead[0].other, f.body);
    assert.equal(lowerRead[0].fixed, null); assert.equal(upperRead[0].fixed, null);
    assert.ok(lowerRead[0].normal[1] > 0.99 && upperRead[0].normal[1] < -0.99);
    assert.deepEqual(lowerRead[0].points, upperRead[0].points);
    assert.equal(lowerRead[0].impulse, upperRead[0].impulse);
    assert.ok(lowerRead[0].impulse > 0);
  } finally { f.dispose(); }
});

test("solver contact gaps follow current motion through settling and lift-off", async () => {
  const f = await capsule({ gap: 0.01, sphere: true });
  try {
    let readings = 0;
    let lifted = false;
    for (let step = 0; step < 130; step++) {
      if (step === 120) f.body.applyImpulse(new Vector3(0, 0.1, 0), f.node.position);
      f.physics.step(1 / 120);
      for (const manifold of f.physics.contactManifoldsOf(f.body)) for (const point of manifold.points) {
        const gap = f.node.position.y - 0.05;
        assert.ok(Math.abs(point.distance - gap) < 2e-6,
          `step ${step}: reported gap ${point.distance}, current surface height ${gap}`);
        readings++;
        if (step > 120 && point.distance > 0) lifted = true;
      }
    }
    assert.ok(readings > 100);
    assert.ok(lifted, "a retained contact reports separation while lifting");
  } finally { f.dispose(); }
});
