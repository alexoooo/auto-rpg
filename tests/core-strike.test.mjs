/**
 * The strike search's perturbation (`perturbed` in `research/core-strike.mjs`): the variation a
 * search averages a candidate over, since one blow is chaotic.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { perturbed } from "../research/core-strike.mjs";

const strike = {
  name: "a blow", hand: "right", chamber: { seconds: 0.3, pose: { "elbow.right flexion": 1.2 } },
  pushes: [
    { channel: "elbow.right flexion", sense: -1, from: 0.002, to: 0.1, level: 0.5 },
    { channel: "shoulder.right flexion", sense: 1, from: 0.05, to: 0.2, level: 0.99 },
    { channel: "thoracic rotation right", sense: 1, from: 0, to: 0.15 },
  ],
};

test("a perturbed strike moves every push and scales its activation, within what a push can be", () => {
  const before = structuredClone(strike);
  assert.deepEqual(perturbed(strike, { shift: -0.004, scale: 1.02 }), {
    ...strike,
    pushes: [
      { channel: "elbow.right flexion", sense: -1, from: 0, to: 0.1 - 0.004, level: 0.5 * 1.02 },
      { channel: "shoulder.right flexion", sense: 1, from: 0.05 - 0.004, to: 0.2 - 0.004, level: 1 },
      { channel: "thoracic rotation right", sense: 1, from: 0, to: 0.15 - 0.004, level: 1 },
    ],
  });
  assert.deepEqual(perturbed(strike, { shift: 0.004, scale: 0.98 }).pushes.map((p) => [p.from, p.to, p.level]),
    [[0.002 + 0.004, 0.1 + 0.004, 0.5 * 0.98], [0.05 + 0.004, 0.2 + 0.004, 0.99 * 0.98], [0.004, 0.15 + 0.004, 0.98]]);
  assert.deepEqual(strike, before, "the strike itself is left as it was");
});
