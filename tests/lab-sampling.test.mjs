import test from "node:test";
import assert from "node:assert/strict";
import { infer, sampleNetwork, validateNetwork, OBSERVATION_NAMES, LAB_VERSION } from "../src/golem/lab-policy.ts";
import { createEnvironment, recording, replay } from "../research/lab/environment.mjs";

const model = () => ({ version: LAB_VERSION, surface: "residual", baseline: "golem-duelist", hz: 12,
  observationNames: OBSERVATION_NAMES, samplingStd: Array(22).fill(0.5),
  layers: [{ activation: "linear", weights: Array.from({ length: 22 }, () => Array(OBSERVATION_NAMES.length).fill(0)),
    bias: Array(22).fill(1.5) }] });
const observation = Array(OBSERVATION_NAMES.length).fill(0);

test("PPO Gaussian noise precedes clipping, while deterministic inference retains the mean", () => {
  const m = model();
  let draws = 0;
  const random = () => draws++ % 2 === 0 ? Math.exp(-2) : 0.5; // z = -2
  assert.deepEqual(infer(m, observation), Array(22).fill(1));
  assert.deepEqual(sampleNetwork(m, observation, random), Array(22).fill(0.5));
  assert.equal(draws, 44);
  delete m.samplingStd;
  assert.deepEqual(sampleNetwork(m, observation, () => assert.fail("legacy policy consumed randomness")), infer(m, observation));
  m.samplingStd = Array(22).fill(0);
  assert.deepEqual(sampleNetwork(m, observation, () => assert.fail("zero deviation consumed randomness")), infer(m, observation));
});

test("sampling deviations reject wrong dimensions, negative and non-finite values", () => {
  for (const bad of [[], null, Array(22).fill(-1), Array(22).fill(Infinity), Array(22).fill(NaN)]) {
    assert.throws(() => validateNetwork({ ...model(), samplingStd: bad }), /sampling deviation/);
  }
  validateNetwork(model());
});

test("sampled policies replay the exact physical trace, including held substep actions", async () => {
  const m = model(); m.layers[0].bias.fill(0);
  const run = async (seed) => {
    const env = await createEnvironment({ seed, maxSeconds: 1, surface: "residual", trace: true,
      left: { kind: "network", model: m } });
    try {
      while (!env.state().terminated && !env.state().truncated) env.step();
      return recording(env);
    } finally { env.close(); }
  };
  const record = await run(17);
  const copy = await replay(record, record.steps.length); copy.close();
  assert.deepEqual((await run(17)).steps, record.steps);
  assert.notDeepEqual((await run(18)).steps.map((r) => r.trace), record.steps.map((r) => r.trace));
});
