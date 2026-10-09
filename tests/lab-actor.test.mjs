/**
 * **The lab's actor** (`src/lab/actor.ts`), on the Node stand: what a page or an experiment gives
 * a body reaches it through the actor, whatever mode drives it.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { centreOfToRef } from "../src/core/control/support.ts";
import { stanceEnvelope } from "../src/core/control/stance-envelope.ts";
import { humanSpec } from "../src/core/human/spec.ts";
import { standIntent } from "../src/core/mind/intent.ts";
import { balanceCeiling, balancePercent, rulebook } from "../src/core/rules/rulebook.ts";
import { placedReach, STAND } from "../src/core/skills/strike.ts";
import { recipeFor, REPERTOIRE } from "../src/core/skills/strikes.ts";
import { labActor } from "../src/lab/actor.ts";
import { throwBlow, watchBlow } from "../src/lab/blow.ts";
import { LAB_BLOWS } from "../src/lab/blows.ts";
import { allowing, loadoutSpec } from "../src/lab/loadout.ts";
import { tacticsOf } from "../src/core/mind/tactics-of.ts";
import { startRoutine } from "../src/lab/routine.ts";
import { LAB_PRESETS, labMind } from "../src/lab/scenarios.ts";
import { startStance } from "../src/lab/stance-mode.ts";
import { WARRIOR_STRAIGHT } from "./fixtures/strikes.mjs";
import { coreStand } from "./harness/core-stand.mjs";

const RULES = rulebook("arena"), PERCENT = balancePercent(RULES);

/** How far `hand` of `spec` stands from a target as high as its head: its recipe's place there, or its placed blow's with none. */
const reachOf = (spec, hand) => recipeFor(REPERTOIRE, spec, hand, 0)?.recipe.place.ahead ?? placedReach(spec, hand, 0);

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
  // its muscles and to 76 at a balance of 25 %; toward its back, the Rogue stands to 50 and to 70.
  for (const [model, impulse, degrees] of [["workshop-fighter", 71, 0], ["workshop-rogue", 60, 180]]) {
    const alone = await shoved(model, impulse, degrees, undefined);
    const none = await shoved(model, impulse, degrees, { assist: balanceCeiling(0, PERCENT) });
    const helped = await shoved(model, impulse, degrees, { assist: balanceCeiling(25, PERCENT) });
    assert.ok(alone.frame.fallen && alone.given === 0, `${model} alone: ${JSON.stringify(alone)}`);
    // No balance is no assist: the same fall, to the bit.
    assert.deepEqual(none, alone, model);
    assert.ok(!helped.frame.fallen && helped.frame.phase === "stand" && helped.given > 0, `${model} at 25 %: ${JSON.stringify(helped)}`);
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

/** How far ahead of the head each hand strikes at a target as high as the head, as a strike skill's report has it. */
const reachesOf = (strike) => ({ left: strike.rangeAt("left", 0).reach, right: strike.rangeAt("right", 0).reach });

/** Which hands of `loadout`'s body may strike, and the reach the skills report for each, its actor given `options`. */
async function strikes(loadout, options) {
  const stand = await coreStand(loadoutSpec(loadout), { ground: true });
  const actor = labActor(stand.built, stand.world, options);
  try { return { may: { ...actor.strikes }, reach: reachesOf(actor.drive({ name: "stand", decide: () => standIntent(0) }).report.strike) }; }
  finally { actor.dispose(); stand.dispose(); }
}

test("a_lab_bodys_hand_may_not_strike_with_what_its_actor_bars", async () => {
  const bare = { model: "workshop-fighter", right: "empty", left: "empty" }, armed = { ...bare, right: "club" };
  // Each hand's reach is how far it stands from a target as high as its head: the fist's and the
  // club's are not the same. A bar is the mind's, and changes nothing the skills know.
  const fist = reachOf(loadoutSpec(bare), "right"), club = reachOf(loadoutSpec(armed), "right");
  assert.equal(reachOf(loadoutSpec(armed), "left"), fist);
  assert.ok(fist > 0 && club > fist, `the fist reaches ${fist} m, the club ${club}`);
  const fists = { left: fist, right: fist }, clubbed = { left: fist, right: club };
  assert.deepEqual(await strikes(bare), { may: { left: true, right: true }, reach: fists });
  assert.deepEqual(await strikes(bare, { allows: allowing([]) }), { may: { left: true, right: true }, reach: fists });
  assert.deepEqual(await strikes(bare, { allows: allowing(["club"]) }), { may: { left: true, right: true }, reach: fists });
  assert.deepEqual(await strikes(bare, { allows: allowing(["empty"]) }), { may: { left: false, right: false }, reach: fists });
  assert.deepEqual(await strikes(armed), { may: { left: true, right: true }, reach: clubbed });
  assert.deepEqual(await strikes(armed, { allows: allowing(["club"]) }), { may: { left: true, right: false }, reach: clubbed });
  assert.deepEqual(await strikes(armed, { allows: allowing(["empty"]) }), { may: { left: false, right: true }, reach: clubbed });
  assert.deepEqual(await strikes(armed, { allows: allowing(["empty", "club"]) }), { may: { left: false, right: false }, reach: clubbed });
});

test("a_hand_with_no_recipe_reaches_as_far_as_its_placed_blow", async () => {
  // The Blow gives its skills one recipe of its own, the club's, at a distance no searched recipe
  // has: the right hand reaches that far, and the left, with no recipe for its fist, as far as a
  // placed blow at a target as high as the head.
  const stored = LAB_BLOWS[0], distance = stored.place.ahead + 0.013;
  assert.deepEqual({ id: stored.id, held: stored.held, band: stored.band, up: stored.place.up }, { id: "unit", held: "wooden club", band: "high", up: 0 });
  const stand = await coreStand(loadoutSpec({ model: stored.model, right: "club", left: "empty" }), { ground: true });
  const blow = throwBlow(labActor(stand.built, stand.world), { hand: stored.hand, strike: stored.strike, place: { ahead: distance, up: 0 }, band: stored.band });
  try {
    const { left, right } = reachesOf(blow.report.strike);
    assert.equal(right, distance);
    // A placed blow is thrown with the arm out, from farther off than the Warrior's straight
    // (`tests/fixtures/strikes.mjs`); and from nearer than the club's.
    assert.equal(left, placedReach(stand.built.spec, "left", 0));
    assert.ok(left > WARRIOR_STRAIGHT.place.ahead && left < right, `the left reaches ${left} m, a straight ${WARRIOR_STRAIGHT.place.ahead} and the club ${right}`);
  } finally { blow.dispose(); stand.dispose(); }
});

test("with_every_strike_barred_the_routine_walks_to_its_targets_and_back", async () => {
  const stand = await coreStand(humanSpec("workshop-fighter"), { ground: true });
  const routine = startRoutine(labActor(stand.built, stand.world, { allows: allowing(["empty"]) }));
  try {
    const legs = [routine.tactics.leg];
    for (let i = 0; i < stand.seconds(40) && routine.tactics.loops < 1 && !routine.body.view.down; i++) {
      stand.step(1);
      if (routine.tactics.leg !== legs.at(-1)) legs.push(routine.tactics.leg);
    }
    assert.deepEqual({ fallen: routine.body.view.down, loops: routine.tactics.loops, readings: routine.readings.length, up: routine.ball(), thrown: routine.report.strike.thrown, legs },
      { fallen: false, loops: 1, readings: 0, up: null, thrown: { left: 0, right: 0 }, legs: ["out", "back", "out"] });
  } finally { routine.dispose(); stand.dispose(); }
});

test("the_first_lab_preset_follows_the_script_and_the_guard_stands_the_way_it_faces", () => {
  assert.deepEqual(Object.keys(LAB_PRESETS), ["script", "guard"]);
  assert.deepEqual(Object.values(LAB_PRESETS).map(({ config }) => config.tactics), [{ kind: "script" }, { kind: "stand" }]);
  const script = { name: "a script", decide: () => { throw new Error("the script decided"); } };
  const tactics = (config, given) => tacticsOf(config.tactics, null, "lab", null, () => null, given);
  assert.equal(tactics(LAB_PRESETS.script.config, script), script);
  assert.throws(() => tactics(LAB_PRESETS.script.config, undefined), /need the screen's script/);
  assert.deepEqual(tactics(LAB_PRESETS.guard.config, script).decide({ report: { heading: 1.25 } }, 1 / 120), standIntent(1.25));
});

test("a_lab_body_plays_the_mind_it_is_given_or_the_script_preset_where_that_has_a_fault", () => {
  const spec = humanSpec("workshop-fighter"), guard = LAB_PRESETS.guard.config;
  assert.deepEqual(labMind(guard, spec), { plays: guard, faults: [] });
  // A mind of another kind, and a fighter whose parts disagree, play the Script preset whole.
  assert.deepEqual(labMind({ kind: "lie" }, spec), { plays: LAB_PRESETS.script.config, faults: ["the Lab drives a fighter"] });
  assert.deepEqual(labMind({ ...guard, kick: { kind: "front-kick" } }, spec),
    { plays: LAB_PRESETS.script.config, faults: ["kick: these tactics never kick"] });
});

test("under_the_guard_a_mode_stands_still_while_its_instruments_run", async () => {
  const mind = LAB_PRESETS.guard.config;
  // The Routine: its clock runs, and it neither walks nor strikes.
  const stand = await coreStand(humanSpec("workshop-fighter"), { ground: true });
  const routine = startRoutine(labActor(stand.built, stand.world, { mind }));
  try {
    stand.step(stand.seconds(5));
    const { centre } = routine.body.view.stance;
    assert.equal(routine.time(), stand.world.time - stand.world.dt);
    assert.deepEqual({ fallen: routine.body.view.down, readings: routine.readings.length, leg: routine.tactics.leg, targets: routine.tactics.targets, up: routine.tactics.up },
      { fallen: false, readings: 0, leg: "out", targets: null, up: null });
    // Standing settles it 7 cm forward of where it was built; the script's walk out is 2 m.
    assert.ok(Math.hypot(centre.x, centre.z) < 0.15, `it stood ${Math.hypot(centre.x, centre.z).toFixed(3)} m from where it began`);
  } finally { routine.dispose(); stand.dispose(); }
  // The Blow, under the guard or with its club barred: its clock runs past the blow's time, and its
  // skills report no blow at any step.
  const stored = LAB_BLOWS[0], seconds = STAND + stored.strike.chamber.seconds + 0.5;
  for (const options of [{ mind }, { allows: allowing(["club"]) }]) {
    const armed = await coreStand(loadoutSpec({ model: stored.model, right: "club", left: "empty" }), { ground: true });
    const actor = labActor(armed.built, armed.world, options);
    const blow = throwBlow(actor, { hand: stored.hand, strike: stored.strike, place: stored.place, band: stored.band });
    const watch = watchBlow(actor, blow, RULES);
    try {
      const phases = new Set();
      for (let i = 0; i < armed.seconds(seconds); i++) { armed.step(1); phases.add(blow.report.strike.phase); }
      assert.ok(Math.abs(blow.time - seconds) < armed.world.dt, `the blow's clock reads ${blow.time} s after ${seconds}`);
      // Its target hangs where the blow would land, and nothing comes near it.
      assert.deepEqual({ phases: [...phases], thrown: blow.report.strike.thrown, reading: watch.reading, fallen: blow.body.view.down },
        { phases: [null], thrown: { left: 0, right: 0 }, reading: { done: 0, cost: 0, nearest: null, hung: true, blows: [] }, fallen: false });
    } finally { watch.dispose(); blow.dispose(); armed.dispose(); }
  }
});

test("while_a_lab_blow_is_under_way_the_skills_its_actor_reports_give_the_hand_to_the_blow", async () => {
  // What a mind's inspector reads (`mindInspector`): the hand under the blow is the blow's, before and after it the guard's.
  const stored = LAB_BLOWS[0], seconds = STAND + stored.strike.chamber.seconds + 0.5;
  const armed = await coreStand(loadoutSpec({ model: stored.model, right: "club", left: "empty" }), { ground: true });
  const actor = labActor(armed.built, armed.world);
  assert.equal(actor.skills, null, "nothing is reported before a mode drives it");
  const blow = throwBlow(actor, { hand: stored.hand, strike: stored.strike, place: stored.place, band: stored.band });
  try {
    const seen = new Set();
    for (let i = 0; i < armed.seconds(seconds); i++) {
      armed.step(1);
      const { strike, holders } = actor.skills.report;
      seen.add(`${strike.phase ? "blow" : "none"} ${holders[stored.hand]} ${holders.left}`);
    }
    assert.deepEqual([...seen].sort(), ["blow blow guard", "none guard guard"]);
  } finally { blow.dispose(); armed.dispose(); }
});

test("a_lab_body_that_is_down_is_handed_to_the_sub_minds_its_mind_names", async () => {
  assert.deepEqual(Object.values(LAB_PRESETS).map(({ config }) => config.subs), [[{ kind: "lie" }], [{ kind: "lie" }]]);
  /** The Script preset with `subs` for its sub-minds. */
  const subs = (list) => ({ mind: { ...LAB_PRESETS.script.config, subs: list } });
  /** The Warrior standing under an actor given `options`, shoved 120 N s forward at its middle trunk a second in: who has it a second after it is down. */
  const has = async (options) => {
    const stand = await coreStand(humanSpec("workshop-fighter"), { ground: true });
    const actor = labActor(stand.built, stand.world, options);
    try {
      actor.drive({ name: "stand", decide: () => standIntent(0) });
      stand.step(stand.seconds(1));
      assert.equal(actor.body.has, "command", "standing, the command layers have it");
      const trunk = stand.built.segments.get("middleTrunk");
      trunk.body.applyImpulse(new Vector3(0, 0, 120), centreOfToRef(trunk, new Vector3()));
      for (let i = 0; i < stand.seconds(4) && !actor.body.view.down; i++) stand.step();
      stand.step(stand.seconds(1));
      return [actor.body.view.down, actor.body.has];
    } finally { actor.dispose(); stand.dispose(); }
  };
  // Given none it has the game's, which lies.
  assert.deepEqual(await has(undefined), [true, "lie"]);
  assert.deepEqual(await has(subs([{ kind: "lie" }])), [true, "lie"]);
  assert.deepEqual(await has(subs([{ kind: "staged-rise" }])), [true, "staged-rise"]);
  // Given no sub-mind, nobody takes it from the command layers.
  assert.deepEqual(await has(subs([])), [true, "command"]);
});
