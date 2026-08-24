import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  OPTION_NAMES,
  behaviourRecord,
  combatOption,
  recordCombatEvent,
  recordBehaviourSample,
  scriptedMetaMind,
} from "../src/options.ts";
import { FEATURE_COLUMNS, FEATURE_MIRROR_SIGN, FEATURE_VERSION, FeatureWriter, mirrorView, writeFeatures } from "../src/learning/features.ts";
import { INTENT_FIELDS, PARITY_CALIBRATION, PARITY_LIMITS, SEED_RANGES, evaluationMirrorSeeds, evaluationSeed, intentFieldDeltas, intentSequencesEqual, validateSeedRanges } from "../src/learning/evaluation.ts";
import { archerMind, duelistMind } from "../src/policies.ts";
import { ACTION_SHOT_TIMING, ACTION_STROKE_TIMING, ACTION_TUNING, actionShotPhase, actionStrokeReading } from "../src/action-primitives.ts";
import { WEAPON_KINDS } from "../src/hands.ts";

const parts = () => Object.fromEntries([
  "torso", "head", "pelvis", "upperArm", "forearm", "hand", "offUpperArm", "offForearm",
  "thighL", "shinL", "thighR", "shinR",
].map((key) => [key, 1]));
const hand = (weapon, outboard, x = 0) => ({
  weapon, shoulder: { x, y: 1.4, z: 0 }, tip: { x, y: 1.4, z: 1 }, tipSpeed: 0,
  reach: weapon === "bow" ? 0.6 : weapon === "empty" ? 0.6 : 1.45, lost: false, outboard,
});
const view = (mine = { primary: "sword", secondary: "empty" }, theirs = mine) => {
  const selfHands = { primary: hand(mine.primary, 1, 0.2), secondary: hand(mine.secondary, -1, -0.2) };
  const opponentHands = { primary: hand(theirs.primary, 1, -0.2), secondary: hand(theirs.secondary, -1, 0.2) };
  for (const h of Object.values(opponentHands)) { h.shoulder.z = 1.5; h.tip.z = 0.5; }
  return {
    self: { ground: { x: 0, y: 0, z: 0 }, facing: 0, shoulder: selfHands.primary.shoulder,
      tip: selfHands.primary.tip, tipSpeed: 0, hands: selfHands, crouch: 0.2, trunkLean: -0.1,
      trunkTwist: 0.3, vitality: 0.8, health: parts() },
    opponent: { ground: { x: 0, y: 0, z: 1.5 }, facing: Math.PI,
      shoulder: opponentHands.primary.shoulder, tip: opponentHands.primary.tip, tipSpeed: 3,
      hands: opponentHands, crouch: 0, trunkLean: 0.1, trunkTwist: -0.2,
      vitality: 0.6, health: parts() },
    measure: 1.1, clock: 12.5,
  };
};

const complete = (intent) => {
  for (const key of ["forward", "strafe", "turn", "zoom"]) assert.ok(Number.isFinite(intent[key]));
  assert.ok(["primary", "secondary"].includes(intent.driving));
  for (const key of ["trunkLean", "trunkTwist", "crouch"]) assert.ok(Number.isFinite(intent.posture[key]));
  assert.ok(intent.zoom >= 0.1 && intent.zoom <= 4);
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
  const loadouts = {
    close: view(), disengage: view(), cover: view(), cut: view(), thrust: view(),
    punch: view({ primary: "empty", secondary: "empty" }),
    shoot: view({ primary: "bow", secondary: "empty" }), recover: view(),
  };
  for (const name of OPTION_NAMES) {
    const option = combatOption(name);
    option.enter(loadouts[name]);
    const intent = option.decide(loadouts[name], 1 / 240);
    complete(intent);
    for (const axis of [intent.forward, intent.strafe, intent.turn, intent.primary.pointerX,
      intent.primary.pointerY, intent.secondary.pointerX, intent.secondary.pointerY]) {
      assert.ok(axis >= -1 && axis <= 1, `${name}: ${axis}`);
    }
  }
});

test("legacy_and_options_share_the_full_stroke_and_shot_timeline", () => {
  assert.equal(actionStrokeReading(ACTION_STROKE_TIMING.chamber / 2).phase, "chamber");
  assert.equal(actionStrokeReading(ACTION_STROKE_TIMING.chamber + ACTION_STROKE_TIMING.commit / 2).phase, "commit");
  assert.equal(actionStrokeReading(ACTION_STROKE_TIMING.chamber + ACTION_STROKE_TIMING.commit + 0.01).phase, "recover");
  const cut = combatOption("cut"); const v = view(); cut.enter(v);
  const recovering = cut.decide(v, ACTION_STROKE_TIMING.chamber + ACTION_STROKE_TIMING.commit + 0.01);
  assert.equal(recovering.primary.guard, true);
  assert.equal(cut.done(v), false);
  assert.equal(actionShotPhase(ACTION_SHOT_TIMING.draw + ACTION_SHOT_TIMING.release + 0.01), "cooldown");
});

test("an_option_refuses_a_loadout_that_cannot_perform_it_by_name", () => {
  assert.throws(() => combatOption("shoot").enter(view()), /option "shoot".*bow/);
  assert.throws(() => combatOption("punch").enter(view({ primary: "sword", secondary: "sword" })),
    /option "punch".*empty hand/);
  assert.throws(() => combatOption("teleport"), /unknown option "teleport"/);
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
    v.opponent.hands.primary.tipSpeed = i > 700 && i < 760 ? 9 : 0;
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
  const archer = scriptedMetaMind("archer", 44); const bow = view({ primary: "bow", secondary: "empty" });
  let held = 0; let released = 0;
  for (let i = 0; i < 520; i += 1) { bow.clock = i / 240; const intent = archer.decide(bow, 1 / 240); intent.primary.thrust ? held++ : released++; }
  assert.ok(held > 200 && released > 0, "the option trace preserves draw then release timing");
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

test("feature_columns_are_total_finite_and_versioned", () => {
  assert.equal(FEATURE_VERSION, 2);
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
  assert.ok(writer.write(moving)[FEATURE_COLUMNS.indexOf("closing_rate")] > 0.9);
  const coherent = view({ primary: "sword", secondary: "empty" }, { primary: "shield", secondary: "sword" });
  coherent.opponent.hands.primary.tipSpeed = 30; coherent.opponent.hands.secondary.tipSpeed = 7;
  coherent.opponent.hands.secondary.tip.x = 0.8;
  const threatFeatures = writeFeatures(coherent);
  assert.equal(threatFeatures[FEATURE_COLUMNS.indexOf("threat_speed")], 7 / 40,
    "the fast shield is not the dangerous hand");
  assert.ok(threatFeatures[FEATURE_COLUMNS.indexOf("threat_bearing")] > 0,
    "bearing and speed both describe the secondary sword tip");
});

test("mirroring_a_view_mirrors_directional_features_and_preserves_scalar_ones", () => {
  const asymmetric = view(); asymmetric.opponent.ground.x = 0.7; asymmetric.opponent.shoulder.x = 0.7;
  const original = writeFeatures(asymmetric);
  const mirrored = writeFeatures(mirrorView(asymmetric));
  for (let i = 0; i < FEATURE_COLUMNS.length; i += 1) {
    assert.ok(Math.abs(mirrored[i] - FEATURE_MIRROR_SIGN[i] * original[i]) < 1e-12,
      FEATURE_COLUMNS[i]);
  }
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
  const legacy = [structuredClone(unchanged), structuredClone(unchanged)];
  const mutated = [structuredClone(unchanged), structuredClone(unchanged)];
  legacy[0].forward = 0; legacy[1].forward = 0;
  mutated[0].forward = 0; mutated[1].forward = 0;
  mutated[0].forward += 0.25;
  mutated[1].forward -= 0.25;
  assert.equal(mutated.reduce((sum, intent) => sum + intent.forward, 0),
    legacy.reduce((sum, intent) => sum + intent.forward, 0), "the means cancel exactly");
  assert.equal(intentSequencesEqual(legacy, mutated), false);
  assert.equal(intentSequencesEqual(legacy, legacy.slice(0, 1)), false, "sample count is part of parity");
});

test("options_and_features_have_no_mutable_config_backdoor", async () => {
  for (const path of ["../src/options.ts", "../src/learning/features.ts"]) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.doesNotMatch(source, /from ["'](?:\.\.\/)?config\.ts["']/);
  }
  assert.equal(Object.isFrozen(ACTION_TUNING), true);
});

test("the_checked_in_corpus_pairs_legacy_and_meta_without_fabricating_legacy_options", async () => {
  const baseline = JSON.parse(await readFile(new URL("../asset-src/learning/baseline-v1.json", import.meta.url), "utf8"));
  assert.equal(baseline.version, 3);
  assert.equal(baseline.parity.length, 12);
  assert.deepEqual(baseline.parityLimits, PARITY_LIMITS);
  assert.deepEqual(PARITY_LIMITS, { damage: 0, seconds: 0, actionRate: 0 });
  assert.deepEqual(baseline.parityCalibration, PARITY_CALIBRATION);
  assert.equal(baseline.parityCalibration.brackets, 48);
  assert.deepEqual(baseline.parityCalibration.observedLegacyRepeatMax,
    { damage: 0, seconds: 0, actionRate: 0 });
  assert.ok(baseline.parity.every((row) => row.sameSeed && row.endingMatch && row.winnerMatch &&
    row.sampleCountMatch && row.intentSequenceMatch && row.controlSampleCountMatch && row.controlIntentSequenceMatch &&
    row.controlWithinLimits && row.withinLimits &&
    row.damageDelta === 0 && row.durationDelta === 0 && row.controlDamageDelta === 0 && row.controlDurationDelta === 0 &&
    INTENT_FIELDS.every((key) => row.actionDelta[key] === 0 && row.controlActionDelta[key] === 0)));
  assert.equal(baseline.syntheticParity.samples, 1200);
  assert.deepEqual(Object.keys(baseline.syntheticParity.fields), INTENT_FIELDS);
  assert.ok(Object.values(baseline.syntheticParity.fields).every((row) =>
    Number.isInteger(row.changed) && Number.isFinite(row.max)));
  assert.equal(baseline.syntheticParity.withinLimits, true);
  assert.ok(INTENT_FIELDS.every((field) => baseline.syntheticParity.fieldsWithinLimits[field] === true));
  for (const controller of ["legacy", "meta"]) {
    assert.ok(baseline.syntheticParity.shotOutput[controller].held > 0);
    assert.ok(baseline.syntheticParity.shotOutput[controller].released > 0);
    assert.ok(Number.isInteger(baseline.syntheticParity.shotOutput[controller].edges));
  }
  assert.deepEqual(baseline.syntheticParity.shotOutput.meta, baseline.syntheticParity.shotOutput.legacy);
  assert.equal(baseline.syntheticParity.shotDutyDelta, 0);
  assert.equal(baseline.syntheticParity.shotEdgeDelta, 0);
  const legacy = baseline.records.filter((row) => row.controller === "legacy");
  assert.ok(legacy.length > 0);
  assert.ok(legacy.every((row) => Object.values(row.behavior.options).every((seconds) => seconds === 0) &&
    Object.values(row.behavior.attackAttempts).every((attempts) => attempts === 0)));
});
