import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { assertCombinedArmsQualification, COMBINED_ARMS_DURABILITY_LADDER,
  COMBINED_ARMS_EVENT_STEP_HZ, COMBINED_ARMS_MORPHOLOGIES, COMBINED_ARMS_SEEDS, COMBINED_ARMS_SIDES,
  combinedArmsRunDigest,
  finalizeCombinedArmsQualification, reconstructCombinedArmsCell,
  reconstructCombinedArmsRung } from "../scripts/construct-combined-arms-qualification.mjs";
import { assertCombinedArmsCheckpointCell, assertCombinedArmsCheckpointReplay,
  assertCombinedArmsCheckpointState,
  finalizeCombinedArmsQualificationCheckpoint,
  parseCombinedArmsQualificationArgs, readCombinedArmsQualificationCheckpoint,
  readCombinedArmsQualificationCheckpointCell, writeCombinedArmsQualificationCheckpointCell,
  writeCombinedArmsQualificationCheckpointReport, writeCombinedArmsQualificationReport,
  withDurabilityMultiplier } from
  "../scripts/construct-warrior-curriculum.mjs";
import { runCombinedArmsJobsInWorkers } from "../scripts/construct-combined-arms-runner.mjs";
import { qualificationTimeAtStep, runConstructWarriorBout } from
  "../scripts/construct-warrior-bout.mjs";
import { runCombinedArmsQualificationBout as guardedSyntheticBout } from
  "./fixtures/combined-arms-isolated-engine.mjs";
import { canonicalIntegrityJson } from "../src/construct/integrity.ts";
import { arbalestSavedConstruct, ARBALEST_SENSORS } from "../src/construct/arbalest.ts";
import { CONFIG } from "../src/config.ts";
import { humanoidSavedConstruct, HUMANOID_SENSORS } from "../src/construct/humanoid.ts";

const add = (events, kind, row = {}) => {
  const atStep = events.length + 1;
  events.push({ sequence: events.length, atStep, atS: atStep / COMBINED_ARMS_EVENT_STEP_HZ,
    kind, ...row });
};

const activeEvents = (morphology, cellIndex = 0) => {
  const events = [];
  add(events, "combat-audit", {
    ownerContactsRefused: 0, inactiveActionsRefused: 0, moduleAttributionRefused: 0,
  });
  for (const semanticPair of morphology.clearancePairs) add(events, "self-clearance-diagnostic",
    { semanticPair, clearanceM: 0.02, requiredM: 0.005, sampledAtStep: 1 });
  add(events, "support", { standing: true, assembled: true, recovery: "not-required" });
  for (const request of morphology.requiredRequests) {
    add(events, "motion-request", { request, correctSign: true,
      ...(request === "ranged-spacing" ? { earned: true } : {}) });
  }
  add(events, "passive-interval", { visible: true, inRange: true, durationS: 0.1 });
  add(events, "passive-audit", { activeProgram: true, intervals: 1,
    terminalFlushed: true, maximumDurationS: 0.1 });

  const begin = (instance, action, weapon, lane) => {
    add(events, "action-started", { action, actionInstanceId: instance, weapon });
    add(events, "action-phase", { action, actionInstanceId: instance, phase: "commit" });
    add(events, "attack-admitted", { action, actionInstanceId: instance, physical: true,
      ...(lane === undefined ? {} : { lane }), ...(action === "dual-cut" ? {
        firstEffectorId: "left-effigy-sword", secondEffectorId: "effigy-sword",
        admissionSupported: true, admissionUpright: true,
      } : {}) });
    for (const semanticPair of morphology.clearancePairs) {
      if (morphology.clearanceActions[semanticPair] === action) add(events, "self-clearance", {
        semanticPair, clearanceM: 0.02, requiredM: 0.005, action, actionInstanceId: instance });
    }
  };
  const contact = (instance, action, weapon, sourceModuleId, extra = {}) => add(events, "contact", {
    action, actionInstanceId: instance, weapon, effectorId: sourceModuleId,
    sourceModuleId, sourceOwner: "construct", ownerRelation: "opponent", attribution: "verified",
    blocked: false, targetPartId: "torso", standingAtStep: true,
    targetVitalityBefore: extra.targetVitalityBefore ?? 10,
    targetVitalityAfter: extra.targetVitalityAfter ?? 9,
    damage: extra.damage ?? 1, preArmourDamage: extra.preArmourDamage ?? extra.damage ?? 1,
    postArmourDamage: extra.damage ?? 1, ...extra,
  });
  const complete = (instance, action) => add(events, "action-completed", { action,
    actionInstanceId: instance });
  const launch = (instance, serial) => {
    const projectile = { owner: "construct", poolIndex: serial % 2, shotSerial: serial };
    add(events, "projectile-launched", { actionInstanceId: instance, projectile });
    return projectile;
  };

  if (morphology.id === "twinblade") {
    begin("attack-0", "dual-cut", "sword", cellIndex % 2 === 0 ? "shielded" : "unshielded");
    contact("attack-0", "dual-cut", "sword", "left-effigy-sword", { phase: "first-cut",
      targetVitalityBefore: 10, targetVitalityAfter: 9 });
    contact("attack-0", "dual-cut", "sword", "effigy-sword", { phase: "second-cut",
      targetVitalityBefore: 9, targetVitalityAfter: 8 });
    complete("attack-0", "dual-cut");
    begin("attack-1", "dual-cut", "sword", cellIndex % 2 === 0 ? "unshielded" : "shielded");
    contact("attack-1", "dual-cut", "sword", "left-effigy-sword", { phase: "first-cut" });
    complete("attack-1", "dual-cut");
  } else if (morphology.id === "arbalest") {
    begin("attack-0", "fire", "projectile");
    const projectile = launch("attack-0", 0);
    complete("attack-0", "fire");
    contact("attack-0", "fire", "projectile", "effigy-arbalest", { projectile,
      contactZone: "point", axial: true, massKg: 0.12, arrivalSpeedMps: 42,
      signedShaftAlignment: 1, penetrationEfficiency: 1, contactedZone: "head",
      usableEnergyJ: 102, uncappedDamage: 3, damage: 2, preArmourDamage: 3 });
    add(events, "melee-opportunity", { rangeM: 1.1 });
    begin("attack-1", "cut-left", "sword");
    contact("attack-1", "cut-left", "sword", "effigy-left-sword");
    complete("attack-1", "cut-left");
  } else if (morphology.id === "warden-crossbow") {
    begin("attack-0", "fire", "projectile");
    const projectile = launch("attack-0", 0);
    complete("attack-0", "fire");
    contact("attack-0", "fire", "projectile", "dorsal-crossbow", { projectile,
      effectorId: `dorsal-crossbow:${projectile.poolIndex}`,
      contactZone: "point", axial: true, massKg: 0.12, arrivalSpeedMps: 42,
      signedShaftAlignment: 1, penetrationEfficiency: 1, contactedZone: "head",
      usableEnergyJ: 102, uncappedDamage: 3, damage: 2, preArmourDamage: 3 });
    begin("attack-1", "bash", "shield");
    contact("attack-1", "bash", "shield", "warden-shield", { damage: 0,
      preArmourDamage: 0, stabilityShove: { kind: "specific-impulse", specificImpulseMps: 0.008 } });
    complete("attack-1", "bash");
  } else if (morphology.id === "warden-sword") {
    begin("attack-0", "cut", "sword");
    contact("attack-0", "cut", "sword", "dorsal-sword");
    complete("attack-0", "cut");
    begin("attack-1", "bash", "shield");
    contact("attack-1", "bash", "shield", "warden-shield", { damage: 0,
      preArmourDamage: 0, targetVitalityBefore: 9, targetVitalityAfter: 9,
      stabilityShove: { kind: "specific-impulse", specificImpulseMps: 0.008 } });
    complete("attack-1", "bash");
  } else {
    const source = "effigy-sword";
    const action = "sweep";
    for (let index = 0; index < 2; index += 1) {
      begin(`attack-${index}`, action, "sword");
      contact(`attack-${index}`, action, "sword", source);
      complete(`attack-${index}`, action);
    }
  }
  return events;
};

const idleEvents = (morphology) => {
  const events = [];
  add(events, "combat-audit", {
    ownerContactsRefused: 0, inactiveActionsRefused: 0, moduleAttributionRefused: 0,
  });
  for (const semanticPair of morphology.clearancePairs) add(events, "self-clearance-diagnostic",
    { semanticPair, clearanceM: 0.02, requiredM: 0.005, sampledAtStep: 1 });
  add(events, "support", { standing: true, assembled: true, recovery: "not-required" });
  add(events, "passive-audit", { activeProgram: false, intervals: 0,
    terminalFlushed: true, maximumDurationS: 0 });
  return events;
};

const cell = (morphology, mode, seed, constructSide, multiplier, cellIndex, passing) => {
  const rawOrderedEvents = mode === "active" ? activeEvents(morphology, cellIndex) : idleEvents(morphology);
  const activeWin = mode === "active" && (cellIndex % 8 < 6 || cellIndex % 8 === 7);
  const idleKill = mode === "idle" && passing;
  const winner = mode === "idle" ? idleKill ? "warrior" : "draw"
    : activeWin ? "construct" : "warrior";
  const baseDurability = { parts: [{ id: "core", health: 10, armour: 2 }],
    joints: [{ id: "bearing", health: 8, armour: 1 }],
    modules: [{ id: "weapon", health: 4, armour: 0.5 }] };
  const actualDurability = Object.fromEntries(Object.entries(baseDurability).map(([kind, rows]) =>
    [kind, rows.map((row) => ({ ...row, health: row.health * multiplier }))]));
  return { morphologyId: morphology.id, qualifierId: morphology.qualifierId, mode, seed,
    constructSide, warriorLoadout: { primary: "sword",
      secondary: morphology.id === "twinblade" && COMBINED_ARMS_SEEDS.indexOf(seed) % 2 === 1
        ? "empty" : "buckler" },
    combatValueUnitVersion: 2, projectileLawVersion: 1,
    blueprintDigest: "1234abcd", controlDigest: "2345bcde", programDigest: "3456cdef",
    baseDurability, actualDurability,
    durabilityMultiplier: multiplier,
    eventStepHz: COMBINED_ARMS_EVENT_STEP_HZ, passiveIntervalLimitS: 1,
    minimumSelfClearanceM: mode === "active" ? 0.02 : null,
    diagnosticMinimumSelfClearanceM: 0.02, rawOrderedEvents,
    verdict: { winner, constructVitality: winner === "warrior" ? 0 : 5,
      warriorVitality: winner === "construct" ? 0 : 5, atStep: 2400, atS: 10,
      timeCap: winner === "draw" } };
};

test("qualification_proves_one_health_scaling_pass_and_unchanged_armour_elementwise", () => {
  const morphology = COMBINED_ARMS_MORPHOLOGIES[0];
  const original = cell(morphology, "active", COMBINED_ARMS_SEEDS[0], "left", 0.1, 0, true);
  assert.deepEqual(reconstructCombinedArmsCell(original).failures, []);

  const doubleScaled = structuredClone(original);
  doubleScaled.actualDurability.parts[0].health *= doubleScaled.durabilityMultiplier;
  assert.match(reconstructCombinedArmsCell(doubleScaled).failures.join("; "),
    /scaled exactly once/);

  const armourScaled = structuredClone(original);
  armourScaled.actualDurability.modules[0].armour *= armourScaled.durabilityMultiplier;
  assert.match(reconstructCombinedArmsCell(armourScaled).failures.join("; "),
    /armour changed/);

  const missing = structuredClone(original);
  missing.actualDurability.joints = [];
  assert.match(reconstructCombinedArmsCell(missing).failures.join("; "),
    /durability manifests/);
});

const rungCells = (morphology, multiplier, passing = true) => {
  const cells = [];
  let index = 0;
  for (const seed of COMBINED_ARMS_SEEDS) for (const constructSide of COMBINED_ARMS_SIDES) {
    cells.push(cell(morphology, "idle", seed, constructSide, multiplier, index, passing));
    cells.push(cell(morphology, "active", seed, constructSide, multiplier, index, passing));
    index += 1;
  }
  return cells;
};

const report = (passingAt = new Set([0.5, 0.1])) => finalizeCombinedArmsQualification({
  sourceDigestBefore: "abcdef12", sourceDigestAfter: "abcdef12",
  morphologies: COMBINED_ARMS_MORPHOLOGIES.map((morphology) => ({ id: morphology.id,
    qualifierId: morphology.qualifierId,
    rungs: COMBINED_ARMS_DURABILITY_LADDER.map((durabilityMultiplier) => ({ durabilityMultiplier,
      cells: rungCells(morphology, durabilityMultiplier, passingAt.has(durabilityMultiplier)) })) })),
});

test("each_morphology_ratchet_requires_zero_idle_and_six_active_wins", () => {
  const morphology = COMBINED_ARMS_MORPHOLOGIES[0];
  const passing = reconstructCombinedArmsRung(morphology.id, rungCells(morphology, 0.1, true));
  assert.equal(passing.passed, true);
  for (const mutate of [
    (cells) => { cells.find(({ mode }) => mode === "idle").verdict = {
      winner: "construct", constructVitality: 1, warriorVitality: 0, atS: 10, timeCap: false }; },
    (cells) => { cells.filter(({ mode }) => mode === "active").slice(5).forEach((row) => {
      row.verdict = { winner: "warrior", constructVitality: 0, warriorVitality: 1, atS: 10, timeCap: false };
    }); },
  ]) {
    const cells = structuredClone(rungCells(morphology, 0.1, true)); mutate(cells);
    assert.equal(reconstructCombinedArmsRung(morphology.id, cells).passed, false);
  }
});

test("a_defeated_idle_Construct_may_be_disassembled_but_a_winner_may_not", () => {
  const morphology = COMBINED_ARMS_MORPHOLOGIES[0];
  const idle = cell(morphology, "idle", COMBINED_ARMS_SEEDS[0], "left", 0.1, 0, true);
  const idleSupport = idle.rawOrderedEvents.find(({ kind }) => kind === "support");
  idleSupport.standing = false;
  idleSupport.assembled = false;
  idleSupport.recovery = "pending";
  assert.deepEqual(reconstructCombinedArmsCell(idle).failures, []);

  const winner = cell(morphology, "active", COMBINED_ARMS_SEEDS[0], "left", 0.1, 0, true);
  const winningSupport = winner.rawOrderedEvents.find(({ kind }) => kind === "support");
  winningSupport.standing = false;
  winningSupport.assembled = false;
  winningSupport.recovery = "pending";
  assert.match(reconstructCombinedArmsCell(winner).failures.join("; "), /winning Construct/);
});

test("a_terminal_open_Action_does_not_replace_or_invalidate_two_completed_attacks", () => {
  const morphology = COMBINED_ARMS_MORPHOLOGIES[0];
  const row = cell(morphology, "active", COMBINED_ARMS_SEEDS[0], "left", 0.1, 0, true);
  add(row.rawOrderedEvents, "action-started", { action: "sweep",
    actionInstanceId: "terminal-open", weapon: "sword" });
  add(row.rawOrderedEvents, "action-phase", { action: "sweep",
    actionInstanceId: "terminal-open", phase: "chamber" });
  add(row.rawOrderedEvents, "attack-admitted", { action: "sweep",
    actionInstanceId: "terminal-open", physical: true });
  add(row.rawOrderedEvents, "contact", { action: "sweep", actionInstanceId: "terminal-open",
    weapon: "sword", effectorId: "effigy-sword", sourceModuleId: "effigy-sword",
    sourceOwner: "construct", ownerRelation: "opponent", attribution: "verified",
    blocked: false, targetPartId: "torso", standingAtStep: true,
    targetVitalityBefore: 8, targetVitalityAfter: 8,
    damage: 0, preArmourDamage: 0, postArmourDamage: 0 });
  assert.deepEqual(reconstructCombinedArmsCell(row).failures, []);
});

test("raw_event_time_is_integer_tick_authority_and_same_tick_terminal_order_is_enforced", () => {
  const morphology = COMBINED_ARMS_MORPHOLOGIES[0];
  const original = cell(morphology, "active", COMBINED_ARMS_SEEDS[0], "left", 0.1, 0, true);
  const drifted = structuredClone(original);
  drifted.rawOrderedEvents[3].atS += 1e-12;
  assert.match(reconstructCombinedArmsCell(drifted).failures.join("; "), /raw ordered events/);

  const terminalFirst = structuredClone(original);
  const contactAt = terminalFirst.rawOrderedEvents.findIndex(({ kind }) => kind === "contact");
  const terminalAt = terminalFirst.rawOrderedEvents.findIndex(({ kind }) => kind === "action-completed");
  const contact = terminalFirst.rawOrderedEvents[contactAt];
  const terminal = terminalFirst.rawOrderedEvents[terminalAt];
  contact.atStep = terminal.atStep;
  contact.atS = terminal.atS;
  terminalFirst.rawOrderedEvents[contactAt] = terminal;
  terminalFirst.rawOrderedEvents[terminalAt] = contact;
  terminalFirst.rawOrderedEvents.forEach((event, sequence) => { event.sequence = sequence; });
  assert.match(reconstructCombinedArmsCell(terminalFirst).failures.join("; "),
    /outside its attributed physical Action/);
});

test("qualification_time_is_derived_by_dividing_the_authoritative_integer_tick", () => {
  // Multiplying by the pre-rounded reciprocal produces 26.349999999999998 here. The strict
  // report validator intentionally requires the bit-exact value of atStep / eventStepHz.
  assert.notEqual(6324 * (1 / COMBINED_ARMS_EVENT_STEP_HZ),
    6324 / COMBINED_ARMS_EVENT_STEP_HZ);
  assert.equal(qualificationTimeAtStep(6324), 6324 / COMBINED_ARMS_EVENT_STEP_HZ);
  assert.equal(qualificationTimeAtStep(413), 413 / COMBINED_ARMS_EVENT_STEP_HZ);
});

test("cancelled_failed_and_refused_terminals_never_count_as_completed_attacks", () => {
  const morphology = COMBINED_ARMS_MORPHOLOGIES[0];
  for (const terminalKind of ["action-cancelled", "action-failed", "action-refused"]) {
    const row = cell(morphology, "active", COMBINED_ARMS_SEEDS[0], "left", 0.1, 0, true);
    row.rawOrderedEvents.find(({ kind }) => kind === "action-completed").kind = terminalKind;
    const failures = reconstructCombinedArmsCell(row).failures.join("; ");
    assert.doesNotMatch(failures, /outside its attributed physical Action/,
      "contact before its terminal is temporally inside even when the Action does not complete");
    assert.match(failures, /two completed physical attack admissions/);

    const terminalFirst = structuredClone(row);
    const contactAt = terminalFirst.rawOrderedEvents.findIndex(({ kind }) => kind === "contact");
    const terminalAt = terminalFirst.rawOrderedEvents.findIndex(({ kind }) => kind === terminalKind);
    const contact = terminalFirst.rawOrderedEvents[contactAt];
    const terminal = terminalFirst.rawOrderedEvents[terminalAt];
    contact.atStep = terminal.atStep;
    contact.atS = terminal.atS;
    terminalFirst.rawOrderedEvents[contactAt] = terminal;
    terminalFirst.rawOrderedEvents[terminalAt] = contact;
    terminalFirst.rawOrderedEvents.forEach((event, sequence) => { event.sequence = sequence; });
    assert.match(reconstructCombinedArmsCell(terminalFirst).failures.join("; "),
      /outside its attributed physical Action/,
      "contact after any terminal remains outside its attributed physical Action");
  }
});

test("cancelled_contact_damage_cannot_supply_the_completed_attack_damage_gate", () => {
  const morphology = COMBINED_ARMS_MORPHOLOGIES.find(({ id }) => id === "swordbearer");
  const row = cell(morphology, "active", COMBINED_ARMS_SEEDS[0], "left", 0.1, 0, true);
  for (const contact of row.rawOrderedEvents.filter(({ kind }) => kind === "contact")) {
    contact.damage = 0;
    contact.preArmourDamage = 0;
    contact.postArmourDamage = 0;
    contact.targetVitalityAfter = contact.targetVitalityBefore;
  }
  add(row.rawOrderedEvents, "action-started", { action: "sweep",
    actionInstanceId: "cancelled-damage", weapon: "sword" });
  add(row.rawOrderedEvents, "action-phase", { action: "sweep",
    actionInstanceId: "cancelled-damage", phase: "commit" });
  add(row.rawOrderedEvents, "attack-admitted", { action: "sweep",
    actionInstanceId: "cancelled-damage", physical: true });
  add(row.rawOrderedEvents, "contact", { action: "sweep", actionInstanceId: "cancelled-damage",
    weapon: "sword", effectorId: "effigy-sword", sourceModuleId: "effigy-sword",
    sourceOwner: "construct", ownerRelation: "opponent", attribution: "verified",
    blocked: false, targetPartId: "torso", standingAtStep: true,
    targetVitalityBefore: 8, targetVitalityAfter: 7,
    damage: 1, preArmourDamage: 1, postArmourDamage: 1 });
  add(row.rawOrderedEvents, "action-cancelled", { action: "sweep",
    actionInstanceId: "cancelled-damage" });
  const failures = reconstructCombinedArmsCell(row).failures.join("; ");
  assert.doesNotMatch(failures, /outside its attributed physical Action/);
  assert.match(failures, /positive damage/);
  assert.match(failures, /Swordbearer lacks a physical sword wound/);
});

test("every_completed_armed_Action_instance_carries_its_own_semantic_clearance", () => {
  const morphology = COMBINED_ARMS_MORPHOLOGIES.find(({ id }) => id === "twinblade");
  const original = cell(morphology, "active", COMBINED_ARMS_SEEDS[0], "left", 0.1, 0, true);
  assert.deepEqual(reconstructCombinedArmsCell(original).failures, []);
  const changed = structuredClone(original);
  changed.rawOrderedEvents = changed.rawOrderedEvents.filter(({ kind, actionInstanceId }) =>
    kind !== "self-clearance" || actionInstanceId !== "attack-1");
  changed.rawOrderedEvents.forEach((event, sequence) => { event.sequence = sequence; });
  assert.match(reconstructCombinedArmsCell(changed).failures.join("; "),
    /completed armed Action attack-1 omitted/);
});

test("the_sword_Warden_qualifier_requires_its_independent_shield_bash_clearance", () => {
  const morphology = COMBINED_ARMS_MORPHOLOGIES.find(({ id }) => id === "warden-sword");
  assert.deepEqual(morphology.clearancePairs, ["dorsal-sword/core", "shield/core"]);
  assert.equal(morphology.clearanceActions["shield/core"], "bash");
  const original = cell(morphology, "active", COMBINED_ARMS_SEEDS[0], "left", 0.1, 0, true);
  assert.deepEqual(reconstructCombinedArmsCell(original).failures, []);

  const missing = structuredClone(original);
  missing.rawOrderedEvents = missing.rawOrderedEvents.filter(({ kind, semanticPair }) =>
    kind !== "self-clearance" || semanticPair !== "shield/core");
  missing.rawOrderedEvents.forEach((event, sequence) => { event.sequence = sequence; });
  assert.match(reconstructCombinedArmsCell(missing).failures.join("; "),
    /semantic self-clearance omitted shield\/core|completed armed Action .* omitted shield\/core/);

  const unsafe = structuredClone(original);
  const sample = unsafe.rawOrderedEvents.find(({ kind, semanticPair }) =>
    kind === "self-clearance" && semanticPair === "shield/core");
  sample.clearanceM = sample.requiredM - 0.001;
  assert.match(reconstructCombinedArmsCell(unsafe).failures.join("; "), /self-clearance fell below/);
});

test("a_short_real_Arbalest_cut_is_sampled_at_its_lifecycle_edges_when_30hz_misses_it", async () => {
  const report = await runConstructWarriorBout({ saved: arbalestSavedConstruct(),
    sensors: ARBALEST_SENSORS, warriorPolicy: "duelist", warriorSeed: COMBINED_ARMS_SEEDS[2],
    constructSide: "right", maxSteps: CONFIG.world.physicsHz * 4 });
  const completed = report.qualificationEvents.filter(({ kind, action }) =>
    kind === "action-completed" && action === "cut-left");
  assert.ok(completed.length > 0, "the fixed real bout must exercise the short physical cut");
  const starts = new Map(report.qualificationEvents.filter(({ kind, action }) =>
    kind === "action-started" && action === "cut-left").map((row) => [row.actionInstanceId, row]));
  for (const terminal of completed) {
    assert.ok(report.qualificationEvents.some(({ kind, semanticPair, actionInstanceId }) =>
      kind === "self-clearance" && semanticPair === "left-sword/torso" &&
      actionInstanceId === terminal.actionInstanceId),
    `completed ${terminal.actionInstanceId} lacked an attributed live-primitive sample`);
  }
  const underOneSamplerInterval = completed.filter((terminal) =>
    terminal.atStep - starts.get(terminal.actionInstanceId).atStep < CONFIG.world.physicsHz / 30);
  assert.ok(underOneSamplerInterval.some((terminal) => {
    const samples = report.qualificationEvents.filter(({ kind, actionInstanceId }) =>
      kind === "self-clearance" && actionInstanceId === terminal.actionInstanceId);
    return samples.some(({ method }) =>
      method === "live-authoritative-primitive-samples-lifecycle-edge") &&
      samples.every(({ method }) => method !== "live-authoritative-primitive-samples-30hz");
  }), "this fixture must retain a sub-30-Hz Action covered only by its lifecycle edges");
});

test("an_Arbalest_cycle_that_never_publishes_a_physical_phase_is_not_claimed_as_an_attack_admission", async () => {
  const report = await runConstructWarriorBout({ saved: arbalestSavedConstruct(),
    sensors: ARBALEST_SENSORS, warriorPolicy: "duelist", warriorSeed: COMBINED_ARMS_SEEDS[1],
    constructSide: "left", maxSteps: CONFIG.world.physicsHz * 6 });
  const phases = new Set(report.qualificationEvents.filter(({ kind }) => kind === "action-phase")
    .map(({ actionInstanceId }) => actionInstanceId));
  const terminals = new Map(report.qualificationEvents.filter(({ kind }) =>
    ["action-completed", "action-cancelled", "action-failed"].includes(kind))
    .map((row) => [row.actionInstanceId, row]));
  const phaseLess = report.qualificationEvents.filter(({ kind, action, actionInstanceId, atStep }) =>
    kind === "action-started" && action === "cut-left" && !phases.has(actionInstanceId) &&
    terminals.get(actionInstanceId)?.atStep === atStep);
  assert.ok(phaseLess.length > 0, "the fixed fixture must retain a same-step phase-less controller cycle");
  const admitted = new Set(report.qualificationEvents.filter(({ kind }) => kind === "attack-admitted")
    .map(({ actionInstanceId }) => actionInstanceId));
  assert.equal(phaseLess.some(({ actionInstanceId }) => admitted.has(actionInstanceId)), false,
    "a scheduler start which completed before any physical phase must not masquerade as an attack admission");
  const armedSamples = new Set(report.qualificationEvents.filter(({ kind }) => kind === "self-clearance")
    .map(({ actionInstanceId }) => actionInstanceId));
  assert.equal(phaseLess.some(({ actionInstanceId }) => armedSamples.has(actionInstanceId)), false,
    "a phase-less lifecycle edge must not masquerade as an armed physical clearance sample");
});

test("passive_interval_coverage_is_typed_flushed_and_terminally_audited", () => {
  const morphology = COMBINED_ARMS_MORPHOLOGIES[0];
  const original = cell(morphology, "active", COMBINED_ARMS_SEEDS[0], "left", 0.1, 0, true);
  assert.deepEqual(reconstructCombinedArmsCell(original).failures, []);
  for (const mutate of [
    (row) => { row.rawOrderedEvents = row.rawOrderedEvents.filter(({ kind }) => kind !== "passive-audit"); },
    (row) => { row.rawOrderedEvents.find(({ kind }) => kind === "passive-interval").visible = "yes"; },
    (row) => { row.rawOrderedEvents.find(({ kind }) => kind === "passive-audit").intervals = 0; },
    (row) => { row.rawOrderedEvents.find(({ kind }) => kind === "passive-audit").terminalFlushed = false; },
  ]) {
    const changed = structuredClone(original); mutate(changed);
    changed.rawOrderedEvents.forEach((event, sequence) => { event.sequence = sequence; });
    assert.match(reconstructCombinedArmsCell(changed).failures.join("; "),
      /passive visible\/in-range interval|terminal coverage audit/);
  }
});

test("a_passing_matrix_contains_at_least_three_wins_in_each_mirror", () => {
  const morphology = COMBINED_ARMS_MORPHOLOGIES[0];
  const cells = structuredClone(rungCells(morphology, 0.1, true));
  const left = cells.filter(({ mode, constructSide }) => mode === "active" && constructSide === "left");
  for (const row of left.slice(2)) row.verdict = {
    winner: "warrior", constructVitality: 0, warriorVitality: 1, atS: 10, timeCap: false };
  assert.match(reconstructCombinedArmsRung(morphology.id, cells).failures.join("; "), /3 per mirror/);
});

test("Arbalest_combined_arms_evidence_requires_bolt_and_concurrent_sword_activity", () => {
  const morphology = COMBINED_ARMS_MORPHOLOGIES.find(({ id }) => id === "arbalest");
  const row = cell(morphology, "active", COMBINED_ARMS_SEEDS[0], "left", 0.1, 0, true);
  assert.deepEqual(reconstructCombinedArmsCell(row).failures, []);
  for (const [predicate, message] of [
    [(event) => event.kind === "contact" && event.weapon === "projectile", /point-first bolt/],
    [(event) => event.kind === "contact" && event.sourceModuleId === "effigy-left-sword", /concurrent left-sword/],
    [(event) => event.kind === "melee-opportunity", /concurrent left-sword/],
  ]) {
    const changed = structuredClone(row);
    changed.rawOrderedEvents = changed.rawOrderedEvents.filter((event) => !predicate(event));
    assert.match(reconstructCombinedArmsCell(changed).failures.join("; "), message);
  }
  const wrongAction = structuredClone(row);
  wrongAction.rawOrderedEvents.find(({ kind, sourceModuleId }) =>
    kind === "contact" && sourceModuleId === "effigy-left-sword").action = "sweep";
  assert.match(reconstructCombinedArmsCell(wrongAction).failures.join("; "), /concurrent left-sword/);
});

test("Warden_combined_arms_evidence_requires_bolt_and_physical_shield_bash", () => {
  const morphology = COMBINED_ARMS_MORPHOLOGIES.find(({ id }) => id === "warden-crossbow");
  const row = cell(morphology, "active", COMBINED_ARMS_SEEDS[0], "left", 0.1, 0, true);
  assert.deepEqual(reconstructCombinedArmsCell(row).failures, []);
  const changed = structuredClone(row);
  changed.rawOrderedEvents.find(({ kind, weapon }) => kind === "contact" && weapon === "shield")
    .sourceModuleId = "core";
  assert.match(reconstructCombinedArmsCell(changed).failures.join("; "), /shield-bash/);
  for (const mutate of [
    (row) => { row.rawOrderedEvents.find(({ kind, weapon }) =>
      kind === "contact" && weapon === "shield").action = "fire"; },
    (row) => { row.rawOrderedEvents.find(({ kind, weapon }) =>
      kind === "contact" && weapon === "shield").effectorId = "dorsal-crossbow"; },
    (row) => { row.rawOrderedEvents.find(({ kind, action }) =>
      kind === "action-completed" && action === "bash").kind = "action-cancelled"; },
  ]) {
    const forged = structuredClone(row); mutate(forged);
    assert.match(reconstructCombinedArmsCell(forged).failures.join("; "), /shield-bash/);
  }
  for (const mutate of [
    (candidate) => { candidate.rawOrderedEvents.find(({ kind, weapon }) =>
      kind === "contact" && weapon === "projectile").action = "bash"; },
    (candidate) => { candidate.rawOrderedEvents.find(({ kind, weapon }) =>
      kind === "contact" && weapon === "projectile").effectorId = "warden-shield"; },
    (candidate) => { candidate.rawOrderedEvents.find(({ kind, weapon }) =>
      kind === "contact" && weapon === "projectile").sourceModuleId = "warden-shield"; },
    (candidate) => { candidate.rawOrderedEvents.find(({ kind, weapon }) =>
      kind === "contact" && weapon === "projectile").effectorId = "effigy-arbalest:0"; },
    (candidate) => { candidate.rawOrderedEvents.find(({ kind, weapon }) =>
      kind === "contact" && weapon === "projectile").effectorId = "dorsal-crossbow:0-junk"; },
    (candidate) => { candidate.rawOrderedEvents.find(({ kind, weapon }) =>
      kind === "contact" && weapon === "projectile").effectorId = "dorsal-crossbow:00"; },
    (candidate) => { candidate.rawOrderedEvents.find(({ kind, weapon }) =>
      kind === "contact" && weapon === "projectile").effectorId = "dorsal-crossbow:1"; },
    (candidate) => { candidate.rawOrderedEvents.find(({ kind, action }) =>
      kind === "action-completed" && action === "fire").kind = "action-cancelled"; },
  ]) {
    const forged = structuredClone(row); mutate(forged);
    assert.match(reconstructCombinedArmsCell(forged).failures.join("; "), /lacks bolt/);
  }
  const recycled = structuredClone(row);
  const contact = recycled.rawOrderedEvents.find(({ kind, weapon }) =>
    kind === "contact" && weapon === "projectile");
  const atStep = recycled.rawOrderedEvents.at(-1).atStep + 1;
  recycled.rawOrderedEvents.push({ ...contact, sequence: recycled.rawOrderedEvents.length,
    atStep, atS: atStep / COMBINED_ARMS_EVENT_STEP_HZ });
  assert.match(reconstructCombinedArmsCell(recycled).failures.join("; "),
    /more than one scored contact/);
});

test("sword_Warden_sweep_requires_the_exact_effector_and_completed_cut_Action", () => {
  const morphology = COMBINED_ARMS_MORPHOLOGIES.find(({ id }) => id === "warden-sword");
  const original = cell(morphology, "active", COMBINED_ARMS_SEEDS[0], "left", 0.1, 0, true);
  assert.deepEqual(reconstructCombinedArmsCell(original).failures, []);
  for (const mutate of [
    (row) => { row.rawOrderedEvents.find(({ kind, sourceModuleId }) =>
      kind === "contact" && sourceModuleId === "dorsal-sword").effectorId = "warden-shield"; },
    (row) => { row.rawOrderedEvents.find(({ kind, action }) =>
      kind === "action-completed" && action === "cut").kind = "action-cancelled"; },
  ]) {
    const changed = structuredClone(original); mutate(changed);
    assert.match(reconstructCombinedArmsCell(changed).failures.join("; "), /physical dorsal sweep/);
  }
});

test("a_summary_without_raw_ordered_events_cannot_qualify", () => {
  const morphology = COMBINED_ARMS_MORPHOLOGIES[0];
  const row = cell(morphology, "active", COMBINED_ARMS_SEEDS[0], "left", 0.1, 0, true);
  delete row.rawOrderedEvents;
  assert.match(reconstructCombinedArmsCell(row).failures.join("; "), /raw ordered events are required/);
});

test("post_verdict_or_recycled_projectile_damage_cannot_qualify_a_cell", () => {
  const morphology = COMBINED_ARMS_MORPHOLOGIES.find(({ id }) => id === "arbalest");
  const original = cell(morphology, "active", COMBINED_ARMS_SEEDS[0], "left", 0.1, 0, true);
  const late = structuredClone(original);
  const lateContact = late.rawOrderedEvents.find(({ kind, weapon }) => kind === "contact" && weapon === "projectile");
  late.verdict.atStep = lateContact.atStep;
  late.verdict.atS = lateContact.atStep / COMBINED_ARMS_EVENT_STEP_HZ;
  assert.match(reconstructCombinedArmsCell(late).failures.join("; "), /post-verdict/);
  const recycled = structuredClone(original);
  const contact = recycled.rawOrderedEvents.find(({ kind, weapon }) => kind === "contact" && weapon === "projectile");
  const atStep = recycled.rawOrderedEvents.at(-1).atStep + 1;
  recycled.rawOrderedEvents.push({ ...contact, sequence: recycled.rawOrderedEvents.length,
    atStep, atS: atStep / COMBINED_ARMS_EVENT_STEP_HZ });
  assert.match(reconstructCombinedArmsCell(recycled).failures.join("; "), /more than one scored contact/);

  const forged = structuredClone(original);
  const forgedContact = forged.rawOrderedEvents.find(({ kind, weapon }) =>
    kind === "contact" && weapon === "projectile");
  forgedContact.preArmourDamage = 1.5;
  forgedContact.postArmourDamage = 1.5;
  forgedContact.damage = 1.5;
  assert.match(reconstructCombinedArmsCell(forged).failures.join("; "), /physical energy/);
});

test("projectile_raw_inputs_independently_reconstruct_every_derived_damage_value", () => {
  const morphology = COMBINED_ARMS_MORPHOLOGIES.find(({ id }) => id === "arbalest");
  const original = cell(morphology, "active", COMBINED_ARMS_SEEDS[0], "left", 0.1, 0, true);
  assert.deepEqual(reconstructCombinedArmsCell(original).failures, []);
  for (const [field, value] of [
    ["massKg", 0.13],
    ["arrivalSpeedMps", 41],
    ["signedShaftAlignment", 0.9],
    ["penetrationEfficiency", 0.8],
  ]) {
    const changed = structuredClone(original);
    changed.rawOrderedEvents.find(({ kind, weapon }) =>
      kind === "contact" && weapon === "projectile")[field] = value;
    assert.match(reconstructCombinedArmsCell(changed).failures.join("; "), /physical energy/,
      `${field} must be checked by independent physical reconstruction`);
  }
});

test("a_non_monotonic_ratchet_runs_every_rung_and_selects_the_lowest_passing_one", () => {
  const complete = report();
  assert.equal(assertCombinedArmsQualification(complete), complete);
  assert.deepEqual(complete.morphologies.map(({ selectedDurabilityMultiplier }) =>
    selectedDurabilityMultiplier), [0.1, 0.1, 0.1, 0.1, 0.1]);
  assert.equal(complete.morphologies.every(({ rungs }) => rungs.length === 7), true);
});

test("clearance_or_owner_contact_evidence_cannot_be_omitted_or_forged", () => {
  const morphology = COMBINED_ARMS_MORPHOLOGIES[0];
  const original = cell(morphology, "active", COMBINED_ARMS_SEEDS[0], "left", 0.1, 0, true);
  const clearance = structuredClone(original);
  clearance.rawOrderedEvents.find(({ kind }) => kind === "self-clearance").clearanceM = 0;
  assert.match(reconstructCombinedArmsCell(clearance).failures.join("; "), /self-clearance fell below/);
  const owner = structuredClone(original);
  owner.rawOrderedEvents.find(({ kind }) => kind === "contact").ownerRelation = "owner";
  assert.match(reconstructCombinedArmsCell(owner).failures.join("; "), /owner contact masqueraded/);
  const missingAudit = structuredClone(original);
  missingAudit.rawOrderedEvents = missingAudit.rawOrderedEvents.filter(({ kind }) => kind !== "combat-audit");
  assert.match(reconstructCombinedArmsCell(missingAudit).failures.join("; "), /refusal stream is absent/);

  const diagnosticOnly = structuredClone(original);
  diagnosticOnly.rawOrderedEvents.find(({ kind }) => kind === "self-clearance-diagnostic").clearanceM = -1;
  assert.deepEqual(reconstructCombinedArmsCell(diagnosticOnly).failures, [],
    "a whole-bout diagnostic may observe debris intersection without poisoning armed clearance");
  const idle = cell(morphology, "idle", COMBINED_ARMS_SEEDS[0], "left", 0.1, 0, true);
  assert.equal(idle.rawOrderedEvents.some(({ kind }) => kind === "self-clearance"), false);
  assert.deepEqual(reconstructCombinedArmsCell(idle).failures, []);
});

test("lifecycle_edge_clearance_keeps_the_same_strict_finite_safety_threshold", () => {
  const morphology = COMBINED_ARMS_MORPHOLOGIES.find(({ id }) => id === "arbalest");
  const original = cell(morphology, "active", COMBINED_ARMS_SEEDS[0], "left", 0.1, 0, true);
  const edge = original.rawOrderedEvents.find(({ kind, action }) =>
    kind === "self-clearance" && action === "cut-left");
  edge.method = "live-authoritative-primitive-samples-lifecycle-edge";
  edge.clearanceM = edge.requiredM - 0.001;
  assert.match(reconstructCombinedArmsCell(original).failures.join("; "),
    /self-clearance fell below/);

  const malformed = cell(morphology, "active", COMBINED_ARMS_SEEDS[0], "left", 0.1, 0, true);
  const malformedEdge = malformed.rawOrderedEvents.find(({ kind, action }) =>
    kind === "self-clearance" && action === "cut-left");
  malformedEdge.method = "live-authoritative-primitive-samples-lifecycle-edge";
  malformedEdge.clearanceM = Number.NaN;
  assert.match(reconstructCombinedArmsCell(malformed).failures.join("; "),
    /self-clearance fell below/);
});

test("Twinblade_two_cut_requires_ordered_opposite_supported_torso_wounds_with_vitality_continuity", () => {
  const morphology = COMBINED_ARMS_MORPHOLOGIES.find(({ id }) => id === "twinblade");
  const original = cell(morphology, "active", COMBINED_ARMS_SEEDS[0], "left", 0.1, 0, true);
  assert.equal(reconstructCombinedArmsCell(original).twoCutSequence, true);
  for (const mutate of [
    (row) => { row.rawOrderedEvents.find(({ phase }) => phase === "first-cut").phase = "chamber"; },
    (row) => { row.rawOrderedEvents.find(({ phase }) => phase === "second-cut").effectorId = "left-effigy-sword"; },
    (row) => { row.rawOrderedEvents.find(({ phase }) => phase === "second-cut").targetPartId = "arm"; },
    (row) => { row.rawOrderedEvents.find(({ phase }) => phase === "first-cut").standingAtStep = false; },
    (row) => { row.rawOrderedEvents.find(({ phase }) => phase === "second-cut").targetVitalityBefore = 8.5; },
  ]) {
    const changed = structuredClone(original); mutate(changed);
    assert.equal(reconstructCombinedArmsCell(changed).twoCutSequence, false);
  }
});

test("Twinblade_rung_freezes_buckler_and_empty_loadouts_instead_of_inferring_shield_loss", () => {
  const morphology = COMBINED_ARMS_MORPHOLOGIES.find(({ id }) => id === "twinblade");
  const original = rungCells(morphology, 0.1, true);
  assert.equal(reconstructCombinedArmsRung(morphology.id, original).passed, true);
  const allBucklers = structuredClone(original);
  for (const row of allBucklers) row.warriorLoadout.secondary = "buckler";
  assert.match(reconstructCombinedArmsRung(morphology.id, allBucklers).failures.join("; "),
    /explicit shielded\/unshielded loadouts/);

  const uncorrelated = structuredClone(original);
  for (const row of uncorrelated.filter(({ mode, warriorLoadout }) =>
    mode === "active" && warriorLoadout.secondary === "empty")) {
    for (const admission of row.rawOrderedEvents.filter(({ kind }) => kind === "attack-admitted")) {
      admission.lane = "shielded";
    }
  }
  assert.match(reconstructCombinedArmsRung(morphology.id, uncorrelated).failures.join("; "),
    /explicit shielded\/unshielded loadouts/,
  "corpus-wide lane labels cannot substitute for the lane belonging to an actual empty loadout");
});

test("a_new_source_digest_cannot_launder_a_rejected_morphology", () => {
  const rejected = report(new Set());
  assert.equal(rejected.status, "rejected");
  const changed = { ...rejected, sourceDigestBefore: "12345678", sourceDigestAfter: "12345678",
    sourceDigest: "12345678", status: "qualified" };
  assert.throws(() => assertCombinedArmsQualification(changed), /run digest contradicted|status contradicted/);
});

test("source_and_run_identity_are_checked_against_the_same_raw_corpus", () => {
  const complete = report();
  const movedDuringRun = { ...complete, sourceDigestAfter: "12345678" };
  assert.notEqual(combinedArmsRunDigest(movedDuringRun), complete.runDigest,
    "the bounded fold still binds the source identity that produced the raw cells");
  assert.throws(() => assertCombinedArmsQualification(movedDuringRun),
    /runtime source changed during qualification/);
  const relabelled = structuredClone(complete);
  relabelled.morphologies[0].rungs[0].cells[0].programDigest = "ffffffff";
  assert.throws(() => assertCombinedArmsQualification(relabelled),
    /run digest contradicted raw ordered evidence/);
});

test("procedural_and_fallback_visual_modes_produce_identical_authoritative_reports", () => {
  const authoritative = report();
  const mapped = structuredClone(authoritative);
  const procedural = structuredClone(authoritative);
  mapped.presentation = { requested: "mapped-pbr", effective: "mapped-pbr" };
  procedural.presentation = { requested: "procedural-pbr", effective: "procedural-pbr" };
  assert.equal(assertCombinedArmsQualification(mapped), mapped);
  assert.equal(assertCombinedArmsQualification(procedural), procedural);
  assert.equal(mapped.runDigest, procedural.runDigest);
});

test("the_streamed_report_matches_canonical_bytes_without_one_corpus_sized_allocation", async () => {
  const complete = report();
  assert.equal(combinedArmsRunDigest(complete), complete.runDigest);
  const directory = await mkdtemp(join(tmpdir(), "combined-arms-report-"));
  const target = join(directory, "report.json");
  try {
    await writeCombinedArmsQualificationReport(target, complete);
    assert.equal(await readFile(target, "utf8"), `${canonicalIntegrityJson(complete)}\n`);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("disk_backed_rung_finalization_and_report_bytes_match_the_small_in_memory_oracle", async () => {
  const complete = report();
  const directory = await mkdtemp(join(tmpdir(), "combined-arms-disk-report-"));
  const manifest = [];
  const cells = [];
  for (const morphology of complete.morphologies) for (const rung of morphology.rungs) {
    for (const row of rung.cells) {
      cells.push(row);
      manifest.push(Object.freeze(Object.fromEntries([
        "morphologyId", "qualifierId", "durabilityMultiplier", "mode", "seed",
        "constructSide", "warriorLoadout", "blueprintDigest", "controlDigest", "programDigest",
      ].map((field) => [field, row[field]]))));
    }
  }
  try {
    await readCombinedArmsQualificationCheckpoint(directory,
      { version: 2, sourceDigest: complete.sourceDigest, manifestDigest: "fixture", cells: cells.length },
      manifest);
    for (let index = 0; index < cells.length; index += 1) {
      await writeCombinedArmsQualificationCheckpointCell(directory, index, cells[index]);
    }
    await assert.rejects(finalizeCombinedArmsQualificationCheckpoint(directory, manifest,
      complete.sourceDigestBefore, "12345678"), /runtime source changed/);
    const receipt = await finalizeCombinedArmsQualificationCheckpoint(directory, manifest,
      complete.sourceDigestBefore, complete.sourceDigestAfter);
    assert.equal(receipt.runDigest, complete.runDigest);
    assert.equal(receipt.status, complete.status);
    assert.deepEqual(receipt.morphologies.map(({ selectedDurabilityMultiplier }) =>
      selectedDurabilityMultiplier), complete.morphologies.map(({ selectedDurabilityMultiplier }) =>
      selectedDurabilityMultiplier));
    const first = join(directory, "disk-report.json");
    const resumed = join(directory, "disk-report-resumed.json");
    await writeCombinedArmsQualificationCheckpointReport(first, receipt, directory, manifest);
    // A second pass models terminal reconstruction after resume: checkpoint cells are re-read,
    // not retained from the clean pass.
    const resumedReceipt = await finalizeCombinedArmsQualificationCheckpoint(directory, manifest,
      complete.sourceDigestBefore, complete.sourceDigestAfter);
    await writeCombinedArmsQualificationCheckpointReport(resumed, resumedReceipt, directory, manifest);
    assert.equal(await readFile(first, "utf8"), `${canonicalIntegrityJson(complete)}\n`);
    assert.equal(await readFile(resumed, "utf8"), await readFile(first, "utf8"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("the_combined_arms_CLI_freezes_positive_workers_and_requires_a_checkpoint_directory", () => {
  assert.throws(() => parseCombinedArmsQualificationArgs(["--combined-arms"]),
    /requires --out/);
  assert.deepEqual(parseCombinedArmsQualificationArgs(["--combined-arms", "--workers", "3",
    "--out", ".tools/qualification"]), { workers: 3, outDirectory: ".tools/qualification" });
  assert.throws(() => parseCombinedArmsQualificationArgs(["--combined-arms", "--workers", "0"]),
    /positive safe integer/);
  assert.throws(() => parseCombinedArmsQualificationArgs(["--combined-arms", "--out"]),
    /--out requires a value/);
  assert.throws(() => parseCombinedArmsQualificationArgs(["--combined-arms", "--shortcut"]),
    /unknown combined-arms qualification flag/);
});

test("checkpoint_resume_refuses_a_different_source_manifest_or_cell_identity", () => {
  const state = { version: 2, sourceDigest: "12345678", manifestDigest: "abcdef12", cells: 560 };
  assert.equal(assertCombinedArmsCheckpointState(state, structuredClone(state)), state);
  assert.throws(() => assertCombinedArmsCheckpointState(state, { ...state, sourceDigest: "87654321" }),
    /checkpoint identity does not match/);
  const identity = { morphologyId: "arbalest", qualifierId: "arbalest-combined-arms-v3",
    durabilityMultiplier: 0.1, mode: "active", seed: COMBINED_ARMS_SEEDS[0],
    constructSide: "left", warriorLoadout: { primary: "sword", secondary: "buckler" },
    blueprintDigest: "1234abcd", controlDigest: "2345bcde",
    programDigest: "3456cdef" };
  assert.equal(assertCombinedArmsCheckpointCell(identity, identity, 17), identity);
  assert.throws(() => assertCombinedArmsCheckpointCell({ ...identity, seed: 1 }, identity, 17),
    /cell 17 contradicted its frozen job identity/);
  assert.throws(() => assertCombinedArmsCheckpointCell({ ...identity,
    warriorLoadout: { primary: "sword", secondary: "empty" } }, identity, 17),
  /cell 17 contradicted its frozen job identity/);
});

test("a_hand_edited_checkpoint_cell_is_independently_replayed_before_qualification", () => {
  const morphology = COMBINED_ARMS_MORPHOLOGIES[0];
  const replayed = cell(morphology, "active", COMBINED_ARMS_SEEDS[0], "left", 0.1, 0, true);
  const forged = structuredClone(replayed);
  const contact = forged.rawOrderedEvents.find(({ kind }) => kind === "contact");
  contact.damage += 0.25;
  contact.postArmourDamage += 0.25;
  const identityFields = ["morphologyId", "qualifierId", "durabilityMultiplier", "mode", "seed",
    "constructSide", "warriorLoadout", "blueprintDigest", "controlDigest", "programDigest"];
  const identity = Object.fromEntries(identityFields.map((field) => [field, replayed[field]]));
  // Frozen identity fields still match; only an independent physical replay exposes the edit.
  assert.equal(assertCombinedArmsCheckpointCell(forged, identity, 17), forged);
  assert.throws(() => assertCombinedArmsCheckpointReplay(forged, replayed, 17),
    /checkpoint cell 17 did not reproduce independently/);
  assert.equal(assertCombinedArmsCheckpointReplay(replayed, structuredClone(replayed), 17), replayed);
});

test("qualification_workers_never_overlap_two_arenas_in_one_JavaScript_realm", async () => {
  const assignments = Array.from({ length: 6 }, (_, index) => Object.freeze({ index,
    job: Object.freeze({ value: index }) }));
  const oldSameRealm = await Promise.allSettled(assignments.map(({ job }) =>
    guardedSyntheticBout(job, { label: "isolated" })));
  assert.equal(oldSameRealm.some(({ status, reason }) => status === "rejected" &&
    /overlapped in one JavaScript realm/.test(reason.message)), true,
  "the former Promise.all scheduler must be demonstrably unsafe for a realm-global engine");

  const engineUrl = new URL("./fixtures/combined-arms-isolated-engine.mjs", import.meta.url);
  const serial = await runCombinedArmsJobsInWorkers({ assignments, workers: 1, engineUrl,
    engineOptions: { label: "isolated" } });
  const parallel = await runCombinedArmsJobsInWorkers({ assignments, workers: 3, engineUrl,
    engineOptions: { label: "isolated" } });
  assert.equal(canonicalIntegrityJson(parallel), canonicalIntegrityJson(serial));
  assert.deepEqual(serial.map(({ index }) => index), [0, 1, 2, 3, 4, 5]);
});

test("a_streaming_worker_waits_for_the_checkpoint_callback_and_retains_no_large_bouts", async () => {
  const engineUrl = new URL("./fixtures/combined-arms-isolated-engine.mjs", import.meta.url);
  const executions = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
  const assignments = Array.from({ length: 12 }, (_, index) => Object.freeze({ index,
    job: Object.freeze({ value: index, executions, payloadBytes: 1024 * 1024 }) }));
  let releaseFirst;
  const blocked = new Promise((resolve) => { releaseFirst = resolve; });
  let observedFirst;
  const first = new Promise((resolve) => { observedFirst = resolve; });
  const seen = [];
  const running = runCombinedArmsJobsInWorkers({ assignments, workers: 1, engineUrl,
    retainResults: false,
    onResult: async (index, bout) => {
      seen.push([index, bout.payload.length]);
      if (index === 0) {
        observedFirst();
        await blocked;
      }
    } });
  await first;
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(Atomics.load(new Int32Array(executions), 0), 1,
    "job two must not execute while job one's raw payload awaits its disk callback");
  releaseFirst();
  assert.equal(await running, null);
  assert.equal(seen.length, assignments.length);
  assert.equal(seen.every(([, bytes]) => bytes === 1024 * 1024), true);
});

test("qualification_worker_failures_name_the_frozen_job_index", async () => {
  const engineUrl = new URL("./fixtures/combined-arms-isolated-engine.mjs", import.meta.url);
  const assignments = [
    Object.freeze({ index: 41, job: Object.freeze({ value: 41 }) }),
    Object.freeze({ index: 42, job: Object.freeze({ value: 42, fail: true }) }),
  ];
  await assert.rejects(runCombinedArmsJobsInWorkers({ assignments, workers: 1, engineUrl }),
    /qualification worker job 42:.*synthetic qualification failure/s);
  await assert.rejects(runCombinedArmsJobsInWorkers({ assignments: [
    Object.freeze({ index: 42, job: Object.freeze({ value: 42 }) }),
  ], workers: 1,
    engineUrl: new URL("./fixtures/combined-arms-isolated-engine.mjs", import.meta.url),
    retainResults: false,
    onResult: async () => { throw new Error("disk full"); } }),
  /result callback for job 42 failed: disk full/);
});

test("one_and_two_isolated_workers_produce_identical_ordered_real_Havok_rows", async () => {
  const saved = withDurabilityMultiplier(humanoidSavedConstruct(), 1, HUMANOID_SENSORS);
  const definition = Object.freeze({ id: "swordbearer", qualifierId: "swordbearer-combined-arms-v1",
    baseSaved: saved, sensors: HUMANOID_SENSORS });
  const assignments = [COMBINED_ARMS_SEEDS[0], COMBINED_ARMS_SEEDS[1]].map((seed, index) =>
    Object.freeze({ index, job: Object.freeze({ definition, durabilityMultiplier: 1,
      mode: "active", saved, seed, constructSide: COMBINED_ARMS_SIDES[index],
      warriorLoadout: Object.freeze({ primary: "sword", secondary: "buckler" }) }) }));
  const serial = await runCombinedArmsJobsInWorkers({ assignments, workers: 1,
    engineOptions: { maxSteps: 8 } });
  const parallel = await runCombinedArmsJobsInWorkers({ assignments, workers: 2,
    engineOptions: { maxSteps: 8 } });
  assert.equal(canonicalIntegrityJson(parallel), canonicalIntegrityJson(serial));
  assert.deepEqual(parallel.map(({ warrior }) => warrior.seed),
    [COMBINED_ARMS_SEEDS[0], COMBINED_ARMS_SEEDS[1]]);
});

test("checkpoint_cells_written_by_workers_resume_in_frozen_manifest_order", async () => {
  const directory = await mkdtemp(join(tmpdir(), "combined-arms-checkpoint-"));
  const identity = { morphologyId: "arbalest", qualifierId: "arbalest-combined-arms-v3",
    durabilityMultiplier: 0.1, mode: "active", seed: COMBINED_ARMS_SEEDS[0],
    constructSide: "left", warriorLoadout: { primary: "sword", secondary: "buckler" },
    blueprintDigest: "1234abcd", controlDigest: "2345bcde", programDigest: "3456cdef" };
  const expected = { version: 2, sourceDigest: "12345678", manifestDigest: "abcdef12", cells: 1 };
  try {
    const empty = await readCombinedArmsQualificationCheckpoint(directory, expected, [identity]);
    assert.equal(empty.length, 1);
    assert.equal(empty[0], undefined);
    await writeCombinedArmsQualificationCheckpointCell(directory, 0, { ...identity, retained: true });
    const resumed = await readCombinedArmsQualificationCheckpoint(directory, expected, [identity]);
    assert.equal(resumed[0].retained, true);
    await assert.rejects(readCombinedArmsQualificationCheckpointCell(directory,
      { ...identity, seed: 1 }, 0), /checkpoint cell 0/);
    assert.equal(await readFile(join(directory, "cells", "000.json"), "utf8"),
      `${canonicalIntegrityJson({ ...identity, retained: true })}\n`);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
