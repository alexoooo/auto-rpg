import assert from "node:assert/strict";
import test from "node:test";

import { advanceQualificationActionLifecycle, assertConstructWarriorEvidence, qualificationActionContext,
  shouldAdvanceConstructWarriorStep, stopCombatOnFatalTransition, stopDefeatedConstructWarriorControl } from
  "../scripts/construct-warrior-bout.mjs";

const FIXED = 1 / 240;

const lifecycle = (events, prior) => advanceQualificationActionLifecycle(events, prior && {
  activeInstances: prior.activeInstances,
  nextInstance: prior.nextInstance,
  pendingFireInstance: prior.pendingFireInstance,
});

test("qualification_Action_generations_survive_same_group_replacement_and_refusal_order", () => {
  const first = lifecycle([{ kind: "started", action: "sweep", group: "weapon" }]);
  const oldSweep = [...first.activeInstances.values()][0];
  const replaced = lifecycle([
    { kind: "started", action: "cut", group: "weapon" },
    { kind: "cancelled", action: "sweep", group: "weapon" },
  ], first);
  assert.deepEqual(replaced.transitions.map(({ kind, event, instance }) =>
    [kind, event.action, instance?.actionInstanceId ?? null]), [
    ["started", "cut", "cut:weapon:1"],
    ["terminal", "sweep", oldSweep.actionInstanceId],
  ]);
  assert.deepEqual([...replaced.activeInstances.values()].map(({ action }) => action), ["cut"]);

  const refused = lifecycle([
    { kind: "refused", action: "cut", group: "weapon" },
    { kind: "cancelled", action: "cut", group: "weapon" },
  ], replaced);
  assert.equal(refused.transitions[0].instance, null,
    "a refused request must not consume the already-running generation");
  assert.equal(refused.transitions[1].instance.actionInstanceId, "cut:weapon:1");
  assert.equal(refused.activeInstances.size, 0);
});

test("a_same_step_fire_replacement_owns_its_launch_while_a_completion_keeps_the_old_generation", () => {
  const first = lifecycle([{ kind: "started", action: "fire", group: "launcher" }]);
  const oldFire = first.pendingFireInstance;
  const replaced = lifecycle([
    { kind: "cancelled", action: "fire", group: "launcher" },
    { kind: "started", action: "fire", group: "launcher" },
  ], first);
  assert.notEqual(replaced.fireInstanceForStep.actionInstanceId, oldFire.actionInstanceId);
  assert.equal(replaced.fireInstanceForStep.actionInstanceId, "fire:launcher:1");
  assert.equal(replaced.pendingFireInstance, replaced.fireInstanceForStep);

  const completed = lifecycle([{ kind: "completed", action: "fire", group: "launcher" }], replaced);
  assert.equal(completed.fireInstanceForStep.actionInstanceId, "fire:launcher:1");
  assert.equal(completed.transitions[0].instance.actionInstanceId, "fire:launcher:1");
});

test("a_completing_Action_retains_its_instance_and_last_published_phase_through_the_solver_step", () => {
  const started = lifecycle([{ kind: "started", action: "sweep", group: "weapon" }]);
  const instance = [...started.activeInstances.values()][0];
  instance.lastPhase = "commit";
  const completed = lifecycle([{ kind: "completed", action: "sweep", group: "weapon" }], started);
  assert.equal(completed.activeInstances.size, 0, "the generation is terminal for the next scheduler step");
  const context = qualificationActionContext("sweep", [], completed.activeInstances,
    completed.transitions.filter(({ kind }) => kind === "terminal"));
  assert.equal(context.instance, instance);
  assert.equal(context.phase, "commit");
});

test("a_phase_less_terminal_Action_cannot_own_a_solver_contact", () => {
  const started = lifecycle([{ kind: "started", action: "sweep", group: "weapon" }]);
  const completed = lifecycle([{ kind: "completed", action: "sweep", group: "weapon" }], started);
  const context = qualificationActionContext("sweep", [], completed.activeInstances,
    completed.transitions.filter(({ kind }) => kind === "terminal"));
  assert.equal(context, null,
    "a generation which never published a physical phase cannot lend its residual pose to contact");
});

const joints = ["left-sword-yaw", "left-sword-pitch", "sword-yaw", "sword-pitch",
  "left-hip", "left-knee", "left-ankle", "left-sole",
  "right-hip", "right-knee", "right-ankle", "right-sole"];
const travel = (effectorId) => ({ effectorId, travelM: 0.30, minimumTargetDistanceM: 0.15,
  startTargetDistanceM: 0.40, startToClosestApproachM: 0.25,
  displacementM: 0.08, closestDelta: { x: 0.02, y: -0.01, z: 0.04 } });
const motorTarget = (joint) => ({ joint, writes: 12, minimumAngleRad: -0.20,
  maximumAngleRad: 0.20 });

const evidence = (blockerX = -0.4) => {
  const firstCutter = blockerX < 0 ? "left-effigy-sword" : "effigy-sword";
  const secondCutter = firstCutter === "left-effigy-sword" ? "effigy-sword" : "left-effigy-sword";
  return ({
  physics: "real-havok-fixed-240hz", simulatedSeconds: 3, verdictAtS: 2 + FIXED,
  postVerdictTailS: 0.5,
  construct: { vitality: 0.8 }, warrior: { vitality: 0 }, winner: "construct",
  posture: { longestStandingS: 3 },
  swordDamageScales: [
    { effectorId: "effigy-sword", damageScale: 1.15 },
    { effectorId: "left-effigy-sword", damageScale: 1.15 },
  ],
  startedActions: ["dual-cut"], completedActions: ["dual-cut"],
  actionTimeline: [
    { atS: 0.5, kind: "started", action: "dual-cut", attempt: 2 },
    { atS: 2.3, kind: "completed", action: "dual-cut", attempt: 2 },
  ],
  blockerTimeline: [
    { atS: 0.5, attempt: 2, action: "dual-cut", phase: "chamber", present: true,
      local: { x: blockerX }, targetLocalX: 0, upright: true, admissionSupported: true,
      warriorThreatVisible: true },
    { atS: 1, attempt: 2, action: "dual-cut", phase: "first-cut", present: true,
      local: { x: blockerX }, targetLocalX: 0, upright: true, admissionSupported: true,
      warriorThreatVisible: true },
    { atS: 2, attempt: 2, action: "dual-cut", phase: "second-cut", present: true,
      local: { x: blockerX }, targetLocalX: 0, upright: true, admissionSupported: true,
      warriorThreatVisible: true },
  ],
  dualMotorJoints: [{ attempt: 2, joints: [...joints], targets: joints.map(motorTarget) }],
  dualAttemptPosture: [{ attempt: 2, activeS: 2, standingFraction: 0.9,
    admissionSupportedFraction: 0.9, minimumRootUp: 0.8,
    minimumTorsoHeightM: 1, minimumHeadAboveTorsoM: 0.4 }],
  dualEffectorTravel: [{ attempt: 2,
    effectors: [travel("effigy-sword"), travel("left-effigy-sword")] }],
  constructContacts: [
    { atS: 1, attempt: 2, action: "dual-cut", phase: "first-cut", blocked: false,
      effectorId: firstCutter, limb: "torso", kind: "cut", damage: 2,
      sourceModuleId: firstCutter, standingAtStep: true,
      targetVitalityBefore: 0.2, targetVitalityAfter: 0.1 },
    { atS: 2, attempt: 2, action: "dual-cut", phase: "second-cut", blocked: false,
      effectorId: secondCutter, limb: "torso", kind: "cut", damage: 4,
      sourceModuleId: secondCutter, standingAtStep: true,
      targetVitalityBefore: 0.1, targetVitalityAfter: 0 },
  ],
  firstConstructDamageS: 1, firstUprightConstructDamageS: 1,
  damagingEffectors: ["effigy-sword", "left-effigy-sword"],
  lifecycle: { started: 1, completed: 1, cancelled: 0, refused: 0, failed: 0 },
  mountedThreatVisibleToWarriorMind: true,
  });
};

const rejects = (mutate, pattern = /construct-Warrior evidence failed/) => {
  const report = evidence();
  mutate(report);
  assert.throws(() => assertConstructWarriorEvidence(report), pattern);
};

test("one_started_supported_attempt_must_land_two_ordered_torso_cuts_then_complete", () => {
  const report = evidence();
  assert.equal(assertConstructWarriorEvidence(report), report);
  rejects((row) => row.actionTimeline.shift());
  rejects((row) => { row.blockerTimeline[0].present = false;
    row.blockerTimeline.push({ ...row.blockerTimeline[0], atS: 0.7, present: true, local: { x: 0.4 } }); });
  rejects((row) => { row.actionTimeline.pop(); row.lifecycle.completed = 0; row.completedActions = []; });
  rejects((row) => { row.actionTimeline[1].atS = 1.5; });
  rejects((row) => { row.constructContacts[0].targetVitalityAfter = 0; });
  rejects((row) => { row.constructContacts[0].blocked = true; });
  rejects((row) => { row.constructContacts[0].phase = "second-cut"; });
  rejects((row) => { row.constructContacts[1].sourceModuleId = "left-effigy-sword"; });
  rejects((row) => { row.constructContacts[1].targetVitalityBefore = 0; });
  rejects((row) => { row.constructContacts[1].targetVitalityBefore = Number.POSITIVE_INFINITY; });
  rejects((row) => { row.constructContacts[1].kind = "thrust"; });
  rejects((row) => { row.constructContacts[0].targetVitalityAfter = 0.11; },
    /construct-Warrior evidence failed/);
  rejects((row) => { row.constructContacts.splice(1, 0, {
    ...row.constructContacts[0], atS: 1.5, phase: "first-cut", damage: 0.01,
    targetVitalityBefore: 0.1, targetVitalityAfter: 0.09,
  }); }, /construct-Warrior evidence failed/);
});

test("the_mirrored_right_blocker_requires_the_right_sword_then_the_left_sword", () => {
  const report = evidence(0.4);
  assert.equal(report.constructContacts[0].effectorId, "effigy-sword");
  assert.equal(report.constructContacts[1].effectorId, "left-effigy-sword");
  assert.equal(assertConstructWarriorEvidence(report), report);
  rejects((row) => {
    row.blockerTimeline.forEach((frame) => { frame.local.x = 0.4; });
  });
});

test("runtime_scales_attempt_posture_support_travel_and_lifecycle_are_not_summary_claims", () => {
  rejects((row) => { row.swordDamageScales[0].damageScale = 1.16; }, /1.15/);
  rejects((row) => { row.swordDamageScales[1].damageScale = 1.16; }, /1.15/);
  rejects((row) => { row.dualAttemptPosture = []; });
  rejects((row) => { row.dualAttemptPosture[0].standingFraction = 0; });
  rejects((row) => { row.dualAttemptPosture[0].admissionSupportedFraction = 0; });
  rejects((row) => { row.blockerTimeline[1].admissionSupported = false; });
  rejects((row) => { row.dualEffectorTravel = []; });
  rejects((row) => { row.dualEffectorTravel[0].effectors.pop(); });
  rejects((row) => { for (const effector of row.dualEffectorTravel[0].effectors) effector.travelM = 0; });
  rejects((row) => { for (const effector of row.dualEffectorTravel[0].effectors) {
    effector.displacementM = 0; effector.startToClosestApproachM = 0;
  } });
  rejects((row) => { row.dualMotorJoints[0].joints.pop(); });
  rejects((row) => { for (const target of row.dualMotorJoints[0].targets) {
    if (target.joint.includes("sword")) target.maximumAngleRad = target.minimumAngleRad;
  } });
  rejects((row) => { row.blockerTimeline[1].warriorThreatVisible = false; });
  for (const kind of ["cancelled", "refused", "failed"]) {
    rejects((row) => { row.actionTimeline.splice(1, 0,
      { atS: 1.5, kind, action: "dual-cut", attempt: 2 }); row.lifecycle[kind] = 1; },
    /cancelled, refused, or failed/);
  }
});

test("redundant_summaries_and_post_verdict_rows_must_match_their_detailed_sources", () => {
  rejects((row) => { row.completedActions = []; }, /completedActions/);
  rejects((row) => { row.damagingEffectors = []; }, /damagingEffectors/);
  rejects((row) => { row.firstUprightConstructDamageS = 1.9; }, /firstUpright/);
  rejects((row) => { row.winner = "warrior"; }, /winner/);
  rejects((row) => { row.lifecycle.completed = 2; }, /lifecycle/);
  rejects((row) => { row.mountedThreatVisibleToWarriorMind = false; }, /time-local perception/);
  rejects((row) => { row.constructContacts.push({ ...row.constructContacts[0], atS: row.verdictAtS }); },
  /post-verdict/);
  rejects((row) => { row.actionTimeline.push({ atS: row.verdictAtS, kind: "started",
    action: "stabilize", attempt: null }); row.lifecycle.started += 1; row.startedActions.push("stabilize"); },
  /new Action/);
});

test("fatal_callback_and_tail_stop_the_right_authority_without_an_off_by_one", () => {
  const stopped = [];
  const first = { stop: () => stopped.push("first") };
  const second = { stop: () => stopped.push("second") };
  assert.equal(stopCombatOnFatalTransition(0.1, 0, first, second), true);
  assert.deepEqual(stopped, ["first", "second"]);
  assert.equal(stopCombatOnFatalTransition(0.1, 0.05, first, second), false);
  assert.deepEqual(stopped, ["first", "second"]);

  const controlStops = [];
  assert.deepEqual(stopDefeatedConstructWarriorControl(
    { vitality: 0.5, stopFighting: () => controlStops.push("construct") },
    { vitality: 0, stopFighting: () => controlStops.push("warrior") }), ["warrior"]);
  assert.deepEqual(controlStops, ["warrior"]);

  assert.equal(shouldAdvanceConstructWarriorStep({ step: 9, maxSteps: 10 }), true);
  assert.equal(shouldAdvanceConstructWarriorStep({ step: 10, maxSteps: 10 }), false);
  assert.equal(shouldAdvanceConstructWarriorStep({ step: 10, maxSteps: 10,
    verdictAtStep: 10, activeAction: null, maxTailSteps: 3 }), false);
  assert.equal(shouldAdvanceConstructWarriorStep({ step: 10, maxSteps: 10,
    verdictAtStep: 10, activeAction: "dual-cut", maxTailSteps: 3 }), true);
  assert.equal(shouldAdvanceConstructWarriorStep({ step: 12, maxSteps: 10,
    verdictAtStep: 10, activeAction: "dual-cut", maxTailSteps: 3 }), true);
  assert.equal(shouldAdvanceConstructWarriorStep({ step: 13, maxSteps: 10,
    verdictAtStep: 10, activeAction: "dual-cut", maxTailSteps: 3 }), false);
  assert.equal(shouldAdvanceConstructWarriorStep({ step: 11, maxSteps: 10,
    verdictAtStep: 10, activeAction: "stabilize", maxTailSteps: 3 }), false);
});
