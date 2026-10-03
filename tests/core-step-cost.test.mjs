/**
 * **What a step allocates is held under a ceiling.** A step's time is the machine's, and no test
 * can hold it; what it allocates is the same on every machine, and it is what a `map` put back
 * into a dear loop shows up as. Read by V8's sampling heap profiler, in KiB a body a step, each
 * reading in a process of its own (`stepAllocation`): two skeletons standing, and the Warrior
 * against the Rogue with clubs. Node, the core world, Rapier, 120 Hz.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { stepAllocation } from "./harness/garbage.mjs";

/**
 * The most a body's step may allocate, KiB, by fixture: the highest of five readings when it was
 * last set, and a quarter. A change that goes over it takes its allocation out of the step or,
 * where the allocation is the feature's, raises the ceiling and says why in its commit.
 */
const CEILING = { standing: 334, bout: 400 };

test("a_standing_body_s_step_allocates_no_more_than_its_ceiling", () => {
  const kib = stepAllocation("standing");
  assert.ok(kib <= CEILING.standing, `${kib.toFixed(0)} KiB a body a step, over ${CEILING.standing}`);
});

test("a_bout_s_step_allocates_no_more_than_its_ceiling", () => {
  const kib = stepAllocation("bout");
  assert.ok(kib <= CEILING.bout, `${kib.toFixed(0)} KiB a body a step, over ${CEILING.bout}`);
});

test("the_meter_sees_an_array_made_in_a_step", () => {
  const plain = stepAllocation("standing"), more = stepAllocation("standing-array");
  // The two bodies share the array's 32 KiB a step: 16 a body, read to within about 2 by the
  // profiler's sampling, so half of it is the least the meter may see.
  assert.ok(more - plain >= 8, `${(more - plain).toFixed(1)} KiB a body a step more`);
});
