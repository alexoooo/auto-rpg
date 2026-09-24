import test from "node:test";
import assert from "node:assert/strict";
import { referenceDataset } from "../research/teacher-dataset.mjs";
import { LAB_VERSION, OBSERVATION_NAMES, infer } from "../src/golem/lab-policy.ts";
import { digest } from "../research/schedule.mjs";

function reference() {
  const result = { tier: "privileged", status: "finished", record: { version: LAB_VERSION, fingerprint: "current",
    observationNames: OBSERVATION_NAMES, config: { hz: 12, surface: "residual", controlBaseline: "golem-duelist",
      left: { kind: "baseline", name: "golem-duelist" }, right: { kind: "baseline", name: "golem-champion" }, seed: 55, leftBuild: "default" },
    steps: [0, 1, 2].map((i) => ({ clock: (i + 1) / 12, observation: Array(OBSERVATION_NAMES.length).fill(i / 10),
      action: i === 1 ? Array(22).fill(0.2) : null, terminated: i === 2, truncated: false, winner: i === 2 ? "left" : null })) } };
  result.record.id = digest({ config: result.record.config, steps: result.record.steps });
  return result;
}
test("teacher imitation uses pre-action observations, includes held decisions and deduplicates replay identities", () => {
  const r = reference(), result = referenceDataset([r, r], "current");
  assert.equal(result.labels.length, 2);
  assert.deepEqual(result.labels[0].observation, r.record.steps[0].observation);
  assert.deepEqual(result.labels[0].action, r.record.steps[1].action);
  assert.deepEqual(result.labels[1].observation, r.record.steps[1].observation);
  assert.deepEqual(result.labels[1].action, Array(22).fill(0));
  assert.equal(result.manifest.sources.length, 1);
  assert.deepEqual(result.constantModel.layers[0].bias, Array(22).fill(0.1));
  assert.ok(result.constantModel.layers[0].weights.every((r) => r.every((w) => w === 0)));
});
test("clock-only teacher control follows nominal opening decisions without reading other observations", () => {
  const result = referenceDataset([reference()], "current");
  assert.equal(result.clockModels.length, 1);
  const model = result.clockModels[0];
  for (const other of [-4, 4]) for (const [time, expected] of [[0, 0], [1 / 12, 0.2], [2 / 12, 0], [10, 0]]) {
    const observation = OBSERVATION_NAMES.map((name) => name === "clock" ? time / 150 : other);
    assert.ok(infer(model, observation).every((x) => Math.abs(x - expected) < 1e-12));
  }
  const r = reference();
  r.record.steps[1].clock = r.record.steps[0].clock;
  r.record.id = digest({ config: r.record.config, steps: r.record.steps });
  assert.throws(() => referenceDataset([r], "current"), /teacher clock/);
});
test("teacher extraction refuses partial, stale and non-equivalent baseline trajectories", () => {
  const r = reference();
  assert.throws(() => referenceDataset([r], "changed"), /matching-source/);
  assert.throws(() => referenceDataset([{ ...r, status: "budget" }], "current"), /completed/);
  const altered = reference();
  altered.record.steps[1].action[0] = 0.3;
  assert.throws(() => referenceDataset([altered], "current"), /matching-source/);
  r.record.config.left = { kind: "network", model: {} };
  assert.throws(() => referenceDataset([r], "current"), /baseline/);
});
