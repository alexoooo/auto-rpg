import assert from "node:assert/strict";
import test from "node:test";

import { deriveLocomotionFootprint, StandableWorldRegistry,
  VirtualLocomotionCarrier, resolveCarrierPair } from "../src/supported-locomotion-runtime.ts";
import { locomotionModeForPair, unitDefinition } from "../src/units.ts";
import { humanoidSavedConstruct, HUMANOID_SENSORS } from "../src/construct/humanoid.ts";
import { arbalestSavedConstruct, ARBALEST_SENSORS } from "../src/construct/arbalest.ts";
import { flatSupportedWorldRegistry, PhysicalSupportedLocomotionPort, recoveryHitInterrupted, resolvePhysicalSupportedPair } from
  "../src/supported-locomotion-production.ts";
import { assertConstructWarriorLocomotionCorpus, CONSTRUCT_WARRIOR_LOCOMOTION_V1,
  runConstructWarriorLocomotionCorpus } from "../scripts/construct-warrior-locomotion.mjs";
import { runConstructWarriorBout } from "../scripts/construct-warrior-bout.mjs";
import { assertSupportedLocomotionBoundaryCorpus,
  runSupportedLocomotionBoundaryCorpus } from "../scripts/supported-locomotion-boundaries.mjs";

let boundaryCorpusPromise;
const boundaryCorpus = () => boundaryCorpusPromise ??=
  runSupportedLocomotionBoundaryCorpus().then(assertSupportedLocomotionBoundaryCorpus);

test("supported_and_legacy_pairs_choose_one_mode_for_both_bodies_before_construction", () => {
  const warrior = unitDefinition("warrior");
  for (const supported of ["warrior", "broot", "kaykit-knight", "swordbearer-effigy",
    "twinblade-effigy", "arbalest-effigy", "bronze-warden"]) {
    assert.equal(locomotionModeForPair(warrior, unitDefinition(supported)), "supported", supported);
  }
  for (const legacy of ["centipede"]) {
    assert.equal(locomotionModeForPair(warrior, unitDefinition(legacy)), "legacy", legacy);
    assert.equal(locomotionModeForPair(unitDefinition(legacy), warrior), "legacy", `${legacy} mirror`);
  }
});

test("pair_resolution_prevents_the_raw_two_root_overlap_symmetrically", () => {
  const registry = new StandableWorldRegistry();
  const footprint = deriveLocomotionFootprint({ radiusM: 0.5, heightM: 1.8,
    provenance: { profileId: "mutation-fixture", source: "fighter-bind-geometry",
      measuredAt: "symmetric root fixture" } });
  const make = (x) => new VirtualLocomotionCarrier({ position: { x, y: 0.9, z: 0 }, yaw: 0 },
    footprint, { maxSpeedMps: 1, maxAccelerationMps2: 10,
      maxYawSpeedRadS: 2, maxYawAccelerationRadS2: 20 }, new Set());
  const left = make(-0.55);
  const right = make(0.55);
  const request = (localRight) => ({ localForward: 0, localRight, yaw: 0, recover: false });
  const leftProposal = left.propose(request(1), 1);
  const rightProposal = right.propose(request(-1), 1);
  const rawGap = rightProposal.next.x - leftProposal.next.x;
  assert.ok(rawGap < footprint.radiusM * 2, "the fixture must reproduce overlap without pair resolution");
  const allowed = resolveCarrierPair(leftProposal, rightProposal, registry);
  assert.ok(allowed.left.x < leftProposal.displacement.x, "left root must yield at contact");
  assert.ok(allowed.right.x > rightProposal.displacement.x, "right root must yield at contact");
  left.commit(leftProposal, allowed.left);
  right.commit(rightProposal, allowed.right);
  assert.ok(right.state.x - left.state.x >= footprint.radiusM * 2 - 1e-12);
  assert.ok(Math.abs(left.state.x + right.state.x) < 1e-12, "equal roots resolve without a one-sided pusher");
});

test("withdrawn_Construct_authority_cannot_resurrect_from_the_prior_boundary", () => {
  const registry = flatSupportedWorldRegistry();
  const footprint = deriveLocomotionFootprint({ radiusM: 0.5, heightM: 1.8,
    provenance: { profileId: "authority-fixture", source: "construct-bind-geometry",
      measuredAt: "withdrawal fixture" } });
  const root = { sample: () => ({ motionType: "dynamic", position: { x: 0, y: 0.9, z: 0 },
    velocity: { x: 0, y: 0, z: 0 }, massKg: 10, released: false }),
  applyForce() {}, clearDrive() {} };
  const token = Object.freeze({ actionId: "move", groupId: "locomotion", carrierPartId: "pelvis",
    carrierToRootJointIds: Object.freeze([]), supportBindings: Object.freeze([{ role: "left-foot" }]),
    balanceChainJointIds: Object.freeze([]), braceCapacityMultiplier: 1, gaitStabilityScale: 1 });
  const port = new PhysicalSupportedLocomotionPort({ id: "authority-fixture", position: root.sample().position,
    yaw: 0, footprint, ownerPartIds: new Set(), root, registry, supportedMassKg: 10,
    authority: () => null, liveSupport: () => true, postureSupported: () => true,
    supportBindings: ["left-foot"], resolveActionAuthority: () => token });
  const action = { id: "move", group: "locomotion", controller: "supported-biped-move",
    claims: ["resource:balance"], parameters: {} };
  const group = { id: "locomotion", joints: [], modules: [], bindings: {} };
  try {
    port.beginControlStep();
    assert.equal(port.authority(action, group), token);
    port.stage({ action: "move", group: "locomotion", authority: token,
      request: { localForward: 1, localRight: 0, yaw: 0, recover: false } });
    port.beginControlStep();
    assert.equal(port.diagnostic().authority, true);
    port.clearSubmission("move", "locomotion", token, "request withdrawn");
    port.beginControlStep();
    assert.equal(port.diagnostic().authority, false,
      "the body-level fallback must not revive scheduler-owned permission");
  } finally { port.dispose(); }
});

test("a_reparameterized_locomotion_Action_keeps_its_declared_brace_at_the_next_safe_boundary", () => {
  const registry = flatSupportedWorldRegistry();
  const footprint = deriveLocomotionFootprint({ radiusM: 0.5, heightM: 1.8,
    provenance: { profileId: "reparameterized-authority-fixture", source: "construct-bind-geometry",
      measuredAt: "scheduler replacement boundary" } });
  const root = { sample: () => ({ motionType: "animated", position: { x: 0, y: 0.9, z: 0 },
    velocity: { x: 0, y: 0, z: 0 }, massKg: 10, released: false }),
  applyForce() {}, clearDrive() {} };
  const first = Object.freeze({ actionId: "advance", groupId: "locomotion", carrierPartId: "pelvis",
    carrierToRootJointIds: Object.freeze([]), supportBindings: Object.freeze([{ role: "left-foot" }]),
    balanceChainJointIds: Object.freeze([]), braceCapacityMultiplier: 2, gaitStabilityScale: 1 });
  const replacement = Object.freeze({ ...first });
  const port = new PhysicalSupportedLocomotionPort({ id: "reparameterized-authority-fixture",
    position: root.sample().position, yaw: 0, footprint, ownerPartIds: new Set(), root, registry,
    supportedMassKg: 10, authority: () => null, liveSupport: () => true, postureSupported: () => true,
    supportBindings: ["left-foot"], resolveActionAuthority: () => replacement });
  const request = (yaw) => ({ localForward: 0, localRight: 0, yaw, recover: false });
  try {
    port.beginControlStep();
    port.stage({ action: "advance", group: "locomotion", authority: first, request: request(0) });
    port.beginControlStep();
    assert.equal(port.diagnostic().stability.fallAtMps, 0.028);
    assert.equal(port.authority({ id: "advance", group: "locomotion", controller: "supported-biped-combat-move",
      claims: ["resource:balance"], parameters: {} }, { id: "locomotion", joints: [], modules: [], bindings: {} }),
    replacement, "the scheduler may probe the replacement before cancelling the prior Action");
    port.clearSubmission("advance", "locomotion", first, "parameters changed");
    port.stage({ action: "advance", group: "locomotion", authority: replacement, request: request(0.3) });
    port.queueStabilityEvent({ kind: "specific-impulse", specificImpulseMps: 0.016 });
    port.beginControlStep();
    assert.equal(port.diagnostic().state.state, "staggered",
      "the sub-braced hit may stagger but must not release the newly reparameterized carrier");
    assert.equal(port.diagnostic().stability.fallAtMps, 0.028);
  } finally { port.dispose(); }
});

test("only_a_fresh_staggering_transfer_can_interrupt_a_bounded_recovery", () => {
  const authority = { carrierPartId: "pelvis", supportBindings: [], braceCapacityMultiplier: 1,
    gaitStabilityScale: 1 };
  assert.equal(recoveryHitInterrupted([{ kind: "specific-impulse", specificImpulseMps: 0.005999 }], 10, authority), false,
    "a physical scrape must not make recovery mathematically impossible");
  assert.equal(recoveryHitInterrupted([{ kind: "specific-impulse", specificImpulseMps: 0.006 }], 10, authority), true,
    "the actual stagger edge must remain an interrupt");
  assert.equal(recoveryHitInterrupted([{ horizontalShoveNs: [0.06, 0] }], 10, authority), true,
    "ordinary authored weapon shoves use the same specific-impulse boundary");
  assert.equal(recoveryHitInterrupted([{ kind: "specific-impulse", specificImpulseMps: 0.011 }], 10,
    { ...authority, braceCapacityMultiplier: 2 }), false,
    "a declared planted brace raises recovery interruption capacity as it raises fall capacity");
});

const physicalFixture = (id, x, registry, overrides = {}) => {
  const footprint = deriveLocomotionFootprint({ radiusM: 0.5, heightM: 1.8,
    provenance: { profileId: id, source: "construct-bind-geometry", measuredAt: "physical port fixture" } });
  const rootState = { motionType: "dynamic", position: { x, y: 0.9, z: 0 },
    velocity: { x: 0, y: 0, z: 0 }, massKg: 10, released: false };
  const root = { sample: () => rootState, applyForce() {}, clearDrive() {} };
  return new PhysicalSupportedLocomotionPort({ id, position: rootState.position, yaw: 0,
    footprint, ownerPartIds: new Set(), root, registry, supportedMassKg: 10,
    authority: () => ({ carrierPartId: "pelvis", supportBindings: [
      { role: "left-foot" }, { role: "right-foot" }], braceCapacityMultiplier: 1, gaitStabilityScale: 1 }),
    liveSupport: () => true, postureSupported: () => true,
    supportBindings: ["left-foot", "right-foot"],
    supportPoint: () => ({ x, y: 0.04, z: 0 }), ...overrides });
};

test("an_admitted_animated_root_is_held_even_without_a_locomotion_request", () => {
  const registry = flatSupportedWorldRegistry();
  const rootState = { motionType: "animated", position: { x: 0, y: 0.9, z: 0 },
    velocity: { x: 0, y: 0, z: 0 }, massKg: 10, released: false };
  const driven = [];
  const port = physicalFixture("idle-root-hold", 0, registry, {
    root: { sample: () => rootState, applyForce() {}, clearDrive() {} },
    driveAnimatedRoot: (position, velocity, yaw, dt) => driven.push({ position, velocity, yaw, dt }),
  });
  try {
    port.beginControlStep();
    const proposal = port.proposal(1 / 240);
    port.commitPhysical(proposal, proposal.displacement, 1 / 240);
    assert.equal(port.diagnostic().requested, null,
      "the fixture must not smuggle in a locomotion request");
    assert.equal(port.diagnostic().allowed, null,
      "maintaining support must not be reported as an admitted command");
    assert.deepEqual(driven, [{ position: { x: 0, y: 0.9, z: 0 },
      velocity: { x: 0, y: 0, z: 0 }, yaw: 0, dt: 1 / 240 }]);
  } finally { port.dispose(); }
});

test("production_diagnostic_is_plain_immutable_support_evidence_and_names_motion_blockage", () => {
  const registry = flatSupportedWorldRegistry();
  const groupRows = [{ id: "locomotion-left", live: true, reason: null,
    bindings: [{ id: "left-foot", live: true, reason: null }] }];
  const port = physicalFixture("diagnostic", 12.49, registry, { supportGroups: () => groupRows });
  try {
    port.beginControlStep();
    port.request({ localForward: 0, localRight: 1, yaw: 0, recover: false });
    const proposal = port.proposal(1);
    port.commitPhysical(proposal, { x: 0, z: 0, yaw: 0 }, 1);
    const row = port.diagnostic();
    assert.equal(row.state.state, "supported");
    assert.equal(row.stability.fallAtMps, 0.014);
    assert.deepEqual(row.supportGroups, groupRows);
    assert.deepEqual(row.requested, { localForward: 0, localRight: 1, yaw: 0, recover: false });
    assert.deepEqual(row.allowed, { localForward: 0, localRight: 0, yaw: 0, recover: false });
    assert.equal(row.blockedReason, "carrier motion is constrained by world or opponent footprint");
    assert.equal(Object.isFrozen(row), true);
    assert.equal(Object.isFrozen(row.state), true);
    assert.equal(Object.isFrozen(row.supportGroups), true);
    assert.equal(Object.isFrozen(row.supportGroups[0].bindings[0]), true);
    assert.deepEqual(Object.keys(row).filter((key) => /body|shape|motor|handle/i.test(key)), []);
  } finally { port.dispose(); }
});

test("production_support_evidence_queries_each_live_terminal_and_the_recovery_footprint", () => {
  const seen = [];
  const registry = new StandableWorldRegistry();
  registry.register({ id: "floor", category: "standable-world", ownerPartId: null,
    upwardNormal: [0, 1, 0], sweep: () => null,
    support: (at) => { seen.push({ ...at }); return { colliderId: "floor", fraction: 1,
      point: { x: at.x, y: 0, z: at.z }, upwardNormal: [0, 1, 0] }; } });
  const points = { "left-foot": { x: -0.2, y: 0.04, z: 0.1 },
    "right-foot": { x: 0.2, y: 0.05, z: -0.1 } };
  const port = physicalFixture("terminal-evidence", 7, registry,
    { supportPoint: (binding) => points[binding] ?? null });
  try {
    port.beginControlStep();
    assert.deepEqual(seen, [points["left-foot"], points["right-foot"], { x: 7, y: 0, z: 0 }]);
    assert.notDeepEqual(seen[0], seen[1], "two support roles must not publish one carrier-centre hit twice");
    assert.notDeepEqual(seen[2], seen[0],
      "recovery clearance must query the carrier footprint rather than borrowing terminal evidence");
  } finally { port.dispose(); }
});

test("a_fallen_carrier_reserves_recovery_space_instead_of_becoming_an_invisible_overlap", () => {
  const registry = flatSupportedWorldRegistry();
  const fallen = physicalFixture("fallen", -0.5, registry);
  const moving = physicalFixture("moving", 0.5, registry);
  try {
    fallen.beginControlStep(); moving.beginControlStep();
    fallen.queueStabilityEvent({ horizontalShoveNs: [1, 0] });
    fallen.beginControlStep(); moving.beginControlStep();
    assert.equal(fallen.state, "fallen");
    moving.request({ localForward: 0, localRight: -1, yaw: 0, recover: false });
    assert.equal(resolvePhysicalSupportedPair(fallen, moving, 0.25), true);
    assert.equal(moving.carrierGround().x, 0.5,
      "the supported body cannot stand over the fallen body and permanently obstruct its rise");
  } finally { fallen.dispose(); moving.dispose(); }
});

test("recovery_uses_the_bounded_rising_path_and_restores_root_and_collision_only_after_completion", () => {
  const registry = flatSupportedWorldRegistry();
  const rootState = { motionType: "dynamic", position: { x: 0.3, y: 0.2, z: -0.1 },
    velocity: { x: 0, y: 0, z: 0 }, massKg: 10, released: false };
  const forces = [];
  const transitions = [];
  const port = physicalFixture("rising", 0, registry, {
    root: { sample: () => rootState, applyForce: (force) => forces.push(force), clearDrive() {} },
    releaseRoot: () => transitions.push("release-root"),
    restoreRoot: () => transitions.push("restore-root"),
    releaseAnatomyCollision: () => transitions.push("release-collision"),
    restoreSupportedAnatomyCollision: () => transitions.push("restore-collision"),
  });
  const recover = { localForward: 0, localRight: 0, yaw: 0, recover: true };
  const cycle = (dt) => {
    port.request(recover);
    const proposal = port.proposal(dt);
    port.commitPhysical(proposal, proposal.displacement, dt);
    port.beginControlStep();
  };
  try {
    port.beginControlStep();
    port.queueStabilityEvent({ horizontalShoveNs: [0.15, 0] });
    port.beginControlStep();
    assert.equal(port.state, "fallen");
    assert.equal(port.diagnostic().releaseReason, "stability threshold was exceeded");
    assert.equal(port.diagnostic().recoveryProgress, 0);
    assert.deepEqual(transitions, ["release-root", "release-collision"]);
    for (let index = 0; index < 4; index += 1) cycle(0.1);
    assert.equal(port.state, "rising");
    assert.ok(port.diagnostic().recoveryProgress >= 0 && port.diagnostic().recoveryProgress < 1);
    assert.deepEqual(port.carrierGround(), { x: rootState.position.x, y: 0, z: rootState.position.z },
      "recovery re-anchors the virtual carrier above the live fallen root");
    assert.equal(transitions.includes("restore-root"), false);
    for (let index = 0; index < 6 && port.state !== "supported"; index += 1) cycle(0.1);
    assert.equal(port.state, "supported");
    assert.equal(port.diagnostic().releaseReason, null);
    assert.equal(port.diagnostic().recoveryProgress, null);
    assert.ok(forces.some(({ y }) => y > 0), "RisingActuator frames reach the bounded root motor");
    assert.deepEqual(transitions, ["release-root", "release-collision", "restore-root", "restore-collision"]);
  } finally { port.dispose(); }
});

test("a_bounded_clear_retreat_separates_an_occupied_fallen_carrier_before_rising", () => {
  const registry = flatSupportedWorldRegistry();
  const fallen = physicalFixture("occupied-fallen", 0, registry);
  const blocker = physicalFixture("occupied-blocker", 0.75, registry);
  const recover = { localForward: 0, localRight: 0, yaw: 0, recover: true };
  try {
    fallen.beginControlStep(); blocker.beginControlStep();
    fallen.queueStabilityEvent({ horizontalShoveNs: [1, 0] });
    fallen.beginControlStep();
    for (let index = 0; index < 5; index += 1) {
      fallen.updatePairOccupancy(blocker);
      fallen.request(recover);
      const proposal = fallen.proposal(0.1);
      fallen.commitPhysical(proposal, proposal.displacement, 0.1);
      fallen.beginControlStep();
    }
    assert.equal(fallen.state, "rising");
    assert.ok(fallen.carrierGround().x < -0.25,
      "the recovery carrier must retreat outside the blocker footprint before rising");
  } finally { fallen.dispose(); blocker.dispose(); }
});

test("an_excessive_overlap_remains_fallen_instead_of_teleporting_clear", () => {
  const registry = flatSupportedWorldRegistry();
  const fallen = physicalFixture("coincident-fallen", 0, registry);
  const blocker = physicalFixture("coincident-blocker", 0, registry);
  const recover = { localForward: 0, localRight: 0, yaw: 0, recover: true };
  try {
    fallen.beginControlStep(); blocker.beginControlStep();
    fallen.queueStabilityEvent({ horizontalShoveNs: [1, 0] });
    fallen.beginControlStep();
    for (let index = 0; index < 5; index += 1) {
      fallen.updatePairOccupancy(blocker); fallen.request(recover);
      const proposal = fallen.proposal(0.1);
      fallen.commitPhysical(proposal, proposal.displacement, 0.1); fallen.beginControlStep();
    }
    assert.equal(fallen.state, "fallen");
    assert.deepEqual(fallen.carrierGround(), { x: 0, y: 0, z: 0 });
  } finally { fallen.dispose(); blocker.dispose(); }
});

test("a_real_close_opponent_no_longer_traps_the_live_Arbalest_ragdoll", async () => {
  const saved = arbalestSavedConstruct();
  const report = await runConstructWarriorBout({ saved, sensors: ARBALEST_SENSORS,
    warriorPolicy: "idle", constructSide: "left",
    warriorLoadout: { primary: "empty", secondary: "empty" }, maxSteps: 5 * 240,
    stabilityShoves: [{ atStep: 0, horizontalShoveNs: [12, 0] }],
    fixturePlacement: { construct: { x: 0, z: 0, facing: 0 },
      warrior: { x: 0, z: 0.75, facing: Math.PI } } });
  const states = report.locomotionTimeline.map(({ construct }) => construct?.state.state);
  const fallen = states.indexOf("fallen");
  const rising = states.indexOf("rising", fallen + 1);
  const supported = states.indexOf("supported", rising + 1);
  assert.ok(fallen >= 0 && rising > fallen && supported > rising,
    `real close-opponent recovery omitted fallen -> rising -> supported: ${states}`);
  assert.ok(report.locomotion.constructRootDisplacementM > 0,
    `the real carrier must physically separate before it rises: ${JSON.stringify(report.locomotion)}`);
});

test("real_held_blade_and_shield_wall_pressure_stays_inside_part_speed_and_joint_frame_bounds", async () => {
  const report = await boundaryCorpus();
  for (const cell of report.cells.filter(({ kind }) => kind === "wall-pressure")) {
    assert.ok(cell.solver.heldWorldContactsByKind[cell.heldKind] > 0,
      `the held ${cell.heldKind} never produced a real WORLD collision callback`);
    assert.ok(cell.solver.minimumHeldWallClearanceByKindM[cell.heldKind] <=
      report.fixture.maximumHeldWallPenetrationM,
    `the held ${cell.heldKind} callback was not physically near the named wall`);
    assert.ok(cell.solver.maximumHeldWallPenetrationByKindM[cell.heldKind] <=
      report.fixture.maximumHeldWallPenetrationM);
    assert.ok(cell.solver.maximumPartSpeedMps <= report.fixture.maximumPartSpeedMps);
    assert.ok(cell.solver.maximumConstructJointFrameErrorM <= report.fixture.maximumJointFrameErrorM);
  }
  const forgedPenetration = structuredClone(report);
  const wall = forgedPenetration.cells.find(({ kind }) => kind === "wall-pressure");
  wall.solver.maximumHeldWallPenetrationByKindM[wall.heldKind] = 0.021;
  assert.throws(() => assertSupportedLocomotionBoundaryCorpus(forgedPenetration),
    /held geometry penetration contradicted signed clearance or phased through the wall/);
  const impossiblePenetration = structuredClone(report);
  const impossibleWall = impossiblePenetration.cells.find(({ kind }) => kind === "wall-pressure");
  impossibleWall.solver.maximumHeldWallPenetrationByKindM[impossibleWall.heldKind] = -1;
  assert.throws(() => assertSupportedLocomotionBoundaryCorpus(impossiblePenetration),
    /held geometry penetration contradicted signed clearance or phased through the wall/);
  const floorOnlyContact = structuredClone(report);
  const distantWall = floorOnlyContact.cells.find(({ kind, heldKind }) =>
    kind === "wall-pressure" && heldKind === "sword");
  distantWall.solver.minimumHeldWallClearanceByKindM.sword = 0.5;
  assert.throws(() => assertSupportedLocomotionBoundaryCorpus(floorOnlyContact),
    /named held body never reached the measured wall boundary/);
  const missingHit = structuredClone(report);
  missingHit.cells.pop();
  missingHit.fixture.cellIds.pop();
  assert.throws(() => assertSupportedLocomotionBoundaryCorpus(missingHit),
    /frozen boundary fixture changed/);
});

test("a_real_weapon_hit_during_rising_aborts_recovery_on_the_next_safe_boundary", async () => {
  const report = await boundaryCorpus();
  const cell = report.cells.find(({ kind }) => kind === "hit-interrupt");
  const rising = cell.locomotionSteps.findIndex(({ construct }) => construct?.state === "rising");
  assert.ok(rising >= 0, "the real combat fixture must enter rising");
  const interrupted = cell.locomotionSteps.findIndex((row, index) => index > rising &&
    row.construct?.state === "fallen" && cell.locomotionSteps[index - 1]?.construct?.state === "rising");
  assert.ok(interrupted > rising, "a later safe boundary must abort rising");
  const priorAtS = cell.locomotionSteps[interrupted - 1].atS;
  const fallenAtS = cell.locomotionSteps[interrupted].atS;
  const physicalHit = cell.warriorContacts.find(({ atS, weapon, damage }) =>
    atS >= priorAtS - 1e-9 && atS <= fallenAtS + 1e-9 && weapon === report.fixture.hit.warriorLoadout.primary &&
    damage > 0);
  assert.ok(physicalHit, "the interrupt boundary must retain the damaging real Havok weapon contact");
  assert.deepEqual(cell.stabilityShoves, [report.fixture.hit.initialShove],
    "only the step-zero fall fixture is authored; the later interrupt must remain a real hit");
});

test("Warrior_and_each_humanoid_Construct_close_in_both_orders_without_a_clinch_heap", async () => {
  const report = assertConstructWarriorLocomotionCorpus(await runConstructWarriorLocomotionCorpus());
  assert.equal(report.summary.physicalCells, 26);
  assert.equal(report.summary.qualifiedCells, 26);
  assert.ok(report.summary.minimumClosureM >= report.fixture.minimumClosureM);
  assert.ok(report.summary.totalDamage > 0, "the corpus must retain real combat rather than a visual walk cycle");
  assert.deepEqual(new Set(report.cells.map(({ schedulerOrder }) => schedulerOrder)),
    new Set(["construct-then-warrior", "warrior-then-construct"]));
  for (const cell of report.cells) {
    assert.equal(cell.locomotionMode, "supported", cell.id);
    assert.equal(cell.support.bothPortsObserved, true, cell.id);
    assert.equal(cell.support.constructLiveThroughout, true, cell.id);
    assert.equal(cell.support.warriorLiveThroughout, true, cell.id);
    assert.equal(cell.posture.constructValidThroughout || cell.constructReleasedByCombat, true, cell.id);
    assert.equal(cell.posture.warriorValidThroughout || cell.warriorReleasedByCombat, true, cell.id);
    assert.ok(cell.range.minimumM >= cell.range.footprintSeparationM -
      cell.range.maximumAllowedPenetrationM, cell.id);
  }
  const combatCells = report.cells.filter(({ mode }) => mode === "combat");
  assert.ok(combatCells.some(({ warriorReleasedByCombat }) => warriorReleasedByCombat),
    "the mixed corpus must retain at least one real supported-to-ragdoll combat release");
  // This mixed corpus pins a real release and recovery path, not its mirror count or exact shove
  // threshold. Low-number wounds and authored tactics legitimately change which combat cells cross
  // it; the dedicated physical stability bracket tests both sides of the threshold symmetrically.
  assert.deepEqual(report.owed, []);
  assert.deepEqual(Object.keys(report.evidence).sort(),
    ["boundaries", "obstacles", "scaled", "warriorWarrior"]);

  for (const mutate of [
    (cell) => { cell.range.closureM = -999; },
    (cell) => { cell.range.minimumM = 0; },
    (cell) => { cell.posture.constructValidThroughout = false; },
  ]) {
    const forged = structuredClone(report); mutate(forged.cells[0]);
    assert.throws(() => assertConstructWarriorLocomotionCorpus(forged),
      /supported locomotion physical corpus failed/);
  }
  const forgedWarriorPosture = structuredClone(report);
  const releasedWarrior = forgedWarriorPosture.cells.find((cell) =>
    cell.posture.warriorValidThroughout === false && cell.warriorReleasedByCombat === true);
  assert.ok(releasedWarrior, "the real corpus must retain a Warrior physical release to guard");
  releasedWarrior.posture.warriorValidThroughout = true;
  releasedWarrior.warriorReleasedByCombat = false;
  assert.throws(() => assertConstructWarriorLocomotionCorpus(forgedWarriorPosture),
    /supported locomotion physical corpus failed/);
  const forgedFixture = structuredClone(report);
  forgedFixture.fixture.minimumClosureM = 0;
  forgedFixture.summary.owedCells = 0;
  assert.throws(() => assertConstructWarriorLocomotionCorpus(forgedFixture),
    /frozen fixture changed/);
});

test("Swordbearer_recovers_from_the_historical_topple_while_an_idle_raised_guard_blocks_its_real_blade", async () => {
  const historicalToppleStep = Math.round(19.5417 * 240);
  for (const constructSide of ["left", "right"]) {
    const report = await runConstructWarriorBout({ saved: humanoidSavedConstruct(),
      sensors: HUMANOID_SENSORS, warriorPolicy: "idle", constructSide, maxSteps: 24 * 240,
      stabilityShoves: [{ atStep: historicalToppleStep, horizontalShoveNs: [12, 0] }] });
    assert.deepEqual(report.stabilityShoves,
      [{ atStep: historicalToppleStep, horizontalShoveNs: [12, 0] }],
    "the report retains the authored toppling fixture rather than inferring recovery from posture samples");
    const states = report.locomotionTimeline.map(({ construct }) => construct?.state.state);
    const fallen = states.indexOf("fallen");
    const rising = states.indexOf("rising", fallen + 1);
    const recovered = states.indexOf("supported", rising + 1);
    assert.ok(fallen >= 0 && rising > fallen && recovered > rising,
      `${constructSide} Swordbearer did not complete fallen -> rising -> supported: ${states}`);
    // This fixture deliberately gives the idle Warrior its ordinary sword-and-buckler loadout.
    // The Swordbearer must still drive real sweeps before the authored shove, and the physical
    // guard must stop each contact it receives. It is not an invisible whole-body immunity: an
    // exposed hand may honestly be grazed around the guard, while the live Duelist bout owns the
    // separate requirement for unblocked damaging exchanges.
    const guardedSweeps = report.constructContacts.filter((row) => row.sourceModuleId === "effigy-sword" &&
      row.effectorId === "effigy-sword" && row.action === "sweep" && row.blocked === true);
    assert.ok(guardedSweeps.length > 0,
      `${constructSide} never physically brought its sword into the idle Warrior's raised guard`);
    assert.equal(guardedSweeps.every(({ damage }) => damage === 0), true,
      `${constructSide} recorded damage through its continuously raised physical sword guard`);
    assert.ok(report.minimumRangeM >= 0.625 - 0.020,
      `${constructSide} Swordbearer penetrated the supported pair footprint`);
  }
});

test("Swordbearer_closes_attacks_and_preserves_recovery_space_without_heap_or_air_walk", async () => {
  for (const constructSide of ["left", "right"]) {
    const report = await runConstructWarriorBout({ saved: humanoidSavedConstruct(),
      sensors: HUMANOID_SENSORS, warriorPolicy: "duelist", constructSide, maxSteps: 10 * 240 });
    assert.ok(report.selectedRules.includes("full-close-distance"),
      `${constructSide} never selected full-close-distance`);
    assert.ok(report.selectedRules.includes("sweep-visible-opponent"),
      `${constructSide} never selected the target-centred physical sweep`);
    assert.ok(report.startedActions.includes("sweep"),
      `${constructSide} did not start an ordinary mounted sword Action`);
    assert.ok(report.constructContacts.length + report.warriorContacts.length > 0,
      `${constructSide} produced no physical weapon exchange`);
    assert.equal(report.actionTimeline.some(({ action, kind }) => action === "sweep" && kind === "refused"), false,
      `${constructSide} left its sword Action permanently refused`);
    // `runConstructWarriorBout` retains the evidence from which the locomotion corpus derives a
    // combat release; it does not publish the corpus cell's derived booleans itself. Reconstruct
    // that same fact here instead of reading absent fields and silently treating every released
    // ragdoll as an upright pair whose transient minimum must satisfy the carrier envelope.
    const physicalContacts = report.constructContacts.length + report.warriorContacts.length;
    const constructPosture = report.posture.firstPostureLossS === null &&
      report.posture.minimumRootUp > report.posture.thresholds.minimumRootUp &&
      report.posture.minimumTorsoHeightM > report.posture.thresholds.minimumTorsoHeightM &&
      report.posture.minimumHeadAboveTorsoM > report.posture.thresholds.minimumHeadAboveTorsoM;
    const warriorPhysical = report.locomotionTimeline.map(({ warriorPhysical }) => warriorPhysical).filter(Boolean);
    const warriorPosture = report.locomotionSteps.length > 0 &&
      report.locomotionSteps.every(({ warrior }) => warrior?.postureSupported === true) &&
      warriorPhysical.length > 0 && warriorPhysical.every((sample) =>
        sample.pelvisUp > CONSTRUCT_WARRIOR_LOCOMOTION_V1.minimumWarriorPelvisUp &&
        sample.torsoHeightAbovePelvisM >
          CONSTRUCT_WARRIOR_LOCOMOTION_V1.minimumWarriorTorsoAbovePelvisM &&
        sample.headHeightAboveTorsoM >
          CONSTRUCT_WARRIOR_LOCOMOTION_V1.minimumWarriorHeadAboveTorsoM);
    const constructReleasedByCombat = !constructPosture && physicalContacts > 0 &&
      report.locomotionSteps.some(({ construct }) => construct?.state === "fallen");
    const warriorReleasedByCombat = !warriorPosture && physicalContacts > 0 &&
      report.locomotionSteps.some(({ warrior }) => warrior?.state === "fallen");
    const releasedByCombat = constructReleasedByCombat || warriorReleasedByCombat;
    const retainedRangeM = releasedByCombat ? report.locomotion.finalRangeM : report.minimumRangeM;
    assert.ok(retainedRangeM >= 0.625 - 0.020,
      `${constructSide} Swordbearer ${releasedByCombat ? "finished inside" : "entered"} the old clinch heap at ${retainedRangeM} m`);
    assert.equal(report.locomotionSteps.some(({ construct }) => construct?.state === "fallen" &&
      construct.allowed && Math.hypot(construct.allowed.localForward, construct.allowed.localRight) > 0), false,
    `${constructSide} Swordbearer air-walked while fallen`);
  }
});
