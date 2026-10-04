import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { createEnvironment } from "../src/core/tasks/environment.ts";
import { createReachTask } from "../src/core/tasks/reach.ts";
import { freshEngine } from "./harness/core-stand.mjs";

const engine = await freshEngine();

test("the declared solver revision identifies the locked vendor artifact", () => {
  const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url)));
  const archive = lock.packages["node_modules/@dimforge/rapier3d-simd-compat"].resolved.replace(/^file:/, "");
  const hash = createHash("sha256").update(readFileSync(new URL(`../${archive}`, import.meta.url))).digest("hex");
  assert.equal(engine.revision, `rapier/adapter-4/sha256:${hash}`);
});
// This task tests a pinned reach, with gains/tolerances from the controller replacement record.
const configuration = { model: "workshop-fighter", controller: "actuator", actuation: "directional", gravity: true,
  pin: "lowerTrunk", channel: "elbow.right flexion", target: [0.5, 0.7], servoSeconds: 0.1, tolerance: 0.025,
  holdSteps: 30, engineRevision: engine.revision };

function fixture(config = configuration, options = { policyPeriodSteps: 4, maxSteps: 360 }, wrap = (task) => task) {
  const counts = { built: 0, disposed: 0 };
  const environment = createEnvironment(config, (c, random) => {
    const rendering = new NullEngine(), scene = new Scene(rendering);
    let task;
    try { task = wrap(createReachTask(scene, engine, c, random), random); }
    catch (error) { scene.dispose(); rendering.dispose(); throw error; }
    counts.built++;
    return { ...task, dispose() { counts.disposed++; task.dispose(); scene.dispose(); rendering.dispose(); } };
  }, options);
  return { environment, counts };
}

const action = ({ body, goal }) => ({ kind: "velocity", activation: body.joints.map(() => 1),
  velocity: body.joints.map((joint) => Math.max(-3, Math.min(3, ((joint.name === goal.channel ? goal.angle : 0) - joint.angle) / 0.1))) });

test("actuator and layered controllers complete the same seeded reach task", () => {
  const goals = [];
  for (const controller of ["actuator", "layered"]) {
    const { environment: env, counts } = fixture({ ...configuration, controller });
    try {
      let result = env.reset(42);
      goals.push(result.observation.goal);
      while (!result.terminated && !result.truncated && result.invalid === null) {
        env.act(controller === "actuator" ? action(result.observation) : { kind: "posture", targets: { [result.observation.goal.channel]: result.observation.goal.angle } });
        result = env.step();
      }
      assert.equal(result.invalid, null);
      assert.equal(result.truncated, false);
      assert.equal(result.terminated, true, controller);
      assert.equal(result.reason, "reached-and-held");
      assert.equal(result.metrics.heldSteps, 30);
      assert.ok(result.metrics.error <= configuration.tolerance);
      assert.throws(() => env.step(), /ended/);
      assert.throws(() => env.act(action(result.observation)), /ended/);
    } finally { env.dispose(); }
    assert.equal(counts.built, counts.disposed);
  }
  assert.deepEqual(goals[0], goals[1]);
});

test("reset, held actions, RNG and policy clocks survive a branch across a decision and a reset", () => {
  const { environment: env, counts } = fixture(configuration, { policyPeriodSteps: 4, maxSteps: 360 }, (task, random) => {
    // A diagnostic draw every step makes lost RNG memory visible, not just the seeded construction.
    const memory = { draw: 0 }, hook = task.world.afterStep(() => { memory.draw = random(); });
    return { ...task, state: { task: task.state, memory }, observe: () => ({ ...task.observe(), draw: memory.draw }),
      dispose() { hook.dispose(); task.dispose(); } };
  });
  try {
    assert.throws(() => env.step(), /reset/);
    const initial = env.reset(123), command = action(initial.observation);
    env.act(command);
    command.activation.fill(0); command.velocity.fill(0);
    const partial = env.step(2), saved = env.save();
    assert.equal(partial.decisionDue, false);
    assert.throws(() => env.act(action(partial.observation)), /boundary/);
    const next = () => {
      const boundary = env.step();
      assert.equal(boundary.steps, 4); assert.equal(boundary.decisionDue, true);
      env.act(action(boundary.observation));
      return env.step(5);
    };
    const expected = next();
    assert.ok(expected.observation.body.joints.some((j) => Math.abs(j.effort) > 1), "the environment owns its accepted action arrays");
    const other = env.reset(456);
    assert.notDeepEqual(other.observation.goal, initial.observation.goal);
    assert.deepEqual(env.load(saved), partial);
    assert.deepEqual(next(), expected);
    assert.deepEqual(env.reset(123), initial);
    assert.throws(() => env.reset(-1), /seed/);
    assert.deepEqual(env.observe(), initial, "invalid reset preserves the live episode");
  } finally { env.dispose(); env.dispose(); }
  assert.equal(counts.built, counts.disposed);
  assert.throws(() => env.reset(123), /disposed/);
});

test("loading another configuration is refused without replacing the current episode", () => {
  const a = fixture(), b = fixture({ ...configuration, actuation: "symmetric" });
  try {
    a.environment.reset(42); b.environment.reset(42);
    a.environment.step(2); b.environment.step(3);
    const before = b.environment.observe(), saved = a.environment.save();
    assert.throws(() => b.environment.load(saved), /another task configuration/);
    assert.deepEqual(b.environment.observe(), before);
    assert.throws(() => b.environment.load({ ...saved, protocol: 2 }), /protocol/);
    assert.deepEqual(b.environment.observe(), before);
  } finally { a.environment.dispose(); b.environment.dispose(); }
  assert.equal(a.counts.built, a.counts.disposed);
  assert.equal(b.counts.built, b.counts.disposed);
});

test("a fresh environment can restore an episode without an unrelated reset", () => {
  const first = fixture(), second = fixture();
  try {
    const initial = first.environment.reset(81);
    first.environment.act(action(initial.observation));
    const partial = first.environment.step(2);
    assert.deepEqual(second.environment.load(first.environment.save()), partial);
    assert.deepEqual(first.environment.step(), second.environment.step());
  } finally { first.environment.dispose(); second.environment.dispose(); }
});

test("time limits and invalid simulations are distinct from task termination", () => {
  const short = fixture(configuration, { policyPeriodSteps: 4, maxSteps: 3 });
  const invalid = fixture(configuration, { policyPeriodSteps: 4, maxSteps: 3 }, (task) => ({ ...task,
    evaluate: () => task.world.steps === 0 ? task.evaluate() : { metrics: { error: NaN }, terminated: null, invalid: null } }));
  try {
    short.environment.reset(0);
    const end = short.environment.step();
    assert.deepEqual([end.steps, end.terminated, end.truncated, end.invalid], [3, false, true, null]);
    invalid.environment.reset(0);
    const failure = invalid.environment.step();
    assert.deepEqual([failure.steps, failure.terminated, failure.truncated, failure.invalid, failure.observation], [1, false, false, "non-finite task metrics", null]);
    assert.throws(() => invalid.environment.step(), /ended/);
    assert.equal(invalid.environment.reset(0).invalid, null);
  } finally { short.environment.dispose(); invalid.environment.dispose(); }
});

test("experiment settings are immutable and actions are checked before being held", () => {
  const config = { ...configuration, target: [0.5, 0.7] }, { environment: env } = fixture(config);
  try {
    config.target[0] = 100;
    const initial = env.reset(42), before = env.save();
    assert.ok(initial.observation.goal.angle >= 0.5 && initial.observation.goal.angle <= 0.7);
    assert.throws(() => { env.configuration.target[0] = 100; }, TypeError);
    assert.throws(() => env.act({ kind: "velocity", activation: [], velocity: [] }), /invalid/);
    assert.deepEqual(env.save().state, before.state);
    assert.throws(() => env.act({ kind: "posture", targets: {} }), /actuator/);
    assert.deepEqual(env.save().state, before.state);
  } finally { env.dispose(); }
  assert.throws(() => fixture(configuration, { policyPeriodSteps: 0, maxSteps: 3 }), /positive/);
});
