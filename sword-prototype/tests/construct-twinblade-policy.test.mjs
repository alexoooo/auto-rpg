import assert from "node:assert/strict";
import test from "node:test";

import { CONFIG } from "../src/config.ts";
import { BIPED_BRACE_POSE } from "../src/construct/biped.ts";
import { CONSTRUCT_CONTROLLERS, supportedLocomotionControllerDescriptor } from "../src/construct/controllers.ts";
import { ConstructMind } from "../src/construct/mind.ts";
import { ActionScheduler } from "../src/construct/scheduler.ts";
import { installedSensorsForBlueprint, SensorFrame } from "../src/construct/sensors.ts";
import { solveSwordbearerSweepCentre } from "../src/construct/mounts.ts";
import { solveTwinbladeScissorCutPath, TWINBLADE_MINIMUM_CUT_PHASE_S, TWINBLADE_SCISSOR_CUT } from
  "../src/construct/twinblade-combat.ts";
import { TWINBLADE_DUELIST } from "../src/construct/twinblade-duelist.ts";
import { twinbladeBlueprint, twinbladeControl, twinbladeProgram, twinbladeSwordBindMetrics,
  TWINBLADE_SENSORS } from "../src/construct/twinblade.ts";

const blueprint = twinbladeBlueprint();
const graph = twinbladeControl();
const sensors = installedSensorsForBlueprint(blueprint, TWINBLADE_SENSORS);
const program = twinbladeProgram();

const values = ({ range = 1.4, visible = true, blocker = true, blockerX = -0.45,
  weapon = true, weaponX = 0.55, weaponY = 0.25, weaponZ = range,
  targetX = 0, targetY = 0.15, targetZ = range,
  upright = true, opponentUpright = true, opponentRising = false,
  leftSupport = true, rightSupport = true } = {}) => ({
  "core-upright": upright, "core-roll-rad": 0, "core-pitch-rad": 0,
  "opponent-range": range, "opponent-relative-speed": 0,
  "opponent-local-x": targetX, "opponent-local-y": targetY, "opponent-local-z": targetZ,
  "opponent-local-vx": 0, "opponent-local-vy": 0, "opponent-local-vz": 0,
  "opponent-blocker-present": blocker,
  "opponent-blocker-local-x": blocker ? blockerX : 0,
  "opponent-blocker-local-y": blocker ? 0.1 : 0,
  "opponent-blocker-local-z": blocker ? range : 0,
  "opponent-weapon-present": weapon,
  "opponent-weapon-local-x": weapon ? weaponX : 0,
  "opponent-weapon-local-y": weapon ? weaponY : 0,
  "opponent-weapon-local-z": weapon ? weaponZ : 0,
  "line-of-sight": visible,
  "opponent-upright": opponentUpright, "opponent-rising": opponentRising,
  "contact-left-foot": leftSupport, "contact-right-foot": rightSupport,
  "slip-left-foot": 0, "slip-right-foot": 0,
  "contact:contact-left-foot": leftSupport, "contact:contact-right-foot": rightSupport,
});

const decideFrom = (selectedProgram, options, runtime) => {
  const frame = new SensorFrame(sensors);
  const facts = values(options);
  for (const sensor of sensors) frame.publish(sensor.id,
    facts[sensor.id] ?? (sensor.unit === "boolean" ? false : 0));
  return new ConstructMind(selectedProgram, graph, sensors).decide(frame, 1, runtime);
};
const decide = (options, runtime) => decideFrom(program, options, runtime);
const actions = (options) => decide(options).requests.map(({ request }) => request.action);
const dualCutRequest = (options) => decide(options).requests
  .find(({ request }) => request.action === "dual-cut")?.request;
const DUAL_CUT_PARAMETERS = ["blocker-outward-m", "blocker-target-height-offset-m",
  "brace-ankle-rad", "brace-knee-rad", "brace-sole-rad", "cut-advance-fraction",
  "cutter-chamber-cross-m", "cutter-chamber-drop-m",
  "motor-force-fraction", "motor-speed-fraction", "open-lane-offset-m",
  "settle-allowance-s", "target-height-offset-m", "travel-multiplier"];
const includesExpression = (expression, predicate) => predicate(expression) ||
  (expression.op === "not" ? includesExpression(expression.value, predicate) :
    "values" in expression ? expression.values.some((value) => includesExpression(value, predicate)) :
      "left" in expression && (includesExpression(expression.left, predicate) ||
        includesExpression(expression.right, predicate)));

// These scheduler tests exercise the authored program without constructing a Havok body. The
// supported brace still needs the same private authority seam production supplies; omitting the
// seam would test legacy admission rather than the graph the Twinblade actually runs.
const schedulerLocomotion = (stage = () => {}) => ({
  authority(action, group) {
    if (!supportedLocomotionControllerDescriptor(action.controller)) return null;
    return Object.freeze({ actionId: action.id, groupId: group.id, carrierPartId: "pelvis",
      carrierToRootJointIds: Object.freeze([]), supportBindings: Object.freeze([]),
      balanceChainJointIds: Object.freeze([]), braceCapacityMultiplier: 1,
      gaitStabilityScale: 1 });
  },
  stage,
  priorSample() { return Object.freeze({ request: null }); },
  clearSubmission() {},
  clearAll() {},
});

const scheduler = (sink) => new ActionScheduler(graph, CONSTRUCT_CONTROLLERS, sink,
  schedulerLocomotion());

const schedulerView = (options, mountAngle = 0) => {
  const joints = {};
  for (const joint of blueprint.joints) for (const axis of joint.angularAxes) {
    const row = { angleRad: joint.id.includes("sword") ? mountAngle : 0, speedRadS: 0,
      minRad: axis.minRad, maxRad: axis.maxRad, maxSpeedRadS: axis.maxSpeedRadS,
      maxForceNm: axis.maxTorqueNm };
    joints[`${joint.id}:${axis.id}`] = row;
    if (joint.angularAxes.length === 1) joints[joint.id] = row;
  }
  return { joints, facts: values(options) };
};

test("the_Twinblade_program_selects_one_combined_attack_without_claim_refusals", () => {
  assert.deepEqual(actions(), ["dual-cut", "stabilize"]);
  assert.deepEqual(Object.keys(dualCutRequest().parameters).sort(), DUAL_CUT_PARAMETERS,
    "the authored rule must supply every required combined-cut parameter");
  assert.equal(program.rules.find(({ action }) => action === "dual-cut")
    .parameters["settle-allowance-s"].value.unit, "seconds");
  assert.equal(dualCutRequest().parameters["open-lane-offset-m"], 0.14);
  assert.equal(dualCutRequest().parameters["target-height-offset-m"], 0.35);
  assert.equal(dualCutRequest().parameters["blocker-target-height-offset-m"], 0.60);
  assert.equal(dualCutRequest().parameters["cut-advance-fraction"], 0.20);
  assert.equal(dualCutRequest({ range: 1.70 })?.action, "dual-cut",
    "mutating the measured 1.80 m admission back to 1.65 m must fail this bracket");
  assert.equal(dualCutRequest({ range: 1.80 }), undefined);
  assert.deepEqual(graph.actions.find(({ id }) => id === "dual-cut")
    .parameters["open-lane-offset-m"], { kind: "number", min: 0, max: 0.35, unit: "metres" });
  assert.deepEqual(graph.actions.find(({ id }) => id === "dual-cut")
    .parameters["target-height-offset-m"], { kind: "number", min: -0.20, max: 0.50, unit: "metres" });
  assert.deepEqual(graph.actions.find(({ id }) => id === "dual-cut")
    .parameters["blocker-target-height-offset-m"],
  { kind: "number", min: -0.20, max: 0.80, unit: "metres" });
  assert.deepEqual(graph.actions.find(({ id }) => id === "dual-cut")
    .parameters["cut-advance-fraction"], { kind: "number", min: 0, max: 0.50, unit: "scalar" });
  assert.deepEqual(actions({ visible: false }), ["dual-mount-neutral", "brace", "stabilize"]);
  assert.deepEqual(actions({ blocker: false }), ["dual-cut", "stabilize"]);
  assert.deepEqual(actions({ leftSupport: false, rightSupport: false }),
    ["dual-mount-neutral", "brace", "stabilize"]);
  assert.deepEqual(actions({ upright: false }), ["dual-cut", "stabilize"],
    "a fallen Twinblade within its physical lane must keep the armed recovery-cut active");
  const cutCondition = program.rules.find(({ action }) => action === "dual-cut").condition;
  assert.equal(includesExpression(cutCondition,
    ({ op, id }) => op === "sensor" && id === "line-of-sight"), true);
  assert.equal(includesExpression(cutCondition,
    ({ op, action }) => op === "active" && action === "dual-cut"), true);

  for (const options of [{}, { visible: false }, { blocker: false }]) {
    const writes = [];
    const events = scheduler({ write: (row) => writes.push(row) })
      .step(decide(options), schedulerView(options), 1 / CONFIG.world.physicsHz);
    assert.equal(events.some(({ kind }) => kind === "refused" || kind === "failed"), false,
      JSON.stringify(events));
    assert.ok(writes.length > 0);
  }
});

test("an_active_dual_cut_survives_fact_flicker_and_suppresses_every_passive_rule", () => {
  const scheduler = new ActionScheduler(graph, CONSTRUCT_CONTROLLERS, { write() {} }, schedulerLocomotion());
  const started = scheduler.step(decide(), schedulerView(), 1 / CONFIG.world.physicsHz);
  assert.equal(started.some(({ kind, action }) => kind === "started" && action === "dual-cut"), true);
  assert.equal(scheduler.isActionActive("dual-cut"), true);

  const flickers = [
    { visible: false }, { range: 0.8 }, { range: 2.4 }, { blocker: false },
    { leftSupport: false, rightSupport: false }, { upright: false },
  ];
  for (const options of flickers) {
    const command = decide(options, scheduler);
    assert.deepEqual(command.requests.map(({ request }) => request.action), ["dual-cut", "stabilize"],
      `commitment lost for ${JSON.stringify(options)}`);
    const events = scheduler.step(command, schedulerView(options), 1 / CONFIG.world.physicsHz);
    assert.equal(events.some(({ kind, action }) => action === "dual-cut" &&
      (kind === "cancelled" || kind === "started")), false, JSON.stringify(events));
  }
});

test("the_Twinblade_attacks_a_visible_unshielded_torso", () => {
  const request = dualCutRequest({ blocker: false });
  assert.equal(request?.action, "dual-cut");
  const writes = [];
  const events = scheduler({ write: (row) => writes.push(row) })
    .step(decide({ blocker: false }), schedulerView({ blocker: false }), 1 / CONFIG.world.physicsHz);
  assert.equal(events.some(({ kind }) => kind === "refused" || kind === "failed"), false,
    JSON.stringify(events));
  assert.equal(writes.some(({ joint }) => joint === "left-sword-yaw"), true);
  assert.equal(writes.some(({ joint }) => joint === "sword-yaw"), true);
});

test("a_stably_downed_opponent_remains_a_physical_melee_target_when_the_upright_ray_hits_the_floor", () => {
  assert.equal(dualCutRequest({ visible: false, opponentUpright: false, opponentRising: false })?.action,
    "dual-cut");
  assert.equal(dualCutRequest({ visible: false, opponentUpright: false, opponentRising: true }), undefined,
    "an opponent actively rising keeps the recovery window");
});

test("an_open_lane_Twinblade_cut_uses_distinct_torso_paths_in_both_mirrors", () => {
  const target = { x: 0.22, y: 0.15, z: 1.4 };
  const path = solveTwinbladeScissorCutPath(target, { kind: "open-torso" });
  const mirrored = solveTwinbladeScissorCutPath({ ...target, x: -target.x }, { kind: "open-torso" });
  assert.equal(path.lane, "open-torso");
  assert.notDeepEqual(path.left.commit, path.right.commit);
  assert.deepEqual(path.left.commit,
    solveSwordbearerSweepCentre({ ...target, x: target.x + 0.10 }, twinbladeSwordBindMetrics("left")));
  assert.deepEqual(path.right.commit,
    solveSwordbearerSweepCentre({ ...target, x: target.x - 0.10 }, twinbladeSwordBindMetrics("right")),
  "both blades must cross the centreline; same-side convergence makes this physical assertion fail");
  assert.notDeepEqual(path.left, mirrored.left,
    "a nonzero target makes the mirror assertion sensitive to broken geometry");
  assert.notDeepEqual(path.right, mirrored.right);
});

test("the_supported_dual_cut_advances_under_brace_authority_without_resurrecting_missing_support", () => {
  const staged = [];
  const port = schedulerLocomotion((row) => staged.push(row));
  const active = new ActionScheduler(graph, CONSTRUCT_CONTROLLERS, { write() {} }, port);
  const events = active.step(decide(), schedulerView(), 1 / CONFIG.world.physicsHz);
  assert.equal(events.some(({ action, kind }) => action === "dual-cut" &&
    (kind === "refused" || kind === "failed")), false, JSON.stringify(events));
  assert.deepEqual(staged.filter(({ action }) => action === "dual-cut").map(({ request }) => request), [{
    localForward: 0.20, localRight: 0, yaw: 0, recover: false,
  }]);

  const recoveringStages = [];
  const recovering = new ActionScheduler(graph, CONSTRUCT_CONTROLLERS, { write() {} },
    schedulerLocomotion((row) => recoveringStages.push(row)));
  const recoveringEvents = recovering.step(decide({ upright: false }),
    schedulerView({ upright: false }), 1 / CONFIG.world.physicsHz);
  assert.equal(recoveringEvents.some(({ kind }) => kind === "refused" || kind === "failed"), false,
    JSON.stringify(recoveringEvents));
  assert.deepEqual(recoveringStages.filter(({ action }) => action === "dual-cut")
    .map(({ request }) => request), [{
    localForward: 0.20, localRight: 0, yaw: 0, recover: true,
  }], "the same armed Action must request bounded support recovery instead of becoming passive");

  const noAuthority = schedulerLocomotion();
  noAuthority.authority = () => null;
  const unsupported = new ActionScheduler(graph, CONSTRUCT_CONTROLLERS, { write() {} }, noAuthority);
  const legacy = unsupported.step(decide(), schedulerView(), 1 / CONFIG.world.physicsHz);
  assert.equal(legacy.some(({ action, kind }) => action === "dual-cut" && kind === "failed"), false,
    "a missing authority cannot be manufactured by the controller; legacy keeps only its motor brace");
});

test("completion_hardware_loss_and_explicit_stop_release_dual_cut_commitment", () => {
  const complete = scheduler({ write() {} });
  complete.step(decide(), schedulerView(), 1 / CONFIG.world.physicsHz);
  let completed = false;
  for (let step = 0; step < 600 && !completed; step += 1) {
    const events = complete.step(decide({ visible: false }, complete), schedulerView({ visible: false }), 1 / 60);
    completed = events.some(({ kind, action }) => kind === "completed" && action === "dual-cut");
  }
  assert.equal(completed, true, "the bounded controller must release its own commitment on completion");
  assert.equal(complete.isActionActive("dual-cut"), false);
  assert.deepEqual(decide({ visible: false }, complete).requests.map(({ request }) => request.action),
    ["dual-mount-neutral", "brace", "stabilize"]);

  const unavailable = scheduler({ write() {} });
  unavailable.step(decide(), schedulerView(), 1 / CONFIG.world.physicsHz);
  const hardwareLoss = unavailable.step(decide({ blocker: false }, unavailable), schedulerView({ blocker: false }),
    1 / CONFIG.world.physicsHz, [{ action: "dual-cut", group: "dual-sword-braced-body",
      available: false, reason: 'missing module "left-effigy-sword"', parameterBounds: {} }]);
  assert.equal(hardwareLoss.some(({ kind, action, reason }) => kind === "cancelled" &&
    action === "dual-cut" && /left-effigy-sword/.test(reason)), true, JSON.stringify(hardwareLoss));
  assert.equal(unavailable.isActionActive("dual-cut"), false);

  const stopped = scheduler({ write() {} });
  stopped.step(decide(), schedulerView(), 1 / CONFIG.world.physicsHz);
  assert.equal(stopped.stop("verdict").some(({ kind, action, reason }) => kind === "cancelled" &&
    action === "dual-cut" && reason === "verdict"), true);
  assert.equal(stopped.isActionActive("dual-cut"), false);
  assert.equal(decide({ visible: false }, stopped).requests.some(({ request }) => request.action === "dual-cut"), false);
});

test("neutral_mount_hold_commands_declared_zero_instead_of_freezing_a_displaced_admission_pose", () => {
  const writes = [];
  const options = { visible: false };
  const events = scheduler({ write: (row) => writes.push(row) })
    .step(decide(options), schedulerView(options, 0.43), 1 / CONFIG.world.physicsHz);
  assert.equal(events.some(({ kind }) => kind === "refused" || kind === "failed"), false);
  const mountWrites = writes.filter(({ joint }) => joint.includes("sword"));
  assert.deepEqual(mountWrites.map(({ joint }) => joint).sort(),
    ["left-sword-pitch", "left-sword-yaw", "sword-pitch", "sword-yaw"]);
  assert.equal(mountWrites.every(({ angleRad }) => angleRad === 0), true,
    "mutating the admission pose must not mutate the neutral contract");
});

test("the_blocker_selects_the_open_lane_for_both_sequential_scissor_blades", () => {
  assert.deepEqual({ outwardChamberM: TWINBLADE_SCISSOR_CUT.outwardChamberM,
    cutterChamberCrossM: TWINBLADE_SCISSOR_CUT.cutterChamberCrossM,
    cutterChamberDropM: TWINBLADE_SCISSOR_CUT.cutterChamberDropM,
    openLaneOffsetM: TWINBLADE_SCISSOR_CUT.openLaneOffsetM }, {
    outwardChamberM: 0.28, cutterChamberCrossM: 0.35, cutterChamberDropM: 0.20,
    openLaneOffsetM: 0,
  });
  assert.deepEqual({ blockerOutwardM: TWINBLADE_DUELIST.blockerOutwardM,
    cutterChamberCrossM: TWINBLADE_DUELIST.cutterChamberCrossM,
    cutterChamberDropM: TWINBLADE_DUELIST.cutterChamberDropM,
    openLaneOffsetM: TWINBLADE_DUELIST.openLaneOffsetM }, {
    blockerOutwardM: 0.28, cutterChamberCrossM: 0.28, cutterChamberDropM: 0.15,
    openLaneOffsetM: 0.14,
  }, "a measured lane must remain an explicit authored parameter");
  assert.deepEqual([TWINBLADE_DUELIST.travelMultiplier, TWINBLADE_DUELIST.settleAllowanceS],
    [0.75, 0]);
  assert.equal(TWINBLADE_MINIMUM_CUT_PHASE_S, 0.13);
  const target = { x: 0, y: 0.15, z: 1.4 };
  const leftBlocker = { x: -0.45, y: 0.1, z: 1.4 };
  const rightBlocker = { x: 0.45, y: 0.1, z: 1.4 };
  const left = solveTwinbladeScissorCutPath(target, leftBlocker);
  const right = solveTwinbladeScissorCutPath(target, rightBlocker);
  assert.deepEqual([left.blockerSide, left.cutterSide], ["left", "right"]);
  assert.deepEqual([right.blockerSide, right.cutterSide], ["right", "left"]);
  assert.deepEqual(left.left.commit,
    solveSwordbearerSweepCentre(target, twinbladeSwordBindMetrics("left")));
  assert.deepEqual(left.right.commit,
    solveSwordbearerSweepCentre(target, twinbladeSwordBindMetrics("right")));
  assert.deepEqual(right.right.commit,
    solveSwordbearerSweepCentre(target, twinbladeSwordBindMetrics("right")));
  assert.deepEqual(right.left.commit,
    solveSwordbearerSweepCentre(target, twinbladeSwordBindMetrics("left")));

  const laneTuning = { ...TWINBLADE_SCISSOR_CUT, openLaneOffsetM: 0.14 };
  const leftOpenLane = solveTwinbladeScissorCutPath(target, leftBlocker, laneTuning);
  const rightOpenLane = solveTwinbladeScissorCutPath(target, rightBlocker, laneTuning);
  const openRight = { ...target, x: target.x + 0.14 };
  const openLeft = { ...target, x: target.x - 0.14 };
  assert.deepEqual(leftOpenLane.left.commit,
    solveSwordbearerSweepCentre(openRight, twinbladeSwordBindMetrics("left")));
  assert.deepEqual(leftOpenLane.right.commit,
    solveSwordbearerSweepCentre(openRight, twinbladeSwordBindMetrics("right")));
  assert.deepEqual(rightOpenLane.left.commit,
    solveSwordbearerSweepCentre(openLeft, twinbladeSwordBindMetrics("left")));
  assert.deepEqual(rightOpenLane.right.commit,
    solveSwordbearerSweepCentre(openLeft, twinbladeSwordBindMetrics("right")));
  assert.deepEqual(leftOpenLane.left.chamber, left.left.chamber,
    "the lane offset must not collapse the sequential scissor chamber");
  assert.deepEqual(leftOpenLane.right.chamber, left.right.chamber,
    "the lane offset must move the torso commit only");
  assert.throws(() => solveTwinbladeScissorCutPath(target, leftBlocker,
    { ...TWINBLADE_SCISSOR_CUT, openLaneOffsetM: -0.01 }), /between 0 and 0\.35 metres/);

  const movedBlocker = solveTwinbladeScissorCutPath(target, { ...leftBlocker, y: 0.35 });
  assert.deepEqual(movedBlocker.left.commit, left.left.commit,
    "the shield chooses the approach side but both physical blades cut the torso");
  assert.deepEqual(movedBlocker.right.commit, left.right.commit,
    "mutating the blocker must not move the torso-directed thrust");
  const movedTarget = solveTwinbladeScissorCutPath({ ...target, y: 0.35 }, leftBlocker);
  assert.notDeepEqual(movedTarget.left.commit, left.left.commit,
    "mutating the torso centre must move both scissor blades");
  assert.notDeepEqual(movedTarget.right.commit, left.right.commit,
    "mutating the torso centre must move the thrust solution");
  assert.notDeepEqual(left.left.commit,
    solveSwordbearerSweepCentre({ x: 0.55, y: 0.25, z: 1.4 }, twinbladeSwordBindMetrics("left")),
    "opponent weapon telemetry must not masquerade as the torso target");
});

test("opponent_weapon_telemetry_cannot_move_either_scissor_cut_motor_path", () => {
  const trace = (weaponX, weaponY) => {
    const options = { weaponX, weaponY };
    const writes = [];
    const scheduler = new ActionScheduler(graph, CONSTRUCT_CONTROLLERS,
      { write: (row) => writes.push(row) }, schedulerLocomotion());
    for (let step = 0; step < 240; step += 1) {
      scheduler.step(decide(options, scheduler), schedulerView(options), 1 / 60);
    }
    return writes.filter(({ joint }) => joint.includes("sword"));
  };
  assert.deepEqual(trace(0.55, 0.25), trace(-0.7, 0.9),
    "mutating a real opponent weapon fact must not redirect the blocker bind");
});

test("each_cut_phase_refreshes_described_torso_geometry_without_restarting_the_Action", () => {
  const firstCutFrame = (targetX) => {
    const writes = [];
    const selected = new ActionScheduler(graph, CONSTRUCT_CONTROLLERS,
      { write: (row) => writes.push(row) }, schedulerLocomotion());
    selected.step(decide({ blocker: false }), schedulerView({ blocker: false }), 1 / 60);
    for (let step = 0; step < 120; step += 1) {
      writes.length = 0;
      const options = { blocker: false, targetX };
      selected.step(decide(options, selected), schedulerView(options), 1 / 60);
      if (selected.diagnostics().some(({ action, phase }) => action === "dual-cut" && phase === "first-cut")) {
        return Object.fromEntries(writes.filter(({ joint }) => joint.includes("sword"))
          .map(({ joint, angleRad }) => [joint, angleRad]));
      }
    }
    throw new Error("Twinblade did not reach first-cut");
  };
  const centred = firstCutFrame(0);
  const moved = firstCutFrame(0.12);
  assert.notDeepEqual(moved, centred,
    "a controller that keeps only admission-frame geometry must fail this mutation");
  const path = solveTwinbladeScissorCutPath({ x: 0.12,
    y: 0.15 + TWINBLADE_DUELIST.targetHeightOffsetM, z: 1.4 }, { kind: "open-torso" }, {
    ...TWINBLADE_SCISSOR_CUT,
    outwardChamberM: TWINBLADE_DUELIST.blockerOutwardM,
    cutterChamberCrossM: TWINBLADE_DUELIST.cutterChamberCrossM,
    cutterChamberDropM: TWINBLADE_DUELIST.cutterChamberDropM,
    openLaneOffsetM: TWINBLADE_DUELIST.openLaneOffsetM,
  });
  assert.deepEqual(moved, {
    "left-sword-yaw": path.left.commit.yawRad, "left-sword-pitch": path.left.commit.pitchRad,
    "sword-yaw": path.right.chamber.yawRad, "sword-pitch": path.right.chamber.pitchRad,
  });
});

test("a_blocker_lane_and_its_high_target_remain_latched_for_the_whole_Action", () => {
  const writes = [];
  const selected = new ActionScheduler(graph, CONSTRUCT_CONTROLLERS,
    { write: (row) => writes.push(row) }, schedulerLocomotion());
  selected.step(decide({ blocker: true, blockerX: -0.45 }),
    schedulerView({ blocker: true, blockerX: -0.45 }), 1 / 60);
  let firstCut = null;
  for (let step = 0; step < 120 && firstCut === null; step += 1) {
    writes.length = 0;
    const options = { blocker: false, targetX: 0.08 };
    selected.step(decide(options, selected), schedulerView(options), 1 / 60);
    if (selected.diagnostics().some(({ action, phase }) => action === "dual-cut" && phase === "first-cut")) {
      firstCut = Object.fromEntries(writes.filter(({ joint }) => joint.includes("sword"))
        .map(({ joint, angleRad }) => [joint, angleRad]));
    }
  }
  assert.ok(firstCut, "Twinblade did not reach the first blocker-relative cut");
  const target = { x: 0.08, y: 0.15 + TWINBLADE_DUELIST.blockerTargetHeightOffsetM, z: 1.4 };
  const path = solveTwinbladeScissorCutPath(target,
    { kind: "blocker-relative", blocker: { x: target.x - 0.10, y: target.y, z: target.z } }, {
      ...TWINBLADE_SCISSOR_CUT,
      outwardChamberM: TWINBLADE_DUELIST.blockerOutwardM,
      cutterChamberCrossM: TWINBLADE_DUELIST.cutterChamberCrossM,
      cutterChamberDropM: TWINBLADE_DUELIST.cutterChamberDropM,
      openLaneOffsetM: TWINBLADE_DUELIST.openLaneOffsetM,
    });
  assert.deepEqual(firstCut, {
    "left-sword-yaw": path.left.commit.yawRad, "left-sword-pitch": path.left.commit.pitchRad,
    "sword-yaw": path.right.chamber.yawRad, "sword-pitch": path.right.chamber.pitchRad,
  }, "live shield loss must not demote an admitted high blocker lane to the torso lane mid-Action");
});

test("phase_order_sends_the_near_blade_before_the_opposite_scissor_blade", () => {
  const writes = [];
  const scheduler = new ActionScheduler(graph, CONSTRUCT_CONTROLLERS,
    { write: (row) => writes.push(row) }, schedulerLocomotion());
  const openLaneOffsetM = 0.14;
  const tunedProgram = twinbladeProgram({ openLaneOffsetM });
  const tuning = { ...TWINBLADE_SCISSOR_CUT,
    outwardChamberM: TWINBLADE_DUELIST.blockerOutwardM,
    cutterChamberCrossM: TWINBLADE_DUELIST.cutterChamberCrossM,
    cutterChamberDropM: TWINBLADE_DUELIST.cutterChamberDropM,
    openLaneOffsetM };
  const path = solveTwinbladeScissorCutPath({ x: 0,
    y: 0.15 + TWINBLADE_DUELIST.blockerTargetHeightOffsetM, z: 1.4 },
    { x: -0.45, y: 0.1, z: 1.4 }, tuning);
  const firstFrame = new Map();
  for (let step = 0; step < 600 && !firstFrame.has("recover"); step += 1) {
    writes.length = 0;
    scheduler.step(decideFrom(tunedProgram, {}, scheduler), schedulerView(), 1 / 60);
    const phase = scheduler.diagnostics().find(({ action }) => action === "dual-cut")?.phase;
    if (phase && !firstFrame.has(phase)) {
      firstFrame.set(phase, Object.fromEntries(writes.filter(({ joint }) =>
        ["left-sword-yaw", "left-sword-pitch", "sword-yaw", "sword-pitch"].includes(joint))
        .map(({ joint, angleRad }) => [joint, angleRad])));
    }
  }
  assert.deepEqual([...firstFrame.keys()], ["chamber", "first-cut", "second-cut", "recover"]);
  assert.deepEqual(firstFrame.get("chamber"), {
    "left-sword-yaw": path.left.chamber.yawRad, "left-sword-pitch": path.left.chamber.pitchRad,
    "sword-yaw": path.right.chamber.yawRad, "sword-pitch": path.right.chamber.pitchRad });
  assert.deepEqual(firstFrame.get("first-cut"), {
    "left-sword-yaw": path.left.commit.yawRad, "left-sword-pitch": path.left.commit.pitchRad,
    "sword-yaw": path.right.chamber.yawRad, "sword-pitch": path.right.chamber.pitchRad },
  "moving the opposite blade during first-cut or mislabeling chamber must fail this mutation");
  assert.deepEqual(firstFrame.get("second-cut"), {
    "left-sword-yaw": path.left.chamber.yawRad, "left-sword-pitch": path.left.chamber.pitchRad,
    "sword-yaw": path.right.commit.yawRad, "sword-pitch": path.right.commit.pitchRad },
  "parking the first blade inside the target or mislabeling first-cut must fail this mutation");
  assert.deepEqual(firstFrame.get("recover"), {
    "left-sword-yaw": 0, "left-sword-pitch": 0, "sword-yaw": 0, "sword-pitch": 0 });
});

test("the_combined_Action_writes_both_swords_and_both_leg_chains_without_contact_latches", () => {
  const writes = [];
  const scheduler = new ActionScheduler(graph, CONSTRUCT_CONTROLLERS,
    { write: (row) => writes.push(row) }, schedulerLocomotion());
  const events = scheduler.step(decide(), schedulerView(), 1 / CONFIG.world.physicsHz);
  assert.equal(events.some(({ kind }) => kind === "refused" || kind === "failed"), false, JSON.stringify(events));
  const joints = new Set(writes.map(({ joint }) => joint.split(":")[0]));
  for (const id of ["left-sword-yaw", "left-sword-pitch", "sword-yaw", "sword-pitch",
    "left-hip", "left-knee", "left-ankle", "left-sole",
    "right-hip", "right-knee", "right-ankle", "right-sole"]) assert.equal(joints.has(id), true, id);
  assert.equal(Object.keys(schedulerView().facts).some((id) => id.includes("sword-blocker")), false);
});

test("the_combined_Action_passes_its_authored_brace_pose_through_the_MotorWriter", () => {
  assert.deepEqual(BIPED_BRACE_POSE, { kneeRad: -0.20, ankleRad: 0.10, soleRad: 0.08 },
    "the ordinary biped brace defaults must remain unchanged");
  const tunedGraph = twinbladeControl();
  const tunedProgram = twinbladeProgram({ braceKneeRad: -0.06, braceAnkleRad: 0.025,
    braceSoleRad: -0.015 });
  const frame = new SensorFrame(sensors);
  const facts = values();
  for (const sensor of sensors) frame.publish(sensor.id,
    facts[sensor.id] ?? (sensor.unit === "boolean" ? false : 0));
  const command = new ConstructMind(tunedProgram, tunedGraph, sensors).decide(frame, 1);
  const writes = [];
  const events = new ActionScheduler(tunedGraph, CONSTRUCT_CONTROLLERS, { write: (row) => writes.push(row) })
    .step(command, schedulerView(), 1 / CONFIG.world.physicsHz);
  assert.equal(events.some(({ kind }) => kind === "refused" || kind === "failed"), false,
    JSON.stringify(events));
  const angle = (joint) => writes.find((row) => row.joint === joint)?.angleRad;
  assert.deepEqual({
    leftKnee: angle("left-knee:x"), rightKnee: angle("right-knee:x"),
    leftAnkle: angle("left-ankle:x"), rightAnkle: angle("right-ankle:x"),
    leftSole: angle("left-sole:x"), rightSole: angle("right-sole:x"),
  }, { leftKnee: -0.06, rightKnee: -0.06, leftAnkle: 0.025, rightAnkle: 0.025,
    leftSole: -0.015, rightSole: -0.015 },
  "mutating an authored pose value must mutate both corresponding real motor writes");
});

test("missing_either_bound_sword_refuses_the_combined_Action_by_name", () => {
  const broken = structuredClone(graph);
  broken.groups.find(({ id }) => id === "dual-sword-braced-body").bindings["left-sword"].modules = [];
  const command = { version: 1, requests: [{ request: dualCutRequest(),
    priority: 1, sourceIndex: 0 }] };
  const events = new ActionScheduler(broken, CONSTRUCT_CONTROLLERS, { write() {} })
    .step(command, schedulerView(), 1 / CONFIG.world.physicsHz);
  assert.equal(events.some(({ kind, reason }) => kind === "refused" && /left sword/.test(reason)), true,
    JSON.stringify(events));
});
