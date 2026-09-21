import test from "node:test";
import assert from "node:assert/strict";
import { referenceDataset } from "../research/teacher-dataset.mjs";
import { OBSERVATION_NAMES } from "../src/golem/lab-policy.ts";
import { digest } from "../research/schedule.mjs";

function reference() {
  const result = { tier: "privileged", status: "finished", record: { version: 2, fingerprint: "current",
    observationNames: OBSERVATION_NAMES, config: { hz: 12, surface: "residual", controlBaseline: "golem-duelist",
      left: { kind: "baseline", name: "golem-duelist" }, right: { kind: "baseline", name: "golem-champion" }, seed: 55, leftBuild: "default" },
    steps: [0, 1, 2].map((i) => ({ observation: Array(OBSERVATION_NAMES.length).fill(i / 10),
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
