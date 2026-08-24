import assert from "node:assert/strict";
import test from "node:test";

import { behaviourRecord, recordBehaviourSample, recordCombatEvent, recordIntentAttack } from "../src/options.ts";
import { EngagementTracker, attackOpportunity } from "../src/learning/engagement.ts";
import { fitnessComponents, noveltyScore } from "../src/learning/meta.ts";
import { SplitReader } from "../src/learning/research.ts";
import { researchMatrix } from "../src/learning/research-matrix.ts";
import { assessTournamentCandidate } from "../src/learning/tournament.ts";

const hand = (weapon = "sword", reach = 1.2, outboard = 1) => ({ weapon, reach, lost: false, outboard,
  shoulder: { x: 0, y: 1.4, z: 0 }, tip: { x: 0, y: 1.4, z: reach }, tipSpeed: 0 });
const body = (z = 0, primary = hand(), radius = 0.25) => ({ unit: "warrior", reach: 0.7,
  crownHeight: 1.8, vitalHeight: 1.1, collisionRadius: radius, naturalAttacks: {}, ground: { x: 0, y: 0, z },
  facing: z ? Math.PI : 0, shoulder: primary.shoulder, tip: primary.tip, tipSpeed: 0,
  hands: { primary, secondary: hand("empty", 0.55, -1) }, crouch: 0, trunkLean: 0, trunkTwist: 0,
  vitality: 1, health: {} });
const view = (measure = 1.2) => ({ self: body(), opponent: body(measure), measure, clock: 0 });

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

test("every_candidate_and_control_receives_the_exact_same_seed_matrix", () => {
  const candidate = researchMatrix("train", 20260824); const control = researchMatrix("train", 20260824);
  assert.deepEqual(candidate, control); assert.ok(candidate.every((row, index) => row.actorSeed === control[index].actorSeed));
});

const passingCandidate = () => ({ name: "candidate", algorithm: "dagger", artifactBytes: 10,
  meanScore: 0.8, confidenceLow: 0.7, confidenceHigh: 0.9, scriptedScore: 0.6, randomScore: 0.4,
  cells: [{ name: "warrior/sword", meaningfulEngagement: 1, opportunityAttackRate: 0.8,
    attackContactRate: 0.4, nearRangeStallShare: 0.1, firstAttackP90Seconds: 2,
    symmetricTimeCapRate: 0, score: 0.7, specialistScore: 0.8 }],
  actionCounts: { close: 20, cover: 20, cut: 20, recover: 1 }, safety: { finiteAnatomical: true,
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

test("legacy_bow_release_and_arrow_contact_convert_one_factual_opportunity", () => {
  const sample = view(2); sample.self.hands.primary.weapon = "bow"; sample.self.hands.primary.reach = 0.8;
  const record = behaviourRecord(); recordBehaviourSample(record, sample, null, 0.1, {});
  const intent = { forward: 0, strafe: 0, turn: 0, zoom: 1, driving: "primary",
    posture: { trunkLean: 0, trunkTwist: 0, crouch: 0 },
    primary: { pointerX: 0, pointerY: 0, roll: 0, wristBend: 0, thrust: true, guard: false },
    secondary: { pointerX: 0, pointerY: 0, roll: 0, wristBend: 0, thrust: false, guard: false } };
  const previous = {}; recordIntentAttack(record, sample, intent, previous);
  sample.clock = 0.1; intent.primary.thrust = false; recordIntentAttack(record, sample, intent, previous);
  recordCombatEvent(record, { hand: "primary", weapon: "arrow", damage: 10, blocked: false, at: 0.2 });
  assert.equal(record.engagement.attacksInWindow, 1); assert.equal(record.engagement.damagingContactsInWindow, 1);
});
