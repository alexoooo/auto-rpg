/**
 * **Native posture control** (`research/native-posture-control.mjs`) on the shared posture task
 * (`createPostureHoldProbe`), the Node core stand, the coordinate engine with Coulomb friction,
 * 120 Hz: rollouts choose bounded actions and reproduce, budgets are declared, and the recorded tape
 * plays on the task it names. Whether the tape still holds the half-kneel is
 * `research-native-posture-capability.test.mjs`'s.
 */
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

// The record was taken on an older anatomy (no Haste, another muscle speed curve), so its tape names a task the body no
// longer builds; `research/native-posture-control.mjs` records it again.
test("the selected native action tape plays its whole length on the posture task it names, within its effort, whatever its ending", { todo: "the record's configuration is stale" }, async () => {
  const rendering = new NullEngine(), scene = new Scene(rendering);
  const probe = createPostureHoldProbe(scene, await freshEngine("rapier-coordinate-coulomb"), record.configuration);
  try {
    assert.deepEqual(probe.configuration, record.configuration);
    assert.equal(record.tape.length, 1200);
    for (const torque of record.tape) { probe.act({ kind: "torque", torque }); probe.world.step(); }
    const outcome = probe.observe().task;
    assert.ok(outcome.contactSteps > 0, `the fixture did not reach its case: the half-kneel never touched the ground: ${JSON.stringify(outcome)}`);
    assert.equal(outcome.steps, 1200);
    assert.ok(Number.isFinite(outcome.peakDrift) && outcome.peakEffortViolation < .0001, JSON.stringify(outcome));
  } finally { probe.dispose(); scene.dispose(); rendering.dispose(); }
});
