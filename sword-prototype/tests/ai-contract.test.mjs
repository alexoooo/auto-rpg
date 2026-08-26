import test from "node:test";
import assert from "node:assert/strict";

import { ResearchArtifact } from "../src/learning/artifact.ts";
import { EngagementTracker, attackOpportunity } from "../src/learning/engagement.ts";
import { QualityArchive, qualityCell } from "../src/learning/quality-diversity.ts";
import { indexedResearchJobs, resumeResearch, SplitReader, stableResearchReport } from "../src/learning/research.ts";
import { RESEARCH_CURRICULUM, RESEARCH_STRATA, curriculumStage, researchMatrix } from "../src/learning/research-matrix.ts";
import { tournamentVerdict } from "../src/learning/tournament.ts";
import { tacticCountKey } from "../src/options.ts";
import { assertCompleteView } from "./fixtures/view.mjs";

// Synthetic on both halves of the header, and deliberately not the runtime
// tables: this file is about the envelope -- checksum, algorithm, provenance,
// plain-data ownership -- and an envelope test that imported the real
// vocabularies would go red every time a name was added to one of them.
const contract = Object.freeze({
  featureVersion: 3,
  featureNames: Object.freeze(["reach-margin", "facing-error"]),
  tacticVersion: 2,
  movementNames: Object.freeze(["close", "hold"]),
  actionNames: Object.freeze(["cover", "cut"]),
  effectorNames: Object.freeze(["primary", "natural"]),
  targetNames: Object.freeze(["vital", "threat"]),
  stanceNames: Object.freeze(["action-default", "compact"]),
});

test("a_research_artifact_round_trips_each_named_algorithm_and_checks_its_digest", () => {
  for (const algorithm of ["neat-qd", "dagger", "ppo", "lookahead"]) {
    const artifact = new ResearchArtifact({ algorithm, ...contract, payload: [0, 1, 254, 255],
      provenance: { seed: 310013, solverSteps: 1_800_000_000, trainingSplit: "train", validationSplit: "validation",
        configDigest: "contract-v3", nested: { complete: true } } }, contract);
    const bytes = artifact.toBytes();
    assert.deepEqual(ResearchArtifact.fromBytes(bytes, contract).data, artifact.data);
    const corrupt = bytes.slice(); corrupt[corrupt.length - 5] ^= 1;
    assert.throws(() => ResearchArtifact.fromBytes(corrupt, contract), /checksum|JSON/);
  }
  const provenance = { seed: 310013, solverSteps: 4, trainingSplit: "train", validationSplit: "validation",
    configDigest: "immutable", nested: { complete: true } };
  const immutable = new ResearchArtifact({ algorithm: "ppo", ...contract, payload: [1], provenance }, contract);
  const before = immutable.toBytes(); provenance.nested.complete = false;
  assert.deepEqual(immutable.toBytes(), before, "validated nested provenance is owned by the artifact");
  assert.equal(immutable.data.provenance.nested.complete, true);
});

test("an_unknown_algorithm_or_mismatched_feature_action_table_refuses_by_name", () => {
  assert.throws(() => new ResearchArtifact({ algorithm: "telepathy", ...contract, payload: [], provenance: {} }, contract),
    /algorithm "telepathy" is unknown/);
  assert.throws(() => new ResearchArtifact({ algorithm: "ppo", ...contract, movementNames: ["orbit"], payload: [], provenance: {} }, contract),
    /movement names do not match/);
  // All four output tables, not just the two the thirteen-wide header had. Each
  // one is a separate name in the refusal because each one is a separate repair,
  // and a header that grew three tables without growing three refusals would
  // accept an artifact whose stance head is indexed against another vocabulary.
  for (const [field, label] of [["actionNames", "action"], ["effectorNames", "effector"],
    ["targetNames", "target"], ["stanceNames", "stance"]]) {
    assert.throws(() => new ResearchArtifact({ algorithm: "ppo", ...contract, [field]: ["fabricated"], payload: [], provenance: {} }, contract),
      new RegExp(`${label} names do not match`), field);
    // And an absent table is refused with the same sentence rather than a
    // `TypeError` from reading `.length` of `undefined`: `fromBytes` spreads what
    // it decoded and rejects no key, so a table can genuinely be missing.
    assert.throws(() => new ResearchArtifact({ algorithm: "ppo", ...contract, [field]: undefined, payload: [], provenance: {} }, contract),
      new RegExp(`${label} names do not match`), field);
  }
});

test("worker_count_and_resume_boundaries_do_not_change_indexed_jobs_or_reports", () => {
  const jobs = indexedResearchJobs("train", ["a", "b", "c", "d"], 100);
  assert.deepEqual(resumeResearch(jobs, [{ index: 3, value: "d" }, { index: 1, value: "b" }]).map((job) => job.index), [0, 2]);
  const forward = stableResearchReport("dagger", jobs.map((job) => ({ index: job.index, value: job.value })));
  const reverse = stableResearchReport("dagger", [...jobs].reverse().map((job) => ({ index: job.index, value: job.value })));
  assert.equal(forward, reverse);
});

test("validation_and_test_cannot_be_read_by_a_training_algorithm", () => {
  assert.deepEqual(new SplitReader("train", [1, 2]).readForTraining("ppo"), [1, 2]);
  assert.throws(() => new SplitReader("validation", [3]).readForTraining("ppo"), /ppo training cannot read validation rows/);
  assert.throws(() => new SplitReader("test", [4]).readForTraining("ppo"), /ppo training cannot read test rows/);
});

test("map_elites_keeps_the_best_feasible_controller_in_each_exact_behavior_cell", () => {
  const descriptor = { opportunityConversion: 0.72, contactConversion: 0.31, nearRangeStallShare: 0.08 };
  assert.equal(qualityCell(descriptor), "3:1:0");
  const archive = new QualityArchive();
  assert.equal(archive.offer({ descriptor, result: { feasible: true, terminalTier: 1, safetyTier: 2 }, value: "first" }), true);
  assert.equal(archive.offer({ descriptor, result: { feasible: true, terminalTier: 2, safetyTier: 0 }, value: "better" }), true);
  assert.equal(archive.get(descriptor).value, "better");
});

test("novel_but_stalling_behavior_cannot_displace_a_feasible_elite", () => {
  const descriptor = { opportunityConversion: 0.72, contactConversion: 0.31, nearRangeStallShare: 0.08 };
  const archive = new QualityArchive();
  archive.offer({ descriptor, result: { feasible: true, terminalTier: 0, safetyTier: 0 }, value: "feasible" });
  assert.equal(archive.offer({ descriptor, result: { feasible: false, terminalTier: 100, safetyTier: 100 }, value: "novel-stall" }), false);
  assert.equal(archive.get(descriptor).value, "feasible");
});

const passing = (name, overrides = {}) => ({
  name, algorithm: "dagger", artifactBytes: 1000, meanScore: 0.7, confidenceLow: 0.65,
  scriptedScore: 0.5, randomScore: 0.3,
  cells: [{ name: "warrior/sword", meaningfulEngagement: 1, opportunityAttackRate: 0.8,
    attackContactRate: 0.4, nearRangeStallShare: 0.1, firstAttackP90Seconds: 4,
    symmetricTimeCapRate: 0.05, score: 0.6, specialistScore: 0.7 }],
  // `close` was one of the four counts here and `close` is a MOVEMENT: the old
  // action-keyed map counted it toward the three-diverse-actions gate, which no
  // producer could ever have written. Three real hand actions plus `recover`,
  // keyed on the whole tuple through the one key builder.
  tacticCounts: { [tacticCountKey({ movement: "close", action: "cover", effector: "secondary", target: "threat", stance: "action-default" })]: 20,
    [tacticCountKey({ movement: "close", action: "cut", effector: "primary", target: "vital", stance: "action-default" })]: 20,
    [tacticCountKey({ movement: "hold", action: "thrust", effector: "primary", target: "high", stance: "compact" })]: 20,
    [tacticCountKey({ movement: "disengage", action: "recover", effector: "primary", target: "vital", stance: "upright" })]: 10 },
  freeChoiceCounts: { effector: { primary: 50, secondary: 20 } },
  safety: { finiteAnatomical: true, capabilities: true, postVerdict: true, stuckActions: true, lifecycle: true },
  ...overrides,
});

test("a_candidate_with_the_best_mean_but_a_dead_cell_is_rejected", () => {
  const dead = passing("dead", { meanScore: 0.95, cells: [{ ...passing("x").cells[0], meaningfulEngagement: 0 }] });
  const verdict = tournamentVerdict([dead, passing("sound")]);
  assert.equal(verdict.promoted, "sound");
  assert.equal(verdict.candidates.find((row) => row.name === "dead").passed, false);
});

test("a_candidate_that_wins_by_time_limit_avoidance_is_rejected", () => {
  const avoider = passing("avoider", { cells: [{ ...passing("x").cells[0], symmetricTimeCapRate: 0.11 }] });
  assert.equal(tournamentVerdict([avoider]).promoted, null);
});

test("no_passing_candidate_produces_no_promoted_artifact", () => {
  assert.equal(tournamentVerdict([passing("unsafe", { safety: { ...passing("x").safety, postVerdict: false } })]).promoted, null);
});

test("a_statistical_tie_selects_the_frozen_smaller_then_named_candidate", () => {
  const large = passing("large", { algorithm: "ppo", artifactBytes: 5000, meanScore: 0.72, confidenceLow: 0.64 });
  const small = passing("small", { algorithm: "lookahead", artifactBytes: 500, meanScore: 0.70, confidenceLow: 0.66 });
  assert.equal(tournamentVerdict([large, small]).promoted, "small");
  assert.equal(tournamentVerdict([small, large]).promoted, "small");
});

const engagementView = () => {
  const hand = (weapon, reach, x) => ({ weapon, reach, lost: false, tipSpeed: 0,
    // A speed and the direction it is a speed of, which is what a real hand
    // publishes; see `tests/fixtures/view.mjs`.
    tipVelocity: { x: 0, y: 0, z: 0 }, outboard: Math.sign(x) || 1,
    shoulder: { x, y: 1.4, z: 0 }, tip: { x, y: 1.4, z: reach } });
  const selfHands = { primary: hand("empty", 0.72, 0.2), secondary: hand("shield", 0.4, -0.2) };
  const opponentHands = { primary: hand("sword", 1.45, -0.2), secondary: hand("empty", 0.72, 0.2) };
  return assertCompleteView({ self: { unit: "warrior", ground: { x: 0, y: 0, z: 0 }, facing: 0,
    shoulder: selfHands.primary.shoulder, tip: selfHands.primary.tip, tipSpeed: 0, hands: selfHands,
    crouch: 0, trunkLean: 0, trunkTwist: 0, vitality: 1, health: {}, reach: 0.72,
    crownHeight: 1.8, vitalHeight: 1.1, collisionRadius: 0.3, naturalAttacks: {} },
  opponent: { unit: "warrior", ground: { x: 0, y: 0, z: 0.65 }, facing: Math.PI,
    shoulder: opponentHands.primary.shoulder, tip: opponentHands.primary.tip, tipSpeed: 0, hands: opponentHands,
    crouch: 0, trunkLean: 0, trunkTwist: 0, vitality: 1, health: {}, reach: 1.45,
    crownHeight: 1.8, vitalHeight: 1.1, collisionRadius: 0.3, naturalAttacks: {} },
  projectiles: [], measure: 0.65, clock: 0 });
};

test("viable_range_comes_from_the_capable_striker_and_body_profile", () => {
  const view = engagementView();
  const opportunity = attackOpportunity(view);
  assert.equal(opportunity.some((row) => row.key === "hand:primary:empty" && row.viable), true);
  assert.equal(opportunity.some((row) => row.key.includes("shield")), false);
  view.self.hands.primary.reach = 0.3;
  assert.equal(attackOpportunity(view).some((row) => row.viable), false);
  view.self.naturalAttacks = { bite: { reach: 0.68, ready: true, active: false } };
  assert.equal(attackOpportunity(view).some((row) => row.key === "natural:bite" && row.viable), true);
});

test("one_attack_spammed_every_decision_counts_as_one_attack_opportunity", () => {
  const view = engagementView(); const tracker = new EngagementTracker();
  for (let frame = 0; frame < 20; frame += 1) {
    view.clock = frame / 60; tracker.sample(view, 1 / 60); tracker.attack("hand:primary:empty", view.clock);
  }
  assert.equal(tracker.record.viableOpportunities, 1);
  assert.equal(tracker.record.attacksInWindow, 1);
});

test("orbiting_inside_one_range_bin_is_reported_as_stall_not_engagement", () => {
  const view = engagementView(); const tracker = new EngagementTracker();
  for (let frame = 0; frame < 240; frame += 1) {
    const angle = frame / 240 * Math.PI;
    view.self.ground.x = Math.sin(angle) * 0.65; view.self.ground.z = 0.65 - Math.cos(angle) * 0.65;
    view.self.facing = Math.atan2(-view.self.ground.x, view.opponent.ground.z - view.self.ground.z);
    view.clock = frame / 60; tracker.sample(view, 1 / 60);
  }
  assert.equal(tracker.record.attacksInWindow, 0);
  assert.ok(tracker.record.tangentialTravelMetres > tracker.record.radialClosingMetres);
  assert.ok(tracker.record.nearRangeStallSeconds > 0);
});

test("every_candidate_and_control_receives_the_exact_same_seed_matrix", () => {
  const candidate = researchMatrix("validation", 20260824);
  const control = researchMatrix("validation", 20260824);
  assert.deepEqual(candidate, control);
  assert.ok(candidate.every((row, index) => row.cell === Math.floor(index / 2) && row.mirror === index % 2));
});

test("test_rows_are_absent_until_the_frozen_candidate_is_selected", () => {
  const train = researchMatrix("train", 20260824); const validation = researchMatrix("validation", 20260824);
  assert.ok(train.every((row) => row.split === "train"));
  assert.ok(validation.every((row) => row.split === "validation"));
  assert.equal(train.some((row) => validation.some((other) => other.actorSeed === row.actorSeed)), false);
});

test("the_curriculum_schedule_is_seed_independent_complete_and_in_the_config_digest", () => {
  assert.deepEqual(RESEARCH_CURRICULUM.map((stage) => stage.startFraction), [0, 0.15, 0.35, 0.55, 0.75]);
  assert.equal(curriculumStage(0.74).name, "mixed"); assert.equal(curriculumStage(0.75).name, "complete");
  assert.deepEqual(curriculumStage(1).strata, RESEARCH_STRATA);
});

test("the_final_quarter_contains_every_frozen_loadout_opponent_and_unit_stratum", () => {
  const complete = curriculumStage(0.75).strata;
  assert.deepEqual(new Set(complete.map((row) => row.unit)), new Set(["warrior", "broot", "centipede"]));
  assert.deepEqual(new Set(complete.map((row) => row.opponent)), new Set(["specialist", "scripted-meta", "random-meta"]));
  assert.equal(complete.length, RESEARCH_STRATA.length);
});
