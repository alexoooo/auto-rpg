import assert from "node:assert/strict";
import test from "node:test";

import { CONFIG } from "../src/config.ts";
import { constructSupportsSupportedLocomotion } from "../src/construct/assisted-locomotion.ts";
import { applySupportedLocomotionAlternatives, deriveCapabilities } from "../src/construct/capabilities.ts";
import { parseSavedConstruct, saveConstruct } from "../src/construct/codec.ts";
import { CONSTRUCT_CONTROLLERS, supportedLocomotionControllerDescriptor } from "../src/construct/controllers.ts";
import { ConstructLabBout } from "../src/construct/lab-bout.ts";
import { SUPPORTED_QUADRUPED_CRAWL_V1 } from "../src/construct/locomotion.ts";
import { ConstructMind } from "../src/construct/mind.ts";
import { ActionScheduler } from "../src/construct/scheduler.ts";
import { installedSensorsForBlueprint, SensorFrame } from "../src/construct/sensors.ts";
import { constructProbeCommand, controllerChoicesForSelection,
  replaceControlAction } from "../src/forge/control-editor.ts";
import { summarizeProbeSnapshots } from "../src/forge/probe.ts";
import { unitDefinition } from "../src/units.ts";
import { stepSupportedLocomotionState } from "../src/supported-locomotion-state.ts";
import { WARDEN_LIMB_ATTACHMENTS, WARDEN_SENSORS, wardenBlueprint, wardenControl,
  wardenProgram } from "../src/construct/warden.ts";
import { createConstructHeadlessArena } from "../scripts/construct-headless-arena.mjs";
import { assertWardenRecoveryABEvidence, measureWardenRecoveryAB } from "../scripts/warden-locomotion-ab.mjs";

const FIXED = 1 / CONFIG.world.physicsHz;
const command = (action, parameters = {}) => Object.freeze({ version: 1, requests: Object.freeze([
  Object.freeze({ request: Object.freeze({ action, parameters: Object.freeze(parameters) }),
    priority: 100, sourceIndex: 0 }),
]) });

test("the_Warden_raw_and_assisted_gaits_are_distinct_construction_time_Action_options", () => {
  const blueprint = wardenBlueprint("crossbow");
  const raw = wardenControl("crossbow", "raw");
  const assisted = wardenControl("crossbow", "assisted");
  const actionControllers = (graph) => Object.fromEntries(graph.actions
    .filter(({ id }) => ["move", "turn", "brace", "recover"].includes(id))
    .map(({ id, controller }) => [id, controller]));
  assert.deepEqual(actionControllers(raw), {
    move: "quadruped-move", turn: "quadruped-turn", brace: "brace", recover: "recover",
  });
  assert.deepEqual(actionControllers(assisted), {
    move: "supported-quadruped-move", turn: "supported-quadruped-turn",
    brace: "supported-quadruped-brace", recover: "supported-quadruped-recover",
  });
  assert.equal(constructSupportsSupportedLocomotion(blueprint, raw), false);
  assert.equal(constructSupportsSupportedLocomotion(blueprint, assisted), true);
  assert.equal(unitDefinition("bronze-warden").supportedLocomotionPort, "supported-locomotion-v1");
  assert.equal(raw.actions.some(({ id }) => id.startsWith("crawl-without-")), false);
  assert.equal(raw.groups.some(({ id }) => id.startsWith("locomotion-without-")), false);
  assert.equal(wardenProgram("crossbow", "raw").rules.some(({ id }) => id.startsWith("crawl-without-")), false);
});

const resources = Object.freeze({ chargeJ: 24_000, heatJ: 0, overheated: false,
  ammunition: Object.freeze({ "dorsal-magazine": 12 }), reloadS: Object.freeze({ "dorsal-magazine": 0 }) });
const hardware = (blueprint, lostJoints = [], lostModules = []) => ({
  joints: new Set(blueprint.joints.map(({ id }) => id).filter((id) => !lostJoints.includes(id))),
  modules: new Set(blueprint.modules.map(({ id }) => id).filter((id) => !lostModules.includes(id))),
  sensors: new Set(WARDEN_SENSORS.map(({ id }) => id)), resources,
});

test("one_lost_Warden_limb_admits_only_its_exact_named_three_support_crawl", () => {
  const blueprint = wardenBlueprint("crossbow");
  const graph = wardenControl("crossbow", "assisted");
  const ids = WARDEN_LIMB_ATTACHMENTS.map(({ id }) => id);
  for (const missing of ids) {
    const group = graph.groups.find(({ id }) => id === `locomotion-without-${missing}`);
    const action = graph.actions.find(({ id }) => id === `crawl-without-${missing}`);
    const remaining = ids.filter((id) => id !== missing);
    assert.ok(group && action, missing);
    assert.deepEqual(Object.keys(group.bindings).sort(), [...remaining, "balance-chain"].sort());
    assert.equal(group.joints.length, 13);
    assert.equal(group.modules.length, 3);
    assert.equal(group.joints.some((id) => id.startsWith(`bearing-${missing}-`)), false);
    assert.equal(group.modules.includes(`foot-${missing}`), false);
    assert.deepEqual(action.claims, ["resource:balance"]);
    assert.equal(action.parameters.speed.max, SUPPORTED_QUADRUPED_CRAWL_V1.MAX_SPEED_MPS);
  }

  const rowsByMissing = new Map();
  for (const missing of ids) {
    const base = deriveCapabilities(graph, hardware(blueprint,
      [`bearing-${missing}-upper`], [`foot-${missing}`]));
    const rows = applySupportedLocomotionAlternatives(graph, base);
    rowsByMissing.set(missing, rows);
    const capability = (id) => rows.find(({ action }) => action === id);
    assert.equal(capability("move").available, false, missing);
    assert.equal(capability(`crawl-without-${missing}`).available, true, missing);
    for (const other of ids.filter((id) => id !== missing)) {
      assert.equal(capability(`crawl-without-${other}`).available, false,
        `${missing} damage must not admit ${other} fallback`);
    }
  }

  const intact = applySupportedLocomotionAlternatives(graph, deriveCapabilities(graph, hardware(blueprint)));
  assert.equal(intact.find(({ action }) => action === "move").available, true);
  for (const id of ids) {
    assert.match(intact.find(({ action }) => action === `crawl-without-${id}`).reason,
      /primary locomotion action "move" remains available/);
  }

  const missing = "front-left";
  const rows = rowsByMissing.get(missing);
  const reversedGraph = { ...graph, actions: [...graph.actions].reverse() };
  const reversed = applySupportedLocomotionAlternatives(reversedGraph,
    deriveCapabilities(reversedGraph, hardware(blueprint,
      [`bearing-${missing}-upper`], [`foot-${missing}`])));
  assert.deepEqual(Object.fromEntries(rows.map(({ action, available, reason }) => [action, [available, reason]])),
    Object.fromEntries(reversed.map(({ action, available, reason }) => [action, [available, reason]])));
});

test("two_Warden_crawls_cannot_double_spend_balance_and_command_order_not_graph_order_decides", () => {
  const blueprint = wardenBlueprint("crossbow");
  const source = wardenControl("crossbow", "assisted");
  const actionIds = ["crawl-without-front-left", "crawl-without-rear-right"];
  const actions = actionIds.map((id) => source.actions.find((row) => row.id === id));
  const groups = actions.map(({ group }) => source.groups.find(({ id }) => id === group));
  const readings = Object.fromEntries(blueprint.joints.flatMap((joint) => joint.angularAxes.map((axis) =>
    [`${joint.id}:${axis.id}`, { angleRad: 0, speedRadS: 0, minRad: axis.minRad, maxRad: axis.maxRad,
      maxSpeedRadS: axis.maxSpeedRadS, maxForceNm: axis.maxTorqueNm }])));
  for (const joint of blueprint.joints) if (joint.angularAxes.length === 1) {
    readings[joint.id] = readings[`${joint.id}:${joint.angularAxes[0].id}`];
  }
  const run = (orderedActions) => {
    const graph = { version: 1, groups, actions: orderedActions };
    const port = { authority: (_action, group) => ({ actionId: _action.id, groupId: group.id,
      carrierPartId: "core", carrierToRootJointIds: [], supportBindings: [], balanceChainJointIds: [],
      braceCapacityMultiplier: 1, gaitStabilityScale: SUPPORTED_QUADRUPED_CRAWL_V1.GAIT_STABILITY_SCALE }),
    stage() {}, priorSample: () => ({ request: null }), clearSubmission() {}, clearAll() {} };
    const scheduler = new ActionScheduler(graph, CONSTRUCT_CONTROLLERS, { write() {} }, port);
    const command = { version: 1, requests: actionIds.map((action, sourceIndex) => ({
      request: { action, parameters: { forward: 1, right: 0, yaw: 0,
        speed: SUPPORTED_QUADRUPED_CRAWL_V1.MAX_SPEED_MPS } }, priority: 1, sourceIndex })) };
    const facts = Object.fromEntries(WARDEN_LIMB_ATTACHMENTS.map(({ id }) => [`contact:foot-${id}`, true]));
    return scheduler.step(command, { joints: readings, facts }, 1 / 240);
  };
  const first = run(actions);
  const reversed = run([...actions].reverse());
  const digest = (events) => events.map(({ kind, action, reason = null }) => [kind, action, reason]);
  assert.deepEqual(digest(reversed), digest(first));
  assert.equal(first.filter(({ kind }) => kind === "started").length, 1);
  assert.equal(first.filter(({ kind }) => kind === "refused").length, 1, JSON.stringify(first));

  const base = deriveCapabilities(source, hardware(blueprint)).map((row) => row.action === "move"
    ? { ...row, available: false, reason: "primary fixture withdrawn" }
    : row.action.startsWith("crawl-without-") ? { ...row, available: true, reason: null } : row);
  const conflicted = applySupportedLocomotionAlternatives(source, base, actionIds);
  for (const id of actionIds) {
    const row = conflicted.find(({ action }) => action === id);
    assert.equal(row.available, false);
    assert.match(row.reason, /one "resource:balance" fallback must be named/);
  }
});

test("Forge_can_author_probe_save_reload_and_physically_fight_with_an_exact_Warden_crawl", async () => {
  const blueprint = wardenBlueprint("crossbow");
  const source = wardenControl("crossbow", "assisted");
  const program = structuredClone(wardenProgram("crossbow", "assisted"));
  const group = source.groups.find(({ id }) => id === "locomotion-without-front-left");
  const descriptor = controllerChoicesForSelection(group, blueprint)
    .find(({ controller }) => controller === "supported-quadruped-crawl");
  assert.ok(descriptor);
  const control = replaceControlAction(source, { id: "forge-three-support-crawl",
    controller: descriptor.controller, group: group.id, claims: ["resource:balance"],
    parameters: descriptor.parameters }, blueprint);
  const canonicalRule = program.rules.find(({ action }) => action === "crawl-without-front-left");
  const forgeCondition = structuredClone(canonicalRule.condition);
  // This Forge exercise authors a closer fallback band than the production arbalest's 6 m
  // standoff. Keep every topology and fresh-support premise from the canonical rule; only the
  // range constant changes so the saved Action is exercised in the 2.6 m headless fixture.
  forgeCondition.values.at(-1).right.value = 2;
  program.rules = [
    { ...structuredClone(canonicalRule), id: "forge-crawl-when-front-left-is-lost",
      action: "forge-three-support-crawl", priority: 100, condition: forgeCondition },
    ...program.rules.filter(({ id }) => id !== canonicalRule.id),
  ];
  const parameters = { forward: 0.5, right: 0.1, yaw: -0.2,
    speed: SUPPORTED_QUADRUPED_CRAWL_V1.MAX_SPEED_MPS };
  const before = constructProbeCommand(control, "forge-three-support-crawl", parameters);
  const saved = saveConstruct("Assisted Warden fallback", blueprint, control, program, WARDEN_SENSORS);
  const loaded = parseSavedConstruct(JSON.stringify(saved), WARDEN_SENSORS);
  const after = constructProbeCommand(loaded.control, "forge-three-support-crawl", parameters);
  assert.deepEqual(after, before);
  assert.deepEqual(loaded.digests, saved.digests);

  const installedSensors = installedSensorsForBlueprint(blueprint, WARDEN_SENSORS);
  const frame = new SensorFrame(installedSensors);
  for (const sensor of installedSensors) {
    if (sensor.id === "contact-foot-front-left") continue;
    frame.publish(sensor.id, sensor.id === "joint-live-bearing-front-left-upper" ? false :
      sensor.unit === "boolean" ? true : sensor.id === "opponent-range" ? 7 :
        sensor.id === "ammo-dorsal-magazine" ? 18 :
          sensor.id.startsWith("module-health-") || sensor.id.startsWith("part-health-") ? 1 : 0);
  }
  const requests = new ConstructMind(loaded.program, loaded.control, installedSensors).decide(frame, 1).requests;
  assert.ok(requests.some(({ request }) => request.action === "forge-three-support-crawl"));
  assert.equal(requests.some(({ request }) => request.action === "crawl-without-front-left"), false);
  assert.equal(requests.some(({ request }) => request.action === "crawl-without-rear-right"), false);

  const expectedFresh = ["front-right", "rear-left", "rear-right"];
  const exercise = async (mode) => {
    const arena = await createConstructHeadlessArena();
    const bout = new ConstructLabBout(arena.scene, loaded, loaded, WARDEN_SENSORS,
      CONFIG.fighter.separation);
    try {
      const left = bout.construct("left");
      // The fixture is about the severed body's exact fallback. Keep its opponent on a real
      // public brace Action so an unrelated raw idle ragdoll cannot slide into the carrier port.
      bout.construct("right").control.installCommandSource(`forge-${mode}-idle`, () => command("brace"));
      left.control.installCommandSource(`forge-${mode}-settle`, () => command("brace"));
      for (let step = 0; step < CONFIG.world.physicsHz; step += 1) bout.step(FIXED);
      left.state.severJoint("bearing-front-left-upper");
      if (mode === "probe") {
        left.control.setDebugCommand(after);
        left.control.installHuman();
      } else left.control.installPolicy("construct-program");
      const start = bout.rootPositions().left;
      const snapshots = [];
      let unsupportedMotionSamples = 0;
      for (let step = 0; step < CONFIG.world.physicsHz * 2; step += 1) {
        const snapshot = bout.step(FIXED).left.snapshot;
        snapshots.push(snapshot);
        const allowed = snapshot.locomotion?.allowed;
        if (allowed && Math.hypot(allowed.localForward, allowed.localRight) > 1e-6 &&
            expectedFresh.some((role) => snapshot.facts[`contact-foot-${role}`] !== true ||
              !snapshot.locomotion.freshSupportBindings.includes(role))) unsupportedMotionSamples += 1;
      }
      const timeline = summarizeProbeSnapshots(snapshots);
      const end = bout.rootPositions().left;
      assert.ok(snapshots.some((snapshot) => snapshot.active.some(({ action }) =>
        action === "forge-three-support-crawl")), `${mode} never executed the Forge-authored Action`);
      assert.equal(timeline.scheduler.some(({ action, kind }) => action === "forge-three-support-crawl" &&
        (kind === "refused" || kind === "failed")), false, JSON.stringify(timeline.scheduler));
      assert.ok(Math.hypot(end.x - start.x, end.z - start.z) > 0.15,
        `${mode} did not physically move the reloaded Forge body`);
      assert.equal(unsupportedMotionSamples, 0,
        `${mode} moved without every exact fresh three-support binding`);
      assert.ok(timeline.locomotion.length > 0 && timeline.motors.writes > 0,
        `${mode} did not cross the physical pair resolver and real motor sink`);
      return Object.freeze({ timeline, start, end });
    } finally { bout.dispose(); arena.dispose(); }
  };
  const probe = await exercise("probe");
  const fight = await exercise("fight");
  for (const { timeline } of [probe, fight]) {
    assert.ok(timeline.locomotion.some(({ diagnostic }) =>
      diagnostic.activeGroup === "locomotion-without-front-left"));
  }
});

test("Forge_offers_assisted_Warden_Actions_from_compatibility_data_without_a_name_switch", () => {
  const blueprint = wardenBlueprint("crossbow");
  const raw = wardenControl("crossbow", "raw").groups.find(({ id }) => id === "locomotion");
  const assisted = wardenControl("crossbow", "assisted").groups.find(({ id }) => id === "locomotion");
  const rawChoices = controllerChoicesForSelection(raw, blueprint).map(({ controller }) => controller);
  const assistedChoices = controllerChoicesForSelection(assisted, blueprint).map(({ controller }) => controller);
  assert.ok(rawChoices.includes("quadruped-move"));
  assert.equal(rawChoices.includes("supported-quadruped-move"), false);
  for (const mode of ["move", "turn", "brace", "recover"]) {
    const controller = `supported-quadruped-${mode}`;
    assert.ok(assistedChoices.includes(controller), `${controller} is exposed by its saved role descriptor`);
    assert.ok(supportedLocomotionControllerDescriptor(controller));
  }
});

test("an_admitted_rise_may_lift_its_planting_terminal_but_still_aborts_on_lost_live_support", () => {
  const authority = { carrierPartId: "core", supportBindings: [{ role: "front-left" }],
    braceCapacityMultiplier: 1, gaitStabilityScale: 1 };
  const boundary = { dt: 1 / 240, safeBoundarySequence: 9, authority, liveSupport: true,
    postureSupported: false, supportedMassKg: 244, authoredShoves: [], recoverRequested: true,
    recoveryGroundAvailable: true,
    occupancyClear: true, hitInterrupted: false, supportEvidence: [{ safeBoundarySequence: 9,
      supportBinding: "front-left", contactedOwner: "arena-floor", category: "standable-world",
      point: [0, 0, 0], upwardNormal: [0, 1, 0], freshness: "current" }] };
  const fallen = { state: "fallen", specificImpulseMps: 0, supportMissingS: 0,
    fallenElapsedS: 0.35, risingElapsedS: 0, driveStaged: false };
  const rising = stepSupportedLocomotionState(fallen, boundary);
  assert.equal(rising.state, "rising");
  assert.equal(stepSupportedLocomotionState(rising, { ...boundary, safeBoundarySequence: 10,
    supportEvidence: [] }).state, "rising", "the bounded path may lift its admitting foot");
  assert.equal(stepSupportedLocomotionState(rising, { ...boundary, safeBoundarySequence: 10,
    liveSupport: false, supportEvidence: [] }).state, "fallen", "lost hardware still aborts immediately");
});

test("assisted_Warden_lateral_recovery_is_measured_beside_the_retained_raw_gait", { timeout: 120_000 }, async () => {
  const evidence = assertWardenRecoveryABEvidence(await measureWardenRecoveryAB());
  assert.deepEqual(evidence.impulseNsByAxis, { longitudinal: 450, lateral: 600 });
  assert.deepEqual(evidence.cells.map(({ mode, axis }) => `${mode}/${axis}`), [
    "raw/longitudinal", "raw/lateral", "assisted/longitudinal", "assisted/lateral",
  ]);
  assert.ok(evidence.cells.every(({ physicalFell }) => physicalFell), JSON.stringify(evidence));
  const assisted = evidence.cells.filter(({ mode }) => mode === "assisted");
  const raw = evidence.cells.filter(({ mode }) => mode === "raw");
  assert.ok(raw.every(({ recoveredAfterFall, settledRecoveryStep, finalUpright, finalSupportState }) =>
    !recoveredAfterFall && settledRecoveryStep === null && !finalUpright && finalSupportState === "legacy"),
  JSON.stringify(evidence));
  assert.ok(assisted.every(({ recoveredAfterFall, settledRecoveryStep, finalUpright, finalSupportState }) =>
    recoveredAfterFall && settledRecoveryStep !== null && finalUpright && finalSupportState === "supported"),
  JSON.stringify(evidence));
  const launderedRaw = structuredClone(evidence);
  launderedRaw.cells[0].recoveredAfterFall = true;
  assert.throws(() => assertWardenRecoveryABEvidence(launderedRaw), /raw negative-control row was laundered/);
  const launderedAssisted = structuredClone(evidence);
  launderedAssisted.cells[2].finalUpright = false;
  assert.throws(() => assertWardenRecoveryABEvidence(launderedAssisted), /assisted row did not complete/);
});
