import test from "node:test";
import assert from "node:assert/strict";
import { networkFaults, recoveryNetwork } from "../src/core/math/learning/recovery-network.ts";

test("malformed learned layers return faults instead of throwing while inspecting shape", () => {
  for (const layers of [[null], [undefined], [{ weights: [null], bias: [0] }], [{ weights: [[1]], bias: null }], [{ weights: [[1, , 2]], bias: [0] }]]) {
    const found = networkFaults({ actions: 1, layers });
    assert.ok(found.faults.length > 0, JSON.stringify(layers));
  }
});

test("learned inference retains clipped observation and action preprocessing", () => {
  const actor = { actions: 1, layers: [{ weights: [[.01]], bias: [0] }], normalization: { mean: [2], scale: [2], clip: 10 }, actionLimit: 3 };
  const run = recoveryNetwork(actor);
  for (const raw of [-100, 2, 3, 100]) {
    const input = Math.max(-10, Math.min(10, (raw - 2) * 2));
    assert.ok(Math.abs(run([raw])[0] - Math.tanh(input * .01)) < 1e-15);
  }
  const limited = recoveryNetwork({ ...actor, layers: [{ weights: [[1]], bias: [0] }] });
  assert.ok(Math.abs(limited([100])[0] - Math.tanh(3)) < 1e-15);
  assert.ok(Math.abs(limited([-100])[0] + Math.tanh(3)) < 1e-15);
  assert.ok(networkFaults({ ...actor, normalization: { ...actor.normalization, scale: [0] } }).faults.length > 0);
});
