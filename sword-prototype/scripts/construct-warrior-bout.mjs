import { pathToFileURL } from "node:url";

import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { PhysicsEventType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";

import { CONFIG } from "../src/config.ts";
import { Combat } from "../src/combat.ts";
import { Construct, constructProfileForBlueprint } from "../src/construct/construct.ts";
import { moduleAtContact } from "../src/construct/damage-target.ts";
import { twinbladeSavedConstruct, TWINBLADE_SENSORS } from "../src/construct/twinblade.ts";
import { constructSupportsSupportedLocomotion } from "../src/construct/assisted-locomotion.ts";
import { flatSupportedWorldRegistry } from "../src/supported-locomotion-production.ts";
import { LAYER } from "../src/physics.ts";
import { stepPair } from "../src/fighter.ts";
import { SUPPORTED_LOCOMOTION_PORT_V1, unitDefinition } from "../src/units.ts";
import { createConstructHeadlessArena } from "./construct-headless-arena.mjs";

const FIXED = 1 / CONFIG.world.physicsHz;

export function constructWarriorWinner(constructVitality, warriorVitality) {
  if (!Number.isFinite(constructVitality) || !Number.isFinite(warriorVitality)) {
    throw new Error("construct-Warrior verdict requires finite vitality");
  }
  const constructDefeated = constructVitality <= 0;
  const warriorDefeated = warriorVitality <= 0;
  return constructDefeated === warriorDefeated ? "draw" : constructDefeated ? "warrior" : "construct";
}

export function constructStandingThresholds(profile = constructProfileForBlueprint(twinbladeSavedConstruct().blueprint)) {
  if (![profile.vitalHeight, profile.crownHeight].every(Number.isFinite) ||
    profile.vitalHeight <= 0 || profile.crownHeight <= profile.vitalHeight) {
    throw new Error("construct standing thresholds require a finite crown above a positive vital height");
  }
  return Object.freeze({ minimumRootUp: 0.72,
    minimumTorsoHeightM: profile.vitalHeight * 0.9,
    minimumHeadAboveTorsoM: (profile.crownHeight - profile.vitalHeight) * 0.5 });
}

export function isConstructStanding(sample, thresholds = constructStandingThresholds()) {
  return sample.rootUp > thresholds.minimumRootUp &&
    sample.torsoHeightM > thresholds.minimumTorsoHeightM &&
    sample.headAboveTorsoM > thresholds.minimumHeadAboveTorsoM;
}

export const CONSTRUCT_VERDICT_TAIL_STEPS = CONFIG.world.physicsHz * 3;
export const CONSTRUCT_ACTION_EVIDENCE = Object.freeze({ minimumStandingFraction: 0.5,
  minimumAdmissionSupportedFraction: 0.5, minimumEffectorTravelM: 0.01,
  minimumEffectorDirectedMotionM: 0.01, minimumSwordTargetSpanRad: 0.01 });

const warriorPerceivesMountedThreat = (opponent) => Object.keys(opponent.hands ?? {}).length > 0 ||
  Object.keys(opponent.naturalAttacks ?? {}).length > 0 ||
  (opponent.effectors ?? []).some(({ weapon, lost }) =>
    (weapon === "sword" || weapon === "bow") && !lost);
const warriorPerceivesLauncher = (opponent) =>
  (opponent.effectors ?? []).some(({ weapon, lost }) => weapon === "bow" && !lost);

/** A verdict may finish its already-authored Action, but it may not start a new bout after the cap. */
export function shouldAdvanceConstructWarriorStep({ step, maxSteps, verdictAtStep = null,
  activeAction = null, maxTailSteps = CONSTRUCT_VERDICT_TAIL_STEPS }) {
  if (![step, maxSteps, maxTailSteps].every(Number.isInteger) || step < 0 || maxSteps <= 0 || maxTailSteps < 0) {
    throw new Error("construct-Warrior step bounds must be non-negative integers with a positive main cap");
  }
  if (verdictAtStep === null) return step < maxSteps;
  if (!Number.isInteger(verdictAtStep) || verdictAtStep < 0 || verdictAtStep > step) {
    throw new Error("construct-Warrior verdict step must be an elapsed step");
  }
  return activeAction === "dual-cut" && step - verdictAtStep < maxTailSteps;
}

/** Stop report-producing observers synchronously at the first fatal contact callback. */
export function stopCombatOnFatalTransition(before, after, firstCombat, secondCombat) {
  if (![before, after].every(Number.isFinite) || before < 0 || after < 0) {
    throw new Error("fatal combat transition requires finite non-negative vitality");
  }
  if (!(before > 0 && after <= 0)) return false;
  firstCombat.stop();
  secondCombat.stop();
  return true;
}

/** The defeated side no longer authors motors; the winner may finish its already-live Action. */
export function stopDefeatedConstructWarriorControl(construct, warrior) {
  const stopped = [];
  if (construct.vitality <= 0) { construct.stopFighting(); stopped.push("construct"); }
  if (warrior.vitality <= 0) { warrior.stopFighting(); stopped.push("warrior"); }
  return Object.freeze(stopped);
}

/** Capture compound-leaf identity while the report point and module transform are contemporaneous. */
export function captureConstructCombatEvent(sourceConstruct, event, context = {}) {
  const striker = sourceConstruct.strikers.find((candidate) => candidate.effectorId === event.effectorId);
  const sourceModuleId = striker
    ? moduleAtContact(sourceConstruct.runtime, striker.body, event.report.point)?.id ?? null : null;
  const shotSerial = Number.isInteger(striker?.shotSerial) ? striker.shotSerial : null;
  return Object.freeze({ ...event, sourceModuleId, shotSerial,
    action: context.action ?? null, phase: context.phase ?? null, attempt: context.attempt ?? null,
    targetVitalityBefore: context.targetVitalityBefore ?? null,
    targetVitalityAfter: context.targetVitalityAfter ?? null });
}

const sharedMaterials = (scene) => {
  const material = new StandardMaterial("construct-warrior.shared-material", scene);
  return Object.freeze({
    material,
    fighter: Object.freeze({ flesh: material, cloth: material, steel: material, leather: material,
      brass: material, hide: material, wood: material, arrowAccent: material }),
  });
};

/**
 * A real solver bout across the construct/humanoid control-surface boundary.
 *
 * This deliberately does not route through `measure.mjs`: that harness passes a humanoid Mind
 * object and never selects a Construct program, so a construct silently falls back to hold. The
 * explicit saved definition and `construct-program` selection here make the public scheduler the
 * only path from authored rules to Havok motors.
 */
export async function runConstructWarriorBout({
  saved = twinbladeSavedConstruct(),
  sensors = TWINBLADE_SENSORS,
  constructProfile = null,
  warriorPolicy = "duelist",
  warriorSeed = 0x51a7,
  constructSide = "left",
  separationM = CONFIG.fighter.separation,
  maxSteps = CONFIG.world.physicsHz * 20,
  warriorLoadout = Object.freeze({ primary: "sword", secondary: "buckler" }),
  stabilityShoves = Object.freeze([]),
  fixturePlacement = null,
} = {}) {
  if (!Number.isInteger(maxSteps) || maxSteps <= 0) throw new Error("construct-Warrior maxSteps must be positive integer");
  if (constructSide !== "left" && constructSide !== "right") {
    throw new Error('construct-Warrior constructSide must be "left" or "right"');
  }
  if (!Array.isArray(stabilityShoves) || stabilityShoves.some(({ atStep, horizontalShoveNs }) =>
    !Number.isInteger(atStep) || atStep < 0 || !Array.isArray(horizontalShoveNs) ||
    horizontalShoveNs.length !== 2 || horizontalShoveNs.some((value) => !Number.isFinite(value)))) {
    throw new Error("construct-Warrior stability shoves require a non-negative step and two finite N s components");
  }
  const fixtureShoves = Object.freeze(stabilityShoves.map(({ atStep, horizontalShoveNs }) =>
    Object.freeze({ atStep, horizontalShoveNs: Object.freeze([...horizontalShoveNs]) })));
  if (fixturePlacement !== null) {
    const points = [fixturePlacement.construct, fixturePlacement.warrior];
    if (points.some((point) => !point || ![point.x, point.z, point.facing].every(Number.isFinite))) {
      throw new Error("construct-Warrior fixture placement requires finite construct and Warrior x/z/facing");
    }
    if (fixturePlacement.wall && (!['x', 'z'].includes(fixturePlacement.wall.axis) ||
        !Number.isFinite(fixturePlacement.wall.coordinate))) {
      throw new Error("construct-Warrior fixture wall requires axis x/z and a finite coordinate");
    }
  }
  const arena = await createConstructHeadlessArena();
  const materials = sharedMaterials(arena.scene);
  const resolvedConstructProfile = constructProfile ?? constructProfileForBlueprint(saved.blueprint);
  const definition = Object.freeze({ blueprint: saved.blueprint, control: saved.control,
    program: saved.program, sensors, profile: resolvedConstructProfile });
  const warriorDefinition = unitDefinition("warrior");
  const locomotionMode = constructSupportsSupportedLocomotion(saved.blueprint, saved.control) &&
    warriorDefinition.supportedLocomotionPort === SUPPORTED_LOCOMOTION_PORT_V1 ? "supported" : "legacy";
  const locomotionWorld = locomotionMode === "supported" ? flatSupportedWorldRegistry() : undefined;
  const constructOrigin = fixturePlacement
    ? new Vector3(fixturePlacement.construct.x, 0, fixturePlacement.construct.z)
    : constructSide === "left" ? Vector3.Zero() : new Vector3(0, 0, separationM);
  const warriorOrigin = fixturePlacement
    ? new Vector3(fixturePlacement.warrior.x, 0, fixturePlacement.warrior.z)
    : constructSide === "left" ? new Vector3(0, 0, separationM) : Vector3.Zero();
  const constructFacing = fixturePlacement?.construct.facing ?? (constructSide === "left" ? 0 : Math.PI);
  const construct = new Construct({ scene: arena.scene, side: constructSide, origin: constructOrigin,
    facing: constructFacing,
    materials: materials.fighter, policyName: "construct-program", locomotionMode, locomotionWorld }, definition);
  let warrior;
  let constructCombat;
  let warriorCombat;
  const heldWallObservers = [];
  const constructReports = [];
  const warriorReports = [];
  let constructContactContext = Object.freeze({ action: null, phase: null, attempt: null });
  try {
    const warriorSide = constructSide === "left" ? "right" : "left";
    warrior = warriorDefinition.build({ scene: arena.scene, side: warriorSide,
      origin: warriorOrigin,
      facing: fixturePlacement?.warrior.facing ?? (warriorSide === "left" ? 0 : Math.PI),
      materials: materials.fighter,
      policyName: warriorPolicy, policySeed: warriorSeed,
      loadout: warriorLoadout, locomotionMode, locomotionWorld });
    let lastWarriorVitality = warrior.vitality;
    constructCombat = new Combat(constructSide, construct.strikers, (event) => {
      const targetVitalityAfter = warrior.vitality;
      constructReports.push(captureConstructCombatEvent(construct, event, {
        ...constructContactContext, targetVitalityBefore: lastWarriorVitality, targetVitalityAfter,
      }));
      if (constructCombat && warriorCombat) {
        stopCombatOnFatalTransition(lastWarriorVitality, targetVitalityAfter, constructCombat, warriorCombat);
      }
      lastWarriorVitality = targetVitalityAfter;
    });
    let lastConstructVitality = construct.vitality;
    warriorCombat = new Combat(warriorSide, warrior.strikers, (event) => {
      const targetVitalityAfter = construct.vitality;
      warriorReports.push(event);
      if (constructCombat && warriorCombat) {
        stopCombatOnFatalTransition(lastConstructVitality, targetVitalityAfter, constructCombat, warriorCombat);
      }
      lastConstructVitality = targetVitalityAfter;
    });
    constructCombat.attach(warrior);
    warriorCombat.attach(construct);
    const initialConstructRoot = construct.centre().clone();
    const initialWarriorRoot = warrior.centre().clone();
    const initialRangeM = Vector3.Distance(initialConstructRoot, initialWarriorRoot);

    const startedActions = new Set();
    const completedActions = new Set();
    const actionTimeline = [];
    const blockerTimeline = [];
    const controllerTimeline = [];
    const locomotionTimeline = [];
    const locomotionSteps = [];
    let lastLocomotionKey = "";
    let lastControllerPhase = "";
    let observedLauncherLooses = 0;
    let pendingFireStart = null;
    let dualCutAttempt = 0;
    const dualMotorJoints = new Map();
    const dualMotorTargets = new Map();
    const dualEffectorTravel = new Map();
    const dualAttemptPosture = new Map();
    const selectedRules = new Set();
    const constructReportStanding = new Map();
    const lifecycle = { started: 0, completed: 0, cancelled: 0, refused: 0, failed: 0 };
    let minimumRangeM = Number.POSITIVE_INFINITY;
    let minimumRootUp = 1;
    let minimumTorsoHeightM = Number.POSITIVE_INFINITY;
    let minimumHeadAboveTorsoM = Number.POSITIVE_INFINITY;
    let currentStandingS = 0;
    let longestStandingS = 0;
    let firstPostureLossS = null;
    let firstSweepCompletedS = null;
    let firstConstructDamageS = null;
    let firstUprightConstructDamageS = null;
    let constructReportCursor = 0;
    let steps = 0;
    let verdictAtStep = null;
    let verdictVitality = null;
    let activeAfterStep = null;
    let maximumPartSpeedMps = 0;
    let maximumConstructJointFrameErrorM = 0;
    let minimumHeldWallClearanceM = Number.POSITIVE_INFINITY;
    const minimumHeldWallClearanceByKindM = new Map();
    let maximumHeldWallPenetrationM = 0;
    const maximumHeldWallPenetrationByKindM = new Map();
    const heldKinds = new Set();
    const solverMeasurementStartStep = Math.ceil(CONFIG.world.physicsHz * 0.6);
    const wall = fixturePlacement?.wall ?? null;
    const held = [...construct.strikers, ...warrior.strikers]
      .filter(({ kind }) => kind === "sword" || kind === "shield" || kind === "buckler");
    const heldWorldContactsByKind = new Map();
    for (const { kind } of held) heldKinds.add(kind);
    for (const striker of held) {
      const observable = striker.body.getCollisionObservable();
      const observer = observable.add((event) => {
        if (steps < solverMeasurementStartStep || event.type === PhysicsEventType.COLLISION_FINISHED) return;
        const membership = event.collidedAgainst?.shape?.filterMembershipMask ?? 0;
        if ((membership & LAYER.WORLD) === 0) return;
        heldWorldContactsByKind.set(striker.kind, (heldWorldContactsByKind.get(striker.kind) ?? 0) + 1);
      });
      if (observer) heldWallObservers.push({ observable, observer });
    }
    const fixtureEnvelopeIntersectsWall = wall !== null && (() => {
      const candidate = fixturePlacement.warrior;
      const centreDistance = Math.abs(wall.coordinate - candidate[wall.axis]);
      return centreDistance <= warriorDefinition.reach + warriorDefinition.collisionRadius;
    })();
    const standingThresholds = constructStandingThresholds(resolvedConstructProfile);
    for (; shouldAdvanceConstructWarriorStep({ step: steps, maxSteps, verdictAtStep,
      activeAction: activeAfterStep }); steps += 1) {
      const clock = constructCombat.now;
      for (const { atStep, horizontalShoveNs } of fixtureShoves) {
        if (atStep === steps) construct.queueStabilityEvent({ horizontalShoveNs });
      }
      const left = constructSide === "left" ? construct : warrior;
      const right = constructSide === "left" ? warrior : construct;
      stepPair(left, right, FIXED, clock);
      const snapshot = construct.control.snapshot();
      const constructLocomotion = construct.locomotion?.diagnostic() ?? null;
      const warriorLocomotion = warrior.locomotion?.diagnostic() ?? null;
      const compactLocomotion = (diagnostic) => diagnostic === null ? null : Object.freeze({
        state: diagnostic.state.state, authority: diagnostic.authority,
        liveSupport: diagnostic.liveSupport, postureSupported: diagnostic.postureSupported,
        freshSupportBindings: diagnostic.freshSupportBindings,
        requested: diagnostic.requested, allowed: diagnostic.allowed,
      });
      locomotionSteps.push(Object.freeze({ atS: steps * FIXED,
        construct: compactLocomotion(constructLocomotion), warrior: compactLocomotion(warriorLocomotion) }));
      const locomotionKey = JSON.stringify([constructLocomotion?.state.state,
        constructLocomotion?.authority, constructLocomotion?.liveSupport,
        constructLocomotion?.postureSupported, warriorLocomotion?.state.state,
        warriorLocomotion?.authority, warriorLocomotion?.liveSupport,
        warriorLocomotion?.postureSupported]);
      if (locomotionKey !== lastLocomotionKey) {
        const fighter = warrior.articulated;
        const pelvisRotation = fighter?.pelvis.mesh.rotationQuaternion ?? Quaternion.Identity();
        const pelvisUp = Vector3.Dot(Vector3.Up().rotateByQuaternionToRef(
          pelvisRotation, new Vector3()), Vector3.Up());
        locomotionTimeline.push(Object.freeze({ atS: steps * FIXED,
          construct: constructLocomotion, warrior: warriorLocomotion,
          warriorPhysical: fighter ? Object.freeze({ pelvisUp,
            torsoHeightAbovePelvisM: fighter.torso.mesh.position.y - fighter.pelvis.mesh.position.y,
            headHeightAboveTorsoM: fighter.head.mesh.position.y - fighter.torso.mesh.position.y }) : null }));
        lastLocomotionKey = locomotionKey;
      }
      if (snapshot.events.some(({ kind, action }) => kind === "started" && action === "dual-cut")) {
        dualCutAttempt += 1;
      }
      const commandedAttack = snapshot.active.find(({ action }) => action === "dual-cut" || action === "sweep");
      constructContactContext = Object.freeze({ action: commandedAttack?.action ?? null,
        phase: commandedAttack?.phase ?? null,
        attempt: commandedAttack?.action === "dual-cut" ? dualCutAttempt : null });
      if (commandedAttack?.action === "dual-cut") {
        const joints = dualMotorJoints.get(dualCutAttempt) ?? new Set();
        const targets = dualMotorTargets.get(dualCutAttempt) ?? new Map();
        for (const target of snapshot.motorTargets) {
          const joint = target.joint.split(":")[0];
          joints.add(joint);
          const prior = targets.get(joint);
          targets.set(joint, { writes: (prior?.writes ?? 0) + 1,
            minimumAngleRad: Math.min(prior?.minimumAngleRad ?? Number.POSITIVE_INFINITY,
              target.angleRad),
            maximumAngleRad: Math.max(prior?.maximumAngleRad ?? Number.NEGATIVE_INFINITY,
              target.angleRad) });
        }
        dualMotorJoints.set(dualCutAttempt, joints);
        dualMotorTargets.set(dualCutAttempt, targets);
      }
      arena.scene._renderId += 1;
      arena.scene._advancePhysicsEngineStep(1000 * FIXED);
      if (steps >= solverMeasurementStartStep) {
        for (const part of construct.runtime.parts.values()) {
          maximumPartSpeedMps = Math.max(maximumPartSpeedMps, part.body.getLinearVelocity().length());
        }
        for (const limb of warrior.limbs) if (!limb.severed) {
          maximumPartSpeedMps = Math.max(maximumPartSpeedMps, limb.part.body.getLinearVelocity().length());
        }
        for (const striker of held) {
          maximumPartSpeedMps = Math.max(maximumPartSpeedMps, striker.body.getLinearVelocity().length());
          if (wall) {
            const coordinate = striker.tipPosition()[wall.axis];
            const signed = Math.sign(wall.coordinate) * (wall.coordinate - coordinate);
            const clearance = signed;
            const penetration = Math.max(0, -signed);
            minimumHeldWallClearanceM = Math.min(minimumHeldWallClearanceM, clearance);
            minimumHeldWallClearanceByKindM.set(striker.kind,
              Math.min(minimumHeldWallClearanceByKindM.get(striker.kind) ?? Number.POSITIVE_INFINITY, clearance));
            maximumHeldWallPenetrationM = Math.max(maximumHeldWallPenetrationM, penetration);
            maximumHeldWallPenetrationByKindM.set(striker.kind,
              Math.max(maximumHeldWallPenetrationByKindM.get(striker.kind) ?? 0, penetration));
          }
        }
        for (const joint of construct.runtime.joints.values()) {
          const frames = joint.liveFrames();
          maximumConstructJointFrameErrorM = Math.max(maximumConstructJointFrameErrorM,
            Vector3.Distance(frames.parent.position, frames.child.position));
        }
      }
      constructCombat.advance(FIXED);
      warriorCombat.advance(FIXED);
      minimumRangeM = Math.min(minimumRangeM, Vector3.Distance(construct.centre(), warrior.centre()));

      const torso = construct.runtime.part(construct.runtime.blueprint.rootPart).node;
      const head = construct.runtime.parts.get("head")?.node;
      const rootUp = Vector3.Dot(Vector3.Up().rotateByQuaternionToRef(
        torso.rotationQuaternion ?? Quaternion.Identity(), new Vector3()), Vector3.Up());
      const headAboveTorsoM = head ? head.position.y - torso.position.y : Number.POSITIVE_INFINITY;
      minimumRootUp = Math.min(minimumRootUp, rootUp);
      minimumTorsoHeightM = Math.min(minimumTorsoHeightM, torso.position.y);
      minimumHeadAboveTorsoM = Math.min(minimumHeadAboveTorsoM, headAboveTorsoM);
      const standing = isConstructStanding({ rootUp, torsoHeightM: torso.position.y, headAboveTorsoM },
        standingThresholds);
      currentStandingS = standing ? currentStandingS + FIXED : 0;
      longestStandingS = Math.max(longestStandingS, currentStandingS);
      if (!standing && firstPostureLossS === null) firstPostureLossS = steps * FIXED;

      if (commandedAttack?.action === "dual-cut") {
        const attemptPosture = dualAttemptPosture.get(dualCutAttempt) ?? {
          steps: 0, standingSteps: 0, admissionSupportedSteps: 0, minimumRootUp: Number.POSITIVE_INFINITY,
          minimumTorsoHeightM: Number.POSITIVE_INFINITY, minimumHeadAboveTorsoM: Number.POSITIVE_INFINITY,
        };
        attemptPosture.steps += 1;
        if (standing) attemptPosture.standingSteps += 1;
        if (snapshot.facts["contact-left-foot"] === true || snapshot.facts["contact-right-foot"] === true) {
          attemptPosture.admissionSupportedSteps += 1;
        }
        attemptPosture.minimumRootUp = Math.min(attemptPosture.minimumRootUp, rootUp);
        attemptPosture.minimumTorsoHeightM = Math.min(attemptPosture.minimumTorsoHeightM, torso.position.y);
        attemptPosture.minimumHeadAboveTorsoM = Math.min(attemptPosture.minimumHeadAboveTorsoM, headAboveTorsoM);
        dualAttemptPosture.set(dualCutAttempt, attemptPosture);
        let attemptTravel = dualEffectorTravel.get(dualCutAttempt);
        if (!attemptTravel) {
          attemptTravel = new Map();
          dualEffectorTravel.set(dualCutAttempt, attemptTravel);
        }
        for (const striker of construct.strikers.filter(({ kind }) => kind === "sword")) {
          const tip = striker.tipPosition();
          const prior = attemptTravel.get(striker.effectorId);
          const target = warrior.centre();
          const targetDistanceM = Vector3.Distance(tip, target);
          const closer = targetDistanceM < (prior?.minimumTargetDistanceM ?? Number.POSITIVE_INFINITY);
          attemptTravel.set(striker.effectorId, {
            start: prior?.start ?? tip.clone(), last: tip.clone(),
            startTargetDistanceM: prior?.startTargetDistanceM ?? targetDistanceM,
            travelM: (prior?.travelM ?? 0) + (prior ? Vector3.Distance(prior.last, tip) : 0),
            minimumTargetDistanceM: Math.min(prior?.minimumTargetDistanceM ?? Number.POSITIVE_INFINITY,
              targetDistanceM),
            closestTip: closer ? tip.clone() : prior.closestTip,
            closestTarget: closer ? target.clone() : prior.closestTarget,
          });
        }
      }

      const activeAttack = snapshot.active.find(({ action }) => action === "dual-cut" || action === "sweep");
      activeAfterStep = activeAttack?.action ?? null;
      const fact = snapshot.facts;
      const warriorThreatVisible = warriorPerceivesMountedThreat(warrior.view.opponent);
      const warriorLauncherVisible = warriorPerceivesLauncher(warrior.view.opponent);
      blockerTimeline.push(Object.freeze({ atS: steps * FIXED,
        present: fact["opponent-blocker-present"],
        local: Object.freeze({ x: fact["opponent-blocker-local-x"],
          y: fact["opponent-blocker-local-y"], z: fact["opponent-blocker-local-z"] }),
        weaponLocalX: fact["opponent-weapon-local-x"],
        targetLocalX: fact["opponent-local-x"], rangeM: fact["opponent-range"],
        upright: fact["core-upright"], lineOfSight: fact["line-of-sight"],
        admissionSupported: fact["contact-left-foot"] === true || fact["contact-right-foot"] === true,
        warriorThreatVisible, warriorLauncherVisible,
        action: activeAttack?.action ?? null, phase: activeAttack?.phase ?? null,
        attempt: activeAttack?.action === "dual-cut" ? dualCutAttempt : null,
        selectedRules: Object.freeze([...(snapshot.decision?.selectedRules ?? [])]) }));
      const controllerPhase = activeAttack ? `${activeAttack.action}/${activeAttack.phase}` : "none";
      if (controllerPhase !== lastControllerPhase) {
        controllerTimeline.push(Object.freeze({ atS: steps * FIXED,
          action: activeAttack?.action ?? null, phase: activeAttack?.phase ?? null,
          attempt: activeAttack?.action === "dual-cut" ? dualCutAttempt : null }));
        lastControllerPhase = controllerPhase;
      }
      for (const id of snapshot.decision?.selectedRules ?? []) selectedRules.add(id);
      for (const event of snapshot.events) {
        if (event.kind in lifecycle) lifecycle[event.kind] += 1;
        if (event.kind in lifecycle) {
          const row = { atS: steps * FIXED,
            rangeM: Vector3.Distance(construct.centre(), warrior.centre()), rootUp,
            torsoHeightM: torso.position.y, kind: event.kind, action: event.action,
            reason: event.reason ?? null, attempt: event.action === "dual-cut" ? dualCutAttempt : null,
            shotSerial: null };
          if (event.action === "fire" && event.kind === "started") pendingFireStart = row;
          if (event.action === "fire" && event.kind === "completed") {
            const looseCount = construct.launcherLooseCount();
            if (looseCount === observedLauncherLooses + 1) {
              row.shotSerial = looseCount - 1;
              if (pendingFireStart) pendingFireStart.shotSerial = row.shotSerial;
              observedLauncherLooses = looseCount;
            }
            pendingFireStart = null;
          } else if (event.action === "fire" &&
              (event.kind === "cancelled" || event.kind === "failed" || event.kind === "refused")) {
            pendingFireStart = null;
          }
          actionTimeline.push(row);
        }
        if (event.kind === "started") startedActions.add(event.action);
        if (event.kind === "completed") {
          completedActions.add(event.action);
          if (event.action === "sweep" && firstSweepCompletedS === null) firstSweepCompletedS = steps * FIXED;
        }
      }
      const newConstructReports = constructReports.slice(constructReportCursor);
      constructReportCursor = constructReports.length;
      for (const event of newConstructReports) constructReportStanding.set(event, standing);
      if (newConstructReports.some(({ report }) => report.damage > 0)) {
        if (firstConstructDamageS === null) firstConstructDamageS = steps * FIXED;
        if (standing && firstUprightConstructDamageS === null) firstUprightConstructDamageS = steps * FIXED;
      }
      if (verdictAtStep === null && (construct.vitality <= 0 || warrior.vitality <= 0)) {
        verdictAtStep = steps + 1;
        verdictVitality = Object.freeze({ construct: construct.vitality, warrior: warrior.vitality });
        // Collision observers remain installed for teardown, but the recovery tail cannot
        // change the already-decided winner or manufacture post-verdict evidence.
        constructCombat.stop();
        warriorCombat.stop();
        stopDefeatedConstructWarriorControl(construct, warrior);
      }
    }

    // This is evidence, not a compatibility shim. Until Construct publishes mounted strikers in
    // BodyView, a Warrior can collide with and be hurt by the sword while its Mind sees no hand or
    // natural-attack threat. The report carries that limitation instead of laundering the bout as
    // a fair tactical comparison.
    const perceived = warrior.view.opponent;
    const perceivedEffectors = Object.freeze((perceived.effectors ?? []).map((effector) => Object.freeze({
      weapon: effector.weapon,
      anchor: Object.freeze({ x: effector.anchor.x, y: effector.anchor.y, z: effector.anchor.z }),
      tip: Object.freeze({ x: effector.tip.x, y: effector.tip.y, z: effector.tip.z }),
      tipVelocity: Object.freeze({ x: effector.tipVelocity.x, y: effector.tipVelocity.y, z: effector.tipVelocity.z }),
      reach: effector.reach,
      lost: effector.lost,
    })));
    const mountedThreatVisible = blockerTimeline.some(({ warriorThreatVisible }) =>
      warriorThreatVisible === true);
    const launcherVisible = blockerTimeline.some(({ warriorLauncherVisible }) =>
      warriorLauncherVisible === true);
    const finalVitality = verdictVitality ?? Object.freeze({ construct: construct.vitality, warrior: warrior.vitality });
    const winner = constructWarriorWinner(finalVitality.construct, finalVitality.warrior);
    const attachedWarriorParts = warrior.limbs.filter(({ severed }) => !severed)
      .map(({ key, part }) => Object.freeze({ key, x: part.mesh.position.x,
        y: part.mesh.position.y, z: part.mesh.position.z }));
    const warriorPelvisPosition = warrior.articulated?.pelvis.mesh.position ?? warrior.centre();
    const warriorPhysical = Object.freeze({
      pelvis: Object.freeze({ x: warriorPelvisPosition.x, y: warriorPelvisPosition.y,
        z: warriorPelvisPosition.z }),
      minimumAttachedY: Math.min(...attachedWarriorParts.map(({ y }) => y)),
      maximumAttachedY: Math.max(...attachedWarriorParts.map(({ y }) => y)),
      maximumAttachedDistanceFromPelvisM: Math.max(...attachedWarriorParts.map(({ x, y, z }) =>
        Math.hypot(x - warriorPelvisPosition.x, y - warriorPelvisPosition.y,
          z - warriorPelvisPosition.z))),
      attachedParts: Object.freeze(attachedWarriorParts),
    });
    const constructRoot = construct.runtime.part(construct.runtime.blueprint.rootPart).node;
    const constructRootRotation = constructRoot.rotationQuaternion ?? Quaternion.Identity();
    const constructPhysical = Object.freeze({
      root: Object.freeze({ x: constructRoot.position.x, y: constructRoot.position.y,
        z: constructRoot.position.z }),
      rootUp: Vector3.Dot(Vector3.Up().rotateByQuaternionToRef(constructRootRotation,
        new Vector3()), Vector3.Up()),
      minimumAttachedY: Math.min(...[...construct.runtime.parts.values()]
        .map(({ node }) => node.position.y)),
      maximumAttachedDistanceFromRootM: Math.max(...[...construct.runtime.parts.values()]
        .map(({ node }) => Vector3.Distance(node.position, constructRoot.position))),
    });
    const contactRows = (events) => Object.freeze(events.map((event) => {
      const { report, effectorId, blocked,
      sourceModuleId = null, action = null, phase = null, attempt = null, shotSerial = null,
        targetVitalityBefore = null, targetVitalityAfter = null } = event;
      return Object.freeze({
      atS: report.at, effectorId, blocked, weapon: report.weapon, limb: report.key, kind: report.kind,
      speedMps: report.speed, edgeAlignment: report.edgeAlignment, damage: report.damage,
      sourceModuleId, action, phase, attempt, shotSerial,
      targetVitalityBefore, targetVitalityAfter,
      standingAtStep: constructReportStanding.get(event) ?? null,
      point: Object.freeze({ x: report.point.x, y: report.point.y, z: report.point.z }),
      });
    }));
    const swordDamageScales = Object.freeze(construct.strikers.filter(({ kind }) => kind === "sword")
      .map(({ effectorId, damageScale = 1 }) => Object.freeze({ effectorId, damageScale }))
      .sort((left, right) => left.effectorId.localeCompare(right.effectorId)));
    const resources = construct.state.hardware().resources;
    const magazine = saved.blueprint.modules.find(({ kind }) => kind === "magazine");
    const launcherEvidence = Object.freeze(saved.blueprint.modules.filter(({ kind }) => kind === "launcher")
      .map((module) => Object.freeze({ moduleId: module.id,
        poolSize: module.projectile?.poolSize ?? null,
        projectileMassKg: module.projectile?.massKg ?? null,
        projectileRadiusM: module.projectile?.radiusM ?? null,
        projectileLengthM: module.projectile?.lengthM ?? null,
        muzzleSpeedMps: module.projectile?.muzzleSpeedMps ?? null,
        damageScale: module.projectile?.damageScale ?? null,
        reloadSeconds: module.reloadSeconds ?? null,
        maxHeatJ: module.maxHeatJ ?? null,
        coolingW: module.coolingW ?? null,
        heatPerShotJ: module.heatPerShotJ ?? null,
        energyPerShotJ: module.energyPerShotJ ?? null,
        magazineId: magazine?.id ?? null,
        initialAmmunition: magazine?.ammunition ?? null,
        remainingAmmunition: magazine ? resources.ammunition[magazine.id] ?? null : null })));
    return Object.freeze({
      version: 1,
      physics: "real-havok-fixed-240hz",
      construct: Object.freeze({ blueprintId: saved.blueprint.id, programId: saved.program.id,
        side: constructSide, vitality: finalVitality.construct,
        damage: constructReports.reduce((sum, event) => sum + event.report.damage, 0) }),
      warrior: Object.freeze({ policy: warriorPolicy, seed: warriorSeed, vitality: finalVitality.warrior,
        damage: warriorReports.reduce((sum, event) => sum + event.report.damage, 0) }),
      steps,
      simulatedSeconds: steps * FIXED,
      verdictAtS: verdictAtStep === null ? null : verdictAtStep * FIXED,
      postVerdictTailS: verdictAtStep === null ? 0 : (steps - verdictAtStep) * FIXED,
      winner,
      warriorPhysical,
      constructPhysical,
      stabilityShoves: fixtureShoves,
      fixturePlacement: fixturePlacement === null ? null : Object.freeze({
        construct: Object.freeze({ ...fixturePlacement.construct }),
        warrior: Object.freeze({ ...fixturePlacement.warrior }),
        wall: fixturePlacement.wall ? Object.freeze({ ...fixturePlacement.wall }) : null,
      }),
      solver: Object.freeze({ measurementStartS: solverMeasurementStartStep * FIXED,
        fixtureEnvelopeIntersectsWall, maximumPartSpeedMps, maximumConstructJointFrameErrorM,
        minimumHeldWallClearanceM: Number.isFinite(minimumHeldWallClearanceM)
          ? minimumHeldWallClearanceM : null,
        minimumHeldWallClearanceByKindM: Object.freeze(Object.fromEntries(
          [...minimumHeldWallClearanceByKindM].sort(([left], [right]) => left.localeCompare(right)))),
        maximumHeldWallPenetrationM,
        maximumHeldWallPenetrationByKindM: Object.freeze(Object.fromEntries(
          [...maximumHeldWallPenetrationByKindM].sort(([left], [right]) => left.localeCompare(right)))),
        heldWorldContactsByKind: Object.freeze(Object.fromEntries(
          [...heldWorldContactsByKind].sort(([left], [right]) => left.localeCompare(right)))),
        heldKinds: Object.freeze([...heldKinds].sort()) }),
      swordDamageScales,
      launcherEvidence,
      locomotion: Object.freeze({ mode: locomotionMode, initialRangeM,
        finalRangeM: Vector3.Distance(construct.centre(), warrior.centre()),
        constructRootDisplacementM: Vector3.Distance(initialConstructRoot, construct.centre()),
        warriorRootDisplacementM: Vector3.Distance(initialWarriorRoot, warrior.centre()),
        constructSupportState: construct.locomotion?.state ?? null,
        warriorSupportState: warrior.locomotion?.state ?? null,
        constructDiagnostic: construct.locomotion?.diagnostic() ?? null,
        warriorDiagnostic: warrior.locomotion?.diagnostic() ?? null }),
      locomotionTimeline: Object.freeze(locomotionTimeline),
      locomotionSteps: Object.freeze(locomotionSteps),
      minimumRangeM,
      startedActions: Object.freeze([...startedActions].sort()),
      completedActions: Object.freeze([...completedActions].sort()),
      actionTimeline: Object.freeze(actionTimeline.map((row) => Object.freeze(row))),
      blockerTimeline: Object.freeze(blockerTimeline),
      controllerTimeline: Object.freeze(controllerTimeline),
      dualMotorJoints: Object.freeze([...dualMotorJoints].map(([attempt, joints]) => Object.freeze({
        attempt, joints: Object.freeze([...joints].sort()),
        targets: Object.freeze([...(dualMotorTargets.get(attempt) ?? new Map())]
          .map(([joint, row]) => Object.freeze({ joint, writes: row.writes,
            minimumAngleRad: row.minimumAngleRad, maximumAngleRad: row.maximumAngleRad }))
          .sort((left, right) => left.joint.localeCompare(right.joint))),
      }))),
      dualEffectorTravel: Object.freeze([...dualEffectorTravel].map(([attempt, effectors]) => Object.freeze({
        attempt, effectors: Object.freeze([...effectors].map(([effectorId, row]) => Object.freeze({
          effectorId, travelM: row.travelM, minimumTargetDistanceM: row.minimumTargetDistanceM,
          startTargetDistanceM: row.startTargetDistanceM,
          startToClosestApproachM: row.startTargetDistanceM - row.minimumTargetDistanceM,
          displacementM: Vector3.Distance(row.start, row.last),
          closestDelta: Object.freeze({ x: row.closestTip.x - row.closestTarget.x,
            y: row.closestTip.y - row.closestTarget.y, z: row.closestTip.z - row.closestTarget.z }),
        }))),
      }))),
      dualAttemptPosture: Object.freeze([...dualAttemptPosture].map(([attempt, row]) => Object.freeze({
        attempt, activeS: row.steps * FIXED, standingFraction: row.standingSteps / row.steps,
        admissionSupportedFraction: row.admissionSupportedSteps / row.steps, minimumRootUp: row.minimumRootUp,
        minimumTorsoHeightM: row.minimumTorsoHeightM,
        minimumHeadAboveTorsoM: row.minimumHeadAboveTorsoM,
      }))),
      selectedRules: Object.freeze([...selectedRules].sort()),
      lifecycle: Object.freeze(lifecycle),
      posture: Object.freeze({ minimumRootUp, minimumTorsoHeightM, minimumHeadAboveTorsoM,
        longestStandingS, firstPostureLossS, thresholds: standingThresholds }),
      firstSweepCompletedS,
      firstConstructDamageS,
      firstUprightConstructDamageS,
      damagingEffectors: Object.freeze([...new Set(constructReports
        .filter(({ report }) => report.damage > 0).map(({ effectorId }) => effectorId))].sort()),
      constructContacts: contactRows(constructReports),
      warriorContacts: contactRows(warriorReports),
      mountedThreatVisibleToWarriorMind: mountedThreatVisible,
      launcherVisibleToWarriorMind: launcherVisible,
      perceivedEffectors,
    });
  } finally {
    for (const { observable, observer } of heldWallObservers) observable.remove(observer);
    warriorCombat?.dispose();
    constructCombat?.dispose();
    warrior?.dispose();
    construct.dispose();
    materials.material.dispose(false, false);
    arena.dispose();
  }
}

export function assertConstructWarriorEvidence(report) {
  const failures = [];
  const timeline = Array.isArray(report.actionTimeline) ? report.actionTimeline : [];
  const blockerTimeline = Array.isArray(report.blockerTimeline) ? report.blockerTimeline : [];
  const contacts = Array.isArray(report.constructContacts) ? report.constructContacts : [];
  const finite = (...values) => values.every(Number.isFinite);
  const sameTime = (left, right) => finite(left, right) && Math.abs(left - right) <= 1e-9;
  const sameStrings = (actual, expected) => Array.isArray(actual) &&
    JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort());
  if (report.physics !== "real-havok-fixed-240hz") failures.push("physics was not real fixed-step Havok");
  const requiredStandingS = Math.min(19, report.simulatedSeconds * 0.95);
  if (!(report.simulatedSeconds > 0)) failures.push("bout did not advance physical time");
  if (report.posture.longestStandingS < requiredStandingS) {
    failures.push(`standing lasted only ${report.posture.longestStandingS} s of ${report.simulatedSeconds} s`);
  }
  const expectedScales = [{ effectorId: "effigy-sword", damageScale: 1.15 },
    { effectorId: "left-effigy-sword", damageScale: 1.15 }];
  if (JSON.stringify(report.swordDamageScales) !== JSON.stringify(expectedScales)) {
    failures.push("runtime Twinblade swords were not the exact ordinary 1.15 damage-scale pair");
  }
  const detailedStarted = [...new Set(timeline.filter(({ kind }) => kind === "started")
    .map(({ action }) => action))].sort();
  const detailedCompleted = [...new Set(timeline.filter(({ kind }) => kind === "completed")
    .map(({ action }) => action))].sort();
  const detailedDamaging = [...new Set(contacts.filter(({ damage }) => Number.isFinite(damage) && damage > 0)
    .map(({ effectorId }) => effectorId))].sort();
  if (!sameStrings(report.startedActions, detailedStarted)) failures.push("startedActions contradicted the timeline");
  if (!sameStrings(report.completedActions, detailedCompleted)) failures.push("completedActions contradicted the timeline");
  if (!sameStrings(report.damagingEffectors, detailedDamaging)) failures.push("damagingEffectors contradicted contacts");
  const firstDamage = contacts.filter(({ damage, atS }) => damage > 0 && finite(damage, atS))
    .reduce((first, { atS }) => Math.min(first, atS), Number.POSITIVE_INFINITY);
  const firstUprightDamage = contacts.filter(({ damage, atS, standingAtStep }) =>
    damage > 0 && standingAtStep === true && finite(damage, atS))
    .reduce((first, { atS }) => Math.min(first, atS), Number.POSITIVE_INFINITY);
  if (!sameTime(report.firstConstructDamageS, firstDamage)) failures.push("firstConstructDamageS contradicted contacts");
  if (!sameTime(report.firstUprightConstructDamageS, firstUprightDamage)) {
    failures.push("firstUprightConstructDamageS contradicted contact posture");
  }
  const detailedMountedThreatVisible = blockerTimeline.some(({ warriorThreatVisible }) =>
    warriorThreatVisible === true);
  if (report.mountedThreatVisibleToWarriorMind !== detailedMountedThreatVisible) {
    failures.push("mounted threat visibility contradicted the time-local perception timeline");
  }
  const detailedLifecycle = { started: 0, completed: 0, cancelled: 0, refused: 0, failed: 0 };
  for (const row of timeline) if (row.kind in detailedLifecycle) detailedLifecycle[row.kind] += 1;
  if (!report.lifecycle || Object.keys(detailedLifecycle).some((kind) => report.lifecycle[kind] !== detailedLifecycle[kind])) {
    failures.push("lifecycle summary contradicted the timeline");
  }
  if (timeline.some(({ action, kind }) => action === "dual-cut" &&
    (kind === "cancelled" || kind === "refused" || kind === "failed"))) {
    failures.push("dual-cut was cancelled, refused, or failed");
  }
  const startedAttempts = timeline.filter(({ kind, action, attempt, atS }) => kind === "started" &&
    action === "dual-cut" && Number.isInteger(attempt) && Number.isFinite(atS));
  const requiredMotors = ["left-sword-yaw", "left-sword-pitch", "sword-yaw", "sword-pitch",
    "left-hip", "left-knee", "left-ankle", "left-sole", "right-hip", "right-knee", "right-ankle", "right-sole"];
  const qualifiedAttempt = startedAttempts.find((started) => {
    const attempt = started.attempt;
    const completed = timeline.find((row) => row.kind === "completed" && row.action === "dual-cut" &&
      row.attempt === attempt && Number.isFinite(row.atS));
    const blocker = blockerTimeline.find((row) => row.attempt === attempt && row.action === "dual-cut" &&
      row.phase === "chamber" && row.present === true && sameTime(row.atS, started.atS));
    if (!completed || !blocker || !finite(blocker.local?.x, blocker.targetLocalX) ||
        Math.abs(blocker.local.x - blocker.targetLocalX) < 0.02) return false;
    const firstCutterModule = blocker.local.x - blocker.targetLocalX < 0
      ? "left-effigy-sword" : "effigy-sword";
    const secondCutterModule = firstCutterModule === "left-effigy-sword"
      ? "effigy-sword" : "left-effigy-sword";
    const firstCut = contacts.find((row) => row.attempt === attempt && row.action === "dual-cut" &&
      row.phase === "first-cut" && !row.blocked && row.limb === "torso" && row.kind === "cut" &&
      row.damage > 0 && row.effectorId === firstCutterModule && row.sourceModuleId === firstCutterModule &&
      row.standingAtStep === true && finite(row.atS, row.damage,
        row.targetVitalityBefore, row.targetVitalityAfter) &&
      row.targetVitalityBefore > row.targetVitalityAfter && row.targetVitalityAfter > 0 &&
      row.atS > started.atS);
    const secondCut = contacts.find((row) => row.attempt === attempt && row.action === "dual-cut" &&
      row.phase === "second-cut" && !row.blocked && row.limb === "torso" && row.kind === "cut" &&
      row.damage > 0 && row.effectorId === secondCutterModule && row.sourceModuleId === secondCutterModule &&
      row.standingAtStep === true && finite(row.atS, row.damage,
        row.targetVitalityBefore, row.targetVitalityAfter) &&
      row.targetVitalityBefore > 0 && row.targetVitalityAfter <= 0 &&
      (!firstCut || row.atS > firstCut.atS));
    const firstCutIndex = contacts.indexOf(firstCut);
    const secondCutIndex = contacts.indexOf(secondCut);
    const interveningDamage = firstCutIndex >= 0 && secondCutIndex > firstCutIndex &&
      contacts.slice(firstCutIndex + 1, secondCutIndex).some(({ damage }) =>
        Number.isFinite(damage) && damage > 0);
    if (!firstCut || !secondCut || !(completed.atS > secondCut.atS) ||
        firstCutIndex < 0 || secondCutIndex <= firstCutIndex || interveningDamage ||
        !sameTime(firstCut.targetVitalityAfter, secondCut.targetVitalityBefore) ||
        !sameTime(report.verdictAtS, secondCut.atS + FIXED) || !(report.postVerdictTailS > 0) ||
        completed.atS < report.verdictAtS) return false;
    const firstCutFrame = blockerTimeline.find((row) => row.attempt === attempt && row.action === "dual-cut" &&
      row.phase === "first-cut" && sameTime(row.atS, firstCut.atS));
    const secondCutFrame = blockerTimeline.find((row) => row.attempt === attempt && row.action === "dual-cut" &&
      row.phase === "second-cut" && sameTime(row.atS, secondCut.atS));
    if (blocker.admissionSupported !== true || blocker.upright !== true ||
        blocker.warriorThreatVisible !== true || firstCutFrame?.warriorThreatVisible !== true ||
        secondCutFrame?.warriorThreatVisible !== true ||
        firstCutFrame?.admissionSupported !== true || secondCutFrame?.admissionSupported !== true) return false;
    const motorRow = report.dualMotorJoints.find((row) => row.attempt === attempt);
    const posture = report.dualAttemptPosture.find((row) => row.attempt === attempt);
    if (!posture || !finite(posture.activeS, posture.standingFraction, posture.admissionSupportedFraction,
      posture.minimumRootUp, posture.minimumTorsoHeightM, posture.minimumHeadAboveTorsoM) ||
      posture.activeS <= 0 || posture.standingFraction < CONSTRUCT_ACTION_EVIDENCE.minimumStandingFraction ||
      posture.admissionSupportedFraction < CONSTRUCT_ACTION_EVIDENCE.minimumAdmissionSupportedFraction) return false;
    const travel = report.dualEffectorTravel.find((row) => row.attempt === attempt);
    if (!travel || travel.effectors.length !== 2) return false;
    const expectedEffectors = ["effigy-sword", "left-effigy-sword"];
    if (!sameStrings(travel.effectors.map(({ effectorId }) => effectorId), expectedEffectors) ||
      travel.effectors.some((row) => !finite(row.travelM, row.minimumTargetDistanceM,
        row.startTargetDistanceM, row.startToClosestApproachM, row.displacementM,
        row.closestDelta?.x, row.closestDelta?.y, row.closestDelta?.z) ||
        row.travelM < CONSTRUCT_ACTION_EVIDENCE.minimumEffectorTravelM ||
        Math.max(row.displacementM, row.startToClosestApproachM) <
          CONSTRUCT_ACTION_EVIDENCE.minimumEffectorDirectedMotionM)) return false;
    const swordTargets = Array.isArray(motorRow?.targets) ? motorRow.targets.filter(({ joint }) =>
      ["left-sword-yaw", "left-sword-pitch", "sword-yaw", "sword-pitch"].includes(joint)) : [];
    return requiredMotors.every((joint) => motorRow?.joints.includes(joint)) &&
      swordTargets.length === 4 && swordTargets.every((row) => finite(row.writes,
        row.minimumAngleRad, row.maximumAngleRad) && row.writes >= 2 &&
        row.maximumAngleRad - row.minimumAngleRad >= CONSTRUCT_ACTION_EVIDENCE.minimumSwordTargetSpanRad);
  });
  if (!qualifiedAttempt) {
    failures.push("no one started-frame-qualified dual-cut landed two ordered opposite torso cuts, killed, and completed");
  }
  const detailedWinner = finite(report.construct?.vitality, report.warrior?.vitality)
    ? constructWarriorWinner(report.construct.vitality, report.warrior.vitality) : null;
  if (report.winner !== detailedWinner) failures.push("winner contradicted final vitality");
  if (report.winner !== "construct" || report.warrior?.vitality > 0) {
    failures.push(`construct did not defeat the Warrior (winner ${report.winner}, vitality ${report.warrior.vitality})`);
  }
  if (contacts.some(({ atS }) => Number.isFinite(atS) && Number.isFinite(report.verdictAtS) &&
    atS >= report.verdictAtS)) failures.push("post-verdict construct combat report was recorded");
  if (timeline.some(({ kind, atS }) => kind === "started" && Number.isFinite(atS) &&
    Number.isFinite(report.verdictAtS) && atS >= report.verdictAtS)) {
    failures.push("a new Action started during the post-verdict completion tail");
  }
  if (!report.mountedThreatVisibleToWarriorMind) failures.push("the Warrior Mind could not perceive the mounted sword");
  if (failures.length) throw new Error(`construct-Warrior evidence failed: ${failures.join("; ")}`);
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await runConstructWarriorBout();
  assertConstructWarriorEvidence(report);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
