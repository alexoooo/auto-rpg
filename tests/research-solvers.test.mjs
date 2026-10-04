import test from "node:test";
import assert from "node:assert/strict";
import { foundationJobs } from "../research/control-foundation-trials.mjs";
import { runFoundation, summarizeFoundation } from "../research/control-foundation.mjs";

test("the pinned solver probe distinguishes actuator effort, passive damping and binding compatibility", async () => {
  const jobs = foundationJobs({ suite: "solver", actuation: "directional" });
  assert.equal(jobs.length, 4);
  assert.throws(() => foundationJobs({ suite: "solver", split: "held-out" }), /no held-out/);
  const rows = await runFoundation(jobs, { workers: 2 });
  for (const { job, result: { outcome } } of rows) {
    assert.equal(outcome.replayExact, true);
    assert.ok(Math.abs(outcome.end.angle - job.sense * job.limit) < 0.001, "the hinge presses its actual limit");
    assert.ok(outcome.maxAbsoluteAngle <= job.limit + 0.001);
    assert.equal(outcome.adapterBindingsAvailable, Object.values(outcome.bindings).every(Boolean));
    assert.equal(outcome.bindings.jointSetMotorForceBounds, true);
    const coast = outcome.rows.filter((r) => r.phase === "coast");
    assert.equal(coast.length, job.coastSteps);
    if (job.representation === "impulse") {
      assert.equal(outcome.bindings.jointMotorStepImpulse, true);
      assert.ok(Math.abs(outcome.first.effortImpulse - outcome.nominalImpulse) < 1e-8);
      assert.ok(Math.abs(outcome.firstAngularMomentum - outcome.first.effortImpulse) < 1e-8);
      assert.ok(coast.every((r) => r.effortImpulse === 0 && Math.abs(r.speed / outcome.first.speed - 1) < 0.0001));
    } else {
      assert.equal(outcome.first.effortImpulse, null, "the probe does not invent an unavailable effort read");
      assert.ok(Math.abs(coast.at(-1).speed) < Math.abs(outcome.first.speed) * 0.9,
        "native multibody damping removes momentum with the motor disabled");
    }
  }
  assert.equal(summarizeFoundation(rows).cells.length, 4, "representations and directions retain separate cells");
});
