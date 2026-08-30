import { pathToFileURL } from "node:url";

import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";

import { Combat } from "../src/combat.ts";
import { CONFIG } from "../src/config.ts";
import { humanoidProfileValues, WARRIOR_PROFILE } from "../src/fighter.ts";
import { idleMind } from "../src/mind.ts";
import { blankIntent } from "../src/policies.ts";
import { humanoidSavedConstruct, HUMANOID_SENSORS } from "../src/construct/humanoid.ts";
import { canonicalIntegrityJson, integrityDigest } from "../src/construct/integrity.ts";
import { Construct, constructProfileForBlueprint } from "../src/construct/construct.ts";
import { classifySupportedClosure } from "../src/supported-locomotion.ts";
import { stepPair } from "../src/fighter.ts";
import { unitDefinition } from "../src/units.ts";
import { createConstructHeadlessArena } from "./construct-headless-arena.mjs";

const FIXED = 1 / CONFIG.world.physicsHz;
const FIXTURE_VERSION = 1;
const SAMPLE_SECONDS = 3;
const WARMUP_SECONDS = 0.6;
const SAMPLE_STEPS = SAMPLE_SECONDS * CONFIG.world.physicsHz;
const WARMUP_STEPS = WARMUP_SECONDS * CONFIG.world.physicsHz;
const START_SEPARATION_M = CONFIG.fighter.separation;
const EMPTY_LOADOUT = Object.freeze({ primary: "empty", secondary: "empty" });
const EXPECTED_CELLS = Object.freeze([
  Object.freeze({ scenario: "warrior-warrior", side: "left" }),
  Object.freeze({ scenario: "warrior-warrior", side: "right" }),
  Object.freeze({ scenario: "warrior-swordbearer", side: "left" }),
  Object.freeze({ scenario: "warrior-swordbearer", side: "right" }),
]);

export const SUPPORTED_LOCOMOTION_BASELINE_CONTRACT = Object.freeze({
  expectedCells: EXPECTED_CELLS,
  expectedSampleCount: SAMPLE_STEPS,
  separationEnvelopeM: 1.10,
  requiredInwardEnvelopeDwellSamples: CONFIG.world.physicsHz,
  maxPenetrationM: 0.08,
  maxPenetrationDwellSamples: Math.round(CONFIG.world.physicsHz * 0.05),
  maxPartSpeedMps: 20,
  maxJointFrameErrorM: 0.08,
});

const frozenFixture = Object.freeze({
  version: FIXTURE_VERSION,
  physics: `real-havok-fixed-${CONFIG.world.physicsHz}hz`,
  warmupSeconds: WARMUP_SECONDS,
  sampleSeconds: SAMPLE_SECONDS,
  warmupSteps: WARMUP_STEPS,
  sampleSteps: SAMPLE_STEPS,
  initialTransforms: Object.freeze({
    left: Object.freeze({ positionM: Object.freeze([0, 0, 0]), facingRad: 0 }),
    right: Object.freeze({ positionM: Object.freeze([0, 0, START_SEPARATION_M]), facingRad: Math.PI }),
  }),
  scenarioOrder: EXPECTED_CELLS,
  warrior: Object.freeze({
    profileDigest: integrityDigest(canonicalIntegrityJson({
      profile: WARRIOR_PROFILE,
      values: humanoidProfileValues(WARRIOR_PROFILE),
    })),
    controlDigest: integrityDigest(canonicalIntegrityJson({
      surface: "humanoid-v1", forward: 1, strafe: 0, turn: 0,
      attacks: false, loadout: EMPTY_LOADOUT, controlCellCounterpart: "idle",
    })),
  }),
  swordbearer: (() => {
    const saved = humanoidSavedConstruct();
    return Object.freeze({ blueprintDigest: saved.digests.blueprint,
      controlDigest: saved.digests.control, programDigest: saved.digests.program,
      command: "shipped brace + stabilize; attacks omitted" });
  })(),
});

const materialsFor = (scene) => {
  const material = new StandardMaterial("supported-locomotion.material", scene);
  return Object.freeze({ owner: material, fighter: Object.freeze({
    flesh: material, cloth: material, steel: material, leather: material,
    brass: material, hide: material, wood: material, arrowAccent: material,
  }) });
};

const inwardSource = () => {
  const intent = blankIntent();
  intent.forward = 1;
  let requested = false;
  return Object.freeze({
    mind: Object.freeze({ name: "supported-locomotion-inward", decide: () => {
      requested = true;
      return intent;
    } }),
    beginStep: () => { requested = false; },
    requested: () => requested,
  });
};

const braceCommand = Object.freeze({ version: 1, requests: Object.freeze([
  Object.freeze({ request: Object.freeze({ action: "brace", parameters: Object.freeze({}) }),
    priority: 20, sourceIndex: 0 }),
  Object.freeze({ request: Object.freeze({ action: "stabilize", parameters: Object.freeze({}) }),
    priority: 10, sourceIndex: 1 }),
]) });

const horizontalSeparation = (left, right) => {
  const a = left.centre(); const b = right.centre();
  return Math.hypot(a.x - b.x, a.z - b.z);
};

const bodyParts = (body) => body instanceof Construct
  ? [...body.runtime.parts.values()].map((part) => part.body)
  : body.limbs.filter((limb) => !limb.severed).map((limb) => limb.part.body);

const maxPartSpeed = (...bodies) => Math.max(0, ...bodies.flatMap(bodyParts)
  .map((body) => body.getLinearVelocity().length()));

const constructJointError = (body) => body instanceof Construct
  ? Math.max(0, ...[...body.runtime.joints.values()].map((joint) => {
    const frames = joint.liveFrames();
    return Vector3.Distance(frames.parent.position, frames.child.position);
  }))
  : 0;

const upDot = (node) => Vector3.Dot(
  Vector3.Up().rotateByQuaternionToRef(node.rotationQuaternion ?? Quaternion.Identity(), new Vector3()),
  Vector3.Up(),
);

const warriorStanding = (fighter) => {
  const values = humanoidProfileValues(fighter.profile).body;
  return upDot(fighter.pelvis.mesh) > 0.72 &&
    fighter.torso.mesh.position.y > values.torsoCentre * 0.9 &&
    fighter.head.mesh.position.y - fighter.torso.mesh.position.y >
      (values.headCentre - values.torsoCentre) * 0.5;
};

const constructStanding = (construct) => {
  const profile = constructProfileForBlueprint(construct.runtime.blueprint);
  const root = construct.runtime.part(construct.runtime.blueprint.rootPart).node;
  const head = construct.runtime.parts.get("head")?.node;
  return upDot(root) > 0.72 && root.position.y > profile.vitalHeight * 0.9 &&
    (head === undefined || head.position.y - root.position.y >
      (profile.crownHeight - profile.vitalHeight) * 0.5);
};

const standing = (body) => body instanceof Construct ? constructStanding(body) : warriorStanding(body);

const summaryFor = (samples, contract) => {
  const longest = (accepts) => {
    let run = 0; let best = 0;
    for (const row of samples) { run = accepts(row) ? run + 1 : 0; best = Math.max(best, run); }
    return best;
  };
  return Object.freeze({
    sampleCount: samples.length,
    minSeparationM: Math.min(...samples.map((row) => row.separationM)),
    enteredEnvelope: samples.some((row) => row.separationM <= contract.separationEnvelopeM),
    inwardEnvelopeDwellSamples: longest((row) => row.inwardRequested &&
      row.separationM <= contract.separationEnvelopeM),
    postureLossSamples: samples.filter((row) => !row.compositePosture).length,
    penetrationDwellSamples: longest((row) => row.penetrationM > contract.maxPenetrationM),
    maxPenetrationM: Math.max(...samples.map((row) => row.penetrationM)),
    maxPartSpeedMps: Math.max(...samples.map((row) => row.maxPartSpeedMps)),
    maxJointFrameErrorM: Math.max(...samples.map((row) => row.maxJointFrameErrorM)),
  });
};

const wake = (scene, ...bodies) => {
  const plugin = scene.getPhysicsEngine().getPhysicsPlugin();
  for (const body of bodies.flatMap(bodyParts)) plugin.setActivationControl(body, 1);
};

/** One real fixed-step closure cell. Options exist for the focused physical test, not the CLI. */
export async function runSupportedLocomotionCell({ scenario, side,
  sampleSteps = SAMPLE_STEPS, warmupSteps = WARMUP_STEPS } = {}) {
  if (!EXPECTED_CELLS.some((cell) => cell.scenario === scenario && cell.side === side)) {
    throw new Error(`unknown supported-locomotion cell ${scenario}/${side}`);
  }
  if (![sampleSteps, warmupSteps].every((value) => Number.isSafeInteger(value) && value >= 0) || sampleSteps === 0) {
    throw new Error("supported-locomotion cell steps must be integers with a positive sample count");
  }
  const arena = await createConstructHeadlessArena();
  const materials = materialsFor(arena.scene);
  const saved = humanoidSavedConstruct();
  const at = (which) => which === "left" ? Vector3.Zero() : new Vector3(0, 0, START_SEPARATION_M);
  const facing = (which) => which === "left" ? 0 : Math.PI;
  let left; let right; let construct = null;
  const inward = inwardSource();
  let leftCombat; let rightCombat;
  try {
    if (scenario === "warrior-warrior") {
      left = unitDefinition("warrior").build({ scene: arena.scene, side: "left", origin: at("left"),
        facing: facing("left"), mind: side === "left" ? inward.mind : idleMind(),
        loadout: EMPTY_LOADOUT, materials: materials.fighter });
      right = unitDefinition("warrior").build({ scene: arena.scene, side: "right", origin: at("right"),
        facing: facing("right"), mind: side === "right" ? inward.mind : idleMind(),
        loadout: EMPTY_LOADOUT, materials: materials.fighter });
    } else {
      const constructSide = side;
      const warriorSide = constructSide === "left" ? "right" : "left";
      construct = new Construct({ scene: arena.scene, side: constructSide, origin: at(constructSide),
        facing: facing(constructSide), materials: materials.fighter, policyName: "construct-program" },
      { blueprint: saved.blueprint, control: saved.control, program: saved.program,
        sensors: HUMANOID_SENSORS, profile: constructProfileForBlueprint(saved.blueprint) });
      construct.control.installCommandSource("supported-locomotion-brace", () => braceCommand);
      const warrior = unitDefinition("warrior").build({ scene: arena.scene, side: warriorSide,
        origin: at(warriorSide), facing: facing(warriorSide), mind: inward.mind,
        loadout: EMPTY_LOADOUT, materials: materials.fighter });
      left = constructSide === "left" ? construct : warrior;
      right = constructSide === "right" ? construct : warrior;
    }

    const combatRows = [];
    leftCombat = new Combat("left", left.strikers, (event) => combatRows.push({ side: "left", event }));
    rightCombat = new Combat("right", right.strikers, (event) => combatRows.push({ side: "right", event }));
    leftCombat.attach(right); rightCombat.attach(left);
    wake(arena.scene, left, right);
    const radii = unitDefinition(left.kind).collisionRadius + unitDefinition(right.kind).collisionRadius;
    const samples = [];
    const totalSteps = warmupSteps + sampleSteps;
    let eventCursor = 0;
    for (let step = 0; step < totalSteps; step += 1) {
      const clock = leftCombat.now;
      inward.beginStep();
      stepPair(left, right, FIXED, clock);
      arena.scene._renderId += 1;
      arena.scene._advancePhysicsEngineStep(1000 * FIXED);
      leftCombat.advance(FIXED); rightCombat.advance(FIXED);
      if (step < warmupSteps) { eventCursor = combatRows.length; continue; }
      const separationM = horizontalSeparation(left, right);
      const newEvents = combatRows.slice(eventCursor);
      eventCursor = combatRows.length;
      samples.push(Object.freeze({
        step: step - warmupSteps,
        separationM,
        inwardRequested: inward.requested(),
        compositePosture: standing(left) && standing(right),
        penetrationM: Math.max(0, radii - separationM),
        maxPartSpeedMps: maxPartSpeed(left, right),
        maxJointFrameErrorM: Math.max(constructJointError(left), constructJointError(right)),
        combatEventCount: newEvents.length,
        damage: newEvents.reduce((sum, row) => sum + row.event.report.damage, 0),
      }));
    }
    const contract = { ...SUPPORTED_LOCOMOTION_BASELINE_CONTRACT, expectedSampleCount: sampleSteps };
    return Object.freeze({ scenario, side, samples: Object.freeze(samples),
      summary: summaryFor(samples, contract) });
  } finally {
    leftCombat?.dispose(); rightCombat?.dispose();
    left?.dispose(); right?.dispose();
    materials.owner.dispose(false, false);
    arena.dispose();
  }
}

export async function measureSupportedLocomotionBaseline() {
  const cells = [];
  for (const cell of EXPECTED_CELLS) cells.push(await runSupportedLocomotionCell(cell));
  const evidence = Object.freeze({ cells: Object.freeze(cells) });
  return Object.freeze({ version: FIXTURE_VERSION, fixture: frozenFixture,
    contract: SUPPORTED_LOCOMOTION_BASELINE_CONTRACT, evidence,
    classification: classifySupportedClosure(evidence, SUPPORTED_LOCOMOTION_BASELINE_CONTRACT) });
}

function parseArgs(args) {
  if (args.length !== 1 || args[0] !== "--baseline") {
    throw new Error('supported-locomotion measurement accepts exactly "--baseline"');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    parseArgs(process.argv.slice(2));
    const report = await measureSupportedLocomotionBaseline();
    process.stdout.write(`${canonicalIntegrityJson(report)}\n`);
    if (report.classification.status !== "rejected") {
      process.stderr.write("pre-fix supported-locomotion baseline unexpectedly qualified\n");
      process.exitCode = 2;
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
