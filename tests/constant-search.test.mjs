import test from "node:test";
import assert from "node:assert/strict";
import { constantResidual, constantSearch, POSE_FIELDS } from "../research/constant-search.mjs";
import { DIRECT_FIELDS, infer, OBSERVATION_NAMES } from "../src/golem/lab-policy.ts";

test("constant pose search changes every numeric axis but never an attack gate", () => {
  assert.equal(POSE_FIELDS.length, 16);
  const parameters = POSE_FIELDS.map((_, i) => (i + 1) / 16);
  const action = infer(constantResidual(parameters), OBSERVATION_NAMES.map(() => 0.8));
  let index = 0;
  assert.deepEqual(action, DIRECT_FIELDS.map((name) => /\.(thrust|guard)$/.test(name) ? 0 : parameters[index++]));
  assert.throws(() => constantResidual([NaN]), /parameters/);
});

test("constant search remeasures incumbent and zero on matched generation fixtures", async () => {
  const seen = [];
  const result = await constantSearch({ deadline: Infinity, seed: 7, generations: 2, population: 4,
    evaluate: async (p, config) => {
      seen.push({ p: [...p], ...config });
      return { score: p[0] > 0 ? 1 : 0, margin: p[0], rows: [] };
    } });
  assert.equal(result.history.length, 2);
  assert.deepEqual(seen[4].p, result.history[0].champion);
  assert.deepEqual(seen[5].p, POSE_FIELDS.map(() => 0));
  assert.deepEqual(seen.map((r) => r.generation), [0, 0, 0, 0, 1, 1, 1, 1]);
  assert.ok(seen.every((r) => r.seed === 7));
  assert.deepEqual(result.partial, []);
});

test("a partial generation cannot select a lucky early candidate", async () => {
  let calls = 0;
  const result = await constantSearch({ deadline: Infinity, population: 4,
    evaluate: async () => ++calls === 4 ? null : { score: calls, margin: 0, rows: [] } });
  assert.equal(result.history.length, 0);
  assert.equal(result.partial.length, 3);
  assert.deepEqual(result.champion, POSE_FIELDS.map(() => 0));
});
