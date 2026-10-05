import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { Quaternion } from "@babylonjs/core/Maths/math.vector.js";
import { contactTracking } from "../src/core/control/contact-tracking.ts";
import { freshEngine } from "./harness/core-stand.mjs";
import { saveState, loadState } from "../src/core/state.ts";

const settings = { maxPoints: 4, gap: 0.005, minUpNormal: 0.9, forceTolerance: 1e-5,
  iterations: 2048, absoluteTolerance: 1e-7, relativeTolerance: 1e-6 };
const command = { joints: [], frames: [], grips: [] };
async function fixture(box = false) {
  const rendering = new NullEngine(), scene = new Scene(rendering);
  const physics = (await freshEngine()).createPhysics({ hz: 120, gravity: true });
  physics.addFixedBox([0, -0.5, 0], [5, 1, 5]);
  const node = new TransformNode("support", scene);
  node.position.set(0, 0.05, 0); node.rotationQuaternion = Quaternion.Identity();
  const body = physics.addBody(node, box ? [{ kind: "box", centre: [0, 0, 0], size: [0.2, 0.1, 0.2] }] : [{ kind: "sphere", centre: [0, 0, 0], radius: 0.05 }], {
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

test("contact redistribution removes artificial tension without changing a body's wrench", async () => {
  const f = await fixture(true);
  try {
    f.physics.step(1 / 120);
    const snapshot = f.physics.save();
    for (const redistributionCost of [undefined, 1e-6]) {
      const tracker = contactTracking(f.physics, f.frames, 1, { ...settings, redistributionCost });
      const rows = tracker.read(command), points = rows.filter((_, i) => i % 3 === 0).map((r) => r[0].point);
      assert.equal(points.length, 4);
      const base = points.flatMap((p) => [0, p[0] * p[2] > 0 ? -1 : 2, 0]);
      tracker.base(base); tracker.column(0, base);
      const candidate = new Float64Array([0]);
      tracker.solve(new Float64Array([1]), new Float64Array([0]), new Float64Array([1]),
        new Float64Array([-1]), new Float64Array([1]), candidate);
      if (redistributionCost === undefined) {
        assert.equal(tracker.report().status, "rejected");
        continue;
      }
      assert.equal(tracker.report().status, "accepted");
      tracker.verify({ reactionMultipliers: () => base }, candidate);
      const report = tracker.report();
      assert.equal(report.status, "accepted");
      assert.ok(report.tension < 1e-8 && report.frictionViolation < 1e-8);
      assert.deepEqual([...candidate], [0]);
      const difference = [0, 0, 0, 0, 0, 0];
      report.forces.forEach(({ point: p, force }, i) => {
        const d = force.map((v, k) => v - base[3 * i + k]);
        for (let k = 0; k < 3; k++) difference[k] += d[k];
        difference[3] += p[1] * d[2] - p[2] * d[1];
        difference[4] += p[2] * d[0] - p[0] * d[2];
        difference[5] += p[0] * d[1] - p[1] * d[0];
      });
      assert.ok(difference.every((v) => Math.abs(v) < 1e-10), JSON.stringify(difference));
      assert.ok(tracker.state.redistribution.some((v) => Math.abs(v) > 0.5));
      const saved = saveState(tracker.state);
      tracker.read({ ...command, supports: [{ frame: { kind: "segment", name: "support" }, mode: "free" }] });
      assert.equal(tracker.report().points, 0);
      loadState(tracker.state, saved);
      tracker.read(command); tracker.base(base); tracker.column(0, base);
      tracker.solve(new Float64Array([1]), new Float64Array([0]), new Float64Array([1]),
        new Float64Array([-1]), new Float64Array([1]), candidate);
      tracker.verify({ reactionMultipliers: () => base }, candidate);
      assert.deepEqual(saveState(tracker.state), saved, "cold work is rebuilt after a different contact topology");
    }
    assert.deepEqual(f.physics.save(), snapshot, "predicted load allocation never applies forces");
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
