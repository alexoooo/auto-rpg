import { CONFIG } from "../src/config.ts";
import { ARBALEST_ASSISTED_QUALIFIER_ID, ARBALEST_HARDWARE, ARBALEST_SENSORS,
  arbalestSavedConstruct } from
  "../src/construct/arbalest.ts";

const FIXED = 1 / CONFIG.world.physicsHz;
export const ARBALEST_QUALIFIER_ID = ARBALEST_ASSISTED_QUALIFIER_ID;
const finite = (...values) => values.every(Number.isFinite);
const sameTime = (left, right) => finite(left, right) && Math.abs(left - right) <= 1e-9;

/** Fail closed: a scoreboard win is not evidence that the authored ranged Action earned it. */
export function assertArbalestWarriorEvidence(report) {
  const failures = [];
  const timeline = Array.isArray(report?.actionTimeline) ? report.actionTimeline : [];
  const frames = Array.isArray(report?.blockerTimeline) ? report.blockerTimeline : [];
  const contacts = Array.isArray(report?.constructContacts) ? report.constructContacts : [];
  const launcher = Array.isArray(report?.launcherEvidence) ? report.launcherEvidence : [];
  const locomotion = Array.isArray(report?.locomotionSteps) ? report.locomotionSteps : [];
  const fireTimeline = timeline.filter(({ action }) => action === "fire");
  const completedFire = fireTimeline.filter(({ kind }) => kind === "completed");
  const arrowContacts = contacts.filter(({ weapon, effectorId }) =>
    weapon === "arrow" && typeof effectorId === "string" && effectorId.startsWith("effigy-arbalest:"));
  const damaging = arrowContacts.filter(({ blocked, damage }) => blocked === false && damage > 0);
  const frameAt = (atS) => frames.find((frame) => sameTime(frame.atS, atS));
  const locomotionAt = (atS) => locomotion.find((frame) => sameTime(frame.atS, atS));
  const supportedThreat = (frame) => frame?.upright === true && frame.admissionSupported === true &&
    frame.warriorLauncherVisible === true;
  const liveImpactThreat = (frame) => frame?.upright === true && frame.warriorLauncherVisible === true;
  const assistedSupport = (frame) => (frame?.construct?.state === "supported" ||
    frame?.construct?.state === "staggered") &&
    frame.construct.authority === true && frame.construct.liveSupport === true &&
    frame.construct.postureSupported === true &&
    Array.isArray(frame.construct.freshSupportBindings) && frame.construct.freshSupportBindings.length > 0;
  // Fire admission/completion pin exact fresh feet. A physical arrow lands a few boundaries later;
  // the support machine intentionally bridges brief contact gaps with liveSupport, so requiring a
  // new current-foot sample at impact would judge an in-flight projectile by unknowable future gait.
  const assistedImpactSupport = (frame) => (frame?.construct?.state === "supported" ||
    frame?.construct?.state === "staggered") && frame.construct.authority === true &&
    frame.construct.liveSupport === true && frame.construct.postureSupported === true;

  const warriorPhysical = report?.warriorPhysical;
  const constructPhysical = report?.constructPhysical;
  if (!finite(warriorPhysical?.pelvis?.x, warriorPhysical?.pelvis?.y, warriorPhysical?.pelvis?.z,
      warriorPhysical?.minimumAttachedY, warriorPhysical?.maximumAttachedY,
      warriorPhysical?.maximumAttachedDistanceFromPelvisM) ||
      warriorPhysical.minimumAttachedY < -0.05 ||
      warriorPhysical.maximumAttachedDistanceFromPelvisM > 1.25) {
    failures.push("the Warrior body was absent, below the arena, or physically disassembled");
  }
  if (!finite(constructPhysical?.root?.x, constructPhysical?.root?.y, constructPhysical?.root?.z,
      constructPhysical?.rootUp, constructPhysical?.minimumAttachedY,
      constructPhysical?.maximumAttachedDistanceFromRootM) ||
      constructPhysical.rootUp < 0.90 || constructPhysical.minimumAttachedY < -0.05 ||
      constructPhysical.maximumAttachedDistanceFromRootM > 1.65) {
    failures.push("the Arbalest body was absent, below the arena, tilted, or physically disassembled");
  }

  if (report?.version !== 1) failures.push("bout evidence schema was not version 1");
  if (report?.physics !== "real-havok-fixed-240hz") failures.push("physics was not real fixed-step Havok");
  if (report?.locomotion?.mode !== "supported" || locomotion.length !== report?.steps ||
      locomotion.some(({ atS }, index) => !finite(atS) || index > 0 && !(locomotion[index - 1].atS < atS))) {
    failures.push("assisted locomotion rows did not cover the supported bout chronologically");
  }
  if (report?.construct?.blueprintId !== "arbalest-effigy" ||
      report?.construct?.programId !== "arbalest-effigy-mind") {
    failures.push("the winning body was not the authored Arbalest Effigy");
  }
  if (frames.some(({ atS }) => !finite(atS)) || frames.some((frame, index) =>
    index > 0 && !(frames[index - 1].atS < frame.atS))) {
    failures.push("perception frames were not finite, strictly chronological, and unique");
  }
  if (launcher.length !== 1 || launcher[0].moduleId !== "effigy-arbalest" ||
      launcher[0].poolSize !== ARBALEST_HARDWARE.projectile.poolSize ||
      launcher[0].projectileMassKg !== ARBALEST_HARDWARE.projectile.massKg ||
      launcher[0].projectileRadiusM !== ARBALEST_HARDWARE.projectile.radiusM ||
      launcher[0].projectileLengthM !== ARBALEST_HARDWARE.projectile.lengthM ||
      launcher[0].muzzleSpeedMps !== ARBALEST_HARDWARE.projectile.muzzleSpeedMps ||
      launcher[0].damageScale !== ARBALEST_HARDWARE.projectile.damageScale ||
      launcher[0].reloadSeconds !== ARBALEST_HARDWARE.reloadSeconds ||
      launcher[0].maxHeatJ !== ARBALEST_HARDWARE.maxHeatJ ||
      launcher[0].coolingW !== ARBALEST_HARDWARE.coolingW ||
      launcher[0].heatPerShotJ !== ARBALEST_HARDWARE.heatPerShotJ ||
      launcher[0].energyPerShotJ !== ARBALEST_HARDWARE.energyPerShotJ ||
      launcher[0].magazineId !== "effigy-arbalest-magazine" ||
      launcher[0].initialAmmunition !== ARBALEST_HARDWARE.ammunition ||
      !Number.isInteger(launcher[0].remainingAmmunition) || launcher[0].remainingAmmunition < 0 ||
      launcher[0].remainingAmmunition > launcher[0].initialAmmunition) {
    failures.push("runtime launcher facts were not the declared 1.90 heavy bolt and torso magazine");
  }
  const spent = launcher.length === 1
    ? launcher[0].initialAmmunition - launcher[0].remainingAmmunition : Number.NaN;
  if (!Number.isInteger(spent) || spent <= 0 || spent !== completedFire.length || arrowContacts.length > spent) {
    failures.push("declared ammunition spend contradicted fire completion or physical arrow contacts");
  }
  const contactSerials = arrowContacts.map(({ shotSerial }) => shotSerial);
  if (contactSerials.some((shotSerial) => !Number.isInteger(shotSerial) || shotSerial < 0) ||
      new Set(contactSerials).size !== contactSerials.length) {
    failures.push("one loose serial produced duplicate or invalid physical contact evidence");
  }
  if (arrowContacts.some(({ atS, damage }) => !finite(atS, damage)) ||
      arrowContacts.some((row, index) => index > 0 && !(arrowContacts[index - 1].atS < row.atS)) ||
      damaging.some(({ atS, damage, targetVitalityBefore, targetVitalityAfter }) =>
        !finite(atS, damage, targetVitalityBefore, targetVitalityAfter) || !(damage > 0) ||
        !(targetVitalityBefore > targetVitalityAfter))) {
    failures.push("arrow contacts were not finite, chronological, unique, and physically damaging when claimed");
  }
  const pairs = [];
  let started = null;
  if (fireTimeline.some(({ atS }) => !finite(atS)) || fireTimeline.some((row, index) =>
    index > 0 && row.atS < fireTimeline[index - 1].atS)) {
    failures.push("fire lifecycle rows were not globally finite and chronological");
  }
  for (const row of fireTimeline) {
    if (row.kind === "started") {
      if (started !== null) failures.push("a fire Action started before its prior lifecycle completed");
      started = row;
    } else if (row.kind === "completed") {
      if (started === null || !finite(started.atS, row.atS) || started.atS > row.atS ||
          !Number.isInteger(started.shotSerial) || started.shotSerial < 0 ||
          started.shotSerial !== row.shotSerial) {
        failures.push("a fire Action did not have a finite ordered started-to-completed lifecycle");
      } else pairs.push(Object.freeze({ shotSerial: row.shotSerial, started, completed: row }));
      started = null;
    } else if (row.kind === "cancelled" || row.kind === "failed" || row.kind === "refused") {
      failures.push(`a fire Action was ${row.kind}`);
    }
  }
  if (started !== null || pairs.length !== completedFire.length ||
      pairs.some(({ shotSerial, started: start, completed }, index) => shotSerial !== index ||
        !supportedThreat(frameAt(start.atS)) || !assistedSupport(locomotionAt(start.atS)) ||
        !supportedThreat(frameAt(completed.atS)) || !assistedSupport(locomotionAt(completed.atS)) ||
        completed.atS >= report?.verdictAtS)) {
    failures.push("fire lifecycles lacked exact-time upright support, mounted threat, or pre-verdict completion");
  }
  if (launcher.length !== 1 || pairs.some((pair, index) => index > 0 &&
      pair.started.atS + 1e-9 < pairs[index - 1].completed.atS + launcher[0].reloadSeconds)) {
    failures.push("a successful fire lifecycle began before the declared launcher reload completed");
  }
  const pairBySerial = new Map(pairs.map((pair) => [pair.shotSerial, pair]));
  if (arrowContacts.some(({ shotSerial, atS }) => {
    const pair = pairBySerial.get(shotSerial);
    return !pair || !finite(atS) || !(pair.completed.atS < atS || sameTime(pair.completed.atS, atS));
  })) {
    failures.push("a physical arrow contact did not follow its ordered completed fire lifecycle");
  }
  if (damaging.length === 0 || damaging.some(({ standingAtStep, atS }) =>
      standingAtStep !== true || !liveImpactThreat(frameAt(atS)) || !assistedImpactSupport(locomotionAt(atS)))) {
    failures.push("a damaging arrow lacked time-local live assisted support or mounted-threat perception");
  }
  const fatal = damaging.findLast(({ targetVitalityBefore, targetVitalityAfter }) =>
    finite(targetVitalityBefore, targetVitalityAfter) && targetVitalityBefore > 0 && targetVitalityAfter <= 0);
  if (!fatal || !sameTime(report?.verdictAtS, fatal.atS + FIXED)) {
    failures.push("no physical damaging arrow owned the fatal vitality transition");
  }
  const postureLoss = report?.posture?.firstPostureLossS;
  if (!(postureLoss === null || fatal && finite(postureLoss) && postureLoss > fatal.atS)) {
    failures.push("posture loss was missing, non-finite, or not strictly after the fatal arrow");
  }
  if (report?.winner !== "construct" || report?.warrior?.vitality !== 0 ||
      !finite(report?.construct?.vitality) || !(report.construct.vitality > 0)) {
    failures.push("the Arbalest did not survive a fatal Warrior transition");
  }
  if (contacts.some(({ atS }) => finite(atS, report?.verdictAtS) && atS >= report.verdictAtS) ||
      timeline.some(({ kind, atS }) => kind === "started" &&
        finite(atS, report?.verdictAtS) && atS >= report.verdictAtS)) {
    failures.push("post-verdict contacts or Actions laundered the victory");
  }
  if (report?.mountedThreatVisibleToWarriorMind !==
      frames.some(({ warriorThreatVisible }) => warriorThreatVisible === true)) {
    failures.push("mounted threat summary contradicted its time-local perception frames");
  }
  if (report?.launcherVisibleToWarriorMind !==
      frames.some(({ warriorLauncherVisible }) => warriorLauncherVisible === true)) {
    failures.push("launcher threat summary contradicted its time-local perception frames");
  }
  if (failures.length) throw new Error(`Arbalest-Warrior evidence failed: ${failures.join("; ")}`);
  return report;
}

export const qualifiesArbalestVictory = (report) => {
  try { assertArbalestWarriorEvidence(report); return true; }
  catch { return false; }
};

/** The curriculum hook carries its own fail-closed evidence predicate with the saved body. */
export const arbalestCurriculumDefinition = () => Object.freeze({
  saved: arbalestSavedConstruct(), sensors: ARBALEST_SENSORS,
  qualifierId: ARBALEST_QUALIFIER_ID,
  qualifyActiveVictory: qualifiesArbalestVictory,
});
