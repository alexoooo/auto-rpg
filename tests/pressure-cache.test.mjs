import test from "node:test";
import assert from "node:assert/strict";
import { cachedPressure, pressureAt } from "../src/core/option/percepts.ts";

/** A measured pressure whose rate exposes every input and counts the profile reads it makes. */
function fixture(phase = "clear", struck = { factor: 3 }) {
  const calls = [];
  const pressure = { model: [
    { reach: () => 10, rate(at, target) {
      calls.push({ ...at, velocity: [...at.velocity], struck: target });
      return (at.range + at.velocity[0] * 2 + at.velocity[1] * 3 + (at.phase === "clear" ? 1 : 2)) * target.factor;
    } },
    { reach: () => 5, rate: () => null },
    { reach: () => 0, rate(at) { assert.ok(Number.isNaN(at.range), "a finite out of reach start is not read"); return null; } },
  ], phase, struck, peak: 20, latency: .5, priced: "measured" };
  return { pressure, calls };
}

test("an exact pressure cache shares a rate across durations and distinguishes every start component", () => {
  const { pressure, calls } = fixture(), cached = cachedPressure(pressure);
  for (const [range, velocity] of [[1, [0, 0]], [1 + Number.EPSILON, [0, 0]], [1, [Number.EPSILON, 0]], [1, [0, Number.EPSILON]],
    [1, [-0, 0]], [1, [0, -0]], [0, [1, 0]], [-0, [1, 0]]]) {
    const before = calls.length;
    const expected = pressureAt(pressure, range, velocity, 1);
    assert.equal(pressureAt(cached, range, velocity, 1), expected);
    assert.equal(calls.length, before + 2, "a distinct exact start misses");
    for (const seconds of [0, -0, .125, 3]) assert.equal(pressureAt(cached, range, [...velocity], seconds), expected * seconds);
    assert.equal(calls.length, before + 2, "duration and tuple identity do not change the cached rate");
  }
  assert.equal(cached.model, pressure.model);
  assert.deepEqual([cached.phase, cached.struck, cached.peak, cached.latency, cached.priced], [pressure.phase, pressure.struck, pressure.peak, pressure.latency, pressure.priced]);
});

test("pressure caches isolate their profiles, phase and struck body and retain exact results after eviction", () => {
  const a = fixture(), b = fixture("striking", { factor: 5 });
  const first = cachedPressure(a.pressure), other = cachedPressure(b.pressure);
  assert.equal(pressureAt(first, 1, [0, 0], .5), 3);
  assert.equal(pressureAt(other, 1, [0, 0], .5), 7.5);
  assert.equal(pressureAt(first, 1, [0, 0], .25), 1.5);
  assert.equal(a.calls.length, 1); assert.equal(b.calls.length, 1);
  const starts = Array.from({ length: 1024 }, (_, i) => ({ range: 1 + i / 2048, velocity: [i / 1024, -i / 1024] }));
  for (const { range, velocity } of starts) assert.equal(pressureAt(first, range, velocity, .25), pressureAt(a.pressure, range, velocity, .25));
  const before = a.calls.length;
  for (const { range, velocity } of starts) assert.equal(pressureAt(first, range, velocity, .125), pressureAt(a.pressure, range, velocity, .125));
  assert.ok(a.calls.length > before + starts.length, "bounded scratch evicts starts and recomputes their rates");
  const fresh = cachedPressure(a.pressure), reads = a.calls.length;
  assert.equal(pressureAt(fresh, 1, [0, 0], .5), 3);
  assert.equal(a.calls.length, reads + 1, "a new search begins without cached results");
});

test("empty, out of reach and nonfinite pressure queries retain their original arithmetic", () => {
  const { pressure } = fixture(), cached = cachedPressure(pressure);
  for (const [range, velocity] of [[10, [0, 0]], [11, [0, 0]], [NaN, [0, 0]], [1, [Infinity, 0]], [1, [0, -Infinity]]])
    for (const seconds of [0, -0, .5, Infinity]) assert.equal(pressureAt(cached, range, velocity, seconds), pressureAt(pressure, range, velocity, seconds));
  const empty = { ...pressure, model: [] };
  for (const seconds of [0, -0, 1, Infinity]) assert.equal(pressureAt(cachedPressure(empty), 1, [0, 0], seconds), pressureAt(empty, 1, [0, 0], seconds));
});
