import { pathToFileURL } from "node:url";

import { CONFIG } from "../src/config.ts";
import { saveConstruct } from "../src/construct/codec.ts";
import { arbalestSavedConstruct, ARBALEST_SENSORS } from "../src/construct/arbalest.ts";
import { constructProfileForBlueprint } from "../src/construct/construct.ts";
import { humanoidSavedConstruct, HUMANOID_SENSORS } from "../src/construct/humanoid.ts";
import { twinbladeSavedConstruct, TWINBLADE_SENSORS } from "../src/construct/twinblade.ts";
import { runConstructWarriorBout } from "./construct-warrior-bout.mjs";
import { SUPPORTED_LOCOMOTION_V1 } from "../src/supported-locomotion-state.ts";
import { assertScaledSupportedLocomotionCorpus,
  runScaledSupportedLocomotionCorpus } from "./scaled-supported-locomotion.mjs";
import { assertPhysicalObstacleCorpus,
  runPhysicalObstacleCorpus } from "./supported-locomotion-physical-obstacles.mjs";
import { assertSupportedLocomotionBoundaryCorpus,
  runSupportedLocomotionBoundaryCorpus } from "./supported-locomotion-boundaries.mjs";
import { assertWarriorWarriorLocomotionCorpus,
  runWarriorWarriorLocomotionCorpus } from "./warrior-warrior-locomotion.mjs";

export const CONSTRUCT_WARRIOR_LOCOMOTION_V1 = Object.freeze({
  version: 2,
  physicsHz: 240,
  maxSteps: 1920,
  initialSeparationM: 2.40,
  minimumClosureM: 0.75,
  maximumFootprintPenetrationM: 0.020,
  minimumWarriorPelvisUp: 0.72,
  minimumWarriorTorsoAbovePelvisM: 0.25,
  minimumWarriorHeadAboveTorsoM: 0.25,
  // This reporter mirrors the carrier's actual bounded clinch bridge. Keeping a second shorter
  // literal here made valid falling/rising intervals fail the corpus even though every retained
  // per-step row showed live topology and a completed recovery.
  supportGraceS: SUPPORTED_LOCOMOTION_V1.SUPPORT_GRACE_S,
});

const CHASSIS = Object.freeze([
  Object.freeze({ id: "swordbearer", saved: humanoidSavedConstruct, sensors: HUMANOID_SENSORS }),
  Object.freeze({ id: "twinblade", saved: twinbladeSavedConstruct, sensors: TWINBLADE_SENSORS }),
  Object.freeze({ id: "arbalest", saved: arbalestSavedConstruct, sensors: ARBALEST_SENSORS }),
]);
const SIDES = Object.freeze(["left", "right"]);

const constant = (value, unit) => Object.freeze({ op: "constant", value, ...(unit ? { unit } : {}) });
const sensor = (id) => Object.freeze({ op: "sensor", id });
const compare = (op, left, right) => Object.freeze({ op, left, right });
const parameter = (value) => Object.freeze({ kind: "expression", value });

/** Attack-free oscillating closure/retreat fixture over the body's real public move Action. */
export function locomotionExerciseSaved(saved, sensors) {
  const rules = [
    { id: "close", action: "move", priority: 60, optional: false, dwellS: 0,
      condition: compare("gte", sensor("opponent-range"), constant(1.48, "metres")),
      utility: constant(10), parameters: { forward: parameter(constant(1)),
        right: parameter(constant(0)), speed: parameter(constant(1.2, "metres-per-second")) } },
    { id: "retreat", action: "move", priority: 60, optional: false, dwellS: 0,
      condition: compare("lt", sensor("opponent-range"), constant(1.48, "metres")),
      utility: constant(10), parameters: { forward: parameter(constant(-1)),
        right: parameter(constant(0)), speed: parameter(constant(0.8, "metres-per-second")) } },
    { id: "stabilize", action: "stabilize", priority: 10, optional: false, dwellS: 0,
      condition: constant(true), utility: constant(1), parameters: {} },
  ];
  if (saved.control.actions.some(({ id }) => id === "dual-mount-neutral")) rules.splice(2, 0,
    { id: "neutral", action: "dual-mount-neutral", priority: 20, optional: false, dwellS: 0,
      condition: constant(true), utility: constant(2), parameters: {} });
  const program = Object.freeze({ version: 1, id: `${saved.blueprint.id}-locomotion-exercise-v1`,
    rules: Object.freeze(rules.map((rule) => Object.freeze({ ...rule,
      parameters: Object.freeze(rule.parameters) }))) });
  return saveConstruct(`${saved.name} -- locomotion exercise`, saved.blueprint, saved.control,
    program, sensors);
}

export const CONSTRUCT_WARRIOR_LOCOMOTION_OWED = Object.freeze([]);

const finite = (...values) => values.every(Number.isFinite);
const round = (value) => Math.round(value * 1e9) / 1e9;

function physicalCell(chassis, constructSide, mode, saved, bout) {
  const transitions = bout.locomotionTimeline;
  const steps = bout.locomotionSteps;
  const warriorPhysical = transitions.map(({ warriorPhysical }) => warriorPhysical).filter(Boolean);
  const profile = constructProfileForBlueprint(saved.blueprint);
  const footprintSeparationM = profile.collisionRadius + CONFIG.body.pelvisRadius;
  const closureM = bout.locomotion.initialRangeM - bout.minimumRangeM;
  const constructSupportStates = [...new Set(transitions.map(({ construct }) => construct?.state.state)
    .filter(Boolean))];
  const warriorSupportStates = [...new Set(transitions.map(({ warrior }) => warrior?.state.state)
    .filter(Boolean))];
  const maximumFreshSupportGapS = (body) => {
    let longest = 0; let current = 0;
    for (const step of steps) {
      const diagnostic = step[body];
      if (diagnostic?.state === "fallen" || diagnostic?.state === "rising" ||
          diagnostic?.freshSupportBindings.length > 0) current = 0;
      else { current += 1; longest = Math.max(longest, current); }
    }
    return longest / CONSTRUCT_WARRIOR_LOCOMOTION_V1.physicsHz;
  };
  const supportStateValid = (diagnostic) => diagnostic !== null &&
    (diagnostic.state === "fallen" || diagnostic.liveSupport === true);
  const support = Object.freeze({
    bothPortsObserved: steps.length === bout.steps && steps.every(({ construct, warrior }) =>
      construct !== null && warrior !== null),
    constructLiveThroughout: steps.length > 0 && steps.every(({ construct }) =>
      supportStateValid(construct)) && maximumFreshSupportGapS("construct") <=
        CONSTRUCT_WARRIOR_LOCOMOTION_V1.supportGraceS + 1e-12,
    warriorLiveThroughout: steps.length > 0 && steps.every(({ warrior }) =>
      supportStateValid(warrior)) && maximumFreshSupportGapS("warrior") <=
        CONSTRUCT_WARRIOR_LOCOMOTION_V1.supportGraceS + 1e-12,
    constructMaximumFreshGapS: maximumFreshSupportGapS("construct"),
    warriorMaximumFreshGapS: maximumFreshSupportGapS("warrior"),
    constructStates: Object.freeze(constructSupportStates),
    warriorStates: Object.freeze(warriorSupportStates),
  });
  const posture = Object.freeze({
    thresholds: bout.posture.thresholds,
    constructMinimumRootUp: bout.posture.minimumRootUp,
    constructMinimumTorsoHeightM: bout.posture.minimumTorsoHeightM,
    constructMinimumHeadAboveTorsoM: bout.posture.minimumHeadAboveTorsoM,
    constructFirstLossS: bout.posture.firstPostureLossS,
    constructValidThroughout: bout.posture.firstPostureLossS === null &&
      bout.posture.minimumRootUp > bout.posture.thresholds.minimumRootUp &&
      bout.posture.minimumTorsoHeightM > bout.posture.thresholds.minimumTorsoHeightM &&
      bout.posture.minimumHeadAboveTorsoM > bout.posture.thresholds.minimumHeadAboveTorsoM,
    warriorTransitionSamples: warriorPhysical.length,
    warriorValidThroughout: steps.length > 0 && steps.every(({ warrior }) =>
      warrior?.postureSupported === true) && warriorPhysical.length > 0 && warriorPhysical.every((sample) =>
      sample.pelvisUp > CONSTRUCT_WARRIOR_LOCOMOTION_V1.minimumWarriorPelvisUp &&
      sample.torsoHeightAbovePelvisM > CONSTRUCT_WARRIOR_LOCOMOTION_V1.minimumWarriorTorsoAbovePelvisM &&
      sample.headHeightAboveTorsoM > CONSTRUCT_WARRIOR_LOCOMOTION_V1.minimumWarriorHeadAboveTorsoM),
  });
  const combat = Object.freeze({ constructDamage: bout.construct.damage,
    warriorDamage: bout.warrior.damage, constructContacts: bout.constructContacts.length,
    warriorContacts: bout.warriorContacts.length });
  const warriorReleasedByCombat = !posture.warriorValidThroughout &&
    combat.constructContacts + combat.warriorContacts > 0 && warriorSupportStates.includes("fallen");
  const constructReleasedByCombat = !posture.constructValidThroughout &&
    combat.constructContacts + combat.warriorContacts > 0 && constructSupportStates.includes("fallen");
  const failures = [];
  if (bout.physics !== "real-havok-fixed-240hz") failures.push("not real fixed-step Havok");
  if (bout.locomotion.mode !== "supported") failures.push("pair did not select supported mode atomically");
  if (!support.bothPortsObserved) failures.push("both physical ports were not observed");
  if (!support.constructLiveThroughout || !support.warriorLiveThroughout) {
    failures.push("live fresh support was absent at a recorded state transition");
  }
  if (!posture.constructValidThroughout && !(mode === "combat" && constructReleasedByCombat)) {
    failures.push("the Construct physical posture predicate was lost without a physical combat release");
  }
  if (!posture.warriorValidThroughout && !warriorReleasedByCombat) {
    failures.push("the Warrior lost posture without a physical supported-to-fallen combat release");
  }
  if (mode === "no-attack" && !(closureM >= CONSTRUCT_WARRIOR_LOCOMOTION_V1.minimumClosureM)) {
    failures.push(`closure was only ${round(closureM)} m`);
  }
  const releasedByCombat = mode === "combat" && (constructReleasedByCombat || warriorReleasedByCombat);
  const separationFloor = footprintSeparationM -
    CONSTRUCT_WARRIOR_LOCOMOTION_V1.maximumFootprintPenetrationM;
  // A fallen carrier deliberately stops blocking its opponent, so ragdoll anatomy may cross the
  // carrier discs during an authored knockdown. Judge the retained separation there after both
  // bodies have had their recovery opportunity; attack-free and never-released cells still pin
  // the whole-stream minimum.
  const separationM = releasedByCombat ? bout.locomotion.finalRangeM : bout.minimumRangeM;
  if (!(separationM >= separationFloor)) {
    failures.push(`${releasedByCombat ? "final" : "minimum"} range ${round(separationM)} m penetrated the declared footprints`);
  }
  if (mode === "combat" && !(combat.constructContacts + combat.warriorContacts > 0)) {
    failures.push("the real-combat cell produced no physical weapon contact");
  }
  if (mode === "no-attack" && (combat.constructDamage !== 0 || combat.warriorDamage !== 0)) {
    failures.push("the attack-free closure cell produced damage");
  }
  const requestedForward = bout.locomotionSteps.map(({ construct }) => construct?.requested?.localForward ?? 0);
  if (mode === "no-attack" && (!requestedForward.some((value) => value > 0) ||
      !requestedForward.some((value) => value < 0))) {
    failures.push("the attack-free cell did not retain both inward and retreat drive");
  }
  if (!finite(bout.minimumRangeM, bout.locomotion.initialRangeM, bout.locomotion.finalRangeM,
    bout.locomotion.constructRootDisplacementM, bout.locomotion.warriorRootDisplacementM,
    combat.constructDamage, combat.warriorDamage)) failures.push("a physical measurement was non-finite");

  return Object.freeze({ id: `${chassis}-${mode}-${constructSide}`, chassis, constructSide, mode,
    schedulerOrder: constructSide === "left" ? "construct-then-warrior" : "warrior-then-construct",
    physics: bout.physics, steps: bout.steps, simulatedSeconds: bout.simulatedSeconds,
    locomotionMode: bout.locomotion.mode,
    range: Object.freeze({ initialM: bout.locomotion.initialRangeM, minimumM: bout.minimumRangeM,
      finalM: bout.locomotion.finalRangeM, closureM,
      footprintSeparationM, maximumAllowedPenetrationM:
        CONSTRUCT_WARRIOR_LOCOMOTION_V1.maximumFootprintPenetrationM }),
    roots: Object.freeze({ constructDisplacementM: bout.locomotion.constructRootDisplacementM,
      warriorDisplacementM: bout.locomotion.warriorRootDisplacementM }),
    support, supportSteps: bout.locomotionSteps, posture, combat, warriorReleasedByCombat,
    constructReleasedByCombat,
    qualified: failures.length === 0, failures: Object.freeze(failures) });
}

export async function runConstructWarriorLocomotionCorpus({
  boutRunner = runConstructWarriorBout,
  maxSteps = CONSTRUCT_WARRIOR_LOCOMOTION_V1.maxSteps,
} = {}) {
  if (!Number.isInteger(maxSteps) || maxSteps <= 0) throw new Error("locomotion corpus maxSteps must be positive integer");
  if (CONFIG.world.physicsHz !== CONSTRUCT_WARRIOR_LOCOMOTION_V1.physicsHz) {
    throw new Error(`locomotion corpus requires ${CONSTRUCT_WARRIOR_LOCOMOTION_V1.physicsHz} Hz physics`);
  }
  const cells = [];
  for (const chassis of CHASSIS) {
    for (const constructSide of SIDES) {
      const saved = chassis.saved();
      const exercise = locomotionExerciseSaved(saved, chassis.sensors);
      const noAttack = await boutRunner({ saved: exercise, sensors: chassis.sensors, warriorPolicy: "idle",
        warriorLoadout: { primary: "empty", secondary: "empty" }, constructSide,
        separationM: CONSTRUCT_WARRIOR_LOCOMOTION_V1.initialSeparationM, maxSteps });
      cells.push(physicalCell(chassis.id, constructSide, "no-attack", exercise, noAttack));
      const combat = await boutRunner({ saved, sensors: chassis.sensors, warriorPolicy: "duelist",
        constructSide, separationM: CONSTRUCT_WARRIOR_LOCOMOTION_V1.initialSeparationM, maxSteps });
      cells.push(physicalCell(chassis.id, constructSide, "combat", saved, combat));
    }
  }
  const warriorWarrior = assertWarriorWarriorLocomotionCorpus(
    await runWarriorWarriorLocomotionCorpus());
  const scaled = assertScaledSupportedLocomotionCorpus(await runScaledSupportedLocomotionCorpus());
  const obstacles = assertPhysicalObstacleCorpus(await runPhysicalObstacleCorpus());
  const boundaries = assertSupportedLocomotionBoundaryCorpus(
    await runSupportedLocomotionBoundaryCorpus());
  const evidence = Object.freeze({ warriorWarrior, scaled, obstacles, boundaries });
  const companionPhysicalCells = warriorWarrior.cells.length + scaled.cells.length +
    obstacles.cells.length + boundaries.cells.length;
  const qualifiedCells = cells.filter(({ qualified }) => qualified).length + companionPhysicalCells;
  const summary = Object.freeze({ physicalCells: cells.length + companionPhysicalCells,
    constructWarriorPhysicalCells: cells.length,
    warriorWarriorPhysicalCells: warriorWarrior.cells.length,
    scaledPhysicalCells: scaled.cells.length,
    obstaclePhysicalCells: obstacles.cells.length,
    boundaryPhysicalCells: boundaries.cells.length,
    qualifiedCells,
    owedCells: CONSTRUCT_WARRIOR_LOCOMOTION_OWED.length,
    minimumClosureM: Math.min(...cells.map(({ range }) => range.closureM)),
    minimumRangeM: Math.min(...cells.map(({ range }) => range.minimumM)),
    totalDamage: cells.reduce((sum, { combat }) =>
      sum + combat.constructDamage + combat.warriorDamage, 0) });
  return Object.freeze({ version: CONSTRUCT_WARRIOR_LOCOMOTION_V1.version,
    fixture: CONSTRUCT_WARRIOR_LOCOMOTION_V1,
    scope: "complete real-Havok supported-locomotion acceptance matrix",
    cells: Object.freeze(cells), evidence, owed: CONSTRUCT_WARRIOR_LOCOMOTION_OWED, summary });
}

export function assertConstructWarriorLocomotionCorpus(report) {
  if (report.version !== CONSTRUCT_WARRIOR_LOCOMOTION_V1.version ||
      JSON.stringify(report.fixture) !== JSON.stringify(CONSTRUCT_WARRIOR_LOCOMOTION_V1)) {
    throw new Error("supported locomotion physical corpus failed: the frozen fixture changed");
  }
  if (report.cells.length !== CHASSIS.length * SIDES.length * 2) {
    throw new Error(`locomotion corpus expected ${CHASSIS.length * SIDES.length * 2} physical cells`);
  }
  const expected = CHASSIS.flatMap(({ id }) => SIDES.flatMap((side) =>
    ["no-attack", "combat"].map((mode) => `${id}-${mode}-${side}`)));
  if (JSON.stringify(report.cells.map(({ id }) => id)) !== JSON.stringify(expected)) {
    throw new Error("locomotion corpus cell matrix changed");
  }
  const failures = [];
  for (const cell of report.cells) {
    const prefix = (failure) => failures.push(`${cell.id}: ${failure}`);
    if (cell.physics !== "real-havok-fixed-240hz") prefix("not real fixed-step Havok");
    if (cell.locomotionMode !== "supported") prefix("pair did not select supported mode atomically");
    if (!Array.isArray(cell.supportSteps) || cell.supportSteps.length !== cell.steps ||
        cell.supportSteps.some(({ construct, warrior }) => construct === null || warrior === null)) {
      prefix("retained support rows did not cover both ports on every step");
    } else {
      const maximumFreshSupportGapS = (body) => {
        let longest = 0; let current = 0;
        for (const step of cell.supportSteps) {
          const diagnostic = step[body];
          if (diagnostic.state === "fallen" || diagnostic.state === "rising" ||
              diagnostic.freshSupportBindings.length > 0) current = 0;
          else { current += 1; longest = Math.max(longest, current); }
        }
        return longest / CONSTRUCT_WARRIOR_LOCOMOTION_V1.physicsHz;
      };
      const constructGap = maximumFreshSupportGapS("construct");
      const warriorGap = maximumFreshSupportGapS("warrior");
      const constructLive = cell.supportSteps.every(({ construct }) =>
        construct.state === "fallen" || construct.liveSupport === true) &&
        constructGap <= report.fixture.supportGraceS + 1e-12;
      const warriorLive = cell.supportSteps.every(({ warrior }) =>
        warrior.state === "fallen" || warrior.liveSupport === true) &&
        warriorGap <= report.fixture.supportGraceS + 1e-12;
      const constructStates = [...new Set(cell.supportSteps.map(({ construct }) => construct.state))];
      const warriorStates = [...new Set(cell.supportSteps.map(({ warrior }) => warrior.state))];
      if (!constructLive || constructLive !== cell.support.constructLiveThroughout ||
          !warriorLive || warriorLive !== cell.support.warriorLiveThroughout ||
          Math.abs(constructGap - cell.support.constructMaximumFreshGapS) > 1e-12 ||
          Math.abs(warriorGap - cell.support.warriorMaximumFreshGapS) > 1e-12 ||
          JSON.stringify(constructStates) !== JSON.stringify(cell.support.constructStates) ||
          JSON.stringify(warriorStates) !== JSON.stringify(cell.support.warriorStates)) {
        prefix("support summary contradicted retained per-step authority evidence");
      }
    }
    const closureM = cell.range.initialM - cell.range.minimumM;
    if (!Number.isFinite(closureM) || Math.abs(closureM - cell.range.closureM) > 1e-9 ||
      (cell.mode === "no-attack" && closureM < CONSTRUCT_WARRIOR_LOCOMOTION_V1.minimumClosureM)) {
      prefix("closure evidence was below or contradicted the threshold");
    }
    const releasedByCombat = cell.mode === "combat" &&
      (cell.constructReleasedByCombat || cell.warriorReleasedByCombat);
    const separationM = releasedByCombat ? cell.range.finalM : cell.range.minimumM;
    if (!Number.isFinite(separationM) ||
        separationM < cell.range.footprintSeparationM - cell.range.maximumAllowedPenetrationM) {
      prefix(`retained ${releasedByCombat ? "final" : "minimum"} range penetrated the declared footprints`);
    }
    const constructPosture = cell.posture.constructFirstLossS === null &&
      cell.posture.constructMinimumRootUp > cell.posture.thresholds.minimumRootUp &&
      cell.posture.constructMinimumTorsoHeightM > cell.posture.thresholds.minimumTorsoHeightM &&
      cell.posture.constructMinimumHeadAboveTorsoM > cell.posture.thresholds.minimumHeadAboveTorsoM;
    const physicalContacts = cell.combat.constructContacts + cell.combat.warriorContacts;
    const constructReleased = !constructPosture && physicalContacts > 0 &&
      cell.supportSteps.some(({ construct }) => construct.state === "fallen");
    if (constructPosture !== cell.posture.constructValidThroughout ||
        constructReleased !== cell.constructReleasedByCombat ||
        (!constructPosture && !(cell.mode === "combat" && constructReleased))) {
      prefix("Construct posture summary contradicted retained extrema");
    }
    const warriorPosture = cell.supportSteps.every(({ warrior }) => warrior.postureSupported === true);
    const warriorReleased = !warriorPosture && physicalContacts > 0 &&
      cell.supportSteps.some(({ warrior }) => warrior.state === "fallen");
    if (warriorPosture !== cell.posture.warriorValidThroughout ||
        warriorReleased !== cell.warriorReleasedByCombat ||
        !(warriorPosture || (cell.mode === "combat" && warriorReleased))) {
      prefix("Warrior posture loss was not an authored damaging release");
    }
    if (cell.mode === "combat" && !(cell.combat.constructContacts + cell.combat.warriorContacts > 0)) {
      prefix("combat evidence was empty");
    }
    if (cell.mode === "no-attack" && (cell.combat.constructDamage !== 0 || cell.combat.warriorDamage !== 0)) {
      prefix("attack-free evidence contained damage");
    }
    if (cell.mode === "no-attack" && (!cell.supportSteps.some(({ construct }) =>
      (construct?.requested?.localForward ?? 0) > 0) || !cell.supportSteps.some(({ construct }) =>
      (construct?.requested?.localForward ?? 0) < 0))) prefix("attack-free drive lacked closure or retreat");
    if (![cell.roots.constructDisplacementM, cell.roots.warriorDisplacementM]
      .every(Number.isFinite)) prefix("root evidence was non-finite");
    if (cell.qualified !== (cell.failures.length === 0)) prefix("qualified flag contradicted cell failures");
  }
  if (failures.length > 0) throw new Error(`supported locomotion physical corpus failed: ${failures.join("; ")}`);
  assertWarriorWarriorLocomotionCorpus(report.evidence?.warriorWarrior ?? {});
  assertScaledSupportedLocomotionCorpus(report.evidence?.scaled ?? {});
  assertPhysicalObstacleCorpus(report.evidence?.obstacles ?? {});
  assertSupportedLocomotionBoundaryCorpus(report.evidence?.boundaries ?? {});
  const companionCounts = Object.freeze({
    warriorWarriorPhysicalCells: report.evidence.warriorWarrior.cells.length,
    scaledPhysicalCells: report.evidence.scaled.cells.length,
    obstaclePhysicalCells: report.evidence.obstacles.cells.length,
    boundaryPhysicalCells: report.evidence.boundaries.cells.length,
  });
  const recomputed = report.cells.filter(({ qualified }) => qualified).length +
    Object.values(companionCounts).reduce((sum, value) => sum + value, 0);
  const expectedPhysical = report.cells.length + Object.values(companionCounts)
    .reduce((sum, value) => sum + value, 0);
  if (report.summary.qualifiedCells !== recomputed || recomputed !== expectedPhysical ||
      report.summary.physicalCells !== expectedPhysical ||
      report.summary.constructWarriorPhysicalCells !== report.cells.length ||
      Object.entries(companionCounts).some(([key, value]) => report.summary[key] !== value)) {
    throw new Error("locomotion corpus summary does not match retained physical cells");
  }
  const minimumClosureM = Math.min(...report.cells.map(({ range }) => range.closureM));
  const minimumRangeM = Math.min(...report.cells.map(({ range }) => range.minimumM));
  const totalDamage = report.cells.reduce((sum, { combat }) =>
    sum + combat.constructDamage + combat.warriorDamage, 0);
  if (report.summary.minimumClosureM !== minimumClosureM ||
      report.summary.minimumRangeM !== minimumRangeM || report.summary.totalDamage !== totalDamage) {
    throw new Error("locomotion corpus aggregate contradicted retained Construct/Warrior cells");
  }
  if (!Array.isArray(report.owed) || report.owed.length !== 0 || report.summary.owedCells !== 0) {
    throw new Error("completed locomotion cells were incorrectly reported as owed");
  }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await runConstructWarriorLocomotionCorpus();
  assertConstructWarriorLocomotionCorpus(report);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
