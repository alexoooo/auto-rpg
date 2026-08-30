import assert from "node:assert/strict";
import test from "node:test";

import { ARBALEST_ASSISTED_QUALIFIER_ID, ARBALEST_HARDWARE, ARBALEST_HISTORICAL_QUALIFIER_ID,
  ARBALEST_SENSORS } from "../src/construct/arbalest.ts";
import { ARBALEST_QUALIFIER_ID, arbalestCurriculumDefinition, assertArbalestWarriorEvidence,
  qualifiesArbalestVictory } from "../scripts/arbalest-warrior-qualifier.mjs";
import { ARBALEST_WARRIOR_CURRICULUM_ACCEPTANCE, assertConstructWarriorCurriculum,
  runConstructWarriorCurriculum } from "../scripts/construct-warrior-curriculum.mjs";

const qualified = () => ({
  version: 1,
  physics: "real-havok-fixed-240hz",
  construct: { blueprintId: "arbalest-effigy", programId: "arbalest-effigy-mind", vitality: 1 },
  warrior: { vitality: 0 }, winner: "construct", verdictAtS: 73 / 240,
  steps: 73,
  locomotion: { mode: "supported" },
  mountedThreatVisibleToWarriorMind: true,
  launcherVisibleToWarriorMind: true,
  posture: { firstPostureLossS: null },
  launcherEvidence: [{ moduleId: "effigy-arbalest",
    poolSize: ARBALEST_HARDWARE.projectile.poolSize,
    projectileMassKg: ARBALEST_HARDWARE.projectile.massKg,
    projectileRadiusM: ARBALEST_HARDWARE.projectile.radiusM,
    projectileLengthM: ARBALEST_HARDWARE.projectile.lengthM,
    muzzleSpeedMps: ARBALEST_HARDWARE.projectile.muzzleSpeedMps,
    damageScale: 1.15, reloadSeconds: 0.65, maxHeatJ: ARBALEST_HARDWARE.maxHeatJ,
    coolingW: ARBALEST_HARDWARE.coolingW, heatPerShotJ: ARBALEST_HARDWARE.heatPerShotJ,
    energyPerShotJ: ARBALEST_HARDWARE.energyPerShotJ,
    magazineId: "effigy-arbalest-magazine", initialAmmunition: 12, remainingAmmunition: 11 }],
  actionTimeline: [
    { atS: 0.1, action: "fire", kind: "started", shotSerial: 0 },
    { atS: 0.2, action: "fire", kind: "completed", shotSerial: 0 },
  ],
  blockerTimeline: [0.1, 0.2, 72 / 240].map((atS) => ({ atS, upright: true,
    admissionSupported: true, warriorThreatVisible: true, warriorLauncherVisible: true })),
  locomotionSteps: Array.from({ length: 73 }, (_, index) => ({ atS: index / 240,
    construct: { state: "supported", authority: true, liveSupport: true,
      postureSupported: true, freshSupportBindings: ["left-foot"] }, warrior: null })),
  constructContacts: [{ atS: 72 / 240, effectorId: "effigy-arbalest:0", shotSerial: 0, weapon: "arrow",
    blocked: false, damage: 63, standingAtStep: true,
    targetVitalityBefore: 0.2, targetVitalityAfter: 0 }],
});

test("the_Arbalest_qualifier_reconstructs_ammunition_posture_perception_and_the_fatal_arrow", () => {
  const report = qualified();
  assert.equal(assertArbalestWarriorEvidence(report), report);
  assert.equal(qualifiesArbalestVictory(report), true);
  const definition = arbalestCurriculumDefinition();
  assert.equal(definition.saved.blueprint.id, "arbalest-effigy");
  assert.equal(definition.sensors, ARBALEST_SENSORS);
  assert.equal(definition.qualifierId, ARBALEST_QUALIFIER_ID);
  assert.equal(ARBALEST_QUALIFIER_ID, ARBALEST_ASSISTED_QUALIFIER_ID);
  assert.equal(ARBALEST_HISTORICAL_QUALIFIER_ID, "arbalest-fatal-arrow-v1");
  assert.equal(definition.qualifyActiveVictory, qualifiesArbalestVictory);

  for (const mutate of [
    (row) => { row.launcherEvidence[0].damageScale = 1.16; },
    (row) => { row.launcherEvidence[0].muzzleSpeedMps = 41; },
    (row) => { row.launcherEvidence[0].remainingAmmunition = 12; },
    (row) => { row.constructContacts[0].standingAtStep = false; },
    (row) => { row.locomotion.mode = "legacy"; },
    (row) => { row.locomotionSteps[48].construct.freshSupportBindings = []; },
    (row) => { row.locomotionSteps[72].construct.authority = false; },
    (row) => { row.blockerTimeline[2].warriorLauncherVisible = false; },
    (row) => { row.constructContacts[0].targetVitalityAfter = 0.1; },
    (row) => { row.constructContacts.push({ ...row.constructContacts[0], atS: row.verdictAtS }); },
    (row) => { row.actionTimeline.push({ atS: 0.21, action: "fire", kind: "refused" }); },
    (row) => { row.posture.firstPostureLossS = 0.25; },
    (row) => { delete row.posture.firstPostureLossS; },
    (row) => { row.posture.firstPostureLossS = Number.NaN; },
    (row) => { row.actionTimeline[1].shotSerial = 1; },
    (row) => { row.actionTimeline[0].atS = 0.21; },
    (row) => { row.blockerTimeline.splice(1, 0, { ...row.blockerTimeline[0] }); },
    (row) => { [row.blockerTimeline[0], row.blockerTimeline[1]] =
      [row.blockerTimeline[1], row.blockerTimeline[0]]; },
    (row) => { row.version = 2; },
    (row) => { row.construct.vitality = Number.POSITIVE_INFINITY; },
  ]) {
    const changed = structuredClone(report); mutate(changed);
    assert.equal(qualifiesArbalestVictory(changed), false);
  }
});

test("recycled_projectile_pool_slots_remain_distinct_through_monotonic_loose_serials", () => {
  const report = qualified();
  report.launcherEvidence[0].remainingAmmunition = 10;
  report.actionTimeline = [
    { atS: 0.1, action: "fire", kind: "started", shotSerial: 0 },
    { atS: 0.2, action: "fire", kind: "completed", shotSerial: 0 },
    { atS: 0.85, action: "fire", kind: "started", shotSerial: 1 },
    { atS: 207 / 240, action: "fire", kind: "completed", shotSerial: 1 },
  ];
  report.verdictAtS = 217 / 240;
  report.steps = 217;
  report.locomotionSteps = Array.from({ length: report.steps }, (_, index) => ({ atS: index / 240,
    construct: { state: "supported", authority: true, liveSupport: true,
      postureSupported: true, freshSupportBindings: ["left-foot"] }, warrior: null }));
  report.blockerTimeline = [0.1, 0.2, 0.75, 0.85, 207 / 240, 0.9].map((atS) => ({ atS,
    upright: true, admissionSupported: true, warriorThreatVisible: true,
    warriorLauncherVisible: true }));
  report.constructContacts = [
    { atS: 0.75, effectorId: "effigy-arbalest:0", shotSerial: 0, weapon: "arrow",
      blocked: false, damage: 5, standingAtStep: true,
      targetVitalityBefore: 0.3, targetVitalityAfter: 0.2 },
    { atS: 0.9, effectorId: "effigy-arbalest:0", shotSerial: 1, weapon: "arrow",
      blocked: false, damage: 63, standingAtStep: true,
      targetVitalityBefore: 0.2, targetVitalityAfter: 0 },
  ];
  assert.equal(assertArbalestWarriorEvidence(report), report,
    "one recycled pool slot may represent two chronological physical shots");

  const recycledIdentity = structuredClone(report);
  recycledIdentity.constructContacts[1].shotSerial = 0;
  assert.equal(qualifiesArbalestVictory(recycledIdentity), false,
    "the pool suffix cannot substitute for a globally unique loose serial");

  const earlyReload = structuredClone(report);
  earlyReload.actionTimeline[2].atS = 203 / 240;
  earlyReload.blockerTimeline.find(({ atS }) => atS === 0.85).atS = 203 / 240;
  assert.throws(() => assertArbalestWarriorEvidence(earlyReload), /declared launcher reload/,
    "a second successful shot cannot begin before the 0.65 s hardware ledger clears");
});

test("the_x010_real_Havok_corpus_freezes_the_earned_mirrored_Arbalest_floor", async () => {
  const report = await runConstructWarriorCurriculum({ definition: arbalestCurriculumDefinition() });
  assert.equal(assertConstructWarriorCurriculum(report, ARBALEST_WARRIOR_CURRICULUM_ACCEPTANCE), report);
  assert.equal(report.summary.idleWarriorKills, 7);
  assert.equal(report.summary.activeConstructKills, 8);
  assert.equal(report.summary.activeQualifiedConstructKills, 8);
  assert.equal(report.summary.activeQualifiedConstructKillsLeft, 4);
  assert.equal(report.summary.activeQualifiedConstructKillsRight, 4);
  const overCap = structuredClone(report);
  const cell = overCap.cells.find(({ mode }) => mode === "active");
  cell.simulatedSeconds = overCap.seconds + 1;
  cell.bout.simulatedSeconds = overCap.seconds + 1;
  cell.bout.steps = (overCap.seconds + 1) * 240;
  assert.throws(() => assertConstructWarriorCurriculum(overCap,
    ARBALEST_WARRIOR_CURRICULUM_ACCEPTANCE), /no-tail simulation cap/);
});
