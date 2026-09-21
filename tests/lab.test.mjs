import test from "node:test";
import assert from "node:assert/strict";
import { createEnvironment, recording, replay } from "../research/lab/environment.mjs";
import { createBout, runBout, freshHavok } from "./harness/bout-runner.mjs";
import { freshGolemIntent } from "../src/golem/tactics.ts";
import { namedBuild } from "../src/golem/roster.ts";
import { labMind, validateAction, validateNetwork, infer, OBSERVATION_NAMES, directIntent, BESPOKE } from "../src/golem/lab-policy.ts";
import { fitObservationModel, fairPlan, oracle } from "../research/lab/planning.mjs";
import { updateArchive } from "../research/lab/archive.mjs";
import { digest } from "../research/schedule.mjs";

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
  const model = { version: 1, surface: "pilot", hz: 12, observationNames: OBSERVATION_NAMES,
    layers: [{ weights: Array.from({ length: 12 }, () => Array(OBSERVATION_NAMES.length).fill(0)), bias: Array(12).fill(0.4), activation: "linear" }] };
  validateNetwork(model);
  assert.deepEqual(infer(model, Array(OBSERVATION_NAMES.length).fill(0)), Array(12).fill(0.4));
  assert.throws(() => validateNetwork({ ...model, version: 99 }), /incompatible/);
  const invalid = structuredClone(model); invalid.layers[0].weights[0][0] = Infinity;
  assert.throws(() => validateNetwork(invalid), /invalid/);
});

test("direct commands remain legal after losing both hands and bespoke policies use published observations", async () => {
  const bout = createBout({ left: "idle", right: "idle", seeds: [1, 2],
    locomotionMode: "supported", maxSeconds: 1, physics: await freshHavok() });
  try {
    bout.step();
    // Real publication, explicitly changed to exercise the capability-loss branch.
    const view = bout.left.view;
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

test("training and exported network policies produce the same physical rollout on every surface", async () => {
  for (const surface of ["pilot", "direct", "residual"]) {
  const size = surface === "pilot" ? 12 : 22;
  const model = { version: 1, surface, hz: 12, observationNames: OBSERVATION_NAMES,
    layers: [{ weights: Array.from({ length: size }, (_, i) => OBSERVATION_NAMES.map((_, j) => (i + j) % 7 === 0 ? 0.1 : 0)),
      bias: Array(size).fill(-0.2), activation: "linear" }] };
  const env = await createEnvironment({ surface, maxSeconds: 2 });
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
  assert.throws(() => fitObservationModel(rows.map((r) => ({ ...r, split: "confirmation" }))), /training-only/);
  const archive = {};
  const entry = { split: "selection", score: 0.6, bouts: 10, behavior: { attackRate: 1, retreatFraction: 0.1, nearFraction: 0.8 } };
  updateArchive(archive, entry); updateArchive(archive, { ...entry, score: 0.4 });
  assert.equal(Object.values(archive)[0].score, 0.6);
  assert.throws(() => updateArchive(archive, { ...entry, split: "train" }), /selection/);
});
