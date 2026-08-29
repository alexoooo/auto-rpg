import { pathToFileURL } from "node:url";

import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";

import { CONFIG } from "../src/config.ts";
import { Combat } from "../src/combat.ts";
import { Construct } from "../src/construct/construct.ts";
import { humanoidSavedConstruct, HUMANOID_SENSORS } from "../src/construct/humanoid.ts";
import { stepPair } from "../src/fighter.ts";
import { unitDefinition } from "../src/units.ts";
import { createConstructHeadlessArena } from "./construct-headless-arena.mjs";

const FIXED = 1 / CONFIG.world.physicsHz;

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
  saved = humanoidSavedConstruct(),
  sensors = HUMANOID_SENSORS,
  warriorPolicy = "duelist",
  warriorSeed = 0x51a7,
  constructSide = "left",
  separationM = CONFIG.fighter.separation,
  maxSteps = CONFIG.world.physicsHz * 20,
} = {}) {
  if (!Number.isInteger(maxSteps) || maxSteps <= 0) throw new Error("construct-Warrior maxSteps must be positive integer");
  if (constructSide !== "left" && constructSide !== "right") {
    throw new Error('construct-Warrior constructSide must be "left" or "right"');
  }
  const arena = await createConstructHeadlessArena();
  const materials = sharedMaterials(arena.scene);
  const definition = Object.freeze({ blueprint: saved.blueprint, control: saved.control,
    program: saved.program, sensors });
  const constructOrigin = constructSide === "left" ? Vector3.Zero() : new Vector3(0, 0, separationM);
  const warriorOrigin = constructSide === "left" ? new Vector3(0, 0, separationM) : Vector3.Zero();
  const construct = new Construct({ scene: arena.scene, side: constructSide, origin: constructOrigin,
    facing: constructSide === "left" ? 0 : Math.PI,
    materials: materials.fighter, policyName: "construct-program" }, definition);
  let warrior;
  let constructCombat;
  let warriorCombat;
  const constructReports = [];
  const warriorReports = [];
  try {
    const warriorSide = constructSide === "left" ? "right" : "left";
    warrior = unitDefinition("warrior").build({ scene: arena.scene, side: warriorSide,
      origin: warriorOrigin, facing: warriorSide === "left" ? 0 : Math.PI, materials: materials.fighter,
      policyName: warriorPolicy, policySeed: warriorSeed,
      loadout: { primary: "sword", secondary: "buckler" } });
    constructCombat = new Combat(constructSide, construct.strikers, (event) => constructReports.push(event));
    warriorCombat = new Combat(warriorSide, warrior.strikers, (event) => warriorReports.push(event));
    constructCombat.attach(warrior);
    warriorCombat.attach(construct);

    const startedActions = new Set();
    const completedActions = new Set();
    const actionTimeline = [];
    const selectedRules = new Set();
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
    for (; steps < maxSteps && construct.alive && warrior.alive; steps += 1) {
      const clock = constructCombat.now;
      const left = constructSide === "left" ? construct : warrior;
      const right = constructSide === "left" ? warrior : construct;
      stepPair(left, right, FIXED, clock);
      arena.scene._renderId += 1;
      arena.scene._advancePhysicsEngineStep(1000 * FIXED);
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
      const standing = rootUp > 0.72 && torso.position.y > 1.2 && headAboveTorsoM > 0.4;
      currentStandingS = standing ? currentStandingS + FIXED : 0;
      longestStandingS = Math.max(longestStandingS, currentStandingS);
      if (!standing && firstPostureLossS === null) firstPostureLossS = steps * FIXED;

      const snapshot = construct.control.snapshot();
      for (const id of snapshot.decision?.selectedRules ?? []) selectedRules.add(id);
      for (const event of snapshot.events) {
        if (event.kind in lifecycle) lifecycle[event.kind] += 1;
        if (event.kind in lifecycle) actionTimeline.push(Object.freeze({ atS: steps * FIXED,
          rangeM: Vector3.Distance(construct.centre(), warrior.centre()), rootUp,
          torsoHeightM: torso.position.y, kind: event.kind, action: event.action,
          reason: event.reason ?? null }));
        if (event.kind === "started") startedActions.add(event.action);
        if (event.kind === "completed") {
          completedActions.add(event.action);
          if (event.action === "sweep" && firstSweepCompletedS === null) firstSweepCompletedS = steps * FIXED;
        }
      }
      const newConstructReports = constructReports.slice(constructReportCursor);
      constructReportCursor = constructReports.length;
      if (newConstructReports.some(({ report }) => report.damage > 0)) {
        if (firstConstructDamageS === null) firstConstructDamageS = steps * FIXED;
        if (standing && firstUprightConstructDamageS === null) firstUprightConstructDamageS = steps * FIXED;
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
    const mountedThreatVisible = Object.keys(perceived.hands).length > 0 ||
      Object.keys(perceived.naturalAttacks).length > 0 ||
      (perceived.effectors ?? []).some(({ weapon, lost }) => weapon === "sword" && !lost);
    const winner = construct.alive === warrior.alive ? "draw" : construct.alive ? "construct" : "warrior";
    return Object.freeze({
      version: 1,
      physics: "real-havok-fixed-240hz",
      construct: Object.freeze({ blueprintId: saved.blueprint.id, programId: saved.program.id,
        side: constructSide, vitality: construct.vitality,
        damage: constructReports.reduce((sum, event) => sum + event.report.damage, 0) }),
      warrior: Object.freeze({ policy: warriorPolicy, seed: warriorSeed, vitality: warrior.vitality,
        damage: warriorReports.reduce((sum, event) => sum + event.report.damage, 0) }),
      steps,
      simulatedSeconds: steps * FIXED,
      winner,
      minimumRangeM,
      startedActions: Object.freeze([...startedActions].sort()),
      completedActions: Object.freeze([...completedActions].sort()),
      actionTimeline: Object.freeze(actionTimeline),
      selectedRules: Object.freeze([...selectedRules].sort()),
      lifecycle: Object.freeze(lifecycle),
      posture: Object.freeze({ minimumRootUp, minimumTorsoHeightM, minimumHeadAboveTorsoM,
        longestStandingS, firstPostureLossS }),
      firstSweepCompletedS,
      firstConstructDamageS,
      firstUprightConstructDamageS,
      damagingEffectors: Object.freeze([...new Set(constructReports
        .filter(({ report }) => report.damage > 0).map(({ effectorId }) => effectorId))].sort()),
      mountedThreatVisibleToWarriorMind: mountedThreatVisible,
      perceivedEffectors,
    });
  } finally {
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
  if (report.physics !== "real-havok-fixed-240hz") failures.push("physics was not real fixed-step Havok");
  if (report.simulatedSeconds < 20) failures.push(`bout ended at ${report.simulatedSeconds} s before the 20 s evidence cap`);
  if (report.posture.longestStandingS < 19) failures.push(`standing lasted only ${report.posture.longestStandingS} s`);
  if (!report.completedActions.includes("sweep")) failures.push("no mounted sweep completed");
  if (!Number.isFinite(report.firstUprightConstructDamageS)) failures.push("no upright construct damage was recorded");
  if (!report.damagingEffectors.includes("effigy-sword")) failures.push("damage was not attributed to effigy-sword");
  if (!report.mountedThreatVisibleToWarriorMind) failures.push("the Warrior Mind could not perceive the mounted sword");
  if (report.lifecycle.refused !== 0 || report.lifecycle.failed !== 0) {
    failures.push(`${report.lifecycle.refused} refused and ${report.lifecycle.failed} failed Actions`);
  }
  if (failures.length) throw new Error(`construct-Warrior evidence failed: ${failures.join("; ")}`);
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await runConstructWarriorBout();
  assertConstructWarriorEvidence(report);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
