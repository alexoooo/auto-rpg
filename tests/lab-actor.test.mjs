/**
 * **The lab's actor** (`src/lab/actor.ts`), on the Node stand: what a page or an experiment gives
 * a body reaches it through the actor, whatever mode drives it.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { stanceEnvelope } from "../src/core/control/stance-envelope.ts";
import { humanSpec } from "../src/core/human/spec.ts";
import { balanceCeiling, balancePoint, rulebook } from "../src/core/rules/rulebook.ts";
import { labActor } from "../src/lab/actor.ts";
import { startStance } from "../src/lab/stance-mode.ts";
import { coreStand } from "./harness/core-stand.mjs";

const POINT = balancePoint(rulebook("arena"));

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

test("a_lab_bodys_balance_holds_it_through_a_shove_that_fells_it_without", async () => {
  // Node stand, Rapier, 120 Hz, a 1 N s grid. Shoved toward its front, the Warrior stands to 66 N s on
  // its muscles and to 76 at 5 points; toward its back, the Rogue stands to 50 and to 70.
  for (const [model, impulse, degrees] of [["workshop-fighter", 71, 0], ["workshop-rogue", 60, 180]]) {
    const alone = await shoved(model, impulse, degrees, undefined);
    const none = await shoved(model, impulse, degrees, { assist: balanceCeiling(0, POINT) });
    const helped = await shoved(model, impulse, degrees, { assist: balanceCeiling(5, POINT) });
    assert.ok(alone.frame.fallen && alone.given === 0, `${model} alone: ${JSON.stringify(alone)}`);
    // No points is no assist: the same fall, to the bit.
    assert.deepEqual(none, alone, model);
    assert.ok(!helped.frame.fallen && helped.frame.phase === "stand" && helped.given > 0, `${model} at 5 points: ${JSON.stringify(helped)}`);
  }
});

test("a_lab_body_stands_under_the_stance_tuning_its_actor_is_given", async () => {
  const stand = await coreStand(humanSpec("workshop-rogue"), { ground: true });
  try {
    // A body carries its envelope only under the stance's own constants.
    const plain = labActor(stand.built, stand.world);
    assert.deepEqual(plain.body.envelope, stanceEnvelope(stand.built.spec));
    plain.dispose();
    const tuned = labActor(stand.built, stand.world, { stance: { track: 0.15 } });
    assert.equal(tuned.body.envelope, null);
    tuned.dispose();
  } finally { stand.dispose(); }
});
