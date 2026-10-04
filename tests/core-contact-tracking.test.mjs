import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { Quaternion } from "@babylonjs/core/Maths/math.vector.js";
import { contactTracking } from "../src/core/control/contact-tracking.ts";
import { freshEngine } from "./harness/core-stand.mjs";

const settings = { maxPoints: 4, gap: 0.005, minUpNormal: 0.9, forceTolerance: 1e-5,
  iterations: 2048, absoluteTolerance: 1e-7, relativeTolerance: 1e-6 };
const command = { joints: [], frames: [], grips: [] };
async function fixture() {
  const rendering = new NullEngine(), scene = new Scene(rendering);
  const physics = (await freshEngine()).createPhysics({ hz: 120, gravity: true });
  physics.addFixedBox([0, -0.5, 0], [5, 1, 5]);
  const node = new TransformNode("support", scene);
  node.position.set(0, 0.05, 0); node.rotationQuaternion = Quaternion.Identity();
  const body = physics.addBody(node, [{ kind: "sphere", centre: [0, 0, 0], radius: 0.05 }], {
    mass: 1, centre: [0, 0, 0], moments: [0.001, 0.001, 0.001], orientation: Quaternion.Identity(),
  });
  return { physics, body, frames: new Map([["segment:support", body]]),
    dispose() { physics.dispose(); scene.dispose(); rendering.dispose(); } };
}

test("desired support neither creates measured contacts nor removes physical contact", async () => {
  const f = await fixture();
  try {
    const tracker = contactTracking(f.physics, f.frames, 1, settings);
    assert.equal(tracker.read(command).length, 0, "no narrowphase measurement before stepping");
    f.physics.step(1 / 120);
    const before = f.physics.save(), manifolds = f.physics.contactManifoldsOf(f.body, (other) => other === null);
    assert.ok(manifolds.some((m) => m.impulse > 0));
    assert.equal(tracker.read(command).length, 3);
    assert.equal(tracker.read({ ...command, supports: [{ frame: { kind: "segment", name: "support" }, mode: "free" }] }).length, 0);
    assert.deepEqual(f.physics.contactManifoldsOf(f.body, (other) => other === null), manifolds);
    assert.deepEqual(f.physics.save(), before);
    assert.equal(tracker.read(command).length, 3);
  } finally { f.dispose(); }
});

test("reaction inequalities change a bounded candidate and rejected solves produce zero action", async () => {
  const f = await fixture();
  try {
    f.physics.step(1 / 120);
    for (const iterations of [2048, 1]) {
      const tracker = contactTracking(f.physics, f.frames, 1, { ...settings, iterations });
      tracker.read(command);
      // An isolated affine load response crosses from tension into compression at torque 0.5.
      tracker.base([0, -1, 0]); tracker.column(0, [0, 1, 0]);
      const candidate = new Float64Array([0]);
      tracker.solve(new Float64Array([1]), new Float64Array([0]), new Float64Array([1]),
        new Float64Array([-1]), new Float64Array([1]), candidate);
      if (iterations === 1) {
        assert.equal(tracker.report().status, "rejected");
        assert.equal(tracker.report().solve.status, "iteration-limit");
        assert.deepEqual([...candidate], [0]);
      } else {
        assert.equal(tracker.report().status, "accepted");
        assert.ok(Math.abs(candidate[0] - 0.5) < 1e-6);
        tracker.verify({ reactionMultipliers: (torque) => [0, -1 + 2 * torque[0], 0] }, candidate);
        assert.equal(tracker.report().status, "accepted");
        const detached = tracker.report(); detached.forces[0].force[1] = 99;
        assert.notEqual(tracker.report().forces[0].force[1], 99);
        tracker.verify({ reactionMultipliers: () => [0, -1, 0] }, candidate);
        assert.equal(tracker.report().status, "rejected");
        assert.deepEqual([...candidate], [0]);
      }
    }
  } finally { f.dispose(); }
});
