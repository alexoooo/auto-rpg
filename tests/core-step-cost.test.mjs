/**
 * **What a step allocates is held under a ceiling.** A step's time is the machine's, and no test
 * can hold it; what it allocates is the same on every machine, and it is what a `map` put back
 * into a dear loop shows up as. Read by V8's sampling heap profiler, in KiB a body a step, each
 * reading in a process of its own (`stepAllocation`): two skeletons standing, the Warrior lying
 * under its ground reader, and each game mind fighting itself (`GAME_MINDS`). Node, the core world,
 * Rapier, 120 Hz.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { centreOfToRef } from "../src/core/control/support.ts";
import { availableParallelism } from "node:os";
import { standBodies, stepAllocation, stepAllocationAsync } from "./harness/garbage.mjs";
import { MINDS } from "../src/core/mind/controllers.ts";
import { partOf } from "../src/core/mind/catalog.ts";
import { controlsFor } from "../src/arena/matchup.ts";
import { BODY_MODELS } from "../src/core/models.ts";
import { traceOf } from "../src/evaluation/trace.ts";

/**
 * The most a body's step may allocate, KiB, by fixture: the highest of five readings when it was
 * last set, and a quarter; `mind` is every game mind's, the highest of them. A change that goes
 * over it takes its allocation out of the step or, where the allocation is the feature's, raises
 * the ceiling and says why in its commit.
 */
const CEILING = { standing: 140, mind: 917, down: 206 };

/** What a fighter's right hand may hold in a mind's bout, the first its body and mind take: the left is empty. */
const HELDS = Object.freeze(["sword", "empty", "club"]);

/**
 * **Every game mind** (`MINDS` whose part is the game's), each with the first body it fits and the
 * first of `HELDS` it fights with there: the bouts each mind's steady state is read in.
 */
const GAME_MINDS = Object.entries(MINDS).filter(([, preset]) => partOf(preset.config).stage === "game").flatMap(([id]) => {
  for (const model of BODY_MODELS) for (const held of HELDS) if (controlsFor(model, { left: "empty", right: held }).includes(id)) return [{ id, model, held }];
  return [];
});

test("a_standing_body_s_step_allocates_no_more_than_its_ceiling", () => {
  const kib = stepAllocation("standing");
  assert.ok(kib <= CEILING.standing, `${kib.toFixed(0)} KiB a body a step, over ${CEILING.standing}`);
});

test("every_game_mind_s_step_allocates_no_more_than_the_ceiling", async () => {
  assert.ok(GAME_MINDS.length > 0, "the fixture found a game mind with a body to fight in");
  const lanes = Math.max(1, availableParallelism() - 1), readings = [];
  for (let k = 0; k < GAME_MINDS.length; k += lanes)
    readings.push(...await Promise.all(GAME_MINDS.slice(k, k + lanes).map(({ id, model, held }) => stepAllocationAsync("mind", id, model, held))));
  const over = GAME_MINDS.map((mind, k) => ({ ...mind, kib: readings[k] })).filter(({ kib }) => !(kib <= CEILING.mind));
  assert.deepEqual(over.map(({ id, model, held, kib }) => `${id} on ${model} holding ${held}: ${kib.toFixed(0)} KiB a body a step`), [],
    `over the ceiling of ${CEILING.mind}`);
});

test("a_down_body_s_step_allocates_no_more_than_its_ceiling", () => {
  const kib = stepAllocation("down");
  assert.ok(kib <= CEILING.down, `${kib.toFixed(0)} KiB a body a step, over ${CEILING.down}`);
});

test("two_bodies_share_no_work", async () => {
  // Two skeletons, each in a world of its own, shoved at its trunk at a step and in a direction of
  // its own, hard enough that it steps to recover, and stepped in turn: each one's every pose is the
  // one it has stepped alone. Their recovering steps overlap, so what a step carries is in use by
  // both at once. A work carries nothing from one call to the next, and a step runs one body's
  // control after the other's, so one work shared by two bodies would read the same here: this
  // holds what they carry. Each has a world of its own because the engine's SIMD solver packs
  // contacts of bodies in one world into shared lanes, which moves each body's last bits.
  const settle = 120, steps = 360;
  const shoves = [{ at: settle, impulse: new Vector3(0, 0, 24) }, { at: settle + 20, impulse: new Vector3(0, 0, -24) }];
  const run = async (which) => {
    const stands = await Promise.all(which.map((only) => standBodies(2, undefined, { only })));
    try {
      const bodies = stands.map((stand) => stand.bodies[0]), traces = bodies.map((body) => traceOf([body.built]));
      for (let step = 0; step < settle + steps; step++) {
        bodies.forEach((body, k) => {
          const shove = shoves[which[k]];
          if (step !== shove.at) return;
          const trunk = body.built.segments.get("middleTrunk");
          trunk.body.applyImpulse(shove.impulse, centreOfToRef(trunk, new Vector3()));
        });
        for (const stand of stands) stand.world.step();
        for (const trace of traces) trace.take();
      }
      for (const body of bodies) assert.ok(body.view.stance.recoveries > 0, "a shove that no step recovers from tries too little");
      return traces.map((trace) => trace.digest());
    } finally { for (const stand of stands) stand.dispose(); }
  };
  const together = await run([0, 1]), first = await run([0]), second = await run([1]);
  assert.deepEqual(together, [...first, ...second]);
});

test("the_meter_sees_an_array_made_in_a_step", () => {
  const plain = stepAllocation("standing"), more = stepAllocation("standing-array");
  // The two bodies share the array's 32 KiB a step: 16 a body, read to within about 2 by the
  // profiler's sampling, so half of it is the least the meter may see.
  assert.ok(more - plain >= 8, `${(more - plain).toFixed(1)} KiB a body a step more`);
});
