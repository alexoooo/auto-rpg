/**
 * **What a step allocates is held under a ceiling.** A step's time is the machine's, and no test
 * can hold it; what it allocates is the same on every machine, and it is what a `map` put back
 * into a dear loop shows up as. Read by V8's sampling heap profiler, in KiB a body a step, each
 * reading in a process of its own (`stepAllocation`): two skeletons standing, and the Warrior
 * against the Rogue with clubs. Node, the core world, Rapier, 120 Hz.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { centreOfToRef } from "../src/core/control/support.ts";
import { standBodies, stepAllocation } from "./harness/garbage.mjs";
import { traceOf } from "./harness/trace.mjs";

/**
 * The most a body's step may allocate, KiB, by fixture: the highest of five readings when it was
 * last set, and a quarter. A change that goes over it takes its allocation out of the step or,
 * where the allocation is the feature's, raises the ceiling and says why in its commit.
 */
const CEILING = { standing: 100, bout: 161 };

test("a_standing_body_s_step_allocates_no_more_than_its_ceiling", () => {
  const kib = stepAllocation("standing");
  assert.ok(kib <= CEILING.standing, `${kib.toFixed(0)} KiB a body a step, over ${CEILING.standing}`);
});

test("a_bout_s_step_allocates_no_more_than_its_ceiling", () => {
  const kib = stepAllocation("bout");
  assert.ok(kib <= CEILING.bout, `${kib.toFixed(0)} KiB a body a step, over ${CEILING.bout}`);
});

test("two_bodies_share_no_work", async () => {
  // Two skeletons standing 3 m apart, each shoved at its trunk at a step and in a direction of its
  // own, hard enough that it steps to recover: each one's every pose is the one it has alone at its
  // place, shoved so. Their recovering steps overlap, so what a step carries is in use by both at
  // once. A work carries nothing from one call to the next, and the world steps one body's control
  // after the other's, so one work shared by two bodies would read the same here: this holds what
  // they carry.
  const settle = 120, steps = 360;
  const shoves = [{ at: settle, impulse: new Vector3(0, 0, 24) }, { at: settle + 20, impulse: new Vector3(0, 0, -24) }];
  const run = async (only) => {
    const { world, bodies, dispose } = await standBodies(2, undefined, { only });
    const which = only === undefined ? [0, 1] : [only];
    try {
      const traces = bodies.map((body) => traceOf([body.built]));
      for (let step = 0; step < settle + steps; step++) {
        bodies.forEach((body, k) => {
          const shove = shoves[which[k]];
          if (step !== shove.at) return;
          const trunk = body.built.segments.get("middleTrunk");
          trunk.body.applyImpulse(shove.impulse, centreOfToRef(trunk, new Vector3()));
        });
        world.step();
        for (const trace of traces) trace.take();
      }
      for (const body of bodies) assert.ok(body.view.stance.recoveries > 0, "a shove that no step recovers from tries too little");
      return traces.map((trace) => trace.digest());
    } finally { dispose(); }
  };
  const together = await run(), first = await run(0), second = await run(1);
  assert.deepEqual(together, [...first, ...second]);
});

test("the_meter_sees_an_array_made_in_a_step", () => {
  const plain = stepAllocation("standing"), more = stepAllocation("standing-array");
  // The two bodies share the array's 32 KiB a step: 16 a body, read to within about 2 by the
  // profiler's sampling, so half of it is the least the meter may see.
  assert.ok(more - plain >= 8, `${(more - plain).toFixed(1)} KiB a body a step more`);
});
