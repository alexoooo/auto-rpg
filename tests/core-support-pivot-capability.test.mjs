/**
 * **How far the knee-weight shift on all fours goes** (`foursSupport`, `tests/fixtures/fours-support.mjs`),
 * measured on the Node core stand, the coordinate engine, 120 Hz, and not a gate
 * (`tests/experimental.json`): in five seconds what is left of the shift asked is under a third of it.
 * What the support holds is `core-support-pivot.test.mjs`'s.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { foursSupport } from "./fixtures/fours-support.mjs";

test("the knee-weight shift on all fours goes most of the way it was asked", async () => {
  const f = await foursSupport(.0001);
  try {
    f.stand.step(600);
    const o = f.observe(), { from, target } = f.body.mind.state, apart = (a, b) => Math.sqrt(a.reduce((sum, x, k) => sum + (x - b[k]) * (x - b[k]), 0));
    assert.ok(apart(o.centre, target) < apart(from, target) / 3, JSON.stringify({ from, target, actual: o.centre }));
  } finally { f.dispose(); }
});
