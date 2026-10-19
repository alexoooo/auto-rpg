/**
 * The learned rise: step up steered by a policy. It is offered beside step up, a policy's outputs
 * set its steer within their ranges, and unsteered it is step up to the step.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { RISE_STEER_KEYS } from "../src/core/mind/rise/staged.ts";
import { riseSteerFrom } from "../src/core/mind/ground/learned-rise.ts";
import { TECHNIQUES } from "../src/core/mind/ground/techniques.ts";
import { risingTrial } from "../research/rising-trial.mjs";

test("the learned rise is offered beside step up, experimental, from the same positions and on the same foot", () => {
  const learned = TECHNIQUES["learned-rise"], up = TECHNIQUES["step-up"];
  assert.equal(learned.stage, "experimental");
  assert.deepEqual(learned.sides, up.sides);
  assert.deepEqual(learned.edges, up.edges);
});

test("a policy's outputs set the steer, each held to -1 to 1 and scaled by its range", () => {
  const steer = riseSteerFrom(RISE_STEER_KEYS.map(() => 2), Object.fromEntries(RISE_STEER_KEYS.map((key) => [key, Number.NaN])));
  const half = riseSteerFrom(RISE_STEER_KEYS.map(() => -.5), { ...steer });
  for (const key of RISE_STEER_KEYS) {
    assert.ok(steer[key] > 0 && Number.isFinite(steer[key]), `${key} at its range: ${steer[key]}`);
    assert.equal(half[key], -.5 * steer[key], key);
  }
  assert.deepEqual(Object.keys(steer), [...RISE_STEER_KEYS]);
});

test("unsteered, the learned rise stands a Warrior placed half kneeling as step up does, to the step", async () => {
  const trial = (technique) => risingTrial({ id: 0, model: "workshop-fighter", held: "empty", seed: 2, start: "placed", posture: "half-kneel",
    sub: "stand-up", techniques: [technique], balance: 0, cap: 6 });
  const [learned, up] = [await trial("learned-rise"), await trial("step-up")];
  assert.equal(learned.status, "stood");
  assert.deepEqual([learned.handback, learned.verified, learned.walked], [up.handback, up.verified, up.walked]);
});
