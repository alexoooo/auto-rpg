import test from "node:test";
import assert from "node:assert/strict";
import { deserialize } from "node:v8";
import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector.js";
import { footStatesOf } from "../src/core/control/support.ts";
import { bootContactRecovery } from "../research/stand-up-contact.mjs";
import { standUpReplay } from "../research/stand-up-replay.mjs";

test("a loaded boot preparation does not plant its soles, and its ordinary-muscle continuation forks", async () => {
  const options = { recovery: bootContactRecovery({ knee: 1.6, ankle: .36, seconds: .5 }), recoveryId: "test-boot-preparation" };
  const f = await standUpReplay(options); let fresh;
  try {
    f.fall(); f.step(540);
    const sample = f.sample(), feet = footStatesOf(f.stand.built);
    assert.equal(sample.experiment.active, true);
    assert.equal(sample.policy.completed, 0);
    assert.equal(sample.down, true);
    for (const foot of feet) {
      const part = sample.segments.find(p => p.name === foot.segment.spec.name);
      const load = sample.floor.filter(c => c.segment === part.name && -c.normal[1] >= .9).reduce((sum, c) => sum + c.impulse * 120, 0);
      const up = Vector3.Up().applyRotationQuaternion(Quaternion.Inverse(foot.segment.rest)).applyRotationQuaternion(new Quaternion(...part.rotation)).y;
      assert.ok(load > 5, `the actual ${foot.side} boot carries a measurable load`);
      assert.ok(up < .1, `the ${foot.side} sole faces sideways despite that load`);
    }
    const checkpoint = f.save(), trace = [];
    for (let k = 0; k < 60; k++) { f.step(); trace.push(f.sample()); }
    fresh = await standUpReplay(options); fresh.restore(checkpoint);
    const restored = [];
    for (let k = 0; k < 60; k++) { fresh.step(); restored.push(fresh.sample()); }
    assert.deepEqual(restored, trace);
    assert.deepEqual(deserialize(fresh.save().bytes).saved.state, deserialize(f.save().bytes).saved.state);
    for (const row of trace) {
      assert.deepEqual(row.assist, { force: 0, moment: 0 });
      for (const joint of row.joints) assert.ok(joint.effort <= joint.positive + .0001 && -joint.effort <= joint.negative + .0001, joint.name);
    }
  } finally { fresh?.dispose(); f.dispose(); }
});
