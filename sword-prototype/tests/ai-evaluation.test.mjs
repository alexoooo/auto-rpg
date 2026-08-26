import assert from "node:assert/strict";
import test from "node:test";

import { behaviourRecord, recordBehaviourSample, recordCombatEvent, recordIntentAttack } from "../src/options.ts";
import { blankIntent } from "../src/policies.ts";
import { EngagementTracker, attackOpportunity, opportunityForAction } from "../src/learning/engagement.ts";
import { INTENT_FIELDS, intentNumbers } from "../src/learning/evaluation.ts";
import { fitnessComponents, noveltyScore } from "../src/learning/meta.ts";
import { SplitReader } from "../src/learning/research.ts";
import { researchMatrix } from "../src/learning/research-matrix.ts";
import { assessTournamentCandidate } from "../src/learning/tournament.ts";
import { tacticCountKey } from "../src/options.ts";
import { assertCompleteView } from "./fixtures/view.mjs";

const hand = (weapon = "sword", reach = 1.2, outboard = 1) => ({ weapon, reach, lost: false, outboard,
  shoulder: { x: 0, y: 1.4, z: 0 }, tip: { x: 0, y: 1.4, z: reach }, tipSpeed: 0,
  // Still, and saying so in both fields. See `tests/fixtures/view.mjs`.
  tipVelocity: { x: 0, y: 0, z: 0 } });
const body = (z = 0, primary = hand(), radius = 0.25) => ({ unit: "warrior", reach: 0.7,
  crownHeight: 1.8, vitalHeight: 1.1, collisionRadius: radius, naturalAttacks: {}, ground: { x: 0, y: 0, z },
  facing: z ? Math.PI : 0, shoulder: primary.shoulder, tip: primary.tip, tipSpeed: 0,
  hands: { primary, secondary: hand("empty", 0.55, -1) }, crouch: 0, trunkLean: 0, trunkTwist: 0,
  vitality: 1, health: {} });
const view = (measure = 1.2) => assertCompleteView(
  { self: body(), opponent: body(measure), projectiles: [], measure, clock: 0 });

const readField = (intent, path) => path.split(".").reduce((at, key) => at[key], intent);
const writeField = (intent, path, value) => {
  const keys = path.split("."); const last = keys.pop();
  keys.reduce((at, key) => at[key], intent)[last] = value;
};

test("the_finiteness_sweep_covers_every_combat_number_and_nothing_else", () => {
  // A finiteness gate is `intentNumbers(...).some((v) => !Number.isFinite(v))`,
  // so it is worth exactly as much as the list it reads. A number the list
  // forgets can go NaN inside a candidate and nothing says so; a field the
  // command no longer carries -- `zoom`, until session 15 -- arrives as
  // `undefined` and would refuse every candidate for a reason nobody could act
  // on. Marking each numeric leaf with a value of its own pins both directions
  // in one assertion, which a length comparison would not: two errors that
  // cancel keep the count right. The list moved out of the deleted promotion
  // evaluator and into `evaluation.ts` beside `INTENT_FIELDS` in session 17;
  // this is the only thing that holds the two together.
  const probe = blankIntent();
  const numeric = INTENT_FIELDS.filter((field) => typeof readField(probe, field) === "number");
  numeric.forEach((field, index) => writeField(probe, field, index + 1));
  assert.deepEqual(
    [...intentNumbers(probe)].sort((a, b) => a - b), numeric.map((_, index) => index + 1),
    `the sweep reads ${intentNumbers(probe).length} numbers for ${numeric.length} numeric command fields`,
  );
  // The rest are left out deliberately rather than by oversight: `Number.isFinite`
  // is false for a hand name and for a button, so sweeping them would refuse
  // every candidate ever trained.
  assert.deepEqual(INTENT_FIELDS.filter((field) => typeof readField(probe, field) !== "number"),
    ["actingHand", "natural.thrust", "natural.guard", "primary.thrust", "primary.guard",
      "secondary.thrust", "secondary.guard"]);
  const holed = blankIntent(); holed.posture.crouch = NaN;
  assert.ok(intentNumbers(holed).some((value) => !Number.isFinite(value)), "the gate still catches a hole");
});

test("draws_and_losses_receive_no_terminal_success_credit", () => {
  const draw = behaviourRecord(); draw.seconds = 45; draw.vitality = 1;
  const loss = behaviourRecord(); loss.seconds = 4; loss.vitality = 1;
  assert.equal(fitnessComponents(draw, 1, 0).win, -4);
  assert.equal(fitnessComponents(loss, 1, 0).win, -4);
});

test("lasting_longer_without_damage_cannot_improve_fitness", () => {
  const short = behaviourRecord(); short.seconds = 1;
  const long = behaviourRecord(); long.seconds = 45;
  assert.equal(fitnessComponents(short, 1, 0).total, fitnessComponents(long, 1, 0).total);
  assert.equal(fitnessComponents(long, 1, 0).survival, 0);
});

test("one_attack_spammed_every_decision_counts_as_one_attack_opportunity", () => {
  const tracker = new EngagementTracker(); const sample = view(); tracker.sample(sample, 1 / 60);
  const key = attackOpportunity(sample).find((row) => row.viable && row.striker === "sword").key;
  for (let i = 0; i < 200; i += 1) { sample.clock = i / 100; tracker.sample(sample, 0.01); tracker.attack(key, i / 100); }
  assert.equal(tracker.record.viableOpportunities, 1);
  assert.equal(tracker.record.attacksInWindow, 1);
  const unsupported = new EngagementTracker(); unsupported.sample(sample, 0.01); unsupported.attack("hand:primary:bow", sample.clock);
  assert.equal(unsupported.record.firstAttackSeconds, null, "an unsupported action cannot fabricate first attack time");
});

test("resting_weapon_contact_cannot_fabricate_repeated_blocks", () => {
  const record = behaviourRecord();
  for (let i = 0; i < 40; i += 1) recordCombatEvent(record,
    { hand: "primary", weapon: "sword", damage: 0, blocked: true, defending: true, at: i / 240, contactId: "resting-contact" });
  assert.equal(record.blocks, 1);
});

test("distinct_projectiles_inside_one_debounce_interval_are_distinct_blocks", () => {
  const record = behaviourRecord();
  recordCombatEvent(record, { hand: "primary", weapon: "arrow", damage: 0, blocked: true, defending: true, at: 1, contactId: "arrow-1" });
  recordCombatEvent(record, { hand: "primary", weapon: "arrow", damage: 0, blocked: true, defending: true, at: 1.01, contactId: "arrow-2" });
  assert.equal(record.blocks, 2);
});

test("orbiting_inside_one_range_bin_is_reported_as_stall_not_engagement", () => {
  const tracker = new EngagementTracker(); const sample = view(1);
  for (let i = 0; i < 32; i += 1) {
    const angle = i * 0.025; sample.self.ground.x = Math.sin(angle); sample.self.ground.z = 1 - Math.cos(angle);
    sample.self.facing = Math.atan2(sample.opponent.ground.x - sample.self.ground.x,
      sample.opponent.ground.z - sample.self.ground.z); sample.clock = i * 0.1; tracker.sample(sample, 0.1);
  }
  assert.ok(tracker.record.nearRangeStallSeconds > 0);
  assert.equal(tracker.record.attacksInWindow, 0);
});

test("radial_closing_and_tangential_orbit_are_measured_separately", () => {
  const closing = new EngagementTracker(); const a = view(1.1); closing.sample(a, 0.1);
  a.self.ground.z += 0.2; a.measure -= 0.2; a.clock += 0.1; closing.sample(a, 0.1);
  const orbit = new EngagementTracker(); const b = view(1.1); orbit.sample(b, 0.1);
  b.self.ground.x += 0.2; b.clock += 0.1; orbit.sample(b, 0.1);
  assert.ok(closing.record.radialClosingMetres > closing.record.tangentialTravelMetres);
  assert.ok(orbit.record.tangentialTravelMetres > orbit.record.radialClosingMetres);
});

test("viable_range_comes_from_the_capable_striker_and_body_profile", () => {
  const narrow = view(1.4); narrow.self.hands.primary.reach = 1; narrow.opponent.collisionRadius = 0.2;
  assert.equal(attackOpportunity(narrow).find((row) => row.striker === "sword").viable, false);
  narrow.opponent.collisionRadius = 0.5;
  assert.equal(attackOpportunity(narrow).find((row) => row.striker === "sword").viable, true);
  narrow.self.hands.primary.lost = true;
  assert.equal(attackOpportunity(narrow).some((row) => row.striker === "sword"), false);
  const fist = view(0.7); fist.self.hands.primary.weapon = "empty"; fist.self.hands.primary.reach = 0.6;
  assert.equal(attackOpportunity(fist).find((row) => row.key === "hand:primary:empty").viable, false,
    "a fist's reach already ends at its contact surface");
});

test("natural_attack_reach_prevents_false_retreat_and_bite_is_an_attack_attempt", () => {
  const sample = view(0.55); sample.self.hands = {}; sample.self.naturalAttacks = { bite: { reach: 0.4, ready: true, active: false } };
  sample.opponent.collisionRadius = 0.2; sample.self.facing = 0; const record = behaviourRecord(); const previous = {};
  recordBehaviourSample(record, sample, "bite", 0.1, previous);
  assert.equal(record.engagement.retreatOutsideReachSeconds, 0);
  assert.equal(record.attackAttempts.bite, 1); assert.equal(record.engagement.attacksInWindow, 1);
});

test("an_attack_opportunity_names_its_effector_and_a_decision_is_attributed_to_that_hand", () => {
  // `opportunitiesForAction` had one caller, zero tests, and read the weapon
  // without ever reading the hand -- so on a two-fisted body every `punch`,
  // whichever fist it named, was attributed to whichever fist the enumeration
  // reached first. Both fists here, because a body with one punchable hand cannot
  // exhibit it: that is the fixture rule this directory learned from the
  // schedule/mask test.
  const fists = view(0.5);
  fists.self.hands.primary.weapon = "empty"; fists.self.hands.primary.reach = 0.6;
  // The whole row list against a freshly built one, not the field under test:
  // `effector` is new and the key already carried the same fact, so a row where
  // the two disagree is the failure worth catching.
  assert.deepEqual(attackOpportunity(fists).map((row) => [row.key, row.effector, row.viable]),
    [["hand:primary:empty", "primary", true], ["hand:secondary:empty", "secondary", true]]);
  // Each hand answers itself, and the row is the row -- identity against the
  // enumeration rather than a re-derived key, so a picker that rebuilt the record
  // would still have to rebuild it correctly.
  for (const effector of ["primary", "secondary"]) {
    assert.deepEqual(opportunityForAction(fists, "punch", effector),
      attackOpportunity(fists).find((row) => row.effector === effector));
  }
  // A hand that cannot perform the action, a hand that does not exist, and a hand
  // out of its own range: three ways to have no opportunity, and none of them may
  // fall through to the other hand's.
  assert.equal(opportunityForAction(fists, "cut", "primary"), null);
  assert.equal(opportunityForAction(fists, "punch", "natural"), null);
  const far = view(1.2); far.self.hands.primary.weapon = "empty"; far.self.hands.primary.reach = 0.6;
  assert.equal(opportunityForAction(far, "punch", "secondary"), null);
  assert.equal(opportunityForAction(far, "cut", "primary"), null);
  // The natural channel is an effector too, and it is `natural` rather than the
  // attack's own name.
  const jaws = view(0.55); jaws.self.hands = {};
  jaws.self.naturalAttacks = { bite: { reach: 0.4, ready: true, active: false } };
  jaws.opponent.collisionRadius = 0.2; jaws.self.facing = 0;
  assert.deepEqual(attackOpportunity(jaws).map((row) => [row.key, row.effector]), [["natural:bite", "natural"]]);
  assert.equal(opportunityForAction(jaws, "bite", "natural").key, "natural:bite");
  assert.equal(opportunityForAction(jaws, "bite", "primary"), null);
});

test("every_candidate_and_control_receives_the_exact_same_seed_matrix", () => {
  const candidate = researchMatrix("train", 20260824); const control = researchMatrix("train", 20260824);
  assert.deepEqual(candidate, control); assert.ok(candidate.every((row, index) => row.actorSeed === control[index].actorSeed));
});

const passingCandidate = () => ({ name: "candidate", algorithm: "dagger", artifactBytes: 10,
  meanScore: 0.8, confidenceLow: 0.7, confidenceHigh: 0.9, scriptedScore: 0.6, randomScore: 0.4,
  cells: [{ name: "warrior/sword", meaningfulEngagement: 1, opportunityAttackRate: 0.8,
    attackContactRate: 0.4, nearRangeStallShare: 0.1, firstAttackP90Seconds: 2,
    symmetricTimeCapRate: 0, score: 0.7, specialistScore: 0.8 }],
  // Was `{ close: 20, cover: 20, cut: 20, recover: 1 }`, and `close` is a
  // movement -- a record no producer could write, counted as a diverse action by
  // a gate that validated no names. Three real hand actions now.
  tacticCounts: { [tacticCountKey({ movement: "close", action: "cover", effector: "secondary", target: "threat", stance: "action-default" })]: 20,
    [tacticCountKey({ movement: "close", action: "cut", effector: "primary", target: "vital", stance: "action-default" })]: 20,
    [tacticCountKey({ movement: "circle-right", action: "thrust", effector: "primary", target: "low", stance: "slip-right" })]: 20,
    [tacticCountKey({ movement: "hold", action: "recover", effector: "primary", target: "vital", stance: "upright" })]: 1 },
  freeChoiceCounts: { effector: { primary: 41, secondary: 20 } },
  safety: { finiteAnatomical: true,
    capabilities: true, postVerdict: true, stuckActions: true, lifecycle: true } });

test("a_good_mean_cannot_hide_a_completely_failed_loadout_or_unit", () => {
  const candidate = passingCandidate(); candidate.cells.push({ ...candidate.cells[0], name: "broot/bow", meaningfulEngagement: 0 });
  assert.equal(assessTournamentCandidate(candidate).passed, false);
});

test("novelty_cannot_change_the_promotion_verdict", () => {
  const candidate = passingCandidate(); const before = assessTournamentCandidate(candidate);
  assert.ok(noveltyScore([0, 0], [[100, 100]]) > 0);
  assert.deepEqual(assessTournamentCandidate({ ...candidate, novelty: Number.MAX_VALUE }), before);
});

test("test_rows_are_absent_until_the_frozen_candidate_is_selected", () => {
  assert.throws(() => new SplitReader("test", [{ score: 1 }]).readForTraining("ppo"), /cannot read test rows/);
  assert.doesNotThrow(() => new SplitReader("validation", [{ score: 1 }]).readForEvaluation());
});

test("the_behaviour_recorder_counts_attack_windows_instead_of_frame_spam", () => {
  const record = behaviourRecord(); const sample = view(); const previous = {};
  for (let i = 0; i < 40; i += 1) { sample.clock = i / 240; recordBehaviourSample(record, sample, "cut", 1 / 240, previous); }
  assert.equal(record.attackAttempts.cut, 1); assert.equal(record.engagement.viableOpportunities, 1);
  assert.equal(record.engagement.attacksInWindow, 1);
});

test("specialist_bow_release_and_arrow_contact_convert_one_factual_opportunity", () => {
  const sample = view(2); sample.self.hands.primary.weapon = "bow"; sample.self.hands.primary.reach = 0.8;
  const record = behaviourRecord(); recordBehaviourSample(record, sample, null, 0.1, {});
  const intent = blankIntent(); intent.primary.thrust = true;
  const previous = {}; recordIntentAttack(record, sample, intent, previous);
  sample.clock = 0.1; intent.primary.thrust = false; recordIntentAttack(record, sample, intent, previous);
  recordCombatEvent(record, { hand: "primary", weapon: "arrow", damage: 10, blocked: false, at: 0.2 });
  assert.equal(record.engagement.attacksInWindow, 1); assert.equal(record.engagement.damagingContactsInWindow, 1);
});
