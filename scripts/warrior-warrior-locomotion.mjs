import { pathToFileURL } from "node:url";

import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";

import { Combat } from "../src/combat.ts";
import { CONFIG } from "../src/config.ts";
import { stepPair } from "../src/fighter.ts";
import { idleMind } from "../src/mind.ts";
import { blankIntent } from "../src/policies.ts";
import { flatSupportedWorldRegistry } from "../src/supported-locomotion-production.ts";
import { SUPPORTED_LOCOMOTION_V1 } from "../src/supported-locomotion-state.ts";
import { unitDefinition } from "../src/units.ts";
import { createHeadlessArena } from "./golem-headless-arena.mjs";

const FIXED = 1 / CONFIG.world.physicsHz;
const EMPTY_LOADOUT = Object.freeze({ primary: "empty", secondary: "empty" });

export const WARRIOR_WARRIOR_LOCOMOTION_V1 = Object.freeze({
  version: 1,
  physicsHz: 240,
  steps: 1920,
  inwardSteps: 720,
  measurementWarmupSteps: 144,
  initialSeparationM: 2.40,
  maximumFootprintPenetrationM: 0.020,
  minimumClosureM: 1.50,
  minimumRetreatM: 0.75,
  maximumCarrierLagM: 0.120,
  maximumPartSpeedMps: 12,
  supportGraceS: 0.10,
});

const materialsFor = (scene) => {
  const owner = new StandardMaterial("warrior-warrior-locomotion.material", scene);
  return Object.freeze({ owner, fighter: Object.freeze({ flesh: owner, cloth: owner,
    steel: owner, leather: owner, brass: owner, hide: owner, wood: owner, arrowAccent: owner }) });
};

const exerciseMind = () => {
  const intent = blankIntent();
  let step = 0;
  return Object.freeze({ name: "warrior-warrior-supported-exercise", decide: () => {
    intent.forward = step < WARRIOR_WARRIOR_LOCOMOTION_V1.inwardSteps ? 1 : -1;
    step += 1;
    return intent;
  } });
};

const upDot = (node) => Vector3.Dot(
  Vector3.Up().rotateByQuaternionToRef(node.rotationQuaternion ?? Quaternion.Identity(), new Vector3()),
  Vector3.Up(),
);

const posture = (fighter) => Object.freeze({
  pelvisUp: upDot(fighter.pelvis.mesh),
  torsoHeightAbovePelvisM: fighter.torso.mesh.position.y - fighter.pelvis.mesh.position.y,
  headHeightAboveTorsoM: fighter.head.mesh.position.y - fighter.torso.mesh.position.y,
});

const postureValid = (sample) => sample.pelvisUp > 0.72 &&
  sample.torsoHeightAbovePelvisM > 0.25 && sample.headHeightAboveTorsoM > 0.25;

const separation = (left, right) => {
  const a = left.centre(); const b = right.centre();
  return Math.hypot(a.x - b.x, a.z - b.z);
};

const carrierLag = (fighter) => {
  const ground = fighter.locomotion?.carrierGround();
  const root = fighter.centre();
  return ground ? Math.hypot(root.x - ground.x, root.z - ground.z) : Number.POSITIVE_INFINITY;
};

const bodySpeed = (fighter) => Math.max(0, ...fighter.limbs.filter(({ severed }) => !severed)
  .map(({ part }) => part.body.getLinearVelocity().length()));

const maximumFreshGapS = (samples, side) => {
  let current = 0; let longest = 0;
  for (const sample of samples) {
    const diagnostic = sample[side].locomotion;
    current = diagnostic.freshSupportBindings.length > 0 ? 0 : current + 1;
    longest = Math.max(longest, current);
  }
  return longest / WARRIOR_WARRIOR_LOCOMOTION_V1.physicsHz;
};

async function runCell(activeSide, stabilityShoves = Object.freeze([])) {
  const arena = await createHeadlessArena();
  const materials = materialsFor(arena.scene);
  const definition = unitDefinition("warrior");
  const world = flatSupportedWorldRegistry();
  const active = exerciseMind();
  const at = (side) => side === "left" ? Vector3.Zero() :
    new Vector3(0, 0, WARRIOR_WARRIOR_LOCOMOTION_V1.initialSeparationM);
  const build = (side) => definition.build({ scene: arena.scene, side, origin: at(side),
    facing: side === "left" ? 0 : Math.PI, materials: materials.fighter,
    mind: side === activeSide ? active : idleMind(), loadout: EMPTY_LOADOUT,
    locomotionMode: "supported", locomotionWorld: world });
  const left = build("left"); const right = build("right");
  let leftCombat; let rightCombat;
  try {
    const combatEvents = [];
    leftCombat = new Combat("left", left.strikers, (event) => combatEvents.push({ side: "left", event }));
    rightCombat = new Combat("right", right.strikers, (event) => combatEvents.push({ side: "right", event }));
    leftCombat.attach(right); rightCombat.attach(left);
    const plugin = arena.scene.getPhysicsEngine().getPhysicsPlugin();
    for (const body of [left, right].flatMap((fighter) => fighter.limbs
      .filter(({ severed }) => !severed).map(({ part }) => part.body))) plugin.setActivationControl(body, 1);

    const samples = [];
    for (let step = 0; step < WARRIOR_WARRIOR_LOCOMOTION_V1.steps; step += 1) {
      for (const shove of stabilityShoves) {
        if (shove.atStep === step) activeSide === "left"
          ? left.queueStabilityEvent({ horizontalShoveNs: shove.horizontalShoveNs })
          : right.queueStabilityEvent({ horizontalShoveNs: shove.horizontalShoveNs });
      }
      const first = activeSide === "left" ? left : right;
      const second = activeSide === "left" ? right : left;
      stepPair(first, second, FIXED, leftCombat.now);
      arena.scene._renderId += 1;
      arena.scene._advancePhysicsEngineStep(1000 * FIXED);
      leftCombat.advance(FIXED); rightCombat.advance(FIXED);
      const locomotion = (fighter) => {
        const diagnostic = fighter.locomotion?.diagnostic();
        if (!diagnostic) throw new Error("Warrior/Warrior physical cell lost a supported port");
        return Object.freeze({ state: diagnostic.state.state, liveSupport: diagnostic.liveSupport,
          postureSupported: diagnostic.postureSupported,
          freshSupportBindings: diagnostic.freshSupportBindings,
          requested: diagnostic.requested, allowed: diagnostic.allowed,
          blockedReason: diagnostic.blockedReason, releaseReason: diagnostic.releaseReason,
          recoveryProgress: diagnostic.recoveryProgress });
      };
      samples.push(Object.freeze({ step, separationM: separation(left, right),
        left: Object.freeze({ posture: posture(left), locomotion: locomotion(left),
          carrierLagM: carrierLag(left), partSpeedMps: bodySpeed(left) }),
        right: Object.freeze({ posture: posture(right), locomotion: locomotion(right),
          carrierLagM: carrierLag(right), partSpeedMps: bodySpeed(right) }) }));
    }
    const footprintRadiusM = Math.max(CONFIG.body.torsoRadius,
      CONFIG.body.hipSide + CONFIG.body.thighRadius);
    const minimumRangeM = Math.min(...samples.map(({ separationM }) => separationM));
    const atTurn = samples[WARRIOR_WARRIOR_LOCOMOTION_V1.inwardSteps - 1].separationM;
    const finalRangeM = samples.at(-1).separationM;
    return Object.freeze({ id: `warrior-warrior-active-${activeSide}`,
      activeSide, schedulerOrder: activeSide === "left" ? "left-then-right" : "right-then-left",
      physics: "real-havok-fixed-240hz", footprintSeparationM: footprintRadiusM * 2,
      stabilityShoves: Object.freeze(stabilityShoves.map((shove) => Object.freeze({
        atStep: shove.atStep, horizontalShoveNs: Object.freeze([...shove.horizontalShoveNs]) }))),
      combatEvents: Object.freeze(combatEvents.map(({ side, event }) => Object.freeze({ side,
        damage: event.report.damage, atS: event.report.at, kind: event.report.kind }))),
      samples: Object.freeze(samples), summary: Object.freeze({
        initialRangeM: WARRIOR_WARRIOR_LOCOMOTION_V1.initialSeparationM,
        minimumRangeM, closureM: WARRIOR_WARRIOR_LOCOMOTION_V1.initialSeparationM - minimumRangeM,
        rangeAtRetreatM: atTurn, finalRangeM, retreatM: finalRangeM - atTurn,
        leftMaximumFreshGapS: maximumFreshGapS(samples, "left"),
        rightMaximumFreshGapS: maximumFreshGapS(samples, "right"),
        maximumCarrierLagM: Math.max(...samples.flatMap(({ left, right }) =>
          [left.carrierLagM, right.carrierLagM])),
        maximumPartSpeedMps: Math.max(...samples.slice(WARRIOR_WARRIOR_LOCOMOTION_V1.measurementWarmupSteps)
          .flatMap(({ left, right }) => [left.partSpeedMps, right.partSpeedMps])),
      }) });
  } finally {
    leftCombat?.dispose(); rightCombat?.dispose();
    left.dispose(); right.dispose(); materials.owner.dispose(false, false); arena.dispose();
  }
}

/** A real Fighter adapter cell: deliberate movement must become a rise request after knockdown. */
export async function runWarriorMovementRecoveryCell(activeSide = "left") {
  if (activeSide !== "left" && activeSide !== "right") {
    throw new Error(`Warrior recovery activeSide must be left or right, got ${JSON.stringify(activeSide)}`);
  }
  return runCell(activeSide, Object.freeze([
    // Just beyond the Fighter's mass-scaled fall threshold. A 12 N s fixture keeps residual
    // stability above the rising threshold for almost five seconds and tests repeated refusal,
    // not whether deliberate movement can complete an otherwise eligible recovery.
    Object.freeze({ atStep: 48, horizontalShoveNs: Object.freeze([1.8, 0]) }),
  ]));
}

export async function runWarriorWarriorLocomotionCorpus() {
  const cells = [];
  for (const activeSide of ["left", "right"]) cells.push(await runCell(activeSide));
  return Object.freeze({ version: 1, fixture: WARRIOR_WARRIOR_LOCOMOTION_V1,
    cells: Object.freeze(cells) });
}

export function assertWarriorWarriorLocomotionCorpus(report) {
  const failures = [];
  const expected = WARRIOR_WARRIOR_LOCOMOTION_V1;
  if (report.version !== expected.version ||
      JSON.stringify(report.fixture) !== JSON.stringify(expected)) {
    failures.push("the frozen Warrior/Warrior fixture changed");
  }
  if (JSON.stringify(report.cells?.map(({ id }) => id)) !== JSON.stringify([
    "warrior-warrior-active-left", "warrior-warrior-active-right",
  ])) failures.push("the exact two-cell matrix changed");
  for (const cell of report.cells ?? []) {
    const prefix = (message) => failures.push(`${cell.id}: ${message}`);
    if (cell.physics !== "real-havok-fixed-240hz") prefix("the cell did not use real fixed-step Havok");
    if (cell.samples.length !== expected.steps) prefix("the retained step stream is incomplete");
    const samples = cell.samples;
    const detailed = samples.length === expected.steps ? Object.freeze({
      minimumRangeM: Math.min(...samples.map(({ separationM }) => separationM)),
      rangeAtRetreatM: samples[expected.inwardSteps - 1].separationM,
      finalRangeM: samples.at(-1).separationM,
      leftMaximumFreshGapS: maximumFreshGapS(samples, "left"),
      rightMaximumFreshGapS: maximumFreshGapS(samples, "right"),
      maximumCarrierLagM: Math.max(...samples.flatMap(({ left, right }) =>
        [left.carrierLagM, right.carrierLagM])),
      maximumPartSpeedMps: Math.max(...samples.slice(expected.measurementWarmupSteps)
        .flatMap(({ left, right }) => [left.partSpeedMps, right.partSpeedMps])),
    }) : null;
    if (detailed) for (const key of Object.keys(detailed)) {
      if (!Number.isFinite(detailed[key]) || Math.abs(detailed[key] - cell.summary[key]) > 1e-12) {
        prefix(`summary ${key} contradicted retained physical steps`);
      }
    }
    const closureM = detailed ? expected.initialSeparationM - detailed.minimumRangeM : 0;
    const retreatM = detailed ? detailed.finalRangeM - detailed.rangeAtRetreatM : 0;
    if (detailed && (Math.abs(closureM - cell.summary.closureM) > 1e-12 ||
        Math.abs(retreatM - cell.summary.retreatM) > 1e-12)) {
      prefix("closure or retreat summary contradicted retained physical steps");
    }
    if (cell.combatEvents.some(({ damage }) => damage !== 0)) prefix("an attack-free cell produced damage");
    if (closureM < expected.minimumClosureM) prefix("inward drive did not close the envelope");
    if ((detailed?.minimumRangeM ?? 0) < cell.footprintSeparationM -
        expected.maximumFootprintPenetrationM) prefix("the pair penetrated its declared footprints");
    if (retreatM < expected.minimumRetreatM) prefix("the active Warrior did not retreat");
    if ((detailed?.maximumCarrierLagM ?? Number.POSITIVE_INFINITY) >
        expected.maximumCarrierLagM) prefix("carrier lag exceeded its bound");
    if ((detailed?.maximumPartSpeedMps ?? Number.POSITIVE_INFINITY) >
        expected.maximumPartSpeedMps) prefix("a body part launched");
    if ((detailed?.leftMaximumFreshGapS ?? Number.POSITIVE_INFINITY) > expected.supportGraceS ||
        (detailed?.rightMaximumFreshGapS ?? Number.POSITIVE_INFINITY) >
          expected.supportGraceS) prefix("fresh foot support exceeded grace");
    if (cell.samples.some(({ left, right }) => [left, right].some((body) =>
      body.locomotion.state !== "supported" || body.locomotion.liveSupport !== true ||
      body.locomotion.postureSupported !== true || body.locomotion.freshSupportBindings.length === 0 ||
      !postureValid(body.posture)))) {
      prefix("a Warrior lost physical supported posture");
    }
    const active = cell.activeSide;
    if (cell.samples.slice(0, expected.inwardSteps).some((sample) =>
      sample[active].locomotion.requested?.localForward !== 1)) prefix("the exact inward command stream changed");
    if (cell.samples.slice(expected.inwardSteps).some((sample) =>
      sample[active].locomotion.requested?.localForward !== -1 ||
      !(sample[active].locomotion.allowed?.localForward < 0))) prefix("the retreat command was not physically allowed");
  }
  if (failures.length) throw new Error(`Warrior/Warrior supported locomotion failed: ${failures.join("; ")}`);
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = assertWarriorWarriorLocomotionCorpus(await runWarriorWarriorLocomotionCorpus());
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
