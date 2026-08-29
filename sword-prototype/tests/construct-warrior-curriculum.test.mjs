import assert from "node:assert/strict";
import test from "node:test";

import { humanoidSavedConstruct } from "../src/construct/humanoid.ts";
import { twinbladeSavedConstruct, TWINBLADE_SENSORS } from "../src/construct/twinblade.ts";
import { assertConstructWarriorCurriculum, CONSTRUCT_WARRIOR_CURRICULUM_ACCEPTANCE,
  ARBALEST_WARRIOR_CURRICULUM_ACCEPTANCE, curriculumAcceptanceForDefinition,
  curriculumDefinitionForArgs,
  CONSTRUCT_WARRIOR_CURRICULUM_SEEDS, CONSTRUCT_WARRIOR_DEFAULT_DURABILITY_MULTIPLIER,
  CONSTRUCT_WARRIOR_DURABILITY_LADDER, postureOnlySavedConstruct,
  runConstructWarriorCurriculum, runConstructWarriorDurabilityLadder,
  withDurabilityMultiplier } from "../scripts/construct-warrior-curriculum.mjs";

test("the_curriculum_seed_corpus_and_posture_only_baseline_are_frozen_before_balance_tuning", () => {
  assert.deepEqual(CONSTRUCT_WARRIOR_CURRICULUM_SEEDS, [4140987459, 4124209840, 4174542697, 4157765078]);
  const active = humanoidSavedConstruct();
  const idle = postureOnlySavedConstruct(active);
  assert.equal(idle.digests.blueprint, active.digests.blueprint);
  assert.equal(idle.digests.control, active.digests.control);
  assert.deepEqual(idle.program.rules.map(({ action }) => action), ["brace", "stabilize"]);
  assert.equal(idle.program.rules.some(({ action }) => action === "guard" || action === "sweep"), false);
});

test("the_Arbalest_CLI_flag_selects_its_committed_definition_and_earned_acceptance", () => {
  assert.equal(curriculumDefinitionForArgs([]), null);
  const definition = curriculumDefinitionForArgs(["--arbalest"]);
  assert.equal(definition.qualifierId, "arbalest-fatal-arrow-v1");
  assert.equal(definition.saved.blueprint.id, "arbalest-effigy");
  assert.equal(curriculumAcceptanceForDefinition(null), CONSTRUCT_WARRIOR_CURRICULUM_ACCEPTANCE);
  assert.equal(curriculumAcceptanceForDefinition(definition), ARBALEST_WARRIOR_CURRICULUM_ACCEPTANCE);
  assert.throws(() => curriculumDefinitionForArgs(["--arbalesst"]),
    /unknown construct-Warrior curriculum flag "--arbalesst"/);
  assert.throws(() => curriculumAcceptanceForDefinition({ qualifierId: "arbalest-fatal-arrow-v1",
    saved: { blueprint: { id: "something-else" } } }), /no committed curriculum acceptance/);
  assert.throws(() => curriculumAcceptanceForDefinition({ qualifierId: "arbalest-fatal-arrow-v1",
    saved: { blueprint: { id: "arbalest-effigy" }, program: { id: "arbalest-effigy-mind" } },
    qualifyActiveVictory: () => true }), /no committed curriculum acceptance/);
});

test("the_Twinblade_idle_target_keeps_the_exact_body_and_neutralizes_both_swords", () => {
  const active = twinbladeSavedConstruct();
  const idle = postureOnlySavedConstruct(active, TWINBLADE_SENSORS);
  assert.equal(idle.digests.blueprint, active.digests.blueprint);
  assert.equal(idle.digests.control, active.digests.control);
  assert.deepEqual(idle.program.rules.map(({ action }) => action),
    ["dual-mount-neutral", "brace", "stabilize"]);
  assert.equal(idle.program.rules.some(({ action }) => action === "dual-cut"), false);
});

const BASE_TORSO_HEALTH = twinbladeSavedConstruct().blueprint.parts
  .find(({ id }) => id === "torso").health;
const fakeBoutWithIdleKills = (idleKillsForMultiplier) => async ({ saved, warriorPolicy,
  warriorSeed, constructSide, maxSteps }) => {
  const idle = saved.program.id === "construct-posture-idle";
  const index = CONSTRUCT_WARRIOR_CURRICULUM_SEEDS.indexOf(warriorSeed) * 2 +
    (constructSide === "right" ? 1 : 0);
  const torsoHealth = saved.blueprint.parts.find(({ id }) => id === "torso")?.health;
  const durabilityMultiplier = torsoHealth / BASE_TORSO_HEALTH;
  const idleKilled = index < idleKillsForMultiplier(durabilityMultiplier);
  const activeKilledWarrior = index < 4;
  return { physics: "real-havok-fixed-240hz", simulatedSeconds: maxSteps / 240,
    winner: idle ? idleKilled ? "warrior" : "draw" : activeKilledWarrior ? "construct" : "draw",
    construct: { blueprintId: saved.blueprint.id, programId: saved.program.id, side: constructSide,
      vitality: idle && idleKilled ? 0 : 1, damage: idle ? 0 : 10 },
    warrior: { policy: warriorPolicy, seed: warriorSeed,
      vitality: !idle && activeKilledWarrior ? 0 : 1, damage: idle ? 30 : 5 },
    firstUprightConstructDamageS: idle ? null : 1, syntheticQualified: !idle && activeKilledWarrior,
  };
};
const fakeBout = fakeBoutWithIdleKills((durabilityMultiplier) =>
  durabilityMultiplier <= CONSTRUCT_WARRIOR_DEFAULT_DURABILITY_MULTIPLIER ? 8 : 2);

test("the_curriculum_runs_the_same_mirrored_body_corpus_for_idle_and_active_programs", async () => {
  const submitted = [];
  const report = await runConstructWarriorCurriculum({ boutRunner: async (options) => {
    submitted.push(options.saved);
    return fakeBout(options);
  } });
  assert.equal(report.cells.length, 16);
  assert.equal(report.durabilityMultiplier, 0.10);
  assert.deepEqual(report.summary, { cellsPerMode: 8, idleWarriorKills: 8, activeConstructKills: 4,
    activeQualifiedConstructKills: 0, activeQualifiedConstructKillsLeft: 0,
    activeQualifiedConstructKillsRight: 0,
    activeConstructSurvivals: 8, activeUprightDamageCells: 8,
    idleConstructDamage: 0, activeConstructDamage: 80 });
  assert.equal(new Set(report.cells.map(({ blueprintDigest }) => blueprintDigest)).size, 1);
  const active = submitted.find(({ program }) => program.id !== "construct-posture-idle");
  const idle = submitted.find(({ program }) => program.id === "construct-posture-idle");
  assert.equal(active.digests.blueprint, idle.digests.blueprint);
  assert.equal(active.digests.control, idle.digests.control);
  const baseline = twinbladeSavedConstruct();
  for (const collection of ["parts", "joints", "modules"]) {
    assert.deepEqual(active.blueprint[collection].map(({ health }) => health),
      baseline.blueprint[collection].map(({ health }) => health * 0.10));
  }
  assert.equal(CONSTRUCT_WARRIOR_CURRICULUM_ACCEPTANCE.idleWarriorKillsMin, 8);
  assert.equal(report.qualifierId, "twinblade-scissor-v1");
  assert.equal(assertConstructWarriorCurriculum(report,
    CONSTRUCT_WARRIOR_CURRICULUM_ACCEPTANCE), report);
});

test("the_durability_multiplier_scales_every_damageable_element_and_nothing_else", () => {
  const active = humanoidSavedConstruct();
  const rung = withDurabilityMultiplier(active, 0.25);
  for (const collection of ["parts", "joints", "modules"]) {
    assert.deepEqual(rung.blueprint[collection].map(({ health }) => health),
      active.blueprint[collection].map(({ health }) => health * 0.25));
    assert.deepEqual(rung.blueprint[collection].map((row) => ({ ...row, health: 0 })),
      active.blueprint[collection].map((row) => ({ ...row, health: 0 })));
  }
  assert.equal(rung.digests.control, active.digests.control);
  assert.equal(rung.digests.program, active.digests.program);
  assert.throws(() => withDurabilityMultiplier(active, 0), /durability multiplier must be positive/);
  assert.throws(() => withDurabilityMultiplier(active, Number.NaN),
    /durability multiplier must be positive/);
});

test("the_declared_durability_ladder_preserves_its_measured_non_monotonic_order", async () => {
  assert.deepEqual(CONSTRUCT_WARRIOR_DURABILITY_LADDER, [0.5, 0.25, 0.10, 0.05, 0.02]);
  const measuredShape = fakeBoutWithIdleKills((multiplier) => new Map([
    [0.5, 1], [0.25, 4], [0.1, 8], [0.05, 8], [0.02, 5],
  ]).get(Number(multiplier.toFixed(2))) ?? 0);
  const report = await runConstructWarriorDurabilityLadder({ boutRunner: measuredShape,
    maxSteps: 240 });
  assert.deepEqual(report.rungs.map(({ durabilityMultiplier, warriorKills }) =>
    [durabilityMultiplier, warriorKills]), [[0.5, 1], [0.25, 4], [0.1, 8], [0.05, 8], [0.02, 5]]);
  assert.equal(new Set(report.rungs.map(({ blueprintDigest }) => blueprintDigest)).size, 5);
  assert.equal(report.rungs.every(({ cells }) => cells.length === 8), true);
});

test("the_acceptance_reconstructs_the_exact_matrix_cells_summaries_and_qualified_kills", async () => {
  const report = await runConstructWarriorCurriculum({ boutRunner: fakeBout, maxSteps: 240 });
  const thresholds = { idleWarriorKillsMin: 6, activeConstructKillsMin: 4,
    activeQualifiedConstructKillsMin: 0, activeQualifiedConstructKillsLeftMin: 0,
    activeQualifiedConstructKillsRightMin: 0, activeConstructSurvivalsMin: 8,
    activeUprightDamageCellsMin: 8 };
  assert.equal(assertConstructWarriorCurriculum(report, thresholds), report);
  for (const [field, value] of [["idleWarriorKills", 5], ["activeConstructKills", 3],
    ["activeQualifiedConstructKills", 1], ["activeQualifiedConstructKillsLeft", 1],
    ["activeQualifiedConstructKillsRight", 1], ["activeConstructSurvivals", 7],
    ["activeUprightDamageCells", 7]]) {
    const mutated = structuredClone(report);
    mutated.summary[field] = value;
    assert.throws(() => assertConstructWarriorCurriculum(mutated, thresholds),
      new RegExp(`${field} summary contradicted cells`));
  }
  const duplicate = structuredClone(report);
  duplicate.cells[0] = structuredClone(duplicate.cells[1]);
  duplicate.summary = { cellsPerMode: 7, idleWarriorKills: 7, activeConstructKills: 5,
    activeQualifiedConstructKills: 0, activeQualifiedConstructKillsLeft: 0,
    activeQualifiedConstructKillsRight: 0, activeConstructSurvivals: 9,
    activeUprightDamageCells: 9, idleConstructDamage: 0, activeConstructDamage: 90 };
  assert.throws(() => assertConstructWarriorCurriculum(duplicate, thresholds),
    /exact seed x side x mode matrix/);
  const contradicted = structuredClone(report);
  contradicted.cells[0].winner = "construct";
  assert.throws(() => assertConstructWarriorCurriculum(contradicted, thresholds),
    /contradicted its retained bout evidence/);
  const unknown = structuredClone(report);
  unknown.qualifierId = "caller-supplied-v1";
  assert.throws(() => assertConstructWarriorCurriculum(unknown, thresholds),
    /unknown or mismatched committed qualifier/);
  const mismatched = structuredClone(report);
  mismatched.constructBlueprintId = "arbalest-effigy";
  assert.throws(() => assertConstructWarriorCurriculum(mismatched, thresholds),
    /unknown or mismatched committed qualifier/);
  const seedRelabel = structuredClone(report);
  seedRelabel.cells[0].bout.warrior.seed += 1;
  assert.throws(() => assertConstructWarriorCurriculum(seedRelabel, thresholds),
    /contradicted its retained bout evidence/);
  const sideRelabel = structuredClone(report);
  sideRelabel.cells[0].bout.construct.side = sideRelabel.cells[0].constructSide === "left"
    ? "right" : "left";
  assert.throws(() => assertConstructWarriorCurriculum(sideRelabel, thresholds),
    /contradicted its retained bout evidence/);
  const programRelabel = structuredClone(report);
  programRelabel.cells.find(({ mode }) => mode === "active").bout.construct.programId =
    "construct-posture-idle";
  assert.throws(() => assertConstructWarriorCurriculum(programRelabel, thresholds),
    /contradicted its retained bout evidence/);
});

test("the_committed_acceptance_pins_corpus_order_duration_and_mirror_identity", async () => {
  const report = await runConstructWarriorCurriculum({ boutRunner: fakeBout });
  assert.equal(assertConstructWarriorCurriculum(report,
    CONSTRUCT_WARRIOR_CURRICULUM_ACCEPTANCE), report);
  for (const [mutate, message] of [
    [(row) => { [row.seeds[0], row.seeds[1]] = [row.seeds[1], row.seeds[0]]; }, /seeds .*does not match/],
    [(row) => { [row.sides[0], row.sides[1]] = [row.sides[1], row.sides[0]]; }, /sides .*does not match/],
    [(row) => { row.seconds = 29; }, /seconds 29 does not match 30/],
    [(row) => { row.durabilityMultiplier = 0.05; }, /durabilityMultiplier 0.05 does not match 0.1/],
    [(row) => { row.version = 3; }, /version 3 does not match 2/],
  ]) {
    const changed = structuredClone(report); mutate(changed);
    assert.throws(() => assertConstructWarriorCurriculum(changed,
      CONSTRUCT_WARRIOR_CURRICULUM_ACCEPTANCE), message);
  }
});
