import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  EFFECTOR_NAMES,
  HAND_ACTION_NAMES,
  MOVEMENT_NAMES,
  STANCE_NAMES,
  TACTIC_NAMES,
  TACTIC_VERSION,
  TARGET_NAMES,
  TARGET_SPAN_FRACTION,
  asMeasured,
  behaviourRecord,
  chooseEffector,
  composeTactic,
  handActionOption,
  movementIntent,
  recordCombatEvent,
  recordBehaviourSample,
  scriptedMetaMind,
  tacticTargets,
  targetHeight,
} from "../src/options.ts";
import { deployableTactics } from "../src/learning/meta.ts";
import { FEATURE_COLUMNS, FEATURE_MIRROR_INDEX, FEATURE_MIRROR_SIGN, FEATURE_VERSION, FeatureWriter, mirrorFeatures, mirrorView, writeFeatures } from "../src/learning/features.ts";
import { INTENT_FIELDS, SEED_RANGES, evaluationMirrorSeeds, evaluationSeed, intentFieldDeltas, intentSequencesEqual, validateSeedRanges } from "../src/learning/evaluation.ts";
import { archerMind, azimuthOf, cursorForAzimuth, duelistMind } from "../src/policies.ts";
// The mutable block, imported here and *only* by this file's cross-check.
// `options.ts` may not reach it -- `options_and_features_have_no_mutable_config_backdoor`
// reads the source text to say so -- which is the whole reason there are two
// copies of the azimuth mapping to compare.
import { CONFIG } from "../src/config.ts";
import { ACTION_SHOT_TIMING, ACTION_STROKE_TIMING, ACTION_TUNING, actionAimAt, actionAzimuthOf, actionCoverAt, actionCursorForAzimuth, actionShotPhase, actionStrokeReading, bareCrowdDistance, blankThreat, freshIntent, selectThreat } from "../src/action-primitives.ts";
import { WEAPON_KINDS } from "../src/hands.ts";
import { COMBAT_FIELDS } from "./fixtures/intent.mjs";
import { assertCompleteView } from "./fixtures/view.mjs";

const parts = () => Object.fromEntries([
  "torso", "head", "pelvis", "upperArm", "forearm", "hand", "offUpperArm", "offForearm",
  "thighL", "shinL", "thighR", "shinR",
].map((key) => [key, 1]));
const hand = (weapon, outboard, x = 0) => ({
  weapon, shoulder: { x, y: 1.4, z: 0 }, tip: { x, y: 1.4, z: 1 }, tipSpeed: 0,
  // Zero, and the same zero `tipSpeed` carries. `describeFighter` derives the
  // speed from the velocity, so the two can only disagree in a fixture -- and
  // `selectThreat` reads both: the magnitude for how fast, the direction for
  // where the path goes, and it ranks on the two together. `closing` below is
  // the way to set them at once.
  tipVelocity: { x: 0, y: 0, z: 0 },
  reach: weapon === "bow" ? 0.6 : weapon === "empty" ? 0.6 : 1.45, lost: false, outboard,
});
/** A point moving at me at `speed`, in both fields. The opponent is down +Z. */
const closing = (record, speed) => {
  record.tipSpeed = speed; record.tipVelocity = { x: 0, y: 0, z: -speed }; return record;
};
/**
 * The five body facts that are not about a hand.
 *
 * Warrior-sized and stated once. `vitalHeight` and `collisionRadius` are read by
 * `selectThreat` -- the first is the point every threat's closest approach is
 * measured to, the second is half of the gate that decides whether a shaft is
 * worth covering -- and all five are feature v4 columns. Left out, they arrive
 * as `undefined`, and `NaN` loses every comparison in that ordering without
 * throwing.
 */
const SHAPE = { unit: "warrior", reach: 0.7, crownHeight: 1.8, vitalHeight: 1.1, collisionRadius: 0.3 };
const view = (mine = { primary: "sword", secondary: "empty" }, theirs = mine) => {
  const selfHands = { primary: hand(mine.primary, 1, 0.2), secondary: hand(mine.secondary, -1, -0.2) };
  const opponentHands = { primary: hand(theirs.primary, 1, -0.2), secondary: hand(theirs.secondary, -1, 0.2) };
  for (const h of Object.values(opponentHands)) { h.shoulder.z = 1.5; h.tip.z = 0.5; }
  return assertCompleteView({
    self: { ...SHAPE, naturalAttacks: {}, ground: { x: 0, y: 0, z: 0 }, facing: 0, shoulder: selfHands.primary.shoulder,
      tip: selfHands.primary.tip, tipSpeed: 0, hands: selfHands, crouch: 0.2, trunkLean: -0.1,
      trunkTwist: 0.3, vitality: 0.8, health: parts() },
    opponent: { ...SHAPE, naturalAttacks: {}, ground: { x: 0, y: 0, z: 1.5 }, facing: Math.PI,
      shoulder: opponentHands.primary.shoulder, tip: opponentHands.primary.tip, tipSpeed: 3,
      hands: opponentHands, crouch: 0, trunkLean: 0.1, trunkTwist: -0.2,
      vitality: 0.6, health: parts() },
    // Neither side has a bow up in this file; `tests/policy-perception.test.mjs`
    // owns the fixtures that do. The array is published rather than omitted
    // because `FighterView` always carries it -- see the note in that file on
    // why `selectThreat` has no tolerant fallback.
    projectiles: [],
    measure: 1.1, clock: 12.5,
  });
};

const complete = (intent) => {
  // The shape, not only the contents. This used to be implicit: the helper
  // checked `zoom` was finite and inside its band, so an option that dropped a
  // field or grew a host one failed here. Session 15 deleted `zoom` and took the
  // implicit check with it, which left the assertions below unable to notice a
  // missing field at all -- so the key set is checked outright, against the one
  // list in `tests/fixtures/intent.mjs` rather than a copy written out here.
  assert.deepStrictEqual(Object.keys(intent).sort(), COMBAT_FIELDS,
    "a combat command is exactly the fields a fighter consumes, and no more");
  for (const key of ["forward", "strafe", "turn"]) assert.ok(Number.isFinite(intent[key]));
  assert.ok(["primary", "secondary", null].includes(intent.actingHand));
  assert.equal(typeof intent.natural.thrust, "boolean");
  assert.equal(typeof intent.natural.guard, "boolean");
  for (const key of ["trunkLean", "trunkTwist", "crouch"]) assert.ok(Number.isFinite(intent.posture[key]));
  assert.ok(intent.posture.trunkLean >= -1 && intent.posture.trunkLean <= 1);
  assert.ok(intent.posture.trunkTwist >= -1 && intent.posture.trunkTwist <= 1);
  assert.ok(intent.posture.crouch >= 0 && intent.posture.crouch <= 1);
  for (const name of ["primary", "secondary"]) {
    for (const key of ["pointerX", "pointerY", "roll", "wristBend"]) assert.ok(Number.isFinite(intent[name][key]));
    assert.equal(typeof intent[name].thrust, "boolean");
    assert.equal(typeof intent[name].guard, "boolean");
    assert.ok(intent[name].roll >= ACTION_TUNING.rollMin && intent[name].roll <= ACTION_TUNING.rollMax);
    assert.ok(intent[name].wristBend >= 0 && intent[name].wristBend <= 1);
  }
};

test("every_option_returns_a_complete_bounded_intent", () => {
  const bite = view(); bite.self.naturalAttacks = { bite: { reach: 0.7, ready: true, active: false } };
  const loadouts = {
    cover: view(), cut: view(), thrust: view(),
    punch: view({ primary: "empty", secondary: "empty" }),
    shoot: view({ primary: "bow", secondary: "empty" }), bite, recover: view(),
  };
  // All twelve tactic names, and `bite` among them for the first time. It used
  // to be excluded here because `combatOption` accepted the name, had no branch
  // for it, and finished on a fallthrough clock -- covering it would have
  // asserted the bug. There is one door now and it carries the real skill.
  for (const name of MOVEMENT_NAMES) complete(movementIntent(name, view()));
  for (const name of HAND_ACTION_NAMES) {
    const v = loadouts[name];
    const option = handActionOption(name, asMeasured(chooseEffector(v, name)));
    option.enter(v);
    const intent = option.decide(v, 1 / 240);
    complete(intent);
    for (const axis of [intent.forward, intent.strafe, intent.turn, intent.primary.pointerX,
      intent.primary.pointerY, intent.secondary.pointerX, intent.secondary.pointerY]) {
      assert.ok(axis >= -1 && axis <= 1, `${name}: ${axis}`);
    }
  }
  assert.equal(TACTIC_NAMES.length, MOVEMENT_NAMES.length + HAND_ACTION_NAMES.length);
});

test("movement_and_hand_action_compose_every_intent_field_exactly_once", () => {
  const v = view(); const movement = movementIntent("close", v); const actionOption = handActionOption("cover", asMeasured("primary"));
  actionOption.enter(v); const action = actionOption.decide(v, 1 / 240);
  const intent = composeTactic(v, "close", "cover", movement, action);
  assert.equal(intent.forward, movement.forward); assert.equal(intent.turn, movement.turn);
  assert.deepEqual(intent.primary, action.primary); assert.deepEqual(intent.secondary, action.secondary);
  assert.deepEqual(intent.posture, action.posture); complete(intent);
});

test("every_legal_tactic_pair_is_finite_bounded_and_capability_checked", () => {
  const bite = view(); bite.self.naturalAttacks = { bite: { reach: 0.7, ready: true, active: false } }; bite.opponent.collisionRadius = 0.3;
  const actionViews = { cover: view(), cut: view(), thrust: view(), punch: view({ primary: "empty", secondary: "empty" }),
    shoot: view({ primary: "bow", secondary: "empty" }), bite, recover: view() };
  for (const movement of MOVEMENT_NAMES) for (const action of HAND_ACTION_NAMES) {
    const v = actionViews[action]; const option = handActionOption(action, asMeasured(chooseEffector(v, action))); option.enter(v);
    complete(composeTactic(v, movement, action, movementIntent(movement, v), option.decide(v, 1 / 240)));
  }
});

test("every_illegal_tactic_pair_refuses_both_requested_names", () => {
  const v = view({ primary: "bow", secondary: "shield" });
  const action = handActionOption("recover", asMeasured("primary")); action.enter(v); const part = action.decide(v, 1 / 240);
  assert.throws(() => composeTactic(v, "circle-left", "punch", movementIntent("circle-left", v), part),
    /circle-left.*punch/);
  const contaminated = movementIntent("hold", v); contaminated.primary.guard = true;
  assert.throws(() => composeTactic(v, "hold", "recover", contaminated, part), /hold.*recover.*movement/);
  const duplicate = structuredClone(part); duplicate.forward = 0.5;
  assert.throws(() => composeTactic(v, "hold", "recover", movementIntent("hold", v), duplicate), /hold.*recover.*hand action/);
});

test("movement_partials_own_only_the_three_locomotion_axes", () => {
  // Three axes, named: a movement head decides where the feet go and nothing
  // else. It used to be four in every place a partial was written down, because
  // `zoom` rode along on the command -- so a factorized hand action carried a
  // camera column it always set to 1, and the merge's contamination check tested
  // it as though a hand action might have had an opinion about the camera.
  const v = view();
  const idle = movementIntent("hold", v);
  for (const name of MOVEMENT_NAMES) {
    const part = movementIntent(name, v);
    assert.deepEqual(Object.keys(part).sort(), COMBAT_FIELDS, name);
    assert.equal(part.actingHand, idle.actingHand, name);
    assert.deepEqual(part.posture, idle.posture, name);
    assert.deepEqual(part.primary, idle.primary, name);
    assert.deepEqual(part.secondary, idle.secondary, name);
  }
  // Not vacuous: the three it does own really are written. `turn` needs an
  // opponent that is not straight ahead, because `turnToward` of a body already
  // faced is zero -- which is also why "hold" is a movement rather than nothing.
  const offLine = view(); offLine.opponent.ground.x = 1.2;
  assert.equal(movementIntent("close", v).forward, 1);
  assert.equal(movementIntent("circle-left", v).strafe, -0.55);
  assert.ok(movementIntent("hold", offLine).turn > 0.1, `${movementIntent("hold", offLine).turn}`);

  const bite = view(); bite.self.naturalAttacks = { bite: { reach: 0.7, ready: true, active: false } };
  bite.opponent.collisionRadius = 0.3;
  const actionViews = { cover: view(), cut: view(), thrust: view(), punch: view({ primary: "empty", secondary: "empty" }),
    shoot: view({ primary: "bow", secondary: "empty" }), bite, recover: view() };
  for (const action of HAND_ACTION_NAMES) {
    const option = handActionOption(action, asMeasured(chooseEffector(actionViews[action], action))); option.enter(actionViews[action]);
    const part = option.decide(actionViews[action], 1 / 240);
    assert.deepEqual(Object.keys(option.movement).sort(), ["forward", "strafe", "turn"], action);
    assert.deepEqual([part.forward, part.strafe, part.turn], [0, 0, 0],
      `${action} left locomotion on the command it hands to the merge`);
  }

  // And the check that catches a contaminated partial is the hand and posture
  // one, which needs no camera sentinel to have something to say.
  const contaminated = movementIntent("close", v); contaminated.posture.crouch = 0.5;
  const cover = handActionOption("cover", asMeasured("primary")); cover.enter(v);
  assert.throws(() => composeTactic(v, "close", "cover", contaminated, cover.decide(v, 1 / 240)),
    /close.*cover.*hand or posture/);
});

test("the_composed_scripted_controller_matches_the_frozen_specialist_trace", () => {
  const specialist = duelistMind(991); const composed = scriptedMetaMind("duelist", 991); const v = view();
  for (let frame = 0; frame < 720; frame += 1) {
    v.clock = frame / 240; v.measure = frame < 200 ? 1.8 : 1.1; v.opponent.ground.z = v.measure + 0.2;
    assert.deepEqual(composed.decide(v, 1 / 240), specialist.decide(v, 1 / 240));
  }
});

test("specialists_and_options_share_the_full_stroke_and_shot_timeline", () => {
  assert.equal(actionStrokeReading(ACTION_STROKE_TIMING.chamber / 2).phase, "chamber");
  assert.equal(actionStrokeReading(ACTION_STROKE_TIMING.chamber + ACTION_STROKE_TIMING.commit / 2).phase, "commit");
  assert.equal(actionStrokeReading(ACTION_STROKE_TIMING.chamber + ACTION_STROKE_TIMING.commit + 0.01).phase, "recover");
  const cut = handActionOption("cut", asMeasured("primary")); const v = view(); cut.enter(v);
  const recovering = cut.decide(v, ACTION_STROKE_TIMING.chamber + ACTION_STROKE_TIMING.commit + 0.01);
  assert.equal(recovering.primary.guard, true);
  assert.equal(cut.done(v), false);
  assert.equal(actionShotPhase(ACTION_SHOT_TIMING.draw + ACTION_SHOT_TIMING.release + 0.01), "cooldown");
});

test("an_option_refuses_a_loadout_that_cannot_perform_it_by_name", () => {
  assert.throws(() => handActionOption("shoot", asMeasured("primary")).enter(view()), /option "shoot".*bow/);
  assert.throws(() => handActionOption("punch", asMeasured("primary")).enter(view({ primary: "sword", secondary: "sword" })),
    /option "punch".*empty .*hand/);
  assert.throws(() => handActionOption("teleport", asMeasured("primary")), /unknown hand action "teleport"/);
  // The other three quarters of a decision are guarded at the same door. A
  // movement name reaching an arm skill is the exact hole the merge closed:
  // `combatOption("hold")` used to construct and then run a hand skill on a
  // locomotion name.
  assert.throws(() => handActionOption("hold", asMeasured("primary")), /unknown hand action "hold"/);
  assert.throws(() => handActionOption("cut", { effector: "third", target: "vital", stance: "action-default" }),
    /unknown effector "third"/);
  assert.throws(() => handActionOption("cut", { effector: "primary", target: "knee", stance: "action-default" }),
    /unknown target "knee"/);
  assert.throws(() => handActionOption("cut", { effector: "primary", target: "vital", stance: "kneeling" }),
    /unknown stance "kneeling"/);
});

// ---- tactic v2: exact effector, exact target, bounded stance ---------------

/** Step an option to a chosen frame, returning the command it produced there. */
const run = (v, action, execution, frames = 1, dt = 1 / 240) => {
  const option = handActionOption(action, execution);
  option.enter(v);
  let intent = null;
  for (let frame = 0; frame < frames; frame += 1) { v.clock = 12.5 + frame * dt; intent = option.decide(v, dt); }
  return { option, intent };
};

test("the_tactic_v2_vocabulary_is_ordered_frozen_and_never_inferred", () => {
  // Stage C lays 26 outputs over these five tables by index, so their order is
  // the contract. Written out here rather than derived, because a table that
  // checks itself checks nothing: this is the copy that fails if somebody
  // inserts a name in the middle of one of them.
  assert.equal(TACTIC_VERSION, 2);
  assert.deepEqual([...MOVEMENT_NAMES], ["close", "hold", "circle-left", "circle-right", "disengage"]);
  assert.deepEqual([...HAND_ACTION_NAMES], ["cover", "cut", "thrust", "punch", "shoot", "bite", "recover"]);
  assert.deepEqual([...EFFECTOR_NAMES], ["primary", "secondary", "natural"]);
  assert.deepEqual([...TARGET_NAMES], ["vital", "high", "low", "threat"]);
  assert.deepEqual([...STANCE_NAMES], ["action-default", "upright", "compact", "extended", "slip-left", "slip-right"]);
  for (const table of [MOVEMENT_NAMES, HAND_ACTION_NAMES, EFFECTOR_NAMES, TARGET_NAMES, STANCE_NAMES]) {
    assert.equal(Object.isFrozen(table), true);
  }
  assert.equal(MOVEMENT_NAMES.length + HAND_ACTION_NAMES.length + EFFECTOR_NAMES.length +
    TARGET_NAMES.length + STANCE_NAMES.length + 1, 26, "the contract Stage C widens to");
});

test("a_dual_wielder_executes_the_effector_the_decision_named", () => {
  // Two pointed weapons, so both hands could -- which is the case action v1
  // could not express an opinion about. `thrust` rather than `cut`, because it
  // puts a button on exactly the acting hand: "it named one and posed the
  // other" is then visible rather than inferred from `actingHand` alone.
  const swords = view({ primary: "sword", secondary: "sword" });
  for (const effector of ["primary", "secondary"]) {
    const spare = effector === "primary" ? "secondary" : "primary";
    const { intent } = run(swords, "thrust", { effector, target: "vital", stance: "action-default" });
    assert.equal(intent.actingHand, effector);
    assert.equal(intent[effector].thrust, true, `${effector} was named and did not thrust`);
    assert.equal(intent[spare].thrust, false, `${effector} was named and the ${spare} thrust instead`);
  }
  // And the direction that used to fail silently. A shield in the primary and a
  // sword in the secondary: `combatOption("cut", "primary")` searched
  // `[primary, secondary]`, found the shield could not cut, and ran the whole
  // stroke on the sword hand without saying so. The request is now refused by
  // the name of the hand it asked for.
  const shielded = view({ primary: "shield", secondary: "sword" });
  assert.throws(() => handActionOption("cut", { effector: "primary", target: "vital", stance: "action-default" }).enter(shielded),
    /option "cut" requires a held striking weapon in the primary hand/);
  assert.equal(run(shielded, "cut", { effector: "secondary", target: "vital", stance: "action-default" }).intent.actingHand,
    "secondary");
  // The scripted search survives as a named helper rather than as a default
  // inside the option, and it is the order it always had.
  assert.equal(chooseEffector(shielded, "cut"), "secondary");
  assert.equal(chooseEffector(swords, "cut"), "primary");
  assert.equal(chooseEffector(swords, "cut", "secondary"), "secondary");
});

/**
 * A stroke aimed at a named region sweeps between its neighbours, and the
 * measured line keeps the arc it was tuned with.
 *
 * The two ends are asserted against `actionAimAt` at the **midpoints** to the
 * neighbouring regions -- not at the neighbouring heights, which this note used
 * to claim and which would be twice the arc. `NAMED_STROKE_SPAN` is what makes
 * the two different, and the difference is the whole magnitude of a named
 * stroke.
 *
 * **Which is why the extent is built from `targetHeight` and a halving, and no
 * longer from the constants.** It read
 * `NAMED_STROKE_SPAN * TARGET_SPAN_FRACTION * span` -- `enter`'s own arithmetic
 * restated -- so both equalities followed either constant wherever it went and
 * `NAMED_STROKE_SPAN` could be moved 0.5 -> 0.55 with all 537 tests green. Only
 * the fixture-bound band below constrained it at all, to about +-20 %. Half the
 * distance between two published region heights is the same rule stated in a
 * quantity the constant cannot move.
 *
 * The mutation it still does not catch is `TARGET_SPAN_FRACTION`: the region
 * spacing and the arc scale with it together, so every equality here is
 * invariant under it. That constant is held by
 * `a_named_target_is_a_body_region_derived_from_published_facts`, which pins
 * all three heights to exact numbers and the fraction to 0.75.
 *
 * The measured-line half is not decoration. `NAMED_STROKE_SPAN` is deliberately
 * out of reach of `"as-measured"` -- that aim is the *centre* of an arc by
 * definition, and it is what the scripted specialists and every figure in
 * `docs/measurements.md` were taken at -- so a change that narrowed both would
 * move `the_scripted_meta_controller_matches_the_policy_it_replaces` and the
 * `duelist-swinger` null control with it. This asserts the asymmetry directly
 * rather than waiting for those to notice.
 */
test("a_named_region_narrows_a_stroke_and_the_measured_line_keeps_its_arc", () => {
  const v = view();
  // Stepped by whole phases rather than sampled at 240 Hz, so the two readings
  // are the arc's own ends and not the nearest frame to them. The entry step
  // poses the guard and advances no stroke clock; a step of exactly the chamber
  // duration lands the reading on the next phase, which is what makes
  // `actionStrokePose` return the chamber point outright, and the same again for
  // the commit. Sampling instead would read the *guard* pose as the top of a
  // `vital` arc, which sits entirely below it.
  const arc = (target) => {
    const option = handActionOption("cut", { effector: "primary", target, stance: "action-default" });
    option.enter(v);
    option.decide(v, 0);
    const chamber = option.decide(v, ACTION_STROKE_TIMING.chamber).primary.pointerY;
    const commit = option.decide(v, ACTION_STROKE_TIMING.commit).primary.pointerY;
    return { low: commit, high: chamber, span: chamber - commit };
  };
  const cursorAt = (y) => actionAimAt(v, { x: v.opponent.ground.x, y, z: v.opponent.ground.z },
    { pointerX: 0, pointerY: 0 }, "primary", v.self.hands.primary.shoulder).pointerY;

  // A named region: the arc runs from the height halfway to the region above it
  // to the height halfway to the region below, and nowhere else. The half-step
  // is measured between two published region heights rather than recomputed
  // from the constants that place them, so a wider or narrower named stroke
  // moves it.
  const spacing = targetHeight(v, "high") - targetHeight(v, "vital");
  assert.ok(Math.abs((targetHeight(v, "vital") - targetHeight(v, "low")) - spacing) < 1e-12,
    "the three named regions are not evenly spaced, so one half-step cannot describe every arc");
  const step = spacing / 2;
  for (const target of ["vital", "high", "low"]) {
    const centre = targetHeight(v, target);
    const named = arc(target);
    assert.ok(Math.abs(named.high - cursorAt(centre + step)) < 1e-9,
      `${target} chambered at ${named.high}, not ${cursorAt(centre + step)}`);
    assert.ok(Math.abs(named.low - cursorAt(centre - step)) < 1e-9,
      `${target} committed to ${named.low}, not ${cursorAt(centre - step)}`);
    // And it is a sweep rather than a point: a stroke with no vertical extent
    // at all would satisfy the two equalities above if the step were zero.
    assert.ok(named.span > 0.2 && named.span < 0.4, `${target} swept ${named.span}`);
  }

  // The measured line: still exactly one cursor unit of sweep about the aim,
  // which is +-0.50 and is what `policies.ts` swings.
  const measured = arc("as-measured");
  assert.ok(Math.abs(measured.span - 1.00) < 1e-9, `the measured line swept ${measured.span}`);
  const aim = cursorAt(v.opponent.shoulder.y + 0.20);
  assert.ok(Math.abs(measured.high - (aim + 0.50)) < 1e-9, `chambered at ${measured.high}`);
  assert.ok(Math.abs(measured.low - (aim - 0.50)) < 1e-9, `committed to ${measured.low}`);
  // Which is the claim the two halves make together: naming a region is what
  // narrows a stroke, and it is between two and five times narrower.
  assert.ok(measured.span > arc("high").span * 2 && measured.span < arc("high").span * 5,
    `${measured.span} against ${arc("high").span}`);
});

/**
 * Naming the hand that covers decides which hand is on the line.
 *
 * It decided nothing at all until session 18: both defensive skills wrote
 * `actionCoverAt` and `guard = true` into the acting hand and then into the
 * spare, so `cover` on the primary and `cover` on the secondary produced
 * byte-identical arm poses and `intent.actingHand` was the only field in the
 * whole command that differed -- a shield in the off hand never led a guard even
 * when the decision named it. Measured over 24 bouts against `swinger` on a
 * `sword+shield` body, the two decisions produced the same bout to the digit:
 * 294.7 damage taken, 98.8 blocks, 18 deaths, both ways.
 *
 * The assertion is on the *set of leaves that differ*, not on a sample of them.
 * A test that read one pointer would go green against a change that moved the
 * lead hand as well as the spare, which is the failure this whole session is
 * about.
 */
test("a_named_cover_hand_leads_and_the_supporting_hand_steps_off_the_line", () => {
  const v = view({ primary: "sword", secondary: "shield" }, { primary: "axe", secondary: "empty" });
  // The shield shoulder sits exactly on the bearing to this fixture's threat, so
  // its own covering aim is 0.0 and a displacement would be the only thing in
  // it. Off the line, so both hands carry a real bearing and a dropped write
  // cannot hide inside a zero.
  v.self.hands.secondary.shoulder.x = -0.6;
  const decide = (effector) => {
    const option = handActionOption("cover", { effector, target: "threat", stance: "action-default" });
    option.enter(v);
    return option.decide(v, 0.05);
  };
  const lead = JSON.parse(JSON.stringify(decide("primary")));
  const off = JSON.parse(JSON.stringify(decide("secondary")));

  const differing = [];
  const walk = (a, b, path) => {
    if (a && typeof a === "object") for (const key of Object.keys(a)) walk(a[key], b[key], path ? `${path}.${key}` : key);
    else if (a !== b) differing.push(path);
  };
  walk(lead, off, "");
  assert.deepEqual(differing.sort(), ["actingHand", "primary.pointerX", "secondary.pointerX"],
    `naming the cover hand moved ${JSON.stringify(differing)}`);

  // And what each of the three is. The hand that was named holds the covering
  // line `actionCoverAt` answers; the other one is that same line turned
  // outboard by `guardSpread`.
  const onTheLine = (hand) => actionCoverAt(v, selectThreat(v, blankThreat()), { pointerX: 0, pointerY: 0 }, hand).pointerX;
  const displaced = (hand) => actionCursorForAzimuth(
    actionAzimuthOf(onTheLine(hand), hand) + v.self.hands[hand].outboard * ACTION_TUNING.guardSpread, hand);
  assert.equal(lead.actingHand, "primary"); assert.equal(off.actingHand, "secondary");
  assert.equal(lead.primary.pointerX, onTheLine("primary"), "the named primary left its own covering line");
  assert.equal(lead.secondary.pointerX, displaced("secondary"), "the supporting shield stayed on the leader's line");
  assert.equal(off.secondary.pointerX, onTheLine("secondary"), "the named shield did not take the covering line");
  assert.equal(off.primary.pointerX, displaced("primary"), "the supporting sword stayed on the leader's line");
  // The displacement is a displacement: outboard is a side, so the two hands go
  // opposite ways and neither stays where it was.
  assert.notEqual(displaced("primary"), onTheLine("primary"));
  assert.notEqual(displaced("secondary"), onTheLine("secondary"));

  // A bare supporting fist is *not* moved, which is the exclusion that keeps the
  // scripted parity sweep -- run on `sword+empty` and nothing else -- out of
  // this, and is also `planOffHand`'s own rule: a fist is small and is already
  // the nearest thing to the line.
  const bare = view({ primary: "sword", secondary: "empty" }, { primary: "axe", secondary: "empty" });
  bare.self.hands.secondary.shoulder.x = -0.6;
  const withFist = handActionOption("cover", { effector: "primary", target: "threat", stance: "action-default" });
  withFist.enter(bare);
  const fist = withFist.decide(bare, 0.05);
  assert.equal(fist.secondary.pointerX,
    actionCoverAt(bare, selectThreat(bare, blankThreat()), { pointerX: 0, pointerY: 0 }, "secondary").pointerX,
    "a bare supporting fist was stepped off the line");
});

/**
 * Which actions spread the supporting hand, over all four that plan one.
 *
 * `DEFENSIVE_ACTIONS` is the condition, and until this test nothing held either
 * end of it. Widening it to every action moves **92 of a 408-cell** command
 * surface and costs a `sword+shield` fighter cutting `high` at `swinger`
 * **157.8 damage a bout against 81.9** over 24 bouts (`.review/rem2/spreadcost.mjs`)
 * -- four to nineteen times the balance noise floor -- and it left all 537
 * tests green. Narrowing it to `cover` alone moves 72 cells and was equally
 * green, and `recover` aimed at `threat` collapses to a byte-identical pose
 * exactly as `cover` did, which is half of what session 18 claims to have
 * fixed.
 *
 * The four rows are the whole of what the block can be asked, so this is the
 * condition asserted rather than a sample of it: `cut` and `punch` are the
 * swinging pair whose acting hand is not holding a guard for the spare to rest
 * against, `cover` and `recover` are the two that are. `punch` needs an empty
 * acting hand, so it brings its own body -- a shield in the off hand and
 * nothing in the fist, which is a real loadout the picker offers.
 *
 * What it does not catch: `guardSpread`'s magnitude. Every expectation here is
 * built from `ACTION_TUNING.guardSpread` itself, so the constant can move and
 * this stays green.
 * `a_named_cover_hand_leads_and_the_supporting_hand_steps_off_the_line` has the
 * same gap, and the 24-bout table beside the constant in `action-primitives.ts`
 * is what argues the value.
 */
test("only_the_two_defensive_skills_spread_the_supporting_hand", () => {
  // The supporting hand is put on the covering line whatever the acting hand was
  // aimed at, so the two swinging rows can take the aim they are allowed --
  // `threat` is refused to them at construction, by this same list.
  const spread = (action, mine, target) => {
    const v = view(mine, { primary: "axe", secondary: "empty" });
    // Off the bearing to the threat, so both hands carry a real azimuth and a
    // displacement cannot hide inside a zero.
    v.self.hands.secondary.shoulder.x = -0.6;
    const option = handActionOption(action, { effector: "primary", target, stance: "action-default" });
    option.enter(v);
    const held = option.decide(v, 0.05).secondary.pointerX;
    const line = actionCoverAt(v, selectThreat(v, blankThreat()), { pointerX: 0, pointerY: 0 }, "secondary").pointerX;
    const off = actionCursorForAzimuth(
      actionAzimuthOf(line, "secondary") + v.self.hands.secondary.outboard * ACTION_TUNING.guardSpread, "secondary");
    assert.notEqual(line, off, `${action}: the fixture cannot tell a spread from the line`);
    return held === off ? "spread" : held === line ? "on the line" : `neither (${held}, line ${line}, spread ${off})`;
  };
  const shielded = { primary: "sword", secondary: "shield" };
  assert.deepEqual({
    cover: spread("cover", shielded, "threat"),
    recover: spread("recover", shielded, "threat"),
    recoverMeasured: spread("recover", shielded, "as-measured"),
    cut: spread("cut", shielded, "as-measured"),
    punch: spread("punch", { primary: "empty", secondary: "shield" }, "as-measured"),
  }, { cover: "spread", recover: "spread", recoverMeasured: "spread", cut: "on the line", punch: "on the line" });
});

/**
 * The option layer's azimuth mapping inverts, on both sides of centre.
 *
 * `tests/handover.test.mjs` records what this costs when it is not checked: the
 * envelope is asymmetric -- a primary arm reaches 1.30 rad outboard and 1.15 rad
 * across itself, the secondary the mirror -- so an inverse that divided by a
 * single half-range agrees with the true one for exactly one sign, and it looked
 * right. Both signs and both hands, or this test proves nothing.
 */
test("the_option_layer_azimuth_mapping_inverts_on_both_sides_of_centre", () => {
  for (const hand of ["primary", "secondary"]) {
    for (const pointer of [-1, -0.7, -0.25, 0, 0.25, 0.7, 1]) {
      const angle = actionAzimuthOf(pointer, hand);
      assert.ok(Math.abs(actionCursorForAzimuth(angle, hand) - pointer) < 1e-12,
        `${hand} ${pointer} -> ${angle} -> ${actionCursorForAzimuth(angle, hand)}`);
    }
    // The asymmetry itself, which is what makes the round trip worth asserting.
    const outboardSign = hand === "primary" ? 1 : -1;
    assert.ok(Math.abs(actionAzimuthOf(outboardSign, hand)) > Math.abs(actionAzimuthOf(-outboardSign, hand)),
      `${hand} reaches no further outboard than across itself`);
  }
  // Beyond the envelope the cursor saturates rather than running past 1, which
  // is what `boundIntent` would have to repair if it did not.
  assert.equal(actionCursorForAzimuth(9, "primary"), 1);
  assert.equal(actionCursorForAzimuth(-9, "primary"), -1);
});

/**
 * The frozen copy and the `CONFIG`-backed copy are the same mapping.
 *
 * There are two on purpose -- `policies.ts` reads mutable `CONFIG.arm` and the
 * option layer may not, which
 * `options_and_features_have_no_mutable_config_backdoor` pins -- and two copies
 * of a rule is one copy somebody edits. The scripted guard and the option
 * layer's guard are placed by the same angle through different arithmetic, so a
 * divergence here would move a shield by a real distance and nothing else in the
 * tree would say so. A comparison rather than a comment, because a comment
 * claiming they agree is exactly what was here before this test.
 */
test("the_option_layer_and_the_scripted_layer_share_one_azimuth_mapping", () => {
  for (const hand of ["primary", "secondary"]) {
    for (const pointer of [-1, -0.83, -0.4, -0.05, 0, 0.05, 0.4, 0.83, 1]) {
      assert.ok(Math.abs(actionAzimuthOf(pointer, hand) - azimuthOf(pointer, hand)) < 1e-12,
        `${hand} ${pointer}: option ${actionAzimuthOf(pointer, hand)} against scripted ${azimuthOf(pointer, hand)}`);
    }
    for (const angle of [-1.30, -0.9, -0.2, 0, 0.2, 0.9, 1.30]) {
      assert.ok(Math.abs(actionCursorForAzimuth(angle, hand) - cursorForAzimuth(angle, hand)) < 1e-12,
        `${hand} ${angle}: option ${actionCursorForAzimuth(angle, hand)} against scripted ${cursorForAzimuth(angle, hand)}`);
    }
  }
  // The four numbers both blocks state, so a session that moves one in `CONFIG`
  // and not in `ACTION_TUNING` fails here rather than in a shield's placement.
  // It was one number until session 18's remediation, and it was a number the
  // option layer did not read: `azimuthRange`, `actionAimAt` and `elevation`
  // each wrote the envelope out again, so mutating `ACTION_TUNING.azimuthMax`
  // failed this assertion while moving no pose anywhere. All four are the
  // single source now, and the loop above is what notices a real move.
  assert.deepEqual({
    azimuthMin: ACTION_TUNING.azimuthMin, azimuthMax: ACTION_TUNING.azimuthMax,
    elevationMin: ACTION_TUNING.elevationMin, elevationMax: ACTION_TUNING.elevationMax,
  }, { azimuthMin: CONFIG.arm.azMin, azimuthMax: CONFIG.arm.azMax,
    elevationMin: CONFIG.arm.elMin, elevationMax: CONFIG.arm.elMax });
});

test("an_illegal_action_effector_target_tuple_is_masked_not_repaired", () => {
  const archer = view({ primary: "bow", secondary: "empty" });
  const legal = deployableTactics(archer);
  const has = (rows, action, effector, target) =>
    rows.some((row) => row.action === action && row.effector === effector && row.target === target);

  // The tuple three independent argmaxes produce: largest action logit `shoot`,
  // largest effector logit `secondary`, largest target logit `low`. Each name is
  // legal and every pair of them is plausible; the triple is not, because a
  // two-handed bow welds the secondary to the haft and `Fighter.update` throws
  // that half of the command away. A repair would fire the bow anyway and call
  // it the decision that was made.
  assert.equal(has(legal, "shoot", "primary", "low"), true, "the bow hand may aim low");
  assert.equal(has(legal, "shoot", "secondary", "low"), false, "the welded hand is not an effector");
  assert.throws(() => handActionOption("shoot", { effector: "secondary", target: "low", stance: "action-default" }).enter(archer),
    /option "shoot" requires the primary hand, which is the only one a two-handed bow leaves free to act/);

  // Masked at the source as well, and this row moved: `punch` used to be
  // offered on a bow body and then posed onto the arm nothing reads.
  assert.equal(legal.some((row) => row.action === "punch"), false);
  const fists = view({ primary: "empty", secondary: "empty" });
  const barehanded = deployableTactics(fists);
  assert.equal(has(barehanded, "punch", "primary", "vital"), true);
  // The target third of the tuple, on a body that can punch: a fist swung from
  // a shoulder socket has no business at a knee.
  assert.equal(has(barehanded, "punch", "primary", "low"), false);
  assert.throws(() => handActionOption("punch", { effector: "primary", target: "low", stance: "action-default" }).enter(fists),
    /option "punch" requires a punch target of vital, high, not "low"/);

  // Capability-neutral recovery, stated as a mask rather than as a comment.
  // `recover` needs no hand and `cover` needs one, and keeping those apart is
  // the fix the last exhaustive look-ahead run bought -- re-fusing them empties
  // the legal set for a body with no arms and `maskedArgmax` throws on it.
  const jaws = view();
  jaws.self.hands = {};
  jaws.self.naturalAttacks = { bite: { reach: 0.7, ready: true, active: false } };
  const natural = deployableTactics(jaws);
  assert.equal(has(natural, "recover", "natural", "vital"), true, "recovery survives having no hand");
  assert.equal(natural.some((row) => row.action === "cover"), false, "a cover needs a hand to place");
  assert.equal(has(natural, "bite", "natural", "vital"), true);

  // Everything offered can be entered, checked against the real bodies rather
  // than against one convenient fixture. That is the direction the arrangement
  // guarantees; the other direction is below, and it does not hold.
  const bodies = [archer, fists, jaws, view(), view({ primary: "sword", secondary: "shield" }),
    view({ primary: "axe", secondary: "empty" })];
  for (const body of bodies) {
    const tuples = deployableTactics(body);
    assert.ok(tuples.length > 0, `${body.self.unit} ${JSON.stringify(Object.keys(body.self.hands))} has no legal tactic`);
    for (const row of tuples) {
      assert.doesNotThrow(
        () => handActionOption(row.action, { ...row, stance: "action-default" }).enter(body),
        `${row.action}/${row.effector}/${row.target}`,
      );
    }
  }

  // The body the "a mask and an executor cannot disagree" claim was false for,
  // and it is the only kind that has arms to lose. An armless *warrior* -- both
  // slots present, both lost, no natural attack -- is refused outright by
  // `supportedOptions`' capability gate, so the mask is empty; the executor's
  // own rule still answers `natural` for `recover` and still enters it. The mask
  // being the stricter of the two is the safe direction and is what is asserted
  // here, rather than an equality that does not exist.
  const armless = view();
  armless.self.hands.primary.lost = true; armless.self.hands.secondary.lost = true;
  assert.deepEqual(deployableTactics(armless), [], "no capability at all is an empty mask");
  assert.doesNotThrow(() => handActionOption("recover", asMeasured("natural")).enter(armless),
    "and the executor is the more permissive of the two, which is a difference worth knowing");
});

test("a_lost_selected_hand_forces_a_new_decision_before_execution", () => {
  const v = view();
  const option = handActionOption("cut", { effector: "primary", target: "vital", stance: "action-default" });
  option.enter(v);
  assert.equal(option.decide(v, 1 / 240).actingHand, "primary");
  assert.equal(option.done(v), false);

  v.self.hands.primary.lost = true;
  // Two halves, and only the first of them existed. `done` has always answered
  // true for a severed hand, which lets a controller that reads it re-decide --
  // but `decide` never re-checked, so a controller inside its persistence
  // window went on posing the arm that had been cut off and went on naming it
  // in `actingHand`. There is no repair available here: switching hands is the
  // silent redirection this stage removes.
  assert.equal(option.done(v), true, "a severed effector ends the option");
  assert.throws(() => option.decide(v, 1 / 240),
    /option "cut" requires an attached primary hand: the one this option named has been severed/);
});

test("natural_bite_never_aliases_a_human_hand", () => {
  const jaws = view();
  jaws.self.hands = {};
  jaws.self.naturalAttacks = { bite: { reach: 0.7, ready: true, active: false } };
  jaws.opponent.collisionRadius = 0.3; jaws.measure = 0.8;
  const { intent } = run(jaws, "bite", { effector: "natural", target: "vital", stance: "action-default" });
  assert.equal(intent.natural.thrust, true, "the jaws close");
  assert.equal(intent.actingHand, null, "jaws are not a hand");
  // Whole slots, every leaf, against a fresh command -- not three booleans.
  // This asserted `primary.thrust` and `secondary.thrust` were false, which is
  // what its own message calls "no hand slot is written on the way" and is not
  // the same claim: writing a guard, a cursor and a roll into both hands on the
  // way past left the entire suite green. A pose on an arm this body does not
  // have is exactly the alias the natural channel exists to end, and it is a
  // pose whatever field carries it.
  const blank = freshIntent();
  assert.deepStrictEqual(intent.primary, blank.primary, "no hand slot is written on the way");
  assert.deepStrictEqual(intent.secondary, blank.secondary, "no hand slot is written on the way");
  // Both directions of the alias, refused by name. A hand cannot bite, and
  // `natural` is not a spare effector for an action a hand owns.
  assert.throws(() => handActionOption("bite", { effector: "primary", target: "vital", stance: "action-default" }).enter(jaws),
    /option "bite" requires the natural effector, not the primary hand/);
  assert.throws(() => handActionOption("cut", { effector: "natural", target: "vital", stance: "action-default" }).enter(view()),
    /option "cut" requires the primary or secondary hand, not the natural effector/);
  // Capability-neutral recovery is the one place a hand action reaches the
  // natural effector, and it stays exactly one: a body with no arm left recovers
  // there, a body with an arm is refused it.
  const armless = view(); armless.self.hands.primary.lost = true; armless.self.hands.secondary.lost = true;
  assert.doesNotThrow(() => handActionOption("recover", asMeasured("natural")).enter(armless));
  assert.throws(() => handActionOption("recover", asMeasured("natural")).enter(view()),
    /option "recover" requires an attached hand rather than the natural effector/);
});

test("each_stance_reaches_its_exact_bounded_posture", () => {
  // Exact values, not finiteness and not a range. `boundIntent` clamps every
  // posture axis, so a stance pushed past one is caught by the clamp rather
  // than by the constant -- an assertion that checked bounds alone would pass a
  // table of 1.5s.
  //
  // Read against a `thrust`, whose action posture is `commit`: 0.12 crouch,
  // 0.30 lean, 0.68 x outboard twist. Worth writing down for session 23, which
  // decides whether these six constants earn their place: **`extended` is very
  // nearly `commit`**, so during any committing action the stance head offers
  // five distinguishable choices rather than six.
  const v = view();
  const expected = {
    "action-default": { crouch: 0.12, trunkLean: 0.30, trunkTwist: 0.68 },
    upright: { crouch: 0, trunkLean: 0, trunkTwist: 0 },
    compact: { crouch: 0.55, trunkLean: -0.20, trunkTwist: 0 },
    extended: { crouch: 0.10, trunkLean: 0.30, trunkTwist: 0.55 },
    "slip-left": { crouch: 0.25, trunkLean: -0.10, trunkTwist: -0.65 },
    "slip-right": { crouch: 0.25, trunkLean: -0.10, trunkTwist: 0.65 },
  };
  for (const stance of STANCE_NAMES) {
    const { intent } = run(v, "thrust", { effector: "primary", target: "vital", stance });
    assert.deepEqual({ crouch: intent.posture.crouch, trunkLean: intent.posture.trunkLean,
      trunkTwist: intent.posture.trunkTwist }, expected[stance], stance);
  }
  // `extended` twists toward the arm that is working, which is the whole of what
  // "toward the selected hand" means -- so the off hand's answer is the negated
  // one and not the same one. A slip is body-relative and does not follow it.
  const swords = view({ primary: "sword", secondary: "sword" });
  assert.equal(run(swords, "thrust", { effector: "secondary", target: "vital", stance: "extended" }).intent.posture.trunkTwist,
    -0.55);
  assert.equal(run(swords, "thrust", { effector: "secondary", target: "vital", stance: "slip-right" }).intent.posture.trunkTwist,
    0.65);
  // The slot is the only legal one, and this is what its being wrong looks
  // like: `applyActionPosture` zeroes all three axes on every call, so a stance
  // applied above it reads back as the action posture instead.
  assert.notEqual(expected.compact.crouch, expected["action-default"].crouch);
  assert.notEqual(expected.compact.trunkLean, expected["action-default"].trunkLean);
});

/**
 * A moving point is answered or refused, never quietly turned into a height.
 *
 * `threat` is the one `TargetName` that is not a height, and `cover` and
 * `recover` are the only branches that consume one -- both through
 * `actionCoverAt`. They used to test different things to decide it: `cover`
 * read the collapsed aim and `recover` read the target, which meant an action
 * whose `AIMED_TARGETS` row grew `threat` without a branch to answer it would
 * have been handed `"as-measured"` -- the opponent's shoulder line, a real aim
 * that nothing had asked for, with no refusal anywhere. This is the coupling
 * between the table and the branches, stated so that widening one without the
 * other is red.
 */
test("only_the_two_defensive_skills_can_be_aimed_at_a_moving_point", () => {
  const answering = HAND_ACTION_NAMES.filter((action) => tacticTargets(action).includes("threat"));
  assert.deepEqual(answering, ["cover", "recover"]);
  for (const action of HAND_ACTION_NAMES) {
    const request = () => handActionOption(action, { effector: "primary", target: "threat", stance: "action-default" });
    if (answering.includes(action)) assert.doesNotThrow(request, action);
    else {
      assert.throws(request, new RegExp(`hand action "${action}" cannot be aimed at "threat"`), action);
    }
  }
  // And the one discriminant really is one: `cover` asked for the measured aim
  // and `cover` asked for the threat are the same placement, because
  // `actionCoverAt` *is* what the specialists were measured through. `recover`
  // asked for the measured aim is the shoulder line and is not the same thing,
  // which is the difference that used to be hidden in two conditions.
  const v = view();
  const cursor = (action, target) => {
    const { intent } = run(v, action, { effector: "primary", target, stance: "action-default" });
    return { pointerX: intent.primary.pointerX, pointerY: intent.primary.pointerY };
  };
  assert.deepEqual(cursor("cover", "as-measured"), cursor("cover", "threat"));
  assert.notDeepEqual(cursor("recover", "as-measured"), cursor("recover", "threat"));
});

/**
 * The stance head reaches an effector that is not a hand.
 *
 * `each_stance_reaches_its_exact_bounded_posture` runs a `thrust`, which is one
 * of the branches that ends in the long shared tail. The two branches that
 * return early -- a `bite`, and `recover` on a body with no arms left -- carry
 * their own `applyTacticStance` call, and deleting it from *both* left the whole
 * suite green. Same table, because a stance is a whole-body pose and does not
 * know what is striking; the difference is that these two never run
 * `applyActionPosture`, so `action-default` is the blank command's zeros rather
 * than a skill's own pose.
 */
test("the_stance_head_reaches_the_natural_effector_as_well_as_a_hand", () => {
  const expected = {
    "action-default": { crouch: 0, trunkLean: 0, trunkTwist: 0 },
    upright: { crouch: 0, trunkLean: 0, trunkTwist: 0 },
    compact: { crouch: 0.55, trunkLean: -0.20, trunkTwist: 0 },
    // `+1` because the command names no hand at all, which is the whole of what
    // the natural fallback in `applyTacticStance` is for.
    extended: { crouch: 0.10, trunkLean: 0.30, trunkTwist: 0.55 },
    "slip-left": { crouch: 0.25, trunkLean: -0.10, trunkTwist: -0.65 },
    "slip-right": { crouch: 0.25, trunkLean: -0.10, trunkTwist: 0.65 },
  };
  const jaws = view();
  jaws.self.hands = {};
  jaws.self.naturalAttacks = { bite: { reach: 0.7, ready: true, active: false } };
  jaws.opponent.collisionRadius = 0.3; jaws.measure = 0.8;
  const armless = view();
  armless.self.hands.primary.lost = true; armless.self.hands.secondary.lost = true;
  const cases = [
    ["bite", jaws, { effector: "natural", target: "vital" }],
    ["recover", armless, { effector: "natural", target: "vital" }],
  ];
  for (const [action, body, execution] of cases) {
    for (const stance of STANCE_NAMES) {
      const { intent } = run(body, action, { ...execution, stance });
      assert.deepEqual({ crouch: intent.posture.crouch, trunkLean: intent.posture.trunkLean,
        trunkTwist: intent.posture.trunkTwist }, expected[stance], `${action}/${stance}`);
      assert.equal(intent.actingHand, null, `${action}/${stance} named a hand`);
    }
  }
});

test("a_named_target_is_a_body_region_derived_from_published_facts", () => {
  const v = view();
  // Warrior geometry as `describeFighter` publishes it: vitals at the torso
  // centre, crown at the top of the head. The head capsule runs 1.555-1.765 and
  // the pelvis 0.83-1.09, so the two outer regions land on different parts.
  v.opponent.vitalHeight = 1.28; v.opponent.crownHeight = 1.765;
  assert.equal(targetHeight(v, "vital"), 1.28);
  assert.ok(Math.abs(targetHeight(v, "high") - 1.64375) < 1e-9, `${targetHeight(v, "high")}`);
  assert.ok(Math.abs(targetHeight(v, "low") - 0.91625) < 1e-9, `${targetHeight(v, "low")}`);
  assert.equal(TARGET_SPAN_FRACTION, 0.75);
  // The same rule on a body a table written in metres would have broken: a
  // centipede is 0.38 m tall, so every region has to come out of its own span.
  const crawler = view();
  crawler.opponent.vitalHeight = 0.209; crawler.opponent.crownHeight = 0.38;
  assert.ok(targetHeight(crawler, "high") < crawler.opponent.crownHeight);
  assert.ok(targetHeight(crawler, "low") > 0);
  assert.ok(targetHeight(crawler, "high") > targetHeight(crawler, "vital"));
  assert.ok(targetHeight(crawler, "vital") > targetHeight(crawler, "low"));
});

test("the_scripted_meta_controller_matches_the_policy_it_replaces", () => {
  const old = duelistMind(991); const meta = scriptedMetaMind("duelist", 991); const v = view();
  const trace = [];
  const directions = { oldForward: 0, oldBack: 0, metaForward: 0, metaBack: 0 };
  const deltaReport = Object.fromEntries(INTENT_FIELDS.map((field) => [field, { changed: 0, max: 0 }]));
  for (let i = 0; i < 1200; i += 1) {
    v.clock = i / 240;
    const distance = i < 180 ? 2.2 - i / 300 : i < 360 ? 1.6 : i < 540 ? 1.1 : 1.42;
    v.opponent.ground.z = distance; v.opponent.shoulder.z = distance;
    v.measure = Math.max(0.9, distance - 0.2);
    closing(v.opponent.hands.primary, i > 700 && i < 760 ? 9 : 0);
    const before = old.decide(v, 1 / 240); const after = meta.decide(v, 1 / 240);
    for (const delta of intentFieldDeltas(before, after)) {
      if (!delta.equal) deltaReport[delta.field].changed += 1;
      if (delta.delta !== null) deltaReport[delta.field].max = Math.max(deltaReport[delta.field].max, Math.abs(delta.delta));
    }
    complete(after);
    if (before.forward > 0) directions.oldForward++; if (before.forward < 0) directions.oldBack++;
    if (after.forward > 0) directions.metaForward++; if (after.forward < 0) directions.metaBack++;
    trace.push(meta.selected);
  }
  assert.ok(trace.includes("cover") && trace.includes("cut"), JSON.stringify(meta.entries));
  assert.ok(directions.oldForward > 0 && directions.oldBack > 0 && directions.metaForward > 0,
    JSON.stringify({ directions, deltaReport }));
  assert.ok(Object.values(meta.entries).reduce((a, b) => a + b, 0) > 4, "the meta-controller really enters options");
  assert.deepEqual(Object.keys(deltaReport), INTENT_FIELDS, JSON.stringify(deltaReport));
  assert.ok(Object.values(deltaReport).every((row) => row.changed === 0 && row.max <= 1e-12),
    `all movement, posture and both-hand fields match: ${JSON.stringify(deltaReport)}`);
  // The archer's draw beside the specialist's, not on its own. This ran only the
  // meta archer and asserted that it both held and released, which the
  // specialist could have disagreed with in every frame while still passing.
  // The paired 520-sample comparison was in `evaluate-options.mjs`, which
  // session 17 deleted; its limits were shot duty within 0.01 and edge count
  // within 1, and the recorded answer was exact on both.
  const count = (mind) => { const bow = view({ primary: "bow", secondary: "empty" });
    const totals = { held: 0, released: 0, edges: 0 }; let previous = null;
    for (let i = 0; i < 520; i += 1) { bow.clock = i / 240; const held = mind.decide(bow, 1 / 240).primary.thrust;
      held ? totals.held += 1 : totals.released += 1;
      if (previous !== null && held !== previous) totals.edges += 1; previous = held; }
    return totals; };
  const specialistShots = count(archerMind(44)); const metaShots = count(scriptedMetaMind("archer", 44));
  assert.ok(metaShots.held > 200 && metaShots.released > 0, "the option trace preserves draw then release timing");
  assert.ok(metaShots.edges >= 2, `a trace that never changes button proves no draw: ${JSON.stringify(metaShots)}`);
  assert.deepEqual(metaShots, specialistShots, "the composed archer holds and looses on the specialist's exact frames");
  const seededA = scriptedMetaMind("duelist", 1); const seededB = scriptedMetaMind("duelist", 2);
  const seededView = view(); seededView.opponent.shoulder.x = seededView.self.shoulder.x;
  let firstA = -1; let firstB = -1;
  for (let i = 0; i < 900; i += 1) {
    seededView.clock = i / 240; seededA.decide(seededView, 1 / 240); seededB.decide(seededView, 1 / 240);
    if (firstA < 0 && seededA.selected === "cut") firstA = i;
    if (firstB < 0 && seededB.selected === "cut") firstB = i;
  }
  assert.notEqual(firstA, firstB, "the public seed changes the first option timing");
});

test("the_meta_guard_uses_the_same_fallback_after_both_enemy_arms_are_gone", () => {
  const v = view();
  v.opponent.hands.primary.lost = true;
  v.opponent.hands.secondary.lost = true;
  assert.deepEqual(scriptedMetaMind("duelist", 991).decide(v, 1 / 240),
    duelistMind(991).decide(v, 1 / 240));
});

test("a_specialist_and_scripted_meta_use_the_same_bare_crowding_boundary", () => {
  for (const measure of [bareCrowdDistance(0.6) - 0.01, bareCrowdDistance(0.6) + 0.01]) {
    const v = view({ primary: "empty", secondary: "empty" });
    v.opponent.ground.z = 0.78;
    v.opponent.shoulder.z = 0.78;
    v.measure = measure;
    const specialist = duelistMind(51).decide(v, 1 / 240);
    const meta = scriptedMetaMind("duelist", 51).decide(v, 1 / 240);
    assert.equal(Math.sign(meta.forward), Math.sign(specialist.forward), `measure ${measure}`);
  }
});

test("a_bare_scripted_meta_duelist_can_enter_punch_range", () => {
  const meta = scriptedMetaMind("duelist", 7);
  const v = view({ primary: "empty", secondary: "empty" });
  v.opponent.shoulder.x = v.self.shoulder.x;
  v.opponent.ground.z = 0.90;
  v.opponent.shoulder.z = 0.90;
  v.measure = 0.65;
  let closed = false;
  let punched = false;
  for (let i = 0; i < 1200; i += 1) {
    v.clock = i / 240;
    const intent = meta.decide(v, 1 / 240);
    closed ||= intent.forward > 0;
    const progress = Math.max(0, intent.forward) / 60;
    v.opponent.ground.z = Math.max(0.70, v.opponent.ground.z - progress);
    v.opponent.shoulder.z = v.opponent.ground.z;
    v.measure = v.opponent.ground.z - 0.25;
    punched ||= meta.selected === "punch";
  }
  assert.equal(closed, true);
  assert.equal(punched, true, JSON.stringify({ z: v.opponent.shoulder.z, measure: v.measure, entries: meta.entries }));
});

test("feature_columns_are_total_finite_and_versioned", () => {
  assert.equal(FEATURE_VERSION, 4);
  assert.equal(new Set(FEATURE_COLUMNS).size, FEATURE_COLUMNS.length);
  const values = writeFeatures(view());
  assert.equal(values.length, FEATURE_COLUMNS.length);
  assert.ok(values.every(Number.isFinite));
  for (const kind of WEAPON_KINDS) {
    const v = view({ primary: kind, secondary: "empty" });
    const features = writeFeatures(v);
    for (const candidate of WEAPON_KINDS) {
      assert.equal(features[FEATURE_COLUMNS.indexOf(`self_primary_kind_${candidate}`)], candidate === kind ? 1 : 0);
    }
  }
  const writer = new FeatureWriter(); const moving = view(); moving.clock = 0; writer.write(moving);
  moving.clock = 0.1; moving.measure -= 0.29;
  assert.ok(writer.write(moving)[FEATURE_COLUMNS.indexOf("radial_closing_rate")] > 0.9);
  const coherent = view({ primary: "sword", secondary: "empty" }, { primary: "shield", secondary: "sword" });
  closing(coherent.opponent.hands.primary, 30); closing(coherent.opponent.hands.secondary, 7);
  coherent.opponent.hands.secondary.tip.x = 0.8;
  const threatFeatures = writeFeatures(coherent);
  // Still `7 / 40`, and it now means something stronger than it did. In v3 a
  // shield could not be a threat because the filter kept only striking kinds and
  // then sorted what was left by speed. In v4 the shield is offered to
  // `selectThreat` like everything else and loses on its *tier* -- so the number
  // survives a shield that is not merely faster but genuinely closing at 30 m/s,
  // which the v3 fixture could not express and this one now does.
  assert.equal(threatFeatures[FEATURE_COLUMNS.indexOf("threat_speed")], 7 / 40,
    "the fast shield is not the dangerous hand");
  assert.ok(threatFeatures[FEATURE_COLUMNS.indexOf("threat_bearing")] > 0,
    "bearing and speed both describe the secondary sword tip");
  // And the kind one-hot agrees with the speed, which is the column that would
  // have caught the two disagreeing before there was one function to ask.
  assert.equal(threatFeatures[FEATURE_COLUMNS.indexOf("threat_kind_sword")], 1);
  assert.equal(threatFeatures[FEATURE_COLUMNS.indexOf("threat_kind_shield")], 0);
  // The sword is closing, so it has a positive time to closest approach and the
  // local-frame velocity points back down the observer's forward axis. Both
  // directions of that sign are pinned by the mirror tests below.
  assert.ok(threatFeatures[FEATURE_COLUMNS.indexOf("threat_time_to_closest")] > 0);
  assert.equal(threatFeatures[FEATURE_COLUMNS.indexOf("threat_velocity_forward")], -7 / 40);
});

test("mirroring_a_view_mirrors_directional_features_and_preserves_scalar_ones", () => {
  const asymmetric = view(); asymmetric.opponent.ground.x = 0.7; asymmetric.opponent.shoulder.x = 0.7;
  const original = writeFeatures(asymmetric);
  const mirrored = writeFeatures(mirrorView(asymmetric));
  assert.deepEqual(mirrored, mirrorFeatures(original));
});

test("feature_v4_has_total_readers_resets_variance_and_exact_mirror_signs", () => {
  const v = view(); v.clock = 0; const writer = new FeatureWriter(); const initial = writer.write(v);
  writer.setTactic("circle-left", "cut", 0.1);
  // The self vitality moves too, and it has to. `time_since_damage` was one
  // clock fed from the opponent's vitality alone -- so it was time since damage
  // *dealt* wearing a name that reads as time since damage taken, and a fixture
  // that only ever wounded the opponent could not tell the two apart. Both are
  // driven here and both are read below.
  v.clock = 0.4; v.measure -= 0.25; v.opponent.vitality -= 0.1; v.self.vitality -= 0.2; v.opponent.ground.x = 0.8;
  const changed = writer.write(v);
  for (const name of ["usable_reach_margin", "radial_closing_rate", "facing_error", "current_movement_circle-left",
    "current_action_cut", "persistence_age", "time_since_damage_dealt", "time_since_damage_received"]) {
    const index = FEATURE_COLUMNS.indexOf(name); assert.notEqual(index, -1, name); assert.ok(Number.isFinite(changed[index]), name);
  }
  assert.notDeepEqual(changed, initial); assert.deepEqual(mirrorFeatures(mirrorFeatures(changed)), changed);
  writer.reset(); const reset = writer.write(v);
  assert.equal(reset[FEATURE_COLUMNS.indexOf("current_movement_hold")], 1);
  assert.equal(reset[FEATURE_COLUMNS.indexOf("current_action_recover")], 1);
  assert.equal(reset[FEATURE_COLUMNS.indexOf("persistence_age")], 0);
  // Both histories reset to "nothing has happened yet", which for an age column
  // is a saturated 1 rather than a 0. Naming both is what stops the pair being
  // fed from one source again.
  assert.equal(reset[FEATURE_COLUMNS.indexOf("time_since_damage_dealt")], 1);
  assert.equal(reset[FEATURE_COLUMNS.indexOf("time_since_damage_received")], 1);
  const crawler = view(); crawler.self.hands = {}; crawler.self.naturalAttacks = { bite: { reach: 0.7, ready: true, active: false } };
  crawler.opponent.collisionRadius = 0.3; crawler.measure = 0.8;
  const crawlerFeatures = writeFeatures(crawler);
  assert.ok(crawlerFeatures[FEATURE_COLUMNS.indexOf("usable_reach_margin")] > 0,
    "published natural reach plus target surface radius is usable without fabricated hands");
  // And the jaws are published as jaws rather than as a nameless zero. Three
  // columns per side, all zero when a body has no natural attack at all, which
  // is not the same reading as a bite of reach zero.
  assert.equal(crawlerFeatures[FEATURE_COLUMNS.indexOf("self_bite_reach")], 0.35);
  assert.equal(crawlerFeatures[FEATURE_COLUMNS.indexOf("self_bite_ready")], 1);
  assert.equal(crawlerFeatures[FEATURE_COLUMNS.indexOf("self_bite_active")], 0);
  assert.equal(crawlerFeatures[FEATURE_COLUMNS.indexOf("opponent_bite_reach")], 0);
  assert.equal(crawlerFeatures[FEATURE_COLUMNS.indexOf("opponent_bite_ready")], 0);
});

/**
 * The sign table, against a world built the other way round rather than against
 * itself.
 *
 * `mirroring_a_view_mirrors_directional_features_and_preserves_scalar_ones`
 * above is the involution check, and an involution proves nothing on its own:
 * mirroring twice returns the input whatever sign a column carries, so two
 * matching wrong signs pass it. This is the version that cannot be satisfied
 * that way -- the second world is constructed asymmetric and mirrored, and the
 * two feature vectors have to agree column for column.
 *
 * Its full form, with an arrow in the air and a threat that is genuinely moving
 * sideways, is `feature_v4_mirror_matches_a_separately_constructed_asymmetric_world`
 * in `tests/policy-perception.test.mjs`; this is the melee half, kept beside the
 * table it is about.
 */
test("feature_v4_mirror_signs_hold_against_a_sideways_moving_threat", () => {
  const asymmetric = view({ primary: "sword", secondary: "empty" }, { primary: "sword", secondary: "shield" });
  asymmetric.opponent.ground.x = 0.7; asymmetric.opponent.shoulder.x = 0.7;
  asymmetric.opponent.hands.primary.tip = { x: 0.55, y: 1.55, z: 0.62 };
  // Across as well as in, so `threat_local_right` and `threat_velocity_right`
  // are both non-zero and a dropped negation in either shows up.
  asymmetric.opponent.hands.primary.tipSpeed = 11;
  asymmetric.opponent.hands.primary.tipVelocity = { x: -6, y: -1.5, z: -9 };
  asymmetric.self.trunkTwist = 0.4; asymmetric.opponent.trunkTwist = -0.25;

  const original = writeFeatures(asymmetric);
  const mirrored = writeFeatures(mirrorView(asymmetric));
  assert.deepEqual(mirrored, mirrorFeatures(original));
  // The columns this test exists for are actually exercised, or it is a story:
  // a table where every one of them happened to be zero would pass whatever the
  // signs said.
  for (const name of ["threat_local_right", "threat_velocity_right", "threat_bearing",
    "facing_error", "self_trunk_twist", "opponent_trunk_twist"]) {
    const index = FEATURE_COLUMNS.indexOf(name);
    assert.equal(FEATURE_MIRROR_SIGN[index], -1, `${name} names a side and has to change sign`);
    assert.ok(Math.abs(original[index]) > 0.01, `${name} is ${original[index]}, so this proves nothing about it`);
  }
});

/**
 * The checkable half of "primary and secondary are not sides", corrected.
 *
 * **This test used to be called `no_feature_column_carries_which_side_a_hand_is_on`
 * and the claim in its name is false.** Two columns carry a side and always did:
 * build two worlds differing only in the x of the opponent's threatening hand
 * and `threat_bearing` and `threat_local_right` come back equal and opposite.
 * `FEATURE_MIRROR_SIGN` lists both, along with `facing_error` and the two trunk
 * twists, which is the table admitting it. The old fixture could not see any of
 * that, because it flipped `outboard` alone: `outboard` is *derived* from the
 * arm's geometry (`src/arm.ts`, published by `src/fighter.ts`), so a body whose
 * `outboard` disagrees with its own `shoulder.x` and `tip.x` is a body that
 * cannot exist -- and `mirrorBody` negates all four together, which is itself the
 * admission that `outboard` is not the only side-carrying field. A hand column
 * spelled `Math.sign(hand.shoulder.x)` left that test green.
 *
 * The narrow fact that *is* true, can fail, and carries the decision: **no hand
 * column distinguishes which physical side a given hand slot is on.** The eight
 * columns per slot are a weapon one-hot, `lost`, `reach` and `tip_speed`, and
 * none of them is signed. So the side a slot sits on is invisible, swapping
 * `primary`/`secondary` under a mirror would invent a distinction the network
 * cannot see, and `mirrorBody` keeping the slot keys while negating the geometry
 * is what makes a mirrored sample a genuine left-handed copy of the same fighter
 * rather than a second, different fighter.
 *
 * Tactic v2's effector head inherits exactly that: `EFFECTOR_NAMES` name a slot,
 * no column answers which side a slot is on, so an output mirror leaves them
 * alone. `TARGET_NAMES` are heights and a threat and take no side either. The
 * conclusion the old test was written for still holds; the evidence for it did
 * not.
 */
test("no_hand_column_carries_which_physical_side_a_slot_is_on", () => {
  // The same fighter built left-handed: `outboard`, the shoulder, the tip and
  // the tip velocity all negated together, which is the only coherent way to
  // move a hand across the body. The torso's own `shoulder` and `tip` are
  // aliases of the primary hand's in this file's fixture, so they are given
  // their own copies first -- moving the hands must not move the body, or this
  // would go red through `threat_bearing` and prove nothing about a hand column.
  const sided = (side) => {
    const built = view({ primary: "sword", secondary: "shield" }, { primary: "axe", secondary: "empty" });
    built.opponent.hands.primary.tipSpeed = 9;
    built.opponent.hands.primary.tipVelocity = { x: -4, y: -1, z: -7 };
    built.self.shoulder = { ...built.self.shoulder }; built.self.tip = { ...built.self.tip };
    for (const slot of Object.values(built.self.hands)) {
      slot.outboard *= side;
      slot.shoulder = { ...slot.shoulder, x: slot.shoulder.x * side };
      slot.tip = { ...slot.tip, x: slot.tip.x * side };
      slot.tipVelocity = { ...slot.tipVelocity, x: slot.tipVelocity.x * side };
    }
    return built;
  };
  const rightHanded = sided(1); const leftHanded = sided(-1);
  // The fixture has to change the thing it is about and nothing else.
  for (const name of ["primary", "secondary"]) {
    assert.equal(leftHanded.self.hands[name].outboard, -rightHanded.self.hands[name].outboard, name);
    assert.equal(leftHanded.self.hands[name].shoulder.x, -rightHanded.self.hands[name].shoulder.x, name);
    assert.equal(leftHanded.self.hands[name].tip.x, -rightHanded.self.hands[name].tip.x, name);
    assert.ok(Math.abs(rightHanded.self.hands[name].shoulder.x) > 0.01, `${name} has to be off the centre line`);
  }
  assert.deepEqual(leftHanded.self.shoulder, rightHanded.self.shoulder, "the torso must not have moved");
  assert.deepEqual(writeFeatures(leftHanded), writeFeatures(rightHanded));
  // And by name as well as by value, so a signed hand column added under a name
  // this fixture happens not to drive is still a failure.
  const handColumns = FEATURE_COLUMNS.filter((name) => /_(primary|secondary)_/.test(name));
  assert.deepEqual(handColumns, ["self", "opponent"].flatMap((owner) => ["primary", "secondary"].flatMap((slot) =>
    [...WEAPON_KINDS.map((kind) => `${owner}_${slot}_kind_${kind}`),
      `${owner}_${slot}_lost`, `${owner}_${slot}_reach`, `${owner}_${slot}_tip_speed`])));

  // **The correction, asserted rather than only written down.** Side *is* in the
  // table -- it is the threat's side, not a slot's. Two worlds differing only in
  // where the opponent's threatening hand is give equal and opposite readings on
  // the two columns that name a direction in the observer's own frame, and
  // `FEATURE_MIRROR_SIGN` marks both. Every hand column is identical across the
  // pair, which is what separates the two facts.
  const threatening = (x) => {
    const built = view({ primary: "sword", secondary: "empty" }, { primary: "axe", secondary: "empty" });
    // Off the centre line so the two readings are exactly opposite rather than
    // merely different, and the torso gets its own shoulder for the same reason
    // as above.
    built.self.shoulder = { ...built.self.shoulder, x: 0 }; built.self.tip = { ...built.self.tip, x: 0 };
    built.opponent.hands.primary.shoulder = { ...built.opponent.hands.primary.shoulder, x };
    built.opponent.hands.primary.tip = { ...built.opponent.hands.primary.tip, x };
    return built;
  };
  const fromRight = writeFeatures(threatening(0.5)); const fromLeft = writeFeatures(threatening(-0.5));
  for (const name of ["threat_bearing", "threat_local_right"]) {
    const index = FEATURE_COLUMNS.indexOf(name);
    assert.equal(FEATURE_MIRROR_SIGN[index], -1, `${name} names a side and has to change sign`);
    // The literals, not just "different": the hand is 0.5 m either side of a
    // shoulder 0.5 m away, so the bearing is a quarter turn of pi and the local
    // right is 0.5 over a 2 m frame scale. Both come to 0.25, and a column that
    // read zero on both sides would satisfy "equal and opposite".
    assert.equal(fromRight[index], 0.25, name);
    assert.equal(fromLeft[index], -0.25, name);
  }
  for (const name of handColumns) {
    const index = FEATURE_COLUMNS.indexOf(name);
    assert.equal(fromRight[index], fromLeft[index], `${name} is a hand column and must not have moved`);
  }

  // And the mirror negates the geometry rather than renaming the slots, which is
  // the other half of the sentence: `mirrorView` flips `outboard`, the shoulder
  // and the tip on every hand and leaves `primary` and `secondary` where they
  // were.
  const reflected = mirrorView(rightHanded);
  assert.deepEqual(Object.keys(reflected.self.hands), Object.keys(rightHanded.self.hands));
  assert.equal(reflected.self.hands.primary.weapon, rightHanded.self.hands.primary.weapon);
  assert.equal(reflected.self.hands.primary.outboard, -rightHanded.self.hands.primary.outboard);
  assert.equal(reflected.self.hands.primary.shoulder.x, -rightHanded.self.hands.primary.shoulder.x);
  assert.equal(reflected.self.hands.primary.tip.x, -rightHanded.self.hands.primary.tip.x);

  // The swap table itself, whole. Exactly one pair moves, and it is a direction
  // of travel rather than a hand -- so a hand swap added to the table would show
  // up here as a third entry rather than as a comment going quietly false.
  const swapped = FEATURE_MIRROR_INDEX.map((source, index) => [FEATURE_COLUMNS[index], FEATURE_COLUMNS[source]])
    .filter(([name, from]) => name !== from);
  assert.deepEqual(swapped, [
    ["current_movement_circle-left", "current_movement_circle-right"],
    ["current_movement_circle-right", "current_movement_circle-left"],
  ]);
});

test("the_behaviour_record_counts_events_instead_of_the_truncated_combat_log", () => {
  const record = behaviourRecord();
  for (let i = 0; i < 40; i += 1) recordCombatEvent(record, {
    hand: i % 2 ? "secondary" : "primary", weapon: i % 3 ? "sword" : "empty",
    damage: 1, blocked: i % 4 === 0,
  });
  assert.equal(record.contacts.primary + record.contacts.secondary, 40);
  assert.equal(record.damage, 40);
  assert.equal(record.blocks, 10);
  const previous = {};
  recordBehaviourSample(record, view(), "cut", 0.1, previous);
  for (let i = 0; i < 20; i += 1) recordBehaviourSample(record, view(), "cut", 0.1, previous);
  assert.equal(record.attackAttempts.cut, 1, "one option entry is one attempt, not twenty samples or forty contacts");
});

test("training_validation_and_test_seed_ranges_cannot_leak", () => {
  assert.doesNotThrow(() => validateSeedRanges(SEED_RANGES));
  assert.throws(() => validateSeedRanges({ train: [0, 20], validation: [20, 40], test: [50, 60] }),
    /train and validation overlap/);
  for (const split of ["train", "validation", "test"]) {
    const seed = evaluationSeed(20260823, split, 4);
    assert.ok(seed >= SEED_RANGES[split][0] && seed <= SEED_RANGES[split][1]);
  }
  assert.deepEqual(evaluationMirrorSeeds(20260823, "test", 4), [
    evaluationSeed(20260823, "test", 4), evaluationSeed(20260823, "test", 4),
  ], "both sides of a mirror pair use one seed");
});

test("ordered_intent_parity_cannot_hide_equal_and_opposite_frame_errors", () => {
  const unchanged = duelistMind(4).decide(view(), 1 / 240);
  const baseline = [structuredClone(unchanged), structuredClone(unchanged)];
  const mutated = [structuredClone(unchanged), structuredClone(unchanged)];
  baseline[0].forward = 0; baseline[1].forward = 0;
  mutated[0].forward = 0; mutated[1].forward = 0;
  mutated[0].forward += 0.25;
  mutated[1].forward -= 0.25;
  assert.equal(mutated.reduce((sum, intent) => sum + intent.forward, 0),
    baseline.reduce((sum, intent) => sum + intent.forward, 0), "the means cancel exactly");
  assert.equal(intentSequencesEqual(baseline, mutated), false);
  assert.equal(intentSequencesEqual(baseline, baseline.slice(0, 1)), false, "sample count is part of parity");
});

test("options_and_features_have_no_mutable_config_backdoor", async () => {
  for (const path of ["../src/options.ts", "../src/learning/features.ts"]) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.doesNotMatch(source, /from ["'](?:\.\.\/)?config\.ts["']/);
  }
  assert.equal(Object.isFrozen(ACTION_TUNING), true);
});
