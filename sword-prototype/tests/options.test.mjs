import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  OPTION_NAMES,
  HAND_ACTION_NAMES,
  MOVEMENT_NAMES,
  behaviourRecord,
  combatOption,
  composeTactic,
  handActionOption,
  movementIntent,
  recordCombatEvent,
  recordBehaviourSample,
  scriptedMetaMind,
} from "../src/options.ts";
import { FEATURE_COLUMNS, FEATURE_MIRROR_SIGN, FEATURE_VERSION, FeatureWriter, mirrorFeatures, mirrorView, writeFeatures } from "../src/learning/features.ts";
import { INTENT_FIELDS, PARITY_CALIBRATION, PARITY_LIMITS, SEED_RANGES, evaluationMirrorSeeds, evaluationSeed, intentFieldDeltas, intentSequencesEqual, validateSeedRanges } from "../src/learning/evaluation.ts";
import { archerMind, duelistMind } from "../src/policies.ts";
import { ACTION_SHOT_TIMING, ACTION_STROKE_TIMING, ACTION_TUNING, actionShotPhase, actionStrokeReading, bareCrowdDistance } from "../src/action-primitives.ts";
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
  // The shape, not only the contents. This used to be implicit: the helper
  // checked `zoom` was finite and inside its band, so an option that dropped a
  // field or grew a host one failed here. Session 15 deleted `zoom` and took the
  // implicit check with it, which left the assertions below unable to notice a
  // missing field at all -- so the key set is now stated outright.
  assert.deepStrictEqual(Object.keys(intent).sort(),
    ["driving", "forward", "posture", "primary", "secondary", "strafe", "turn"],
    "a combat command is exactly the seven fields a fighter consumes");
  for (const key of ["forward", "strafe", "turn"]) assert.ok(Number.isFinite(intent[key]));
  assert.ok(["primary", "secondary"].includes(intent.driving));
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

test("movement_and_hand_action_compose_every_intent_field_exactly_once", () => {
  const v = view(); const movement = movementIntent("close", v); const actionOption = handActionOption("cover");
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
    const v = actionViews[action]; const option = handActionOption(action); option.enter(v);
    complete(composeTactic(v, movement, action, movementIntent(movement, v), option.decide(v, 1 / 240)));
  }
});

test("every_illegal_tactic_pair_refuses_both_requested_names", () => {
  const v = view({ primary: "bow", secondary: "shield" });
  const action = handActionOption("recover"); action.enter(v); const part = action.decide(v, 1 / 240);
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
    assert.deepEqual(Object.keys(part).sort(),
      ["driving", "forward", "posture", "primary", "secondary", "strafe", "turn"], name);
    assert.equal(part.driving, idle.driving, name);
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
    const option = handActionOption(action); option.enter(actionViews[action]);
    const part = option.decide(actionViews[action], 1 / 240);
    assert.deepEqual(Object.keys(option.movement).sort(), ["forward", "strafe", "turn"], action);
    assert.deepEqual([part.forward, part.strafe, part.turn], [0, 0, 0],
      `${action} left locomotion on the command it hands to the merge`);
  }

  // And the check that catches a contaminated partial is the hand and posture
  // one, which needs no camera sentinel to have something to say.
  const contaminated = movementIntent("close", v); contaminated.posture.crouch = 0.5;
  const cover = handActionOption("cover"); cover.enter(v);
  assert.throws(() => composeTactic(v, "close", "cover", contaminated, cover.decide(v, 1 / 240)),
    /close.*cover.*hand or posture/);
});

test("the_composed_scripted_controller_matches_the_frozen_legacy_trace", () => {
  const legacy = duelistMind(991); const composed = scriptedMetaMind("duelist", 991); const v = view();
  for (let frame = 0; frame < 720; frame += 1) {
    v.clock = frame / 240; v.measure = frame < 200 ? 1.8 : 1.1; v.opponent.ground.z = v.measure + 0.2;
    assert.deepEqual(composed.decide(v, 1 / 240), legacy.decide(v, 1 / 240));
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

test("legacy_and_scripted_meta_use_the_same_bare_crowding_boundary", () => {
  for (const measure of [bareCrowdDistance(0.6) - 0.01, bareCrowdDistance(0.6) + 0.01]) {
    const v = view({ primary: "empty", secondary: "empty" });
    v.opponent.ground.z = 0.78;
    v.opponent.shoulder.z = 0.78;
    v.measure = measure;
    const legacy = duelistMind(51).decide(v, 1 / 240);
    const meta = scriptedMetaMind("duelist", 51).decide(v, 1 / 240);
    assert.equal(Math.sign(meta.forward), Math.sign(legacy.forward), `measure ${measure}`);
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
  assert.equal(FEATURE_VERSION, 3);
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
  assert.deepEqual(mirrored, mirrorFeatures(original));
});

test("feature_v3_has_total_readers_resets_variance_and_exact_mirror_signs", () => {
  const v = view(); v.clock = 0; const writer = new FeatureWriter(); const initial = writer.write(v);
  writer.setTactic("circle-left", "cut", 0.1);
  v.clock = 0.4; v.measure -= 0.25; v.opponent.vitality -= 0.1; v.opponent.ground.x = 0.8;
  const changed = writer.write(v);
  for (const name of ["usable_reach_margin", "radial_closing_rate", "facing_error", "current_movement_circle-left",
    "current_action_cut", "persistence_age", "time_since_damage"]) {
    const index = FEATURE_COLUMNS.indexOf(name); assert.notEqual(index, -1, name); assert.ok(Number.isFinite(changed[index]), name);
  }
  assert.notDeepEqual(changed, initial); assert.deepEqual(mirrorFeatures(mirrorFeatures(changed)), changed);
  writer.reset(); const reset = writer.write(v);
  assert.equal(reset[FEATURE_COLUMNS.indexOf("current_movement_hold")], 1);
  assert.equal(reset[FEATURE_COLUMNS.indexOf("current_action_recover")], 1);
  assert.equal(reset[FEATURE_COLUMNS.indexOf("persistence_age")], 0);
  assert.equal(reset[FEATURE_COLUMNS.indexOf("time_since_damage")], 1);
  const crawler = view(); crawler.self.hands = {}; crawler.self.naturalAttacks = { bite: { reach: 0.7, ready: true, active: false } };
  crawler.opponent.collisionRadius = 0.3; crawler.measure = 0.8;
  assert.ok(writeFeatures(crawler)[FEATURE_COLUMNS.indexOf("usable_reach_margin")] > 0,
    "published natural reach plus target surface radius is usable without fabricated hands");
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
