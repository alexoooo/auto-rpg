/**
 * **Whether the recorded native action tape holds the half-kneel** (`docs/reference/native-posture-control.json`),
 * replayed on the shared posture task, the Node core stand, the coordinate engine with Coulomb
 * friction, 120 Hz, and not a gate (`tests/experimental.json`): it holds within 20 mm on its limbs
 * through the whole gate and reproduces its recorded outcome. What the tape keeps whatever its ending
 * is `research-native-posture.test.mjs`'s.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { freshEngine } from "./harness/core-stand.mjs";
import { createPostureHoldProbe } from "../src/core/tasks/posture-hold.ts";
import record from "../docs/reference/native-posture-control.json" with { type: "json" };

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
