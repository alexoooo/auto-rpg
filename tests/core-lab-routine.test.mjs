/**
 * **The core lab's Routine** (`src/core-lab/routine.ts`), on the Node stand as the page runs it: a
 * mind on the core's skills, each human for two loops at 120 Hz: the second sets off from the post
 * into the turn, where a faster turn falls (`ROUTINE_GAIT`). It stays on its feet, completes the
 * loops, and at the post throws the right hand's strike, the left's and the right's again, each
 * from where its feet were set (`Locomotion.place`), with the head inside the recipe's window,
 * turned over for the left hand, and the fist as fast as the recipe was searched to go. The
 * Routine reads the fist's peak in the air, to the pushes' end, so it is above the recipe's peak to
 * its landing.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { humanSpec } from "../src/core/human/spec.ts";
import { mirroredWindow, recipeFor, REPERTOIRE } from "../src/core/skills/strikes.ts";
import { ROUTINE_HANDS, startRoutine } from "../src/core-lab/routine.ts";
import { coreStand } from "./harness/core-stand.mjs";

const LOOPS = 2;
/** Seconds allowed for the loops: a loop takes about 28 s. */
const SECONDS = 40 * LOOPS;

for (const model of ["workshop-fighter", "workshop-rogue"]) {
  test(`${model}_completes_two_routine_loops_striking_from_where_its_feet_were_set`, async () => {
    const spec = humanSpec(model), stand = await coreStand(spec, { ground: true, hz: 120 });
    const routine = startRoutine(stand.built, stand.world);
    try {
      for (let i = 0; i < stand.seconds(SECONDS) && routine.mind.loops < LOOPS && !routine.report.fallen; i++) stand.step(1);
      assert.equal(routine.report.fallen, false, routine.doing());
      assert.equal(routine.mind.loops, LOOPS, `${routine.doing()} at ${routine.time().toFixed(1)} s`);
      assert.deepEqual(routine.strikes.map((s) => s.hand), [...ROUTINE_HANDS, ...ROUTINE_HANDS]);
      for (const s of routine.strikes) {
        const { strike, recipe } = recipeFor(REPERTOIRE, spec, s.hand);
        const window = s.hand === recipe.strike.hand ? recipe.window : mirroredWindow(recipe.window);
        assert.equal(s.name, strike.name);
        const { along, across } = s.off, what = `${s.name}: off ${JSON.stringify(s.off)}, window ${JSON.stringify(window)}`;
        assert.ok(window.along[0] <= along && along <= window.along[1] && window.across[0] <= across && across <= window.across[1], what);
        assert.ok(s.peak >= recipe.readings.at120.peak, `${s.name}: peak ${s.peak} under the recipe's ${recipe.readings.at120.peak}`);
      }
    } finally { routine.dispose(); stand.dispose(); }
  });
}
