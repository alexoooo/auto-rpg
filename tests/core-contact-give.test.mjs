/**
 * Muscles that hold through a blow (`yieldPath`, `ContactMass.yielding`, `contactGive` in
 * `src/core/build/contact-mass.ts`): the path a push follows against held freedoms, against every
 * way the freedoms could hold or give, on random mass matrices; and on a Warrior's arm, that no hold
 * is the free mass, that holding raises it, and that two sides agree on the impulse and the time.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { changeAt, contactGive, contactMass, yieldPath } from "../src/core/build/contact-mass.ts";
import { modelSpec } from "../src/core/models.ts";
import { coreStand } from "./harness/core-stand.mjs";

/** A seeded uniform in [0, 1). */
function random(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/** x with A x = b, by Gaussian elimination. */
function solve(A, b) {
  const m = b.length, M = A.map((row, i) => [...row, b[i]]);
  for (let i = 0; i < m; i++) {
    for (let r = i + 1; r < m; r++) { const f = M[r][i] / M[i][i]; for (let k = i; k <= m; k++) M[r][k] -= f * M[i][k]; }
  }
  const x = new Array(m).fill(0);
  for (let i = m - 1; i >= 0; i--) { let s = M[i][m]; for (let k = i + 1; k < m; k++) s -= M[i][k] * x[k]; x[i] = s / M[i][i]; }
  return x;
}

/** The change a push of `P` makes, found by trying every way the freedoms could hold (0) or give at a bound (+1, -1). */
function bruteChange(a, c, K, low, high, P) {
  const h = c.length, found = [];
  for (let code = 0; code < 3 ** h; code++) {
    const at = [];
    for (let i = 0, rest = code; i < h; i++, rest = Math.floor(rest / 3)) at.push([0, 1, -1][rest % 3]);
    const given = at.map((s, i) => s > 0 ? high[i] : s < 0 ? low[i] : 0);
    const holding = at.flatMap((s, i) => s === 0 ? [i] : []);
    const rhs = holding.map((i) => -c[i] * P - at.reduce((sum, s, k) => sum + (s === 0 ? 0 : K[i][k] * given[k]), 0));
    const inside = solve(holding.map((i) => holding.map((k) => K[i][k])), rhs);
    holding.forEach((i, k) => { given[i] = inside[k]; });
    const eps = 1e-9 * (1 + P);
    const ok = at.every((s, i) => {
      if (s === 0) return given[i] >= low[i] - eps && given[i] <= high[i] + eps;
      const turn = c[i] * P + given.reduce((sum, g, k) => sum + K[i][k] * g, 0);
      return s > 0 ? turn <= eps : turn >= -eps;
    });
    if (ok) found.push(a * P + c.reduce((sum, ci, i) => sum + ci * given[i], 0));
  }
  return found;
}

test("a push against held freedoms follows the one path that every way of holding agrees with", () => {
  const next = random(7);
  let checked = 0;
  for (let trial = 0; trial < 60; trial++) {
    const h = 1 + (trial % 5), n = h + 2;
    // A random mass matrix, its inverse, the push on the first speed and the held ones after it.
    const B = Array.from({ length: n }, () => Array.from({ length: n }, () => next() * 2 - 1));
    const M = B.map((_, i) => B.map((__, j) => B.reduce((sum, row) => sum + row[i] * row[j], 0) + (i === j ? 0.2 : 0)));
    const A = M.map((_, i) => solve(M, M.map((__, k) => (k === i ? 1 : 0))));
    const cols = Array.from({ length: h }, (_, i) => i + 1);
    const a = A[0][0], c = cols.map((col) => A[col][0]), K = cols.map((i) => cols.map((k) => A[i][k]));
    const low = cols.map((_, i) => (i === 1 ? 0 : -next() * 2)), high = cols.map((_, i) => (i === 2 ? 0 : next() * 2));
    const path = yieldPath(a, c, K, low, high);
    for (const P of [0.01, 0.3, 1, 3, 10, 40]) {
      const brute = bruteChange(a, c, K, low, high, P);
      assert.ok(brute.length >= 1, `trial ${trial}, P ${P}: no way of holding fits`);
      for (const v of brute) assert.ok(Math.abs(changeAt(path, P) - v) < 1e-7 * (1 + Math.abs(v)), `trial ${trial}, P ${P}: ${changeAt(path, P)} against ${v}`);
      checked++;
    }
    assert.ok(Math.abs(path.slope - a) < 1e-12 * a || path.impulse.length < h + 1, "past every corner the push meets the free mass, or a freedom never gave");
  }
  assert.equal(checked, 360);
});

test("a Warrior's fist meets its free mass with no hold, more with its arm held, and two sides share one impulse over one time", async () => {
  const stand = await coreStand(modelSpec("workshop-fighter"), { gravity: false, ground: false });
  try {
    const masses = contactMass(stand.built), hand = stand.built.segments.get("hand.right"), forearm = stand.built.segments.get("forearm.right");
    masses.update();
    const point = hand.node.position.asArray(), along = hand.node.position.subtract(forearm.node.position).asArray();
    const free = masses.along(hand, point, along);
    const none = masses.yielding(hand, point, along, []);
    assert.deepEqual([none.impulse, none.change], [[0], [0]]);
    assert.ok(Math.abs(1 / none.slope - free) < 1e-12 * free);
    const arm = [...stand.built.joints.values()].filter((joint) => /(shoulder|elbow|wrist)\.right|spine|thoracic|lumbar/.test(joint.spec.name))
      .flatMap((joint) => joint.dofs.map((_, index) => ({ joint, index, negative: 150, positive: 150 })));
    assert.ok(arm.length >= 7, `${arm.length} held freedoms`);
    const held = masses.yielding(hand, point, along, arm);
    assert.ok(held.impulse.length > 1 && changeAt(held, 1e-3) / 1e-3 < none.slope, "a held arm moves less for a small push");
    assert.ok(Math.abs(held.slope - none.slope) < 1e-9 * none.slope, "and gives as freely once every hold has given");
    const head = masses.yielding(hand, point, along, []);
    assert.deepEqual(contactGive(held, head, 6, Infinity), { impulse: 0, aKg: 1 / held.slope, bKg: 1 / head.slope }, "no compliance, no time to hold");
    const stiffness = 7.6e4, closing = 6, give = contactGive(held, head, closing, stiffness);
    assert.ok(give.aKg > free * 1.05, `the held fist meets ${give.aKg} kg against ${free} free`);
    const mu = give.impulse / closing, T = Math.PI * Math.sqrt(mu / stiffness);
    const stops = T * (changeAt(held, give.impulse / T) + changeAt(head, give.impulse / T));
    assert.ok(Math.abs(stops - closing) < 1e-9 * closing, `the impulse stops the closing: ${stops}`);
    assert.ok(Math.abs(1 / (1 / give.aKg + 1 / give.bKg) - mu) < 1e-9 * mu, "each side's mass is the impulse over its change");
  } finally { stand.dispose(); }
});
