import { pathToFileURL } from "node:url";
import { mkdir, open, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { COMBAT_VALUE_UNIT_VERSION, CONFIG } from "../src/config.ts";
import { saveConstruct } from "../src/construct/codec.ts";
import { constructBlueprintForDurability, durabilityManifest, scaleConstructDurability } from
  "../src/construct/durability.ts";
import { canonicalIntegrityJson, integrityDigest } from "../src/construct/integrity.ts";
import { humanoidSavedConstruct, HUMANOID_SENSORS } from "../src/construct/humanoid.ts";
import { arbalestSavedConstruct, ARBALEST_SENSORS } from "../src/construct/arbalest.ts";
import { twinbladeSavedConstruct, TWINBLADE_SENSORS } from "../src/construct/twinblade.ts";
import { wardenBlueprint, wardenControl, wardenProgram, WARDEN_SENSORS } from "../src/construct/warden.ts";
import { ARBALEST_QUALIFIER_ID, arbalestCurriculumDefinition,
  qualifiesArbalestVictory } from "./arbalest-warrior-qualifier.mjs";
import { beginCombinedArmsRunDigest, COMBINED_ARMS_DURABILITY_LADDER,
  COMBINED_ARMS_MORPHOLOGIES, COMBINED_ARMS_QUALIFICATION_VERSION,
  COMBINED_ARMS_SEEDS, COMBINED_ARMS_SIDES,
  foldCombinedArmsRunDigest, reconstructCombinedArmsRung, selectLowestPassingRung } from
  "./construct-combined-arms-qualification.mjs";
import { assertConstructWarriorEvidence, runConstructWarriorBout } from "./construct-warrior-bout.mjs";
import { constructQualificationSourceFingerprint } from "./qualify-construct-learning-entry.mjs";
import { runCombinedArmsJobsInWorkers } from "./construct-combined-arms-runner.mjs";

export { assertCombinedArmsQualification, COMBINED_ARMS_DURABILITY_LADDER,
  COMBINED_ARMS_MORPHOLOGIES, COMBINED_ARMS_QUALIFICATION_VERSION,
  reconstructCombinedArmsCell, reconstructCombinedArmsRung, selectLowestPassingRung } from
  "./construct-combined-arms-qualification.mjs";

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
  const actionIds = new Set(active.control.actions.map(({ id }) => id));
  const neutral = active.control.actions.filter(({ id }) => id.endsWith("-neutral"))
    .map((action, index) => Object.freeze({ id: `idle-${action.id}`, action: action.id,
      priority: 30 - index, optional: false, dwellS: 0, condition: constant(true),
      utility: constant(3), parameters: Object.freeze({}) }));
  const posture = [
    ...(actionIds.has("brace") ? [Object.freeze({ id: "idle-brace", action: "brace", priority: 20,
      optional: false, dwellS: 0, condition: constant(true), utility: constant(2),
      parameters: Object.freeze({}) })] : []),
    ...(actionIds.has("stabilize") ? [Object.freeze({ id: "idle-stabilize", action: "stabilize",
      priority: 10, optional: false, dwellS: 0, condition: constant(true), utility: constant(1),
      parameters: Object.freeze({}) })] : []),
  ];
  if (!posture.length) throw new Error(`construct ${JSON.stringify(active.blueprint.id)} has no posture-only Action`);
  const program = Object.freeze({ version: 1, id: "construct-posture-idle",
    rules: Object.freeze([...neutral, ...posture]) });
  return saveConstruct(`${active.name} -- posture-only idle`, active.blueprint, active.control,
    program, sensors);
}

/** Scale every damageable element while leaving armour, dynamics and Mind byte-identical. */
export function withDurabilityMultiplier(saved, durabilityMultiplier,
  sensors = HUMANOID_SENSORS) {
  const blueprint = scaleConstructDurability(saved.blueprint, durabilityMultiplier);
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
  return Object.freeze({ version: 4, seeds: Object.freeze([...seeds]), sides: Object.freeze([...sides]),
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
  return Object.freeze({ version: 4, multipliers: Object.freeze([...multipliers]),
    seeds: Object.freeze([...seeds]), sides: Object.freeze([...sides]),
    seconds: maxSteps / CONFIG.world.physicsHz,
    controlDigest: active.digests.control, rungs: Object.freeze(rungs) });
}

const combinedArmsDefinitions = () => {
  const warden = (variant) => saveConstruct(`Warden ${variant} combined-arms qualifier`,
    wardenBlueprint(variant), wardenControl(variant, "assisted"),
    wardenProgram(variant, "assisted"), WARDEN_SENSORS);
  const saved = new Map([
    ["swordbearer", Object.freeze({ saved: humanoidSavedConstruct(), sensors: HUMANOID_SENSORS })],
    ["twinblade", Object.freeze({ saved: twinbladeSavedConstruct(), sensors: TWINBLADE_SENSORS })],
    ["arbalest", Object.freeze({ saved: arbalestSavedConstruct(), sensors: ARBALEST_SENSORS })],
    ["warden-crossbow", Object.freeze({ saved: warden("crossbow"), sensors: WARDEN_SENSORS })],
    ["warden-sword", Object.freeze({ saved: warden("sword"), sensors: WARDEN_SENSORS })],
  ]);
  return COMBINED_ARMS_MORPHOLOGIES.map((identity) => {
    const source = saved.get(identity.id);
    const baseSaved = saveConstruct(source.saved.name,
      constructBlueprintForDurability(source.saved.blueprint, identity.id, "base"),
      source.saved.control, source.saved.program, source.sensors);
    return Object.freeze({ ...identity, baseSaved, sensors: source.sensors });
  });
};

export const combinedArmsWarriorLoadout = (morphologyId, seed) => Object.freeze({ primary: "sword",
  secondary: morphologyId === "twinblade" && COMBINED_ARMS_SEEDS.indexOf(seed) % 2 === 1
    ? "empty" : "buckler" });

const combinedArmsCell = (definition, saved, mode, seed, constructSide, warriorLoadout,
  durabilityMultiplier, bout) => Object.freeze({
  morphologyId: definition.id, qualifierId: definition.qualifierId, mode, seed, constructSide,
  warriorLoadout: Object.freeze({ ...warriorLoadout }),
  combatValueUnitVersion: COMBAT_VALUE_UNIT_VERSION, projectileLawVersion: 1,
  blueprintDigest: saved.digests.blueprint, controlDigest: saved.digests.control,
  programDigest: saved.digests.program,
  baseDurability: durabilityManifest(definition.baseSaved.blueprint),
  actualDurability: durabilityManifest(saved.blueprint),
  durabilityMultiplier,
  eventStepHz: bout.qualificationEventStepHz ?? null,
  passiveIntervalLimitS: bout.qualificationPassiveIntervalLimitS ?? null,
  minimumSelfClearanceM: bout.minimumSelfClearanceM ?? null,
  diagnosticMinimumSelfClearanceM: bout.diagnosticMinimumSelfClearanceM ?? null,
  rawOrderedEvents: bout.qualificationEvents ?? null,
  verdict: Object.freeze({ winner: bout.winner, constructVitality: bout.construct.vitality,
    warriorVitality: bout.warrior.vitality, atStep: bout.verdictAtStep ?? bout.steps,
    atS: bout.verdictAtS ?? bout.simulatedSeconds,
    timeCap: bout.verdictAtS === null }),
});

export function assertCombinedArmsCheckpointState(actual, expected) {
  if (canonicalIntegrityJson(actual) !== canonicalIntegrityJson(expected)) {
    throw new Error("combined-arms qualification checkpoint identity does not match source and frozen jobs");
  }
  return actual;
}

export function assertCombinedArmsCheckpointCell(cell, identity, index) {
  if (Object.entries(identity).some(([field, value]) =>
      canonicalIntegrityJson(cell?.[field]) !== canonicalIntegrityJson(value))) {
    throw new Error(`combined-arms qualification cell ${index} contradicted its frozen job identity`);
  }
  return cell;
}

/**
 * Checkpoint bytes are restart hints, not qualification authority. A digest would be editable
 * beside the row, so the only useful trust boundary is a fresh physical replay under the same
 * frozen source and job identity.
 */
export function assertCombinedArmsCheckpointReplay(cached, replayed, index) {
  if (canonicalIntegrityJson(cached) !== canonicalIntegrityJson(replayed)) {
    throw new Error(`combined-arms qualification checkpoint cell ${index} did not reproduce independently`);
  }
  return cached;
}

const combinedArmsCheckpointCellPath = (output, index) => path.join(output, "cells",
  `${String(index).padStart(3, "0")}.json`);

const prepareCombinedArmsQualificationCheckpoint = async (output, expected) => {
  await mkdir(path.join(output, "cells"), { recursive: true });
  const statePath = path.join(output, "state.json");
  let prior = null;
  try { prior = JSON.parse(await readFile(statePath, "utf8")); }
  catch (error) { if (error?.code !== "ENOENT") throw error; }
  if (prior !== null) assertCombinedArmsCheckpointState(prior, expected);
  if (prior === null) {
    const temporary = `${statePath}.new`;
    await writeFile(temporary, canonicalIntegrityJson(expected) + "\n", "utf8");
    await rename(temporary, statePath);
  }
};

export async function readCombinedArmsQualificationCheckpointCell(output, identity, index,
  { required = false } = {}) {
  try {
    const savedCell = JSON.parse(await readFile(combinedArmsCheckpointCellPath(output, index), "utf8"));
    assertCombinedArmsCheckpointCell(savedCell, identity, index);
    return Object.freeze(savedCell);
  } catch (error) {
    if (error?.code === "ENOENT" && !required) return undefined;
    if (error?.code === "ENOENT") {
      throw new Error(`combined-arms qualification checkpoint omitted cell ${index}`, { cause: error });
    }
    throw new Error(`combined-arms qualification checkpoint cell ${index}: ${error.message}`, {
      cause: error,
    });
  }
}

/** Small-fixture convenience. The 560-cell runner deliberately never calls this collector. */
export async function readCombinedArmsQualificationCheckpoint(output, expected, manifest) {
  await prepareCombinedArmsQualificationCheckpoint(output, expected);
  const cells = new Array(manifest.length);
  for (let index = 0; index < manifest.length; index += 1) {
    cells[index] = await readCombinedArmsQualificationCheckpointCell(output, manifest[index], index);
  }
  return cells;
}

export async function writeCombinedArmsQualificationCheckpointCell(output, index, cell) {
  const target = combinedArmsCheckpointCellPath(output, index);
  const temporary = `${target}.new`;
  await writeFile(temporary, canonicalIntegrityJson(cell) + "\n", "utf8");
  await rename(temporary, target);
  return cell;
}

/**
 * Small-fixture oracle for canonical report bytes. Production uses the checkpoint-backed writer
 * below because receiving an already assembled report would itself retain the raw corpus.
 */
export async function writeCombinedArmsQualificationReport(target, report) {
  const handle = await open(target, "w");
  const write = (text) => handle.write(text, null, "utf8");
  try {
    await write(`{"durabilityLadder":${canonicalIntegrityJson(report.durabilityLadder)},"morphologies":[`);
    for (let morphologyAt = 0; morphologyAt < report.morphologies.length; morphologyAt += 1) {
      const morphology = report.morphologies[morphologyAt];
      if (morphologyAt > 0) await write(",");
      await write(`{"id":${canonicalIntegrityJson(morphology.id)},"qualifierId":${canonicalIntegrityJson(morphology.qualifierId)},"rungs":[`);
      for (let rungAt = 0; rungAt < morphology.rungs.length; rungAt += 1) {
        const rung = morphology.rungs[rungAt];
        if (rungAt > 0) await write(",");
        await write("{\"cells\":[");
        for (let cellAt = 0; cellAt < rung.cells.length; cellAt += 1) {
          if (cellAt > 0) await write(",");
          await write(canonicalIntegrityJson(rung.cells[cellAt]));
        }
        await write(`],"durabilityMultiplier":${canonicalIntegrityJson(rung.durabilityMultiplier)},"evaluation":${canonicalIntegrityJson(rung.evaluation)}}`);
      }
      await write(`],"selectedDurabilityMultiplier":${canonicalIntegrityJson(morphology.selectedDurabilityMultiplier)}}`);
    }
    await write(`],"runDigest":${canonicalIntegrityJson(report.runDigest)},"seeds":${canonicalIntegrityJson(report.seeds)},` +
      `"sides":${canonicalIntegrityJson(report.sides)},"sourceDigest":${canonicalIntegrityJson(report.sourceDigest)},` +
      `"sourceDigestAfter":${canonicalIntegrityJson(report.sourceDigestAfter)},` +
      `"sourceDigestBefore":${canonicalIntegrityJson(report.sourceDigestBefore)},` +
      `"status":${canonicalIntegrityJson(report.status)},"version":${canonicalIntegrityJson(report.version)}}\n`);
  } finally {
    await handle.close();
  }
}

const combinedArmsCellsPerRung = COMBINED_ARMS_SEEDS.length * COMBINED_ARMS_SIDES.length * 2;

const readCombinedArmsRungFromCheckpoint = async (output, manifest, start) => {
  const cells = [];
  for (let offset = 0; offset < combinedArmsCellsPerRung; offset += 1) {
    cells.push(await readCombinedArmsQualificationCheckpointCell(output, manifest[start + offset],
      start + offset, { required: true }));
  }
  return cells;
};

/**
 * Reconstruct one 16-cell rung at a time, then make a second bounded pass for the exact historical
 * digest grammar. The returned receipt has no raw cells; report.json remains their authority.
 */
export async function finalizeCombinedArmsQualificationCheckpoint(output, manifest,
  sourceDigestBefore, sourceDigestAfter) {
  if (sourceDigestAfter !== sourceDigestBefore) {
    throw new Error("combined-arms qualification runtime source changed during qualification");
  }
  let cursor = 0;
  const morphologies = [];
  for (const morphology of COMBINED_ARMS_MORPHOLOGIES) {
    const rungs = [];
    for (const durabilityMultiplier of COMBINED_ARMS_DURABILITY_LADDER) {
      const cells = await readCombinedArmsRungFromCheckpoint(output, manifest, cursor);
      cursor += combinedArmsCellsPerRung;
      rungs.push(Object.freeze({ durabilityMultiplier,
        evaluation: reconstructCombinedArmsRung(morphology.id, cells, durabilityMultiplier) }));
    }
    morphologies.push(Object.freeze({ id: morphology.id, qualifierId: morphology.qualifierId,
      rungs: Object.freeze(rungs), selectedDurabilityMultiplier: selectLowestPassingRung(rungs) }));
  }
  if (cursor !== manifest.length) {
    throw new Error(`combined-arms qualification manifest has ${manifest.length - cursor} trailing cells`);
  }
  const receipt = { version: COMBINED_ARMS_QUALIFICATION_VERSION,
    seeds: COMBINED_ARMS_SEEDS, sides: COMBINED_ARMS_SIDES,
    durabilityLadder: COMBINED_ARMS_DURABILITY_LADDER,
    sourceDigestBefore, sourceDigestAfter, sourceDigest: sourceDigestBefore,
    morphologies: Object.freeze(morphologies) };
  let folded = beginCombinedArmsRunDigest(receipt);
  cursor = 0;
  for (const morphology of morphologies) {
    folded = foldCombinedArmsRunDigest(folded, "morphology", { id: morphology.id,
      qualifierId: morphology.qualifierId,
      selectedDurabilityMultiplier: morphology.selectedDurabilityMultiplier });
    for (const rung of morphology.rungs) {
      folded = foldCombinedArmsRunDigest(folded, "rung",
        { durabilityMultiplier: rung.durabilityMultiplier, evaluation: rung.evaluation });
      const cells = await readCombinedArmsRungFromCheckpoint(output, manifest, cursor);
      cursor += combinedArmsCellsPerRung;
      for (const cell of cells) folded = foldCombinedArmsRunDigest(folded, "cell", cell);
    }
  }
  receipt.runDigest = folded;
  receipt.status = morphologies.every(({ selectedDurabilityMultiplier }) =>
    selectedDurabilityMultiplier !== null) ? "qualified" : "rejected";
  return Object.freeze(receipt);
}

/** Stream canonical full evidence from checkpoint cells without rebuilding a raw report object. */
export async function writeCombinedArmsQualificationCheckpointReport(target, receipt, output,
  manifest) {
  const handle = await open(target, "w");
  const write = (text) => handle.write(text, null, "utf8");
  let cursor = 0;
  try {
    await write(`{"durabilityLadder":${canonicalIntegrityJson(receipt.durabilityLadder)},"morphologies":[`);
    for (let morphologyAt = 0; morphologyAt < receipt.morphologies.length; morphologyAt += 1) {
      const morphology = receipt.morphologies[morphologyAt];
      if (morphologyAt > 0) await write(",");
      await write(`{"id":${canonicalIntegrityJson(morphology.id)},"qualifierId":${canonicalIntegrityJson(morphology.qualifierId)},"rungs":[`);
      for (let rungAt = 0; rungAt < morphology.rungs.length; rungAt += 1) {
        const rung = morphology.rungs[rungAt];
        if (rungAt > 0) await write(",");
        await write("{\"cells\":[");
        const cells = await readCombinedArmsRungFromCheckpoint(output, manifest, cursor);
        cursor += combinedArmsCellsPerRung;
        for (let cellAt = 0; cellAt < cells.length; cellAt += 1) {
          if (cellAt > 0) await write(",");
          await write(canonicalIntegrityJson(cells[cellAt]));
        }
        await write(`],"durabilityMultiplier":${canonicalIntegrityJson(rung.durabilityMultiplier)},"evaluation":${canonicalIntegrityJson(rung.evaluation)}}`);
      }
      await write(`],"selectedDurabilityMultiplier":${canonicalIntegrityJson(morphology.selectedDurabilityMultiplier)}}`);
    }
    await write(`],"runDigest":${canonicalIntegrityJson(receipt.runDigest)},"seeds":${canonicalIntegrityJson(receipt.seeds)},` +
      `"sides":${canonicalIntegrityJson(receipt.sides)},"sourceDigest":${canonicalIntegrityJson(receipt.sourceDigest)},` +
      `"sourceDigestAfter":${canonicalIntegrityJson(receipt.sourceDigestAfter)},` +
      `"sourceDigestBefore":${canonicalIntegrityJson(receipt.sourceDigestBefore)},` +
      `"status":${canonicalIntegrityJson(receipt.status)},"version":${canonicalIntegrityJson(receipt.version)}}\n`);
    if (cursor !== manifest.length) {
      throw new Error(`combined-arms qualification report left ${manifest.length - cursor} checkpoint cells`);
    }
  } finally {
    await handle.close();
  }
}

/**
 * The frozen 560-bout qualification. Workers change only scheduling: jobs are assigned and
 * aggregated by index, and source identity is checked around the complete run. The physical bout
 * recorder must publish raw qualificationEvents; missing evidence produces an honest rejected
 * report rather than a summary inferred from winner counters.
 */
export async function runCombinedArmsQualification({ workers = 8, outDirectory = null } = {}) {
  if (!Number.isSafeInteger(workers) || workers <= 0) {
    throw new Error("combined-arms qualification workers must be a positive safe integer");
  }
  if (outDirectory === null) {
    throw new Error("combined-arms qualification requires --out so raw evidence remains disk-backed");
  }
  const sourceDigestBefore = await constructQualificationSourceFingerprint();
  const definitions = combinedArmsDefinitions();
  const jobs = [];
  for (const definition of definitions) for (const durabilityMultiplier of COMBINED_ARMS_DURABILITY_LADDER) {
    const active = withDurabilityMultiplier(definition.baseSaved, durabilityMultiplier, definition.sensors);
    const idle = postureOnlySavedConstruct(active, definition.sensors);
    for (const seed of COMBINED_ARMS_SEEDS) for (const constructSide of COMBINED_ARMS_SIDES) {
      const warriorLoadout = combinedArmsWarriorLoadout(definition.id, seed);
      jobs.push(Object.freeze({ definition, durabilityMultiplier, mode: "idle", saved: idle,
        seed, constructSide, warriorLoadout }));
      jobs.push(Object.freeze({ definition, durabilityMultiplier, mode: "active", saved: active,
        seed, constructSide, warriorLoadout }));
    }
  }
  const manifest = jobs.map(({ definition, durabilityMultiplier, mode, saved, seed, constructSide,
    warriorLoadout }) =>
    Object.freeze({ morphologyId: definition.id, qualifierId: definition.qualifierId,
      durabilityMultiplier, mode, seed, constructSide, warriorLoadout,
      blueprintDigest: saved.digests.blueprint,
      controlDigest: saved.digests.control, programDigest: saved.digests.program }));
  const manifestDigest = integrityDigest(canonicalIntegrityJson(manifest));
  const output = path.resolve(outDirectory);
  const expected = { version: 2, sourceDigest: sourceDigestBefore, manifestDigest,
    cells: jobs.length };
  await prepareCombinedArmsQualificationCheckpoint(output, expected);
  // Every cached cell is replayed. Fresh cells run once; resumed cells run once in this process
  // and must reproduce byte-for-byte before either copy can reach finalization. This deliberately
  // makes a fully resumed qualifying run cost one full matrix: local files are not signatures.
  const assignments = jobs.map((job, index) => Object.freeze({ job, index }));
  await runCombinedArmsJobsInWorkers({ assignments, workers,
    onResult: async (index, bout) => {
    const job = jobs[index];
    const cell = combinedArmsCell(job.definition, job.saved, job.mode, job.seed, job.constructSide,
      job.warriorLoadout,
      job.durabilityMultiplier, bout);
    const checkpointCell = await readCombinedArmsQualificationCheckpointCell(output,
      manifest[index], index);
    if (checkpointCell !== undefined) assertCombinedArmsCheckpointReplay(checkpointCell, cell, index);
    await writeCombinedArmsQualificationCheckpointCell(output, index, cell);
  }, retainResults: false });
  const sourceDigestAfter = await constructQualificationSourceFingerprint();
  const receipt = await finalizeCombinedArmsQualificationCheckpoint(output, manifest,
    sourceDigestBefore, sourceDigestAfter);
  const target = path.join(output, "report.json");
  const temporary = `${target}.new`;
  await writeCombinedArmsQualificationCheckpointReport(temporary, receipt, output, manifest);
  await rename(temporary, target);
  return Object.freeze({ ...receipt, reportPath: target, cells: jobs.length });
}

// Filled from the pinned resized-body baseline, never from a convenient single seed.
export const CONSTRUCT_WARRIOR_CURRICULUM_ACCEPTANCE = Object.freeze({
  version: 4,
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
 * Recovery-aware assisted-support v2 rerun on 2026-08-31. After living fallen bodies began
 * reserving recovery space, the corrected 2.40 m retreat and 1.90 heavy bolt restored x0.10 to
 * 8/8 qualified wins (left 4, right 4). The authored-clearance rerun kept that floor after moving
 * the launcher 0.20 m outboard/forward, narrowing its bow and moving the downed lane to +0.15 m.
 * The same-body posture-only baseline dies 8/8. The fragile Mind reads saved launcher capacity
 * and times pressure during a rise. Ordinary full-health hardware waits for restored support, or
 * gives an opponent that remains prone 1.25 seconds before a separately aimed finishing shot;
 * that branch is outside these fast fragile cells.
 */
export const ARBALEST_WARRIOR_CURRICULUM_ACCEPTANCE = Object.freeze({
  version: 4,
  qualified: false,
  status: "historical-v1-combat-units",
  reason: "combat-value ruleset v2 requires fresh Session-30 qualification",
  seeds: CONSTRUCT_WARRIOR_CURRICULUM_SEEDS,
  sides: CONSTRUCT_WARRIOR_CURRICULUM_SIDES,
  seconds: CONSTRUCT_WARRIOR_CURRICULUM_SECONDS,
  durabilityMultiplier: CONSTRUCT_WARRIOR_DEFAULT_DURABILITY_MULTIPLIER,
  qualifierId: ARBALEST_QUALIFIER_ID,
  constructBlueprintId: "arbalest-effigy",
  activeProgramId: "arbalest-effigy-mind",
  controlDigest: "0f542c4c",
  historical: Object.freeze({ combatValueUnitVersion: 1, blueprintDigest: "1cfdf5d7",
    activeProgramDigest: "d89e988b", qualifiedWins: 8, cells: 8 }),
});

export function assertConstructWarriorCurriculum(report,
  thresholds = CONSTRUCT_WARRIOR_CURRICULUM_ACCEPTANCE) {
  const failures = [];
  if (thresholds.qualified === false) failures.push(thresholds.reason);
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
  const known = new Set(["--arbalest", "--durability-ladder", "--combined-arms"]);
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

export function parseCombinedArmsQualificationArgs(args) {
  const known = new Set(["--combined-arms", "--workers", "--out"]);
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!known.has(argument)) throw new Error(`unknown combined-arms qualification flag ${JSON.stringify(argument)}`);
    if (argument === "--workers" || argument === "--out") index += 1;
  }
  const valueAfter = (flag) => {
    const at = args.indexOf(flag);
    if (at < 0) return null;
    const value = args[at + 1];
    if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
    if (args.indexOf(flag, at + 1) >= 0) throw new Error(`${flag} may be supplied only once`);
    return value;
  };
  const workerText = valueAfter("--workers");
  const workers = workerText === null ? 8 : Number(workerText);
  if (!Number.isSafeInteger(workers) || workers <= 0) {
    throw new Error("--workers must be a positive safe integer");
  }
  const outDirectory = valueAfter("--out");
  if (outDirectory === null) {
    throw new Error("combined-arms qualification requires --out so raw evidence remains disk-backed");
  }
  return Object.freeze({ workers, outDirectory });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes("--combined-arms")) {
    const options = parseCombinedArmsQualificationArgs(process.argv.slice(2));
    const report = await runCombinedArmsQualification(options);
    const terminal = Object.freeze({ status: report.status, runDigest: report.runDigest,
      sourceDigest: report.sourceDigest, cells: report.cells, reportPath: report.reportPath,
      selectedDurabilityMultipliers: Object.freeze(Object.fromEntries(report.morphologies
        .map(({ id, selectedDurabilityMultiplier }) => [id, selectedDurabilityMultiplier]))) });
    process.stdout.write(`${canonicalIntegrityJson(terminal)}\n`);
    process.exitCode = report.status === "qualified" ? 0 : 2;
  } else {
  const ladder = process.argv.includes("--durability-ladder");
  const definition = curriculumDefinitionForArgs(process.argv.slice(2));
  const report = ladder ? await runConstructWarriorDurabilityLadder(definition
    ? { active: definition.saved, sensors: definition.sensors } : {})
    : await runConstructWarriorCurriculum(definition ? { definition } : {});
  if (!ladder) assertConstructWarriorCurriculum(report, curriculumAcceptanceForDefinition(definition));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  }
}
