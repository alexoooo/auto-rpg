/**
 * **Who takes a blow's energy** (`energyShares`, `src/core/rules/share.ts`): surfaces in series
 * under one force share by their compliance, a rigid one takes none, and a stiffness that is none
 * is refused.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { energyShares } from "../src/core/rules/share.ts";

test("two surfaces share a blow by their compliance", () => {
  // 1/100 and 1/300 of 4/300: the softer takes three quarters.
  assert.deepEqual(energyShares([100, 300]), [0.75, 0.25]);
  assert.deepEqual(energyShares([300, 100]), [0.25, 0.75]);
  assert.deepEqual(energyShares([250, 250]), [0.5, 0.5]);
  // A rigid surface takes none, and what meets it takes all; two rigid ones, nobody.
  assert.deepEqual(energyShares([100, null]), [1, 0]);
  assert.deepEqual(energyShares([null, 100]), [0, 1]);
  assert.deepEqual(energyShares([null, null]), [0, 0]);
  // Every layer between the two bodies, in any order.
  assert.deepEqual(energyShares([100, 300, null]), [0.75, 0.25, 0]);
  assert.deepEqual(energyShares([null, 300, 100]), [0, 0.25, 0.75]);
  assert.deepEqual(energyShares([]), []);
  // With a compliant layer the shares are the whole blow, to rounding.
  for (const list of [[201e3, 122.3e3], [17e3, 122.3e3, null], [247e3, 17e3, 201e3, 122.3e3], [1e-3, 1e9]]) {
    const shares = energyShares(list), sum = shares.reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1) <= 2 * Number.EPSILON, `${list}: ${sum}`);
    assert.ok(shares.every((share) => share >= 0 && share <= 1), `${shares}`);
  }
  // The stiffer the other, the more of it is this one's.
  assert.ok(energyShares([100, 1000])[0] > energyShares([100, 300])[0]);
});

test("a stiffness that is no stiffness is refused", () => {
  for (const k of [0, -1, NaN, Infinity, -Infinity, undefined]) {
    assert.throws(() => energyShares([100, k]), /a surface's stiffness is a finite N\/m over 0/, `${k}`);
    assert.throws(() => energyShares([k, null]), /a surface's stiffness is a finite N\/m over 0/, `${k}`);
  }
});
