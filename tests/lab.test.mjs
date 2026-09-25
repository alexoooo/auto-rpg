import test from "node:test";
import assert from "node:assert/strict";
import { createEnvironment, recording, replay } from "../research/lab/environment.mjs";
import { createBout, runBout, freshHavok } from "./harness/bout-runner.mjs";
import { freshGolemIntent } from "../src/golem/tactics.ts";
import { namedBuild } from "../src/golem/roster.ts";
import { labMind, labObservation, validateAction, validateNetwork, infer, LAB_VERSION, OBSERVATION_NAMES, OBSERVATION_NAMES_V2, LEGACY_OBSERVATION_NAMES, directIntent, BESPOKE } from "../src/golem/lab-policy.ts";
import { fitObservationModel, fairPlan, oracle, calibrateObservationModel } from "../research/lab/planning.mjs";
import { updateArchive } from "../research/lab/archive.mjs";
import { digest } from "../research/schedule.mjs";
import { policyMind } from "../src/mind.ts";
import { exportPoses } from "../research/lab/poses.mjs";
import { LAB_BASELINES, originalMind } from "../src/golem/lab-baselines.ts";
import { referenceFight } from "../research/lab/reference.mjs";

test("zero-residual imitation exactly preserves each named baseline's full substep trace", async () => {
  for (const baseline of ["golem-driver", "golem-duelist"]) {
    const model = { version: LAB_VERSION, surface: "residual", hz: 12, baseline, observationNames: OBSERVATION_NAMES,
      layers: [{ activation: "linear", weights: Array.from({ length: 22 }, () => Array(OBSERVATION_NAMES.length).fill(0)), bias: Array(22).fill(0) }] };
    const run = async (left) => {
      const env = await createEnvironment({ seed: 19, leftBuild: "two-blades", rightBuild: "two-blades", left,
        surface: "residual", controlBaseline: baseline, maxSeconds: 3, trace: true });
      try {
        let state = env.state();
        while (!state.terminated && !state.truncated) state = env.step();
        return recording(env).steps;
      } finally { env.close(); }
    };
    assert.deepEqual(await run({ kind: "network", model }), await run({ kind: "baseline", name: baseline }));
  }
});

test("reference fights finish their configured horizon and retain a valid prefix on budget expiry", async () => {
  const config = { surface: "residual", controlBaseline: "golem-duelist", seed: 55,
    left: { kind: "baseline", name: "golem-duelist" }, maxSeconds: 0.25 };
  const result = await referenceFight({ config, candidates: 2, horizon: 1 / 12,
    commitSeconds: 1 / 12, maxDecisions: 10, deadline: Date.now() + 60000 });
  assert.equal(result.status, "finished");
  assert.equal(result.record.config.seed, 55);
  assert.equal(result.record.config.controlBaseline, "golem-duelist");
  assert.ok(result.record.steps.at(-1).truncated);
  const copy = await replay(result.record);
  copy.close();
  const env = await createEnvironment({ ...config, maxSeconds: 10, trace: true });
  let record;
  try { env.step(); record = recording(env); } finally { env.close(); }
  const limited = await referenceFight({ record, candidates: 64, horizon: 2, maxDecisions: 100,
    deadline: Date.now() + 10 });
  assert.equal(limited.status, "budget");
  assert.equal(limited.record.id, record.id);
  const recovered = await replay(limited.record);
  recovered.close();
});

test("stepping preserves the whole-bout result, and disposal is idempotent", async () => {
  const env = await createEnvironment({ maxSeconds: 3 });
  let stepped;
  try { while (!env.state().terminated && !env.state().truncated) env.step(); stepped = env.result(); }
  finally { env.close(); env.close(); }
  const config = env.config;
  const whole = runBout({ left: "golem-driver", right: "golem-fencer", seeds: [config.seed, config.seed ^ 0x123456],
    leftMind: labMind(config.left, config.seed), rightMind: labMind(config.right, config.seed ^ 0x123456),
    leftGolem: namedBuild("default").setup, rightGolem: namedBuild("default").setup,
    locomotionMode: "supported", maxSeconds: 3, physics: await freshHavok() });
  assert.deepEqual(stepped, whole);
  assert.throws(() => env.step(), /closed/);
});

test("fresh replay reproduces observed commands, contacts and continuation; branching changes the future", async () => {
  const env = await createEnvironment({ trace: true, surface: "residual", maxSeconds: 3 });
  await assert.rejects(createEnvironment(), /one Havok/);
  let record;
  try { for (let i = 0; i < 24; i++) env.step(); record = recording(env); }
  finally { env.close(); }
  const poses = await exportPoses(record);
  assert.equal(poses.frames.length, record.steps.length + 1);
  assert.ok(poses.geometry.every((g) => g.positions.length > 0 && g.indices.length > 0));
  assert.ok(poses.frames.every((f) => f.parts.length === poses.geometry.length));
  assert.equal(poses.frames.at(-1).clock, record.steps.at(-1).clock);
  const copy = await replay(record, 12);
  try {
    for (let i = 12; i < 24; i++) copy.step();
    assert.deepEqual(copy.tape, record.steps);
  } finally { copy.close(); }
  const branch = await replay(record, 12);
  try {
    const alternative = branch.step(Array(22).fill(-1));
    assert.notEqual(alternative.trace, record.steps[12].trace);
  } finally { branch.close(); }
  await assert.rejects(replay({ ...record, fingerprint: "changed" }), /incompatible/);
  const broken = structuredClone(record); broken.steps[0].observation[0] += 1;
  await assert.rejects(replay(broken), /incompatible/);
  broken.id = digest({ config: broken.config, steps: broken.steps });
  await assert.rejects(replay(broken), /divergence/);
  const label = await oracle(record, 12, { candidates: 2, iterations: 1, horizon: 0.1 });
  assert.equal(label.tier, "privileged");
  assert.equal(label.evaluations, 3);
  assert.ok(label.value >= label.baselineValue);
});

test("action and network contracts reject incompatible or non-finite data", () => {
  assert.throws(() => validateAction("pilot", [NaN]), /invalid/);
  assert.throws(() => validateAction("direct", Array(22).fill(2)), /invalid/);
  const model = { version: LAB_VERSION, surface: "pilot", hz: 12, observationNames: OBSERVATION_NAMES,
    layers: [{ weights: Array.from({ length: 12 }, () => Array(OBSERVATION_NAMES.length).fill(0)), bias: Array(12).fill(0.4), activation: "linear" }] };
  validateNetwork(model);
  assert.deepEqual(infer(model, Array(OBSERVATION_NAMES.length).fill(0)), Array(12).fill(0.4));
  assert.throws(() => validateNetwork({ ...model, version: 99 }), /version/);
  const invalid = structuredClone(model); invalid.layers[0].weights[0][0] = Infinity;
  assert.throws(() => validateNetwork(invalid), /invalid/);
});

test("direct commands remain legal after losing both hands and bespoke policies use published observations", async () => {
  const bout = createBout({ left: "idle", right: "idle", seeds: [1, 2],
    locomotionMode: "supported", maxSeconds: 1, physics: await freshHavok() });
  try {
    // Two frames, not one. A body's base is first read at its first control step and published at
    // the next, and the first 1/60 s frame holds a single control step at 120 Hz physics: Babylon's
    // accumulator takes it as one 1/120 step and a float remainder. After one frame the view read
    // stabilityImpulseNs 0 at 120 and 113.8 N s at 240; after two, 113.8 at both (Node bout runner,
    // 2026-09-25).
    bout.step();
    bout.step();
    // Real publication, explicitly changed to exercise the capability-loss branch.
    const view = bout.left.view;
    const base = freshGolemIntent();
    base.actingHand = "secondary";
    base.secondary.roll = 0.2;
    assert.deepEqual(directIntent(Array(22).fill(0), view, base), base);
    base.actingHand = null;
    assert.deepEqual(directIntent(Array(22).fill(0), view, base), base);
    const before = labObservation(view);
    assert.equal(before.length, OBSERVATION_NAMES.length);
    assert.deepEqual(labObservation(view, 1), before.slice(0, LEGACY_OBSERVATION_NAMES.length));
    // Version 3 appends each body's physical facts after every version 2 column, so a version 2
    // student reads what it was trained on, and each new column reads its own published field.
    assert.deepEqual(labObservation(view, 2), before.slice(0, OBSERVATION_NAMES_V2.length));
    for (const side of ["self", "opponent"]) {
      for (const [field, scale] of [["massKg", 1 / 500], ["stabilityImpulseNs", 1 / 250], ["armRate", 1 / 20], ["soak", 400]]) {
        const column = before[OBSERVATION_NAMES.indexOf(`${side}.${field}`)];
        assert.ok(view[side][field] > 0 && Math.abs(column - view[side][field] * scale) < 1e-12,
          `${side}.${field} reads ${column} from a published ${view[side][field]}`);
      }
    }
    const weapon = view.self.hands.primary.weapon;
    view.self.hands.primary.weapon = weapon === "axe" ? "sword" : "axe";
    const after = labObservation(view);
    assert.equal(after[OBSERVATION_NAMES.indexOf(`self.primary.weapon.${weapon}`)], 0);
    assert.notDeepEqual(before, after);
    view.self.hands.primary.weapon = weapon;
    view.self.hands.primary.lost = true;
    view.self.hands.secondary.lost = true;
    const command = directIntent(Array(22).fill(1), view);
    assert.deepEqual(command.primary, freshGolemIntent().primary);
    assert.deepEqual(command.secondary, freshGolemIntent().secondary);
    assert.equal(command.actingHand, null);
    view.self.hands.primary.lost = false;
    const whole = directIntent(Array(22).fill(1), view);
    assert.equal(whole.primary.roll, Math.PI);
    assert.equal(whole.primary.wristBend, 1);
    assert.equal(directIntent(Array(22).fill(-1), view).primary.wristBend, 0);
    for (const name of BESPOKE) {
      const probe = labMind({ kind: "bespoke", name }, 7);
      const action = probe.decide(view, 1 / 240);
      assert.ok(Number.isFinite(action.forward));
    }
    assert.throws(() => directIntent(Array(21).fill(0), {}), /invalid/);
  } finally { bout.dispose(); }
});

test("archived v1 policies retain their exact feature contract", async () => {
  const { readFileSync } = await import("node:fs");
  const model = JSON.parse(readFileSync(new URL("../research/lab/results/ppo-pilot-1.json", import.meta.url), "utf8"));
  validateNetwork(model);
  assert.equal(infer(model, Array(48).fill(0)).length, 12);
  const env = await createEnvironment({ maxSeconds: 0.2, left: { kind: "network", model } });
  try { env.step(); assert.ok(env.state().clock > 0); } finally { env.close(); }
});

test("paired controller has an independent off-hand cycle and preserves the main hand", async () => {
  const bout = createBout({ left: "idle", right: "idle", seeds: [7, 8], maxSeconds: 1,
    leftGolem: namedBuild("two-blades").setup, rightGolem: namedBuild("two-blades").setup,
    locomotionMode: "supported", physics: await freshHavok() });
  try {
    bout.step();
    const view = bout.left.view;
    // Explicit close-range publication fixture; this test measures controller scheduling, not physics.
    view.opponent.ground.copyFrom(view.self.ground);
    view.opponent.ground.z += view.self.hands.secondary.reach * 0.7;
    const paired = labMind({ kind: "bespoke", name: "paired" }, 7), base = policyMind("golem-duelist", 7);
    let differences = 0, extensions = 0, recoveries = 0;
    for (let i = 0; i < 720; i++) {
      view.clock = i / 240;
      const original = base.decide(view, 1 / 240), actual = paired.decide(view, 1 / 240);
      assert.deepEqual(actual.primary, original.primary);
      if (JSON.stringify(actual.secondary) !== JSON.stringify(original.secondary)) differences++;
      if (actual.secondary.thrust) extensions++;
      else if (actual.secondary.reach === -0.65) recoveries++;
    }
    assert.ok(differences > 30);
    assert.ok(extensions > 10);
    assert.ok(recoveries > 10);
  } finally { bout.dispose(); }
});

test("paired policy preserves Duelist's physical result on non-dual builds", async () => {
  // A paired grip is the non-dual build: its two hands are one mechanism, and `pairedMind` hands it
  // back to the Duelist whole. This ran on `default` until physical contact session 08, but the
  // default build's off hand publishes a thrust, so `independent-hands` applies to it and the paired
  // mind drives it whenever that hand is in range -- the test passed only because on seed 77 it never
  // came within range in three seconds, and once a blow's height reached the tipping ledger it did.
  // On the maul the same bout is equal with the `pairedHands` guard and differs without it.
  const play = async (left) => {
    const env = await createEnvironment({ seed: 77, maxSeconds: 3, left, leftBuild: "maul", rightBuild: "maul" });
    try {
      while (!env.state().terminated && !env.state().truncated) env.step();
      return env.result();
    } finally { env.close(); }
  };
  assert.deepEqual(await play({ kind: "bespoke", name: "paired" }),
    await play({ kind: "baseline", name: "golem-duelist" }));
});

test("frozen lab baseline factories match the registered original minds", async () => {
  const bout = createBout({ left: "idle", right: "idle", seeds: [1, 2], maxSeconds: 1,
    locomotionMode: "supported", physics: await freshHavok() });
  try {
    bout.step();
    for (const name of ["idle", ...Object.keys(LAB_BASELINES)]) {
      const a = originalMind(name, 19), b = policyMind(name, 19);
      for (let i = 0; i < 120; i++) {
        bout.left.view.clock = i / 240;
        assert.deepEqual(a.decide(bout.left.view, 1 / 240), b.decide(bout.left.view, 1 / 240), name);
      }
    }
  } finally { bout.dispose(); }
});

test("training and exported network policies produce the same physical rollout on every surface", async () => {
  for (const [surface, baseline] of [["pilot", "golem-driver"], ["direct", "golem-driver"],
    ["residual", "golem-driver"], ["residual", "golem-duelist"]]) {
  const size = surface === "pilot" ? 12 : 22;
  const model = { version: LAB_VERSION, surface, baseline, hz: 12, observationNames: OBSERVATION_NAMES,
    layers: [{ weights: Array.from({ length: size }, (_, i) => OBSERVATION_NAMES.map((_, j) => (i + j) % 7 === 0 ? 0.1 : 0)),
      bias: Array(size).fill(-0.2), activation: "linear" }] };
  const env = await createEnvironment({ surface, controlBaseline: baseline, maxSeconds: 2 });
  let expected;
  try {
    while (!env.state().terminated && !env.state().truncated) env.step(infer(model, env.observation()));
    expected = env.result();
  } finally { env.close(); }
  const student = await createEnvironment({ surface, maxSeconds: 2, left: { kind: "network", model } });
  try {
    while (!student.state().terminated && !student.state().truncated) student.step();
    assert.deepEqual(student.result(), expected, surface);
  } finally { student.close(); }
  }
});

test("fair planner consumes only training observation transitions and retains ensemble disagreement", () => {
  const observation = Array(OBSERVATION_NAMES.length).fill(0), action = Array(12).fill(0);
  const rows = Array.from({ length: 5 }, (_, i) => {
    const next = [...observation]; next[6] = i / 10;
    return { observation, action, nextObservation: next, split: "train", terminated: false, truncated: false };
  });
  const model = fitObservationModel(rows);
  const label = fairPlan(observation, model, { candidates: 2, steps: 2 });
  assert.equal(label.tier, "fair");
  assert.ok(label.alternatives[0].spread > 0);
  assert.ok(!("replayId" in label));
  const validation = rows.map((r) => ({ ...r, seed: 88, split: "model-validation" }));
  const calibration = calibrateObservationModel(model, validation);
  assert.equal(calibration.transitions, 5);
  assert.ok(Number.isFinite(calibration.rmse));
  assert.throws(() => calibrateObservationModel(model, rows), /independent/);
  assert.throws(() => calibrateObservationModel({ ...model, trainingSeeds: [88] }, validation), /independent/);
  assert.throws(() => fitObservationModel(rows.map((r) => ({ ...r, split: "confirmation" }))), /training-only/);
  const archive = {};
  const entry = { split: "selection", score: 0.6, bouts: 10, behavior: { attackRate: 1, retreatFraction: 0.1, nearFraction: 0.8 } };
  updateArchive(archive, entry); updateArchive(archive, { ...entry, score: 0.4 });
  assert.equal(Object.values(archive)[0].score, 0.6);
  assert.throws(() => updateArchive(archive, { ...entry, split: "train" }), /selection/);
});
