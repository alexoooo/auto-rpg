/**
 * **What counts as having risen** (`risenAt`, `research/core-rise-trials.mjs`): the first run of two
 * seconds up, read from a trace of down and up. No world is stepped.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { risenAt, UP_SECONDS } from "../research/core-rise-trials.mjs";

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
