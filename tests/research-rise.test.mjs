/**
 * **The battery of falls** (`research/core-rise-trials.mjs`): what counts as having risen, and a
 * shove of the battery's own that fells a body. Node, core world, Rapier, 120 Hz.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { risenAt, shoved, UP_SECONDS } from "../research/core-rise-trials.mjs";

test("a rise is two seconds up running", () => {
  const hz = 10, run = UP_SECONDS * hz;
  const trace = (...spans) => spans.flatMap(([down, steps]) => Array.from({ length: steps }, () => down));
  assert.equal(risenAt(trace([true, 30], [false, run]), hz), 3, "down 3 s, then up the whole run");
  assert.equal(risenAt(trace([true, 30], [false, run - 1], [true, 5]), hz), null, "up a step short of it, and down again");
  assert.equal(risenAt(trace([true, 30], [false, run - 1]), hz), null, "up a step short of it when the watch ends");
  assert.equal(risenAt(trace([true, 30], [false, run - 1], [true, 5], [false, run + 4]), hz), 3 + (run - 1 + 5) / hz, "the run that counts is the first whole one");
  assert.equal(risenAt(trace([false, run]), hz), 0, "never down, it is up from the start");
  assert.equal(risenAt([], hz), null);
});

test("a shove of the battery fells the Warrior, and it does not rise", async () => {
  for (const degrees of [0, 90]) {
    const row = await shoved({ model: "workshop-fighter", held: "club", degrees });
    assert.deepEqual(Object.keys(row), ["fell", "risen", "seconds", "peak", "asked"]);
    assert.deepEqual({ fell: row.fell, risen: row.risen, seconds: row.seconds }, { fell: true, risen: false, seconds: null }, `shoved ${degrees} degrees about up`);
    assert.ok(row.peak > 0 && Number.isFinite(row.peak), `the fastest of its segments moved ${row.peak} m/s`);
    assert.ok(row.asked > 0, `its stance asked ${row.asked} weights more than its soles gave`);
  }
  // The control: a shove it holds is no fall.
  assert.deepEqual(await shoved({ model: "workshop-fighter", held: "club", degrees: 0, impulse: 0.2 }),
    { fell: false, risen: false, seconds: null, peak: null, asked: null });
});
