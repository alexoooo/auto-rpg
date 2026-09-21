import test from "node:test";
import assert from "node:assert/strict";
import { modelCases, spacedRows, modelCampaign } from "../research/model-campaign.mjs";
import { OBSERVATION_NAMES } from "../src/golem/lab-policy.ts";

test("model calibration covers the complete matrix and separated episode seeds", () => {
  const train = modelCases(12001), validation = modelCases(112001);
  assert.equal(train.length, 16);
  assert.equal(new Set(train.map((r) => r.build + r.opponent)).size, 16);
  assert.ok(validation.every((r) => !train.some((t) => t.seed === r.seed)));
  assert.deepEqual(spacedRows(Array.from({ length: 100 }, (_, i) => i), 4), [0, 25, 50, 75]);
});

test("calibration campaign resumes completed episodes and reports episode-balanced error", async () => {
  let calls = 0;
  const collectEpisode = async ({ seed, onTransition }) => {
    calls++;
    const observation = OBSERVATION_NAMES.map(() => 0), nextObservation = observation.map(() => 0.1);
    onTransition({ seed, action: Array(12).fill(0), observation, nextObservation, terminated: false, truncated: false });
    return { id: String(seed), steps: [{ clock: 1, terminated: true, truncated: false }] };
  };
  const result = await modelCampaign({ deadline: Infinity, collectEpisode });
  assert.equal(calls, 32); assert.equal(result.status, "complete");
  assert.equal(result.calibration.perEpisode.length, 16);
  assert.equal(result.calibration.balancedRmse, 0);
  assert.ok(result.calibration.beatsPersistence);
  assert.equal(await modelCampaign({ deadline: Infinity, previous: result, collectEpisode }), result);
  assert.equal(calls, 32);
  const partial = { protocol: result.protocol, episodes: result.episodes.slice(0, 17), status: "budget" };
  const resumed = await modelCampaign({ deadline: Infinity, previous: partial, collectEpisode });
  assert.equal(calls, 47); // Only the fifteen missing episodes are collected again.
  assert.deepEqual(resumed.calibration, result.calibration);
  await assert.rejects(modelCampaign({ deadline: Infinity, seed: 4, previous: result }), /protocol mismatch/);
});

test("a deadline-cut model trajectory is neither retained nor calibrated", async () => {
  const result = await modelCampaign({ deadline: Infinity,
    collectEpisode: async () => ({ id: "unfinished", steps: [{ clock: 0.5, terminated: false, truncated: false }] }) });
  assert.equal(result.status, "budget");
  assert.deepEqual(result.episodes, []);
  assert.equal(result.calibration, undefined);
});
