/**
 * **The lab's actor** (`src/lab/actor.ts`), on the Node stand: what a page or an experiment gives
 * a body reaches it through the actor, whatever mode drives it.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { stanceEnvelope } from "../src/core/control/stance-envelope.ts";
import { humanSpec } from "../src/core/human/spec.ts";
import { standIntent } from "../src/core/mind/intent.ts";
import { balanceCeiling, balancePoint, rulebook } from "../src/core/rules/rulebook.ts";
import { STAND } from "../src/core/skills/strike.ts";
import { recipeFor, REPERTOIRE } from "../src/core/skills/strikes.ts";
import { labActor } from "../src/lab/actor.ts";
import { throwBlow } from "../src/lab/blow.ts";
import { LAB_BLOWS } from "../src/lab/blows.ts";
import { watchClubBlow } from "../src/lab/club-blow.ts";
import { allowing, loadoutSpec } from "../src/lab/loadout.ts";
import { LAB_MINDS } from "../src/lab/minds.ts";
import { startRoutine } from "../src/lab/routine.ts";
import { LAB_MIND_IDS } from "../src/lab/scenarios.ts";
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

/** The reach the skills report for each hand of `loadout`'s body, its actor given `options`: a hand with no strike has none. */
async function reach(loadout, options) {
  const stand = await coreStand(loadoutSpec(loadout), { ground: true });
  const actor = labActor(stand.built, stand.world, options);
  try { return actor.drive({ name: "stand", decide: () => standIntent(0) }).report.strike.reach; }
  finally { actor.dispose(); stand.dispose(); }
}

test("a_lab_bodys_hand_has_no_strike_its_actor_bars", async () => {
  const bare = { model: "workshop-fighter", right: "empty", left: "empty" }, armed = { ...bare, right: "club" };
  // Each hand's reach is its recipe's distance: the fist's and the club's are not the same.
  const fist = recipeFor(REPERTOIRE, loadoutSpec(bare), "right").recipe.distance, club = recipeFor(REPERTOIRE, loadoutSpec(armed), "right").recipe.distance;
  assert.ok(fist > 0 && club > fist, `the fist reaches ${fist} m, the club ${club}`);
  assert.deepEqual(await reach(bare), { left: fist, right: fist });
  assert.deepEqual(await reach(bare, { allows: allowing([]) }), { left: fist, right: fist });
  assert.deepEqual(await reach(bare, { allows: allowing(["club"]) }), { left: fist, right: fist });
  assert.deepEqual(await reach(bare, { allows: allowing(["empty"]) }), { left: null, right: null });
  assert.deepEqual(await reach(armed), { left: fist, right: club });
  assert.deepEqual(await reach(armed, { allows: allowing(["club"]) }), { left: fist, right: null });
  assert.deepEqual(await reach(armed, { allows: allowing(["empty"]) }), { left: null, right: club });
  assert.deepEqual(await reach(armed, { allows: allowing(["empty", "club"]) }), { left: null, right: null });
});

test("an_actor_bars_strikes_among_those_its_mode_gives_the_skills", async () => {
  // The Blow gives its skills one recipe of its own, at a distance no searched recipe has.
  const stored = LAB_BLOWS[0], distance = stored.distance + 0.013;
  const reaches = async (options) => {
    const stand = await coreStand(loadoutSpec({ model: stored.model, right: "club", left: "empty" }), { ground: true });
    const blow = throwBlow(labActor(stand.built, stand.world, options), stored.strike, distance);
    try { return blow.report.strike.reach; } finally { blow.dispose(); stand.dispose(); }
  };
  assert.deepEqual(await reaches(), { left: null, right: distance });
  assert.deepEqual(await reaches({ allows: allowing([]) }), { left: null, right: distance });
  assert.deepEqual(await reaches({ allows: allowing(["empty"]) }), { left: null, right: distance });
  assert.deepEqual(await reaches({ allows: allowing(["club"]) }), { left: null, right: null });
});

test("with_every_strike_barred_the_routine_walks_to_the_post_and_back", async () => {
  const stand = await coreStand(humanSpec("workshop-fighter"), { ground: true });
  const routine = startRoutine(labActor(stand.built, stand.world, { allows: allowing(["empty"]) }));
  try {
    const legs = [routine.tactics.leg];
    for (let i = 0; i < stand.seconds(40) && routine.tactics.loops < 1 && !routine.report.fallen; i++) {
      stand.step(1);
      if (routine.tactics.leg !== legs.at(-1)) legs.push(routine.tactics.leg);
    }
    assert.deepEqual({ fallen: routine.report.fallen, loops: routine.tactics.loops, strikes: routine.strikes.length, thrown: routine.report.strike.thrown, legs },
      { fallen: false, loops: 1, strikes: 0, thrown: { left: 0, right: 0 }, legs: ["out", "back", "out"] });
  } finally { routine.dispose(); stand.dispose(); }
});

test("the_first_lab_mind_is_the_script_itself_and_the_guard_stands_the_way_it_faces", () => {
  assert.deepEqual(Object.keys(LAB_MINDS), LAB_MIND_IDS);
  assert.deepEqual(LAB_MIND_IDS.map((id) => LAB_MINDS[id].strikes), [true, false]);
  const script = { name: "a script", decide: () => { throw new Error("the script decided"); } };
  assert.equal(LAB_MINDS.script.tactics(script), script);
  assert.deepEqual(LAB_MINDS.guard.tactics(script).decide({ report: { heading: 1.25 } }, 1 / 120), standIntent(1.25));
});

test("under_the_guard_a_mode_stands_still_while_its_instruments_run", async () => {
  const mind = LAB_MINDS.guard.tactics;
  // The Routine: its clock runs, and it neither walks nor strikes.
  const stand = await coreStand(humanSpec("workshop-fighter"), { ground: true });
  const routine = startRoutine(labActor(stand.built, stand.world, { mind }));
  try {
    stand.step(stand.seconds(5));
    const { centre } = routine.body.view.stance;
    assert.equal(routine.time(), stand.world.time - stand.world.dt);
    assert.deepEqual({ fallen: routine.report.fallen, strikes: routine.strikes.length, leg: routine.tactics.leg, post: routine.tactics.post },
      { fallen: false, strikes: 0, leg: "out", post: null });
    // Standing settles it 7 cm forward of where it was built; the script's walk out is 2 m.
    assert.ok(Math.hypot(centre.x, centre.z) < 0.15, `it stood ${Math.hypot(centre.x, centre.z).toFixed(3)} m from where it began`);
  } finally { routine.dispose(); stand.dispose(); }
  // The Blow, under the guard or with its club barred: its clock runs past the blow's time, and its
  // skills report no blow at any step.
  const stored = LAB_BLOWS[0], seconds = STAND + stored.strike.chamber.seconds + 0.5;
  for (const options of [{ mind }, { allows: allowing(["club"]) }]) {
    const armed = await coreStand(loadoutSpec({ model: stored.model, right: "club", left: "empty" }), { ground: true });
    const blow = throwBlow(labActor(armed.built, armed.world, options), stored.strike, stored.distance);
    const watch = watchClubBlow(armed.built, armed.world, blow, stored.distance, stored.hand);
    try {
      const phases = new Set();
      for (let i = 0; i < armed.seconds(seconds); i++) { armed.step(1); phases.add(blow.report.strike.phase); }
      assert.ok(Math.abs(blow.time - seconds) < armed.world.dt, `the blow's clock reads ${blow.time} s after ${seconds}`);
      assert.deepEqual({ phases: [...phases], thrown: blow.report.strike.thrown, landed: watch.landed, fell: watch.fell, fallen: blow.report.fallen },
        { phases: [null], thrown: { left: 0, right: 0 }, landed: null, fell: false, fallen: false });
    } finally { watch.dispose(); blow.dispose(); armed.dispose(); }
  }
});
