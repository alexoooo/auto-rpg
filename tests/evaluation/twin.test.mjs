import { test } from "node:test";
import assert from "node:assert/strict";
import { between } from "../../src/evaluation/twin.ts";

// A twin is held out from its cell: e66f926ba's `between` drew each point at the middle of its share
// of the range, which for an odd count of evenly spaced points is the cell's own middle point (the
// cover's gaps 1.2, 1.6, 2 gave 1.6; the way-up bouts' centre case was in their twin), so a search
// scored on a case its confirmation holds out. No drill shows it: a search reads only its score.
test("between draws as many points as a list, none of them its own", () => {
  for (let n = 2; n <= 9; n++) for (const [low, step] of [[0, 1], [1.2, 0.4], [-1, 1], [0.6, 0.1]]) {
    const points = Array.from({ length: n }, (_, k) => Math.round((low + k * step) * 1e4) / 1e4), drawn = between(points);
    assert.equal(drawn.length, n, `${points}`);
    for (const point of drawn) assert.ok(!points.includes(point), `${point} of ${points}`);
  }
});
