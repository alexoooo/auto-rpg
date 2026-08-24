import test from "node:test";
import assert from "node:assert/strict";

import { aggregateDaggerRows, balancedDaggerRows, daggerModelDigest, requireTeacherEngagement,
  selectDaggerIteration, trainDaggerModel, validateDaggerRow } from "../src/learning/dagger.ts";
import { tacticalTeacher } from "../src/learning/tactical-teacher.ts";

const hand = (weapon, reach, x) => ({ weapon, reach, lost: false, tipSpeed: 0, outboard: Math.sign(x) || 1,
  shoulder: { x, y: 1.4, z: 0 }, tip: { x, y: 1.4, z: reach } });
const view = (measure = 0.7) => { const selfHands = { primary: hand("empty", 0.72, 0.2), secondary: hand("empty", 0.72, -0.2) };
  const opponentHands = { primary: hand("sword", 1.45, -0.2), secondary: hand("empty", 0.72, 0.2) };
  return { self: { unit: "warrior", reach: 0.72, crownHeight: 1.8, vitalHeight: 1.25, collisionRadius: 0.17,
    ground: { x: 0, y: 0, z: 0 }, facing: 0, shoulder: selfHands.primary.shoulder,
    tip: selfHands.primary.tip, tipSpeed: 0, hands: selfHands, crouch: 0, trunkLean: 0, trunkTwist: 0,
    vitality: 1, health: {}, naturalAttacks: {} }, opponent: { unit: "warrior", reach: 1.45, crownHeight: 1.8,
    vitalHeight: 1.25, collisionRadius: 0.17, ground: { x: 0, y: 0, z: measure }, facing: Math.PI,
    shoulder: opponentHands.primary.shoulder, tip: opponentHands.primary.tip, tipSpeed: 0, hands: opponentHands,
    crouch: 0, trunkLean: 0, trunkTwist: 0, vitality: 1, health: {}, naturalAttacks: {} }, measure, clock: 0 }; };

test("the_teacher_attacks_a_real_opportunity_and_closes_when_none_exists", () => {
  assert.deepEqual(tacticalTeacher(view(0.7)), { movement: "hold", action: "punch", persistence: 0.42 });
  assert.deepEqual(tacticalTeacher(view(1.2)), { movement: "close", action: "cover", persistence: 0.24 });
});

test("the_teacher_does_not_label_retreat_for_an_extended_fist_outside_shoulder_range", () => {
  assert.equal(tacticalTeacher(view(0.78)).movement, "close");
});

const row = (iteration, unitCell, action, sourceStep) => ({ featureVersion: 3, features: [0.1, 0.2],
  label: { movement: "close", action, persistence: 0.4 }, unitCell, sourceSeed: 310013,
  sourceStep, iteration, teacherVersion: 1 });

test("dagger_rows_contain_only_versioned_observation_features_and_labels", () => {
  assert.doesNotThrow(() => validateDaggerRow(row(0, "warrior/bare", "punch", 1), 3, 2));
  assert.throws(() => validateDaggerRow({ ...row(0, "warrior/bare", "punch", 1), features: [0.1, NaN] }, 3, 2), /finite published features/);
  assert.throws(() => validateDaggerRow({ ...row(0, "warrior/bare", "punch", 1), exactEnemyPose: [1, 2, 3] }, 3, 2), /privileged/);
  assert.throws(() => trainDaggerModel([row(0, "warrior/bare", "punch", 1),
    { ...row(0, "warrior/bare", "punch", 2), featureVersion: 4 }], 2, ["close"], ["punch"]),
    /feature version 4 does not match 3/);
});

test("validation_selects_an_iteration_without_reading_test_rows", () => {
  const selected = selectDaggerIteration([{ iteration: 0, validationLoss: 0.5, testLoss: 0 },
    { iteration: 1, validationLoss: 0.2, testLoss: 99 }]);
  assert.equal(selected.iteration, 1);
});

test("a_teacher_below_the_engagement_floor_refuses_before_training", () => {
  assert.throws(() => requireTeacherEngagement(0.04, 0.05), /below frozen floor/);
  assert.doesNotThrow(() => requireTeacherEngagement(0.05, 0.05));
});

test("learner_visited_states_are_relabelled_and_aggregated_in_stable_order", () => {
  const rows = [row(1, "warrior/bare", "punch", 5), row(0, "warrior/bare", "cover", 8), row(1, "broot/bare", "punch", 2)];
  assert.deepEqual(aggregateDaggerRows([rows.slice(1), rows.slice(0, 1)]).map((value) => [value.iteration, value.unitCell, value.sourceStep]), [
    [0, "warrior/bare", 8], [1, "broot/bare", 2], [1, "warrior/bare", 5],
  ]);
});

test("class_balancing_cannot_drop_a_rare_legal_attack_or_unit_cell", () => {
  const rows = Array.from({ length: 5 }, (_, index) => row(0, "warrior/bare", "cover", index));
  rows.push(row(0, "warrior/bare", "punch", 20), row(0, "centipede/natural", "bite", 30));
  const balanced = balancedDaggerRows(rows, 2);
  assert.equal(balanced.filter((value) => value.label.action === "cover").length, 2);
  assert.ok(balanced.some((value) => value.label.action === "punch"));
  assert.ok(balanced.some((value) => value.label.action === "bite"));
});

test("the_same_seed_and_dataset_produce_byte_identical_weights_and_report", () => {
  const rows = [row(0, "warrior/bare", "cover", 0), row(1, "warrior/bare", "punch", 1)];
  const a = trainDaggerModel(rows, 2, ["close", "hold"], ["cover", "punch"]);
  const b = trainDaggerModel([...rows].reverse(), 2, ["close", "hold"], ["cover", "punch"]);
  assert.equal(daggerModelDigest(a), daggerModelDigest(b));
});

test("human_trace_absence_does_not_change_the_required_experiment_matrix", () => {
  const required = [row(0, "warrior/bare", "punch", 0)];
  assert.deepEqual(aggregateDaggerRows([required, []]), aggregateDaggerRows([required]));
});
