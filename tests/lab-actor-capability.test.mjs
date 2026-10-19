/**
 * **How well a lab body keeps its feet** (`src/lab/actor.ts`), measured and not a gate
 * (`tests/experimental.json`): a shove that fells it alone, held at a balance of 25 %, and the
 * Routine's walk with every strike barred (Node stand, Rapier, 120 Hz).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { humanSpec } from "../src/core/human/spec.ts";
import { balanceCeiling, balancePercent, rulebook } from "../src/core/rules/rulebook.ts";
import { labActor } from "../src/lab/actor.ts";
import { allowing } from "../src/lab/loadout.ts";
import { startRoutine } from "../src/lab/routine.ts";
import { startStance } from "../src/lab/stance-mode.ts";
import { coreStand } from "./harness/core-stand.mjs";

const PERCENT = balancePercent(rulebook("arena"));

/** The Stance's frame 4 s after a shove at 2 s, the actor given `options`, and what its assist gave. */
async function shoved(model, impulse, degrees, options) {
  const stand = await coreStand(humanSpec(model), { ground: true });
  const stance = startStance(labActor(stand.built, stand.world, options));
  try {
    stand.step(stand.seconds(2));
    stance.shove(impulse, degrees);
    stand.step(stand.seconds(4));
    return { frame: stance.frame(), given: stance.body.assist.meter.force };
  } finally { stance.dispose(); stand.dispose(); }
}

// Shoved toward its front, the Warrior stands to 101 N s on its muscles and falls at each of 106 to
// 110 (a 1 N s grid), and stands to 125 at a balance of 25 % (a 3 N s grid); toward its back, the
// Rogue stands to 60 on its muscles and falls from 65 (a 5 N s grid).
for (const [model, impulse, degrees] of [["workshop-fighter", 110, 0], ["workshop-rogue", 65, 180]]) {
  test(`${model}_a_lab_bodys_balance_holds_it_through_a_shove_that_fells_it_without`, async () => {
    const alone = await shoved(model, impulse, degrees, undefined);
    const helped = await shoved(model, impulse, degrees, { assist: balanceCeiling(25, PERCENT) });
    assert.ok(alone.frame.fallen, `${model} alone: ${JSON.stringify(alone)}`);
    assert.ok(!helped.frame.fallen && helped.frame.phase === "stand", `${model} at 25 %: ${JSON.stringify(helped)}`);
  });
}

test("with_every_strike_barred_the_routine_walks_to_its_targets_and_back", async () => {
  const stand = await coreStand(humanSpec("workshop-fighter"), { ground: true });
  const routine = startRoutine(labActor(stand.built, stand.world, { allows: allowing(["empty"]) }));
  try {
    const legs = [routine.tactics.leg];
    for (let i = 0; i < stand.seconds(40) && routine.tactics.loops < 1 && !routine.body.view.down; i++) {
      stand.step(1);
      if (routine.tactics.leg !== legs.at(-1)) legs.push(routine.tactics.leg);
    }
    assert.deepEqual({ fallen: routine.body.view.down, loops: routine.tactics.loops, legs }, { fallen: false, loops: 1, legs: ["out", "back", "out"] });
  } finally { routine.dispose(); stand.dispose(); }
});
