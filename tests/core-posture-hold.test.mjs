import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { freshEngine } from "./harness/core-stand.mjs";
import { createPostureHoldProbe } from "../src/core/tasks/posture-hold.ts";
import { saveState, loadState } from "../src/core/state.ts";

const configuration = { model: "workshop-fighter", posture: "fours", hz: 120, actuation: "directional", servoSeconds: .01, speed: 10, activation: 1 };

test("independent joint feedback holds an installed all-fours body within 20 mm and replays", async (t) => {
  for (const profile of ["rapier-coordinate", "rapier-coordinate-coulomb"]) {
    const rendering = new NullEngine(), scene = new Scene(rendering), engine = await freshEngine(profile);
    const probe = createPostureHoldProbe(scene, engine, configuration);
    try {
      assert.equal(probe.configuration.pin, null); assert.deepEqual(probe.configuration.assists, { root: 0, weapon: false });
      const state = { world: probe.world.state, ...probe.state };
      probe.world.step(240);
      const saved = { physics: probe.world.physics.save(), state: saveState(state) };
      const branch = () => {
        const trace = createHash("sha256");
        while (!probe.complete) { probe.world.step(); trace.update(JSON.stringify(probe.body.observe())); }
        return { outcome: probe.observe(), state: saveState(state), digest: trace.digest("hex") };
      };
      const result = branch(), outcome = result.outcome.task;
      assert.equal(outcome.success, true); assert.equal(outcome.steps, 1200);
      assert.ok(outcome.peakDrift > .001 && outcome.peakDrift < .02, JSON.stringify(outcome));
      assert.ok(outcome.contactSteps > 1000 && outcome.peakEffort > 0 && outcome.peakEffortViolation < .0001);
      assert.equal(probe.body.assist.meter.force, 0); assert.equal(probe.body.assist.meter.moment, 0);
      probe.world.physics.load(saved.physics); loadState(state, saved.state); assert.deepEqual(branch(), result);
      t.diagnostic(JSON.stringify({ profile, outcome, digest: result.digest }));
    } finally { probe.dispose(); scene.dispose(); rendering.dispose(); }
  }
});

test("the installed hold gate rejects weak control, limp bodies and unsupported postures", async () => {
  const engine = await freshEngine("rapier-coordinate-coulomb");
  for (const change of [{ servoSeconds: .1 }, { activation: 0 }, { posture: "half-kneel" }, { posture: "squat" }]) {
    const rendering = new NullEngine(), scene = new Scene(rendering), probe = createPostureHoldProbe(scene, engine, { ...configuration, ...change });
    try {
      probe.world.step(1200); const outcome = probe.observe().task;
      assert.equal(outcome.complete, true); assert.equal(outcome.success, false);
      assert.ok(outcome.peakDrift > .02, JSON.stringify({ change, outcome }));
    } finally { probe.dispose(); scene.dispose(); rendering.dispose(); }
  }
  const rendering = new NullEngine(), scene = new Scene(rendering);
  try {
    for (const invalid of [{ model: "workshop-rogue" }, { model: "crypt-skeleton" }, { posture: "unknown" },
      { hz: 0 }, { servoSeconds: 0 }, { speed: Infinity }, { activation: NaN }]) {
      assert.throws(() => createPostureHoldProbe(scene, engine, { ...configuration, ...invalid }), /configuration|posture/);
      assert.equal(scene.transformNodes.length, 0);
    }
  } finally { scene.dispose(); rendering.dispose(); }
});
