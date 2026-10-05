import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { freshEngine } from "./harness/core-stand.mjs";
import { createPostureHoldProbe } from "../src/core/tasks/posture-hold.ts";
import { saveState, loadState } from "../src/core/state.ts";
import poses from "../assets/research/posture-holds.json" with { type: "json" };
import { createEnvironment } from "../src/core/tasks/environment.ts";

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
      { hz: 0 }, { servoSeconds: 0 }, { speed: Infinity }, { activation: NaN }, { controller: "unknown" }]) {
      assert.throws(() => createPostureHoldProbe(scene, engine, { ...configuration, ...invalid }), /configuration|posture/);
      assert.equal(scene.transformNodes.length, 0);
    }
  } finally { scene.dispose(); rendering.dispose(); }
});

test("external actuator actions use the identical posture fixture, score and replayable held command", async () => {
  const engine = await freshEngine("rapier-coordinate-coulomb"), rendering = new NullEngine();
  const scene = new Scene(rendering), otherScene = new Scene(rendering);
  const direct = createPostureHoldProbe(scene, engine, configuration);
  const external = createPostureHoldProbe(otherScene, engine, { ...configuration, controller: "actuator" });
  const pose = poses.find(p => p.id === "fours");
  const targets = [...external.built.joints].flatMap(([name, joint]) => joint.dofs.map((_, i) => pose.placement.joints[name][i]));
  const state = { world: external.world.state, ...external.state };
  const save = () => ({ physics: external.world.physics.save(), state: saveState(state) });
  try {
    assert.equal(direct.actuators, null);
    assert.equal(Object.isFrozen(external.actuators.channels), true);
    assert.equal(external.configuration.anatomy.model, external.built.spec.model);
    assert.equal(external.configuration.anatomy.mass.value, external.built.spec.mass.value);
    assert.equal(external.configuration.anatomy.joints.length, external.built.spec.joints.length);
    assert.throws(() => direct.act({ kind: "torque", torque: [] }), /external actions/);
    const original = save();
    assert.throws(() => external.act({ kind: "torque", torque: [NaN] }), /invalid actuator/);
    assert.deepEqual(save(), original);
    for (let step = 0; step < 1200; step++) {
      const observation = external.body.observe();
      const action = { kind: "velocity", activation: targets.map(() => 1), velocity: targets.map((target, i) =>
        Math.max(-10, Math.min(10, (target - observation.joints[i].angle) / .01))) };
      external.act(action); action.activation.fill(0); action.velocity.fill(100);
      direct.world.step(); external.world.step();
      assert.deepEqual(external.observe(), direct.observe());
    }
    assert.equal(external.evaluate().terminated, "held");
    assert.equal(external.evaluate().invalid, null);
    assert.equal(external.observe().task.success, true);
    const branch = () => {
      const observations = [];
      for (let i = 0; i < 16; i++) { external.world.step(); observations.push(external.observe()); }
      return { observations, state: saveState(state) };
    };
    const held = save(), result = branch();
    external.act({ kind: "torque", torque: targets.map(() => 0) });
    external.world.physics.load(held.physics); loadState(state, held.state);
    assert.deepEqual(branch(), result);
  } finally { direct.dispose(); external.dispose(); scene.dispose(); otherScene.dispose(); rendering.dispose(); }
});

test("the actuator posture task runs in the common environment across a held-action boundary and reset", async () => {
  const engine = await freshEngine("rapier-coordinate-coulomb");
  const env = createEnvironment({ ...configuration, controller: "actuator" }, config => {
    const rendering = new NullEngine(), scene = new Scene(rendering), probe = createPostureHoldProbe(scene, engine, config);
    return { ...probe, dispose() { probe.dispose(); scene.dispose(); rendering.dispose(); } };
  }, { policyPeriodSteps: 4, maxSteps: 12 });
  try {
    const initial = env.reset(0), count = initial.observation.body.joints.length;
    env.act({ kind: "velocity", activation: Array(count).fill(1), velocity: Array(count).fill(0) });
    const partial = env.step(2), saved = env.save();
    assert.equal(partial.decisionDue, false);
    const branch = () => { env.step(2); env.act({ kind: "torque", torque: Array(count).fill(0) }); return env.step(8); };
    const expected = branch();
    assert.equal(expected.invalid, null); assert.equal(expected.terminated, false); assert.equal(expected.truncated, true);
    assert.equal(expected.metrics.steps, 12);
    assert.deepEqual(env.load(saved), partial); assert.deepEqual(branch(), expected);
    assert.deepEqual(env.reset(0), initial);
  } finally { env.dispose(); }
});
