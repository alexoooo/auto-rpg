import test from 'node:test';
import assert from 'node:assert/strict';
import { recoveryNetwork } from '../src/core/control/recovery-network.ts';

test('exported actor inference preserves asymmetric channels, saturation and independent calls', () => {
  const run = recoveryNetwork({ actions: 3, layers: [
    { weights: [[1,2],[-1,1]], bias: [0,-1] },
    { weights: [[1,0],[0,1],[-1000,0],[0,0],[0,0],[0,0]], bias: [0,-2,0,10,20,30] },
  ] });
  const expected = [Math.tanh(3),Math.tanh(-2),-1];
  const actual = run([1,1]);
  actual.forEach((v,i) => assert.ok(Math.abs(v-expected[i]) < 1e-14));
  run([-1,-1]); assert.deepEqual(run([1,1]),actual);
  assert.throws(() => run([NaN,1]), /observation/);
  assert.throws(() => recoveryNetwork({actions:1,layers:[{weights:[[1]],bias:[Infinity]}]}), /layer/);
});
