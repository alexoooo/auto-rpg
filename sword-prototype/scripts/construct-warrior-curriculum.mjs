import { pathToFileURL } from "node:url";

import { CONFIG } from "../src/config.ts";
import { saveConstruct } from "../src/construct/codec.ts";
import { humanoidSavedConstruct, HUMANOID_SENSORS } from "../src/construct/humanoid.ts";
import { twinbladeSavedConstruct, TWINBLADE_SENSORS } from "../src/construct/twinblade.ts";
import { ARBALEST_QUALIFIER_ID, arbalestCurriculumDefinition,
  qualifiesArbalestVictory } from "./arbalest-warrior-qualifier.mjs";
import { assertConstructWarriorEvidence, runConstructWarriorBout } from "./construct-warrior-bout.mjs";

const fnv1a32 = (text) => {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
};

export const CONSTRUCT_WARRIOR_CURRICULUM_SEEDS = Object.freeze(
  Array.from({ length: 4 }, (_, index) => fnv1a32(`swordbearer-curriculum-v1:${index}`)),
);
export const CONSTRUCT_WARRIOR_CURRICULUM_SIDES = Object.freeze(["left", "right"]);
export const CONSTRUCT_WARRIOR_CURRICULUM_SECONDS = 30;
// This is a measured ladder, not an ordered boundary. At 0.02 severance and collision
// changes make the idle chassis survive more often than it does at either 0.10 or 0.05.
export const CONSTRUCT_WARRIOR_DURABILITY_LADDER = Object.freeze([0.5, 0.25, 0.10, 0.05, 0.02]);
export const CONSTRUCT_WARRIOR_DEFAULT_DURABILITY_MULTIPLIER = 0.10;

const constant = (value) => Object.freeze({ op: "constant", value });

/** A fair noncombat baseline: real balance motors stay active, sword intelligence does not. */
export function postureOnlySavedConstruct(active = humanoidSavedConstruct(), sensors = HUMANOID_SENSORS) {
  const neutral = active.control.actions.some(({ id }) => id === "dual-mount-neutral")
    ? [Object.freeze({ id: "idle-neutral-mounts", action: "dual-mount-neutral", priority: 30,
        optional: false, dwellS: 0, condition: constant(true), utility: constant(3), parameters: Object.freeze({}) })]
    : [];
  const program = Object.freeze({ version: 1, id: "construct-posture-idle", rules: Object.freeze([
    ...neutral,
    Object.freeze({ id: "idle-brace", action: "brace", priority: 20, optional: false, dwellS: 0,
      condition: constant(true), utility: constant(2), parameters: Object.freeze({}) }),
    Object.freeze({ id: "idle-stabilize", action: "stabilize", priority: 10, optional: false, dwellS: 0,
      condition: constant(true), utility: constant(1), parameters: Object.freeze({}) }),
  ]) });
  return saveConstruct(`${active.name} -- posture-only idle`, active.blueprint, active.control,
    program, sensors);
}

/** Scale every damageable element while leaving armour, dynamics and Mind byte-identical. */
export function withDurabilityMultiplier(saved, durabilityMultiplier,
  sensors = HUMANOID_SENSORS) {
  if (!Number.isFinite(durabilityMultiplier) || durabilityMultiplier <= 0) {
    throw new Error(`durability multiplier must be positive, got ${durabilityMultiplier}`);
  }
  const blueprint = structuredClone(saved.blueprint);
  blueprint.parts = blueprint.parts.map((part) =>
    ({ ...part, health: part.health * durabilityMultiplier }));
  blueprint.joints = blueprint.joints.map((joint) =>
    ({ ...joint, health: joint.health * durabilityMultiplier }));
  blueprint.modules = blueprint.modules.map((module) =>
    ({ ...module, health: module.health * durabilityMultiplier }));
  return saveConstruct(`${saved.name} -- durability x${durabilityMultiplier}`, blueprint,
    saved.control, saved.program, sensors);
}

const qualifiesTwinbladeVictory = (report) => {
  try {
    assertConstructWarriorEvidence(report);
    return true;
  } catch {
    return false;
  }
};
export const TWINBLADE_QUALIFIER_ID = "twinblade-scissor-v1";
const COMMITTED_QUALIFIERS = Object.freeze({
  [TWINBLADE_QUALIFIER_ID]: Object.freeze({ blueprintId: "twinblade-effigy", qualify: qualifiesTwinbladeVictory }),
  [ARBALEST_QUALIFIER_ID]: Object.freeze({ blueprintId: "arbalest-effigy", qualify: qualifiesArbalestVictory }),
});

const summarize = (cells, qualifyActiveVictory = qualifiesTwinbladeVictory) => {
  const idle = cells.filter(({ mode }) => mode === "idle");
  const active = cells.filter(({ mode }) => mode === "active");
  const count = (rows, predicate) => rows.filter(predicate).length;
  return Object.freeze({
    cellsPerMode: idle.length,
    idleWarriorKills: count(idle, ({ winner, constructVitality }) =>
      winner === "warrior" && constructVitality === 0),
    activeConstructKills: count(active, ({ winner, warriorVitality }) =>
      winner === "construct" && warriorVitality === 0),
    activeQualifiedConstructKills: count(active, ({ winner, warriorVitality, bout }) =>
      winner === "construct" && warriorVitality === 0 && qualifyActiveVictory(bout) === true),
    activeQualifiedConstructKillsLeft: count(active, ({ constructSide, winner, warriorVitality, bout }) =>
      constructSide === "left" && winner === "construct" && warriorVitality === 0 &&
      qualifyActiveVictory(bout) === true),
    activeQualifiedConstructKillsRight: count(active, ({ constructSide, winner, warriorVitality, bout }) =>
      constructSide === "right" && winner === "construct" && warriorVitality === 0 &&
      qualifyActiveVictory(bout) === true),
    activeConstructSurvivals: count(active, ({ constructVitality }) => constructVitality > 0),
    activeUprightDamageCells: count(active, ({ firstUprightConstructDamageS }) =>
      Number.isFinite(firstUprightConstructDamageS)),
    idleConstructDamage: idle.reduce((sum, row) => sum + row.constructDamage, 0),
    activeConstructDamage: active.reduce((sum, row) => sum + row.constructDamage, 0),
  });
};

export async function runConstructWarriorCurriculum({
  seeds = CONSTRUCT_WARRIOR_CURRICULUM_SEEDS,
  sides = CONSTRUCT_WARRIOR_CURRICULUM_SIDES,
  maxSteps = CONFIG.world.physicsHz * CONSTRUCT_WARRIOR_CURRICULUM_SECONDS,
  active = twinbladeSavedConstruct(),
  sensors = TWINBLADE_SENSORS,
  definition = null,
  durabilityMultiplier = CONSTRUCT_WARRIOR_DEFAULT_DURABILITY_MULTIPLIER,
  boutRunner = runConstructWarriorBout,
} = {}) {
  if (definition !== null && (typeof definition !== "object" || !definition.saved ||
      !Array.isArray(definition.sensors) || typeof definition.qualifierId !== "string" ||
      typeof definition.qualifyActiveVictory !== "function")) {
    throw new Error("construct-Warrior curriculum definition requires saved, sensors, qualifierId and qualifier");
  }
  const selectedActive = definition?.saved ?? active;
  const selectedSensors = definition?.sensors ?? sensors;
  const qualifierId = definition?.qualifierId ?? TWINBLADE_QUALIFIER_ID;
  const committed = COMMITTED_QUALIFIERS[qualifierId];
  if (!committed || committed.blueprintId !== selectedActive.blueprint.id ||
      (definition && definition.qualifyActiveVictory !== committed.qualify)) {
    throw new Error(`construct-Warrior curriculum qualifier ${JSON.stringify(qualifierId)} does not match blueprint ${JSON.stringify(selectedActive.blueprint.id)}`);
  }
  const selectedQualifier = committed.qualify;
  const tunedActive = withDurabilityMultiplier(selectedActive, durabilityMultiplier, selectedSensors);
  const idle = postureOnlySavedConstruct(tunedActive, selectedSensors);
  const cells = [];
  for (const seed of seeds) for (const constructSide of sides) for (const [mode, saved] of [
    ["idle", idle], ["active", tunedActive],
  ]) {
    const report = await boutRunner({ saved, sensors: selectedSensors, warriorPolicy: "duelist",
      warriorSeed: seed, constructSide, maxSteps });
    cells.push(Object.freeze({ mode, seed, constructSide, physics: report.physics,
      simulatedSeconds: report.simulatedSeconds, winner: report.winner,
      constructVitality: report.construct.vitality, warriorVitality: report.warrior.vitality,
      constructDamage: report.construct.damage, warriorDamage: report.warrior.damage,
      firstUprightConstructDamageS: report.firstUprightConstructDamageS,
      blueprintDigest: saved.digests.blueprint, bout: report }));
  }
  return Object.freeze({ version: 2, seeds: Object.freeze([...seeds]), sides: Object.freeze([...sides]),
    seconds: maxSteps / CONFIG.world.physicsHz, durabilityMultiplier, qualifierId,
    constructBlueprintId: selectedActive.blueprint.id,
    activeProgramId: selectedActive.program.id,
    controlDigest: tunedActive.digests.control, activeProgramDigest: tunedActive.digests.program,
    blueprintDigest: tunedActive.digests.blueprint,
    cells: Object.freeze(cells), summary: summarize(cells, selectedQualifier) });
}

/**
 * Replays the pinned posture-only target at each declared durability rung. The
 * ordering is intentional: it records the ratchet rather than searching health
 * values until one convenient corpus happens to pass.
 */
export async function runConstructWarriorDurabilityLadder({
  multipliers = CONSTRUCT_WARRIOR_DURABILITY_LADDER,
  seeds = CONSTRUCT_WARRIOR_CURRICULUM_SEEDS,
  sides = CONSTRUCT_WARRIOR_CURRICULUM_SIDES,
  maxSteps = CONFIG.world.physicsHz * CONSTRUCT_WARRIOR_CURRICULUM_SECONDS,
  active = twinbladeSavedConstruct(),
  sensors = TWINBLADE_SENSORS,
  boutRunner = runConstructWarriorBout,
} = {}) {
  const rungs = [];
  for (const durabilityMultiplier of multipliers) {
    const tunedActive = withDurabilityMultiplier(active, durabilityMultiplier, sensors);
    const saved = postureOnlySavedConstruct(tunedActive, sensors);
    const cells = [];
    for (const seed of seeds) for (const constructSide of sides) {
      const report = await boutRunner({ saved, sensors, warriorPolicy: "duelist",
        warriorSeed: seed, constructSide, maxSteps });
      cells.push(Object.freeze({ seed, constructSide, physics: report.physics,
        simulatedSeconds: report.simulatedSeconds, winner: report.winner,
        constructVitality: report.construct.vitality,
        warriorDamage: report.warrior.damage, blueprintDigest: saved.digests.blueprint }));
    }
    rungs.push(Object.freeze({ durabilityMultiplier, blueprintDigest: saved.digests.blueprint,
      warriorKills: cells.filter(({ winner, constructVitality }) =>
        winner === "warrior" && constructVitality === 0).length,
      cells: Object.freeze(cells) }));
  }
  return Object.freeze({ version: 2, multipliers: Object.freeze([...multipliers]),
    seeds: Object.freeze([...seeds]), sides: Object.freeze([...sides]),
    seconds: maxSteps / CONFIG.world.physicsHz,
    controlDigest: active.digests.control, rungs: Object.freeze(rungs) });
}

// Filled from the pinned resized-body baseline, never from a convenient single seed.
export const CONSTRUCT_WARRIOR_CURRICULUM_ACCEPTANCE = Object.freeze({
  version: 2,
  seeds: CONSTRUCT_WARRIOR_CURRICULUM_SEEDS,
  sides: CONSTRUCT_WARRIOR_CURRICULUM_SIDES,
  seconds: CONSTRUCT_WARRIOR_CURRICULUM_SECONDS,
  durabilityMultiplier: CONSTRUCT_WARRIOR_DEFAULT_DURABILITY_MULTIPLIER,
  qualifierId: TWINBLADE_QUALIFIER_ID,
  constructBlueprintId: "twinblade-effigy",
  activeProgramId: "twinblade-warrior-scissor-cut",
  idleWarriorKillsMin: 8,
  // Active thresholds remain zero until the identically pinned active corpus is measured.
  activeConstructKillsMin: 0,
  activeQualifiedConstructKillsMin: 0,
  activeConstructSurvivalsMin: 0,
  activeUprightDamageCellsMin: 0,
});

/**
 * Honest x0.10 floor from the strict 2026-08-29 Arbalest corpus, not the
 * superseded pre-qualifier score. The unchanged AI/body ratchet also passed
 * x0.05 at 2 qualified wins and x0.02 non-monotonically at 3; idle died 8/8
 * at all three rungs. Active damage was 912.2360733535304, the same again,
 * then 1127.6907478558683.
 */
export const ARBALEST_WARRIOR_CURRICULUM_ACCEPTANCE = Object.freeze({
  version: 2,
  seeds: CONSTRUCT_WARRIOR_CURRICULUM_SEEDS,
  sides: CONSTRUCT_WARRIOR_CURRICULUM_SIDES,
  seconds: CONSTRUCT_WARRIOR_CURRICULUM_SECONDS,
  durabilityMultiplier: CONSTRUCT_WARRIOR_DEFAULT_DURABILITY_MULTIPLIER,
  qualifierId: ARBALEST_QUALIFIER_ID,
  constructBlueprintId: "arbalest-effigy",
  activeProgramId: "arbalest-effigy-mind",
  idleWarriorKillsMin: 8,
  activeConstructKillsMin: 2,
  activeQualifiedConstructKillsMin: 2,
  activeQualifiedConstructKillsLeftMin: 1,
  activeQualifiedConstructKillsRightMin: 1,
  activeConstructSurvivalsMin: 2,
  activeUprightDamageCellsMin: 8,
  blueprintDigest: "3f4928d9",
  controlDigest: "2d8aa403",
  activeProgramDigest: "da776d60",
});

export function assertConstructWarriorCurriculum(report,
  thresholds = CONSTRUCT_WARRIOR_CURRICULUM_ACCEPTANCE) {
  const failures = [];
  const committed = COMMITTED_QUALIFIERS[report.qualifierId];
  if (!committed || committed.blueprintId !== report.constructBlueprintId) {
    failures.push(`unknown or mismatched committed qualifier ${JSON.stringify(report.qualifierId)}`);
  }
  const expectedCells = report.seeds.length * report.sides.length;
  if (report.cells.length !== expectedCells * 2) failures.push(`expected ${expectedCells * 2} cells, got ${report.cells.length}`);
  const expectedKeys = new Set(report.seeds.flatMap((seed) => report.sides.flatMap((side) =>
    ["idle", "active"].map((mode) => `${mode}:${seed}:${side}`))));
  const actualKeys = report.cells.map(({ mode, seed, constructSide }) => `${mode}:${seed}:${constructSide}`);
  if (new Set(actualKeys).size !== actualKeys.length || actualKeys.some((key) => !expectedKeys.has(key)) ||
      [...expectedKeys].some((key) => !actualKeys.includes(key))) {
    failures.push("cells were not the exact seed x side x mode matrix");
  }
  if (report.cells.some(({ physics }) => physics !== "real-havok-fixed-240hz")) failures.push("a cell did not use real fixed-step Havok");
  if (report.cells.some(({ blueprintDigest }) => blueprintDigest !== report.blueprintDigest)) failures.push("idle and active bodies differ");
  if (report.qualifierId === ARBALEST_QUALIFIER_ID &&
      (!Number.isFinite(report.seconds) || report.seconds < 0 || report.cells.some((cell) =>
        !Number.isFinite(cell.simulatedSeconds) || cell.simulatedSeconds < 0 ||
        !Number.isInteger(cell.bout?.steps) || cell.bout.steps < 0 ||
        Math.abs(cell.bout.steps / CONFIG.world.physicsHz - cell.simulatedSeconds) > 1e-9 ||
        cell.simulatedSeconds > report.seconds + 1e-9 ||
        cell.bout.steps > report.seconds * CONFIG.world.physicsHz))) {
    failures.push("an Arbalest cell exceeded or contradicted its no-tail simulation cap");
  }
  const detailedFields = ["physics", "simulatedSeconds", "winner", "firstUprightConstructDamageS"];
  if (report.cells.some((cell) => !cell.bout || detailedFields.some((field) => cell[field] !== cell.bout[field]) ||
      cell.constructVitality !== cell.bout.construct?.vitality || cell.warriorVitality !== cell.bout.warrior?.vitality ||
      cell.constructDamage !== cell.bout.construct?.damage || cell.warriorDamage !== cell.bout.warrior?.damage ||
      cell.seed !== cell.bout.warrior?.seed || cell.constructSide !== cell.bout.construct?.side ||
      cell.bout.warrior?.policy !== "duelist" ||
      cell.bout.construct?.blueprintId !== report.constructBlueprintId ||
      cell.bout.construct?.programId !== (cell.mode === "active"
        ? report.activeProgramId : "construct-posture-idle"))) {
    failures.push("a cell contradicted its retained bout evidence");
  }
  const detailedSummary = summarize(report.cells, committed?.qualify ?? (() => false));
  for (const [field, value] of Object.entries(detailedSummary)) {
    if (report.summary?.[field] !== value) failures.push(`${field} summary contradicted cells`);
  }
  for (const [field, threshold] of Object.entries(thresholds).filter(([field]) => field.endsWith("Min"))) {
    const summaryField = field.replace(/Min$/, "");
    if (detailedSummary[summaryField] < threshold) {
      failures.push(`${summaryField} ${detailedSummary[summaryField]} is below ${threshold}`);
    }
  }
  for (const field of ["version", "seconds", "durabilityMultiplier", "qualifierId",
    "constructBlueprintId", "activeProgramId", "blueprintDigest", "controlDigest",
    "activeProgramDigest"]) {
    if (Object.prototype.hasOwnProperty.call(thresholds, field) && report[field] !== thresholds[field]) {
      failures.push(`${field} ${JSON.stringify(report[field])} does not match ${JSON.stringify(thresholds[field])}`);
    }
  }
  for (const field of ["seeds", "sides"]) {
    if (Object.prototype.hasOwnProperty.call(thresholds, field) &&
        JSON.stringify(report[field]) !== JSON.stringify(thresholds[field])) {
      failures.push(`${field} ${JSON.stringify(report[field])} does not match ${JSON.stringify(thresholds[field])}`);
    }
  }
  if (failures.length) throw new Error(`construct-Warrior curriculum failed: ${failures.join("; ")}`);
  return report;
}

export const curriculumDefinitionForArgs = (args) => {
  const known = new Set(["--arbalest", "--durability-ladder"]);
  const unknown = args.find((argument) => !known.has(argument));
  if (unknown) throw new Error(`unknown construct-Warrior curriculum flag ${JSON.stringify(unknown)}`);
  return args.includes("--arbalest") ? arbalestCurriculumDefinition() : null;
};
export const curriculumAcceptanceForDefinition = (definition) => {
  if (definition === null) return CONSTRUCT_WARRIOR_CURRICULUM_ACCEPTANCE;
  if (definition?.qualifierId === ARBALEST_QUALIFIER_ID &&
      definition.saved?.blueprint?.id === "arbalest-effigy" &&
      definition.saved?.program?.id === "arbalest-effigy-mind" &&
      definition.qualifyActiveVictory === qualifiesArbalestVictory) {
    return ARBALEST_WARRIOR_CURRICULUM_ACCEPTANCE;
  }
  if (definition?.qualifierId === TWINBLADE_QUALIFIER_ID &&
      definition.saved?.blueprint?.id === "twinblade-effigy" &&
      definition.saved?.program?.id === "twinblade-warrior-scissor-cut" &&
      definition.qualifyActiveVictory === qualifiesTwinbladeVictory) {
    return CONSTRUCT_WARRIOR_CURRICULUM_ACCEPTANCE;
  }
  throw new Error(`no committed curriculum acceptance for ${JSON.stringify(definition?.qualifierId)}`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const ladder = process.argv.includes("--durability-ladder");
  const definition = curriculumDefinitionForArgs(process.argv.slice(2));
  const report = ladder ? await runConstructWarriorDurabilityLadder(definition
    ? { active: definition.saved, sensors: definition.sensors } : {})
    : await runConstructWarriorCurriculum(definition ? { definition } : {});
  if (!ladder) assertConstructWarriorCurriculum(report, curriculumAcceptanceForDefinition(definition));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
