/**
 * `boundedLeastSquares` (`src/core/control/stance.ts`), the solve that keeps a swinging leg's torques
 * within its strength: on random coupled problems its answer is within the bounds and meets the
 * optimality conditions of the least of (x - y)' A (x - y) there -- each free component's gradient
 * zero, each held one's pointing out of the box -- and y itself is returned where it is inside. The
 * control: y clipped to the box, which is what clipping each freedom alone gives, fails them.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { boundedLeastSquares } from "../src/core/control/stance.ts";

/** A seeded uniform generator (mulberry32). */
function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A problem of `n` freedoms: A = G'G with G 6 x n, as the swing's, and y partly outside the box. */
function problem(seed, n = 6) {
  const r = random(seed);
  const G = Array.from({ length: 6 }, () => Array.from({ length: n }, () => 2 * r() - 1));
  const A = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => G.reduce((sum, row) => sum + row[i] * row[j], 0)));
  const hi = Array.from({ length: n }, () => 50 + 150 * r()), lo = hi.map(() => -(50 + 150 * r()));
  const y = hi.map((h, i) => (2 * r() - 1) * 1.8 * Math.max(h, -lo[i]));
  return { A, y, lo, hi };
}

/** The worst breach of the optimality conditions at x, scaled by the gradient's size. */
function breach({ A, y, lo, hi }, x) {
  const g = x.map((_, i) => A[i].reduce((sum, v, j) => sum + v * (x[j] - y[j]), 0));
  const size = Math.max(1, ...g.map(Math.abs));
  let worst = 0;
  x.forEach((v, i) => {
    const tol = 1e-9 * (hi[i] - lo[i]);
    if (v < lo[i] - tol || v > hi[i] + tol) worst = Math.max(worst, Infinity);
    else if (v <= lo[i] + tol) worst = Math.max(worst, -g[i] / size);
    else if (v >= hi[i] - tol) worst = Math.max(worst, g[i] / size);
    else worst = Math.max(worst, Math.abs(g[i]) / size);
  });
  return worst;
}

test("the bounded least squares meets its optimality conditions within the box, and y clipped does not", () => {
  let clippedFails = 0, held = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const p = problem(seed);
    const x = boundedLeastSquares(p.A, p.y, p.lo, p.hi);
    // The regularizer, 1e-6 of the largest diagonal, is charged on distances of some hundreds of
    // N m against gradients of some tens: it moves the answer by that order.
    assert.ok(breach(p, x) < 1e-3, `seed ${seed}: breach ${breach(p, x)}`);
    held += x.filter((v, i) => v === p.lo[i] || v === p.hi[i]).length;
    const clipped = p.y.map((v, i) => Math.min(p.hi[i], Math.max(p.lo[i], v)));
    if (breach(p, clipped) > 1e-2) clippedFails++;
  }
  assert.ok(held > 100, `only ${held} bounds held: the problems do not exercise the bounds`);
  assert.ok(clippedFails > 150, `the control: y clipped met the conditions in ${200 - clippedFails} of 200`);
});

test("the bounded least squares returns y where y is inside the box", () => {
  const p = problem(7);
  const y = p.lo.map((l, i) => (l + p.hi[i]) / 3);
  assert.deepEqual(boundedLeastSquares(p.A, y, p.lo, p.hi), y);
});
