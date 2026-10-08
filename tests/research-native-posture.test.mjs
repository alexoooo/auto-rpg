import test from "node:test";
import assert from "node:assert/strict";
import { nativePostureControl } from "../research/native-posture-control.mjs";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { freshEngine } from "./harness/core-stand.mjs";
import { createPostureHoldProbe } from "../src/core/tasks/posture-hold.ts";
import record from "../docs/reference/native-posture-control.json" with { type: "json" };

test("native rollouts select bounded actions through the shared posture task and reproduce their execution", async () => {
  const first = await nativePostureControl({ steps: 30 });
  const second = await nativePostureControl({ steps: 30 });
  assert.equal(first.replay, true);
  assert.equal(first.configuration.controller, "actuator");
  assert.deepEqual(first.configuration.assists, { root: 0, weapon: false });
  assert.ok(first.outcome.peakDrift < .01, JSON.stringify(first.outcome));
  assert.ok(first.outcome.peakEffort > 1 && first.outcome.peakEffortViolation < .0001);
  assert.ok(first.totalEvaluations > first.steps);
  assert.equal(first.outcome.steps, 30, "counterfactual steps cannot enter task metrics");
  assert.equal(first.outcome.complete, false, "a short probe is not a completed hold");
  assert.equal(first.outcome.success, false);
  assert.equal(second.digest, first.digest);
  assert.deepEqual(second.tape, first.tape);
  assert.deepEqual(second.outcome, first.outcome);
});

test("native posture search refuses undeclared budgets before creating a world", async () => {
  for (const change of [{ steps: 0 }, { steps: 1201 }, { response: NaN }, { iterations: 0 }, { iterations: 9 }, { posture: "unknown" },
    { envelope: "toe" }, { transfer: "yes" }, { transfer: true, steps: 2161 }]) {
    await assert.rejects(nativePostureControl(change), /invalid native posture trial/);
  }
});

test("the selected native action tape holds half-kneel for the full physical gate without a planner", async () => {
  const rendering = new NullEngine(), scene = new Scene(rendering);
  const probe = createPostureHoldProbe(scene, await freshEngine("rapier-coordinate-coulomb"), record.configuration);
  try {
    assert.deepEqual(probe.configuration, record.configuration);
    assert.equal(record.tape.length, 1200);
    for (const torque of record.tape) { probe.act({ kind: "torque", torque }); probe.world.step(); }
    const outcome = probe.observe().task;
    assert.equal(outcome.success, true, JSON.stringify(outcome));
    assert.ok(outcome.peakDrift < .02 && outcome.peakEffortViolation < .0001);
    assert.equal(outcome.contactSteps, 1200);
    assert.deepEqual(outcome, record.outcome);
  } finally { probe.dispose(); scene.dispose(); rendering.dispose(); }
});
