import assert from "node:assert/strict";
import test from "node:test";

import { arbalestBlueprint, arbalestControl, arbalestProgram,
  ARBALEST_SENSORS } from "../src/construct/arbalest.ts";
import { CONSTRUCT_CONTROLLERS, HUMANOID_LEFT_SWORD_SWEEP_V1,
  ARBALEST_LEFT_SWORD_LANE, WARDEN_SHIELD_BASH_V1 } from "../src/construct/controllers.ts";
import { ConstructMind } from "../src/construct/mind.ts";
import { ActionScheduler } from "../src/construct/scheduler.ts";
import { installedSensorsForBlueprint, SensorFrame } from "../src/construct/sensors.ts";
import { wardenBlueprint, wardenControl, wardenProgram,
  WARDEN_SENSORS } from "../src/construct/warden.ts";

const joint = (minRad = -2.5, maxRad = 2.5) => ({
  angleRad: 0, speedRadS: 0, minRad, maxRad, maxSpeedRadS: 7, maxForceNm: 900,
});

const scheduled = (action, sourceIndex, priority, parameters = {}) => ({
  request: { action, parameters }, sourceIndex, priority,
});

const arbalestFacts = Object.freeze({
  "core-upright": true,
  "opponent-local-x": -0.34,
  "opponent-local-y": 0,
  "opponent-local-z": 3,
  "opponent-local-vx": 0,
  "opponent-local-vy": 0,
  "opponent-local-vz": 0,
  "opponent-range": 2,
  "opponent-aim-local-x": -0.34,
  "projectile-speed-mps": 42,
  "line-of-sight": true,
  "launcher-clear": true,
  "launcher-muzzle-local-x": 0,
  "launcher-muzzle-local-y": 0,
  "launcher-muzzle-local-z": 0,
  "launcher-forward-local-x": 0,
  "launcher-forward-local-y": 0,
  "launcher-forward-local-z": 1,
  "left-sword-clear": true,
});

test("the_Arbalest_left_sword_can_cut_while_the_right_launcher_tracks", () => {
  const graph = arbalestControl();
  const left = graph.groups.find(({ id }) => id === "left-sword-guard");
  const mount = graph.groups.find(({ id }) => id === "arbalest-arm");
  const cut = graph.actions.find(({ id }) => id === "cut-left");
  assert.deepEqual({ controller: cut.controller, group: cut.group, claims: cut.claims, parameters: cut.parameters }, {
    controller: "humanoid-left-sword-sweep", group: "left-sword-guard",
    claims: ["module:effigy-left-sword", "resource:power-left-guard"], parameters: {},
  });
  assert.equal(new Set([...left.joints, ...left.modules].filter((id) =>
    [...mount.joints, ...mount.modules].includes(id))).size, 0);

  const writes = [];
  const joints = Object.fromEntries([...left.joints, ...mount.joints].map((id) => [id, joint()]));
  const scheduler = new ActionScheduler(graph, CONSTRUCT_CONTROLLERS, {
    write: (target) => writes.push(target),
  });
  const events = scheduler.step({ version: 1, requests: [
    scheduled("track", 0, 30, { "target-height-offset": 0, "target-lateral-offset": 0,
      "target-lane-blend": 0 }),
    scheduled("cut-left", 1, 29),
  ] }, { joints, facts: arbalestFacts }, 1 / 240);
  assert.deepEqual(new Set(events.filter(({ kind }) => kind === "started").map(({ action }) => action)),
    new Set(["track", "cut-left"]));
  assert.equal(writes.some(({ joint: id }) => mount.joints.includes(id)), true);
  assert.equal(writes.some(({ joint: id }) => left.joints.includes(id)), true);
});

test("the_Arbalest_declares_constant_nonattacking_neutral_Actions_for_both_weapon_groups", () => {
  const graph = arbalestControl();
  const neutral = graph.actions.filter(({ id }) => id.endsWith("-neutral"));
  assert.deepEqual(neutral.map(({ id, controller, group, parameters }) =>
    ({ id, controller, group, parameters })), [
    { id: "launcher-neutral", controller: "arbalest-launcher-neutral",
      group: "arbalest-arm", parameters: {} },
    { id: "left-sword-neutral", controller: "arbalest-left-sword-neutral",
      group: "left-sword-guard", parameters: {} },
  ]);
  const rules = arbalestProgram().rules.filter(({ action }) => action.endsWith("-neutral"));
  assert.deepEqual(rules.map(({ action, priority, condition }) => ({ action, priority, condition })), [
    { action: "left-sword-neutral", priority: 22, condition: { op: "constant", value: true } },
    { action: "launcher-neutral", priority: 5, condition: { op: "constant", value: true } },
  ]);

  const writes = [];
  const groupJoints = graph.groups.filter(({ id }) => id === "arbalest-arm" || id === "left-sword-guard")
    .flatMap(({ joints: group }) => group);
  const displaced = Object.fromEntries(groupJoints.map((id) => [id, { ...joint(-1.25, 1.65), angleRad: 0.4 }]));
  const events = new ActionScheduler(graph, CONSTRUCT_CONTROLLERS, { write: (row) => writes.push(row) })
    .step({ version: 1, requests: [scheduled("launcher-neutral", 0, 2),
      scheduled("left-sword-neutral", 1, 2)] }, { joints: displaced, facts: arbalestFacts }, 1 / 240);
  assert.equal(events.some(({ kind }) => kind === "refused" || kind === "failed"), false);
  assert.deepEqual(Object.fromEntries(writes.map(({ joint: id, angleRad }) => [id, angleRad])), {
    "sword-yaw": 0, "sword-pitch": 0,
    "left-shoulder": -0.35, "left-elbow": -0.65, "left-wrist": 0.35, "left-palm": -0.15,
  });
});

test("the_Arbalest_left_sword_remains_offensive_before_and_after_ammunition_loss", () => {
  const graph = arbalestControl();
  const sensors = installedSensorsForBlueprint(arbalestBlueprint(), ARBALEST_SENSORS);
  const decide = (ammo) => {
    const frame = new SensorFrame(sensors);
    frame.publish("core-upright", true);
    frame.publish("line-of-sight", true);
    frame.publish("opponent-range", 2.2);
    frame.publish("opponent-local-x", ARBALEST_LEFT_SWORD_LANE.x);
    frame.publish("opponent-aim-local-x", -0.34);
    frame.publish("ammo-effigy-arbalest-magazine", ammo);
    frame.publish("module-health-effigy-arbalest", ammo > 0 ? 1 : 0);
    frame.publish("module-health-effigy-arbalest-magazine", ammo > 0 ? 1 : 0);
    return new ConstructMind(arbalestProgram(), graph, sensors).decide(frame, 1).requests
      .map(({ request }) => request.action);
  };
  assert.equal(decide(12).includes("cut-left"), false,
    "the loaded opening draw keeps the independent sword in reserve");
  assert.equal(decide(11).includes("cut-left"), true,
    "spending one physical bolt commits the staged left-sword follow-through");
  assert.equal(decide(0).includes("cut-left"), true);
});

test("fragile_Arbalest_hardware_holds_the_ranged_band_until_the_Warrior_enters_its_sword_reach", () => {
  const graph = arbalestControl();
  const sensors = installedSensorsForBlueprint(arbalestBlueprint(), ARBALEST_SENSORS);
  const decideAt = (range, ammo = 12) => {
    const frame = new SensorFrame(sensors);
    for (const [id, value] of Object.entries({
      "core-upright": true, "opponent-upright": true, "opponent-rising": false,
      "line-of-sight": true, "opponent-range": range,
      "opponent-local-x": ARBALEST_LEFT_SWORD_LANE.x,
      "opponent-aim-local-x": ARBALEST_LEFT_SWORD_LANE.x,
      "reload-effigy-arbalest-magazine": 0, "ammo-effigy-arbalest-magazine": ammo,
      "module-health-effigy-arbalest": 0.09,
      "module-max-health-effigy-arbalest": 0.09,
      "module-health-effigy-arbalest-magazine": 0.09,
      "power-charge-j": 24_000, overheated: false,
    })) frame.publish(id, value);
    return new ConstructMind(arbalestProgram(), graph, sensors).decide(frame, 1).requests;
  };
  const ranged = decideAt(3);
  assert.equal(ranged.some(({ request }) => request.action === "move" &&
    request.parameters.forward > 0), false,
  "deliberately fragile hardware must not abandon a live loaded ranged band merely to seek a sword cut");
  assert.equal(ranged.some(({ request }) => request.action === "turn"), true,
    "the ranged hold still turns for a physical launcher and left-arm lane");
  assert.equal(ranged.some(({ request }) => request.action === "fire"), true,
    "holding range is concurrent launcher discipline, not passive evasion");

  const approach = decideAt(4);
  assert.equal(approach.some(({ request }) => request.action === "move" &&
    request.parameters.forward > 0), true,
  "the fragile carrier still earns its three-metre firing band with physical locomotion");

  const followThrough = decideAt(3, 11);
  assert.equal(followThrough.some(({ request }) => request.action === "move" &&
    request.parameters.forward > 0), true,
  "after spending the physical opening bolt, the same fragile body closes for its required left-sword follow-through");
  assert.equal(followThrough.some(({ request }) => request.action === "cut-left"), false,
    "the left sword does not swing before the closing movement earns its physical reach");

  const clinch = decideAt(2.2);
  assert.equal(clinch.some(({ request }) => request.action === "move" &&
    request.parameters.forward < 0), true,
  "once the Warrior enters sword reach, the carrier retreats while its independent left arm attacks");
  assert.equal(clinch.some(({ request }) => request.action === "cut-left"), false,
    "the guarded left weapon survives the opening draw instead of exposing itself before the bolt looses");
  assert.equal(decideAt(2.2, 11).some(({ request }) => request.action === "cut-left"), true,
    "the independent left arm attacks once the opening bolt has been physically spent");
});

test("the_Arbalest_turns_an_upright_close_target_into_its_real_left_arm_plane", () => {
  const graph = arbalestControl();
  const sensors = installedSensorsForBlueprint(arbalestBlueprint(), ARBALEST_SENSORS);
  const decideAt = (x, aimX = x) => {
    const frame = new SensorFrame(sensors);
    frame.publish("core-upright", true);
    frame.publish("opponent-upright", true);
    frame.publish("line-of-sight", true);
    frame.publish("opponent-range", 1.8);
    frame.publish("opponent-local-x", x);
    frame.publish("opponent-aim-local-x", aimX);
    frame.publish("ammo-effigy-arbalest-magazine", 11);
    return new ConstructMind(arbalestProgram(), graph, sensors).decide(frame, 1).requests;
  };
  assert.equal(decideAt(0, -0.34).find(({ request }) => request.action === "turn")?.request.parameters.yaw, 1,
    "a launcher opening inside the arm lane cannot hide an off-plane opponent centre");
  assert.equal(decideAt(-0.70).find(({ request }) => request.action === "turn")?.request.parameters.yaw, -1);
  assert.equal(decideAt(-0.34, 0.60).some(({ request }) => request.action === "brace"), true,
    "an aligned blade holds the shoulder plane rather than recentring on the torso");
});

test("the_left_sword_controller_uses_the_declared_chamber_commit_recover_clock_and_names_self_blocking", () => {
  const graph = arbalestControl();
  const group = graph.groups.find(({ id }) => id === "left-sword-guard");
  const joints = Object.fromEntries(group.joints.map((id) => [id, joint(-1.25, 0.95)]));
  const scheduler = new ActionScheduler(graph, CONSTRUCT_CONTROLLERS, { write: () => {} });
  const command = { version: 1, requests: [scheduled("cut-left", 0, 1)] };
  const phaseAfter = (dt, facts = arbalestFacts) => {
    scheduler.step(command, { joints, facts }, dt);
    return scheduler.diagnostics()[0]?.phase ?? "complete";
  };
  assert.equal(phaseAfter(HUMANOID_LEFT_SWORD_SWEEP_V1.chamberS / 2), "chamber");
  assert.equal(phaseAfter(HUMANOID_LEFT_SWORD_SWEEP_V1.chamberS / 2 + 0.001), "commit");
  assert.equal(phaseAfter(HUMANOID_LEFT_SWORD_SWEEP_V1.commitS + 0.001), "recover");
  assert.equal(phaseAfter(HUMANOID_LEFT_SWORD_SWEEP_V1.recoverS + 0.001), "complete");

  const blocked = new ActionScheduler(graph, CONSTRUCT_CONTROLLERS, { write: () => {} });
  const events = blocked.step(command,
    { joints, facts: { ...arbalestFacts, "left-sword-clear": false } }, 1 / 240);
  assert.equal(events.some(({ kind, reason }) => kind === "refused" && reason === "self-blocked"), true);
});

test("the_left_sword_commit_keeps_the_four_hinge_path_snapshotted_after_admission", () => {
  const graph = arbalestControl();
  const group = graph.groups.find(({ id }) => id === "left-sword-guard");
  const joints = Object.fromEntries(group.joints.map((id) => [id, joint(-1.25, 0.95)]));
  const writes = [];
  const scheduler = new ActionScheduler(graph, CONSTRUCT_CONTROLLERS, {
    write: (row) => writes.push(row),
  });
  const command = { version: 1, requests: [scheduled("cut-left", 0, 1)] };
  scheduler.step(command, { joints, facts: arbalestFacts }, 1 / 240);
  const admitted = writes.splice(0).map(({ joint: id, angleRad }) => [id, angleRad]);
  scheduler.step(command, { joints, facts: { ...arbalestFacts,
    "opponent-local-y": 0.7, "opponent-local-z": 0.8 } }, 1 / 240);
  assert.deepEqual(writes.map(({ joint: id, angleRad }) => [id, angleRad]), admitted,
    "fresh perception cannot redirect an admitted four-hinge blade through its owner");
  assert.deepEqual(admitted.map(([id]) => id).sort(),
    ["left-elbow", "left-palm", "left-shoulder", "left-wrist"]);
});

test("an_off_lane_Arbalest_cut_waits_in_guard_then_snapshots_the_real_centre_lane", () => {
  const graph = arbalestControl();
  const group = graph.groups.find(({ id }) => id === "left-sword-guard");
  const joints = Object.fromEntries(group.joints.map((id) => [id, joint(-1.25, 0.95)]));
  const writes = [];
  const scheduler = new ActionScheduler(graph, CONSTRUCT_CONTROLLERS, {
    write: (row) => writes.push(row),
  });
  const command = { version: 1, requests: [scheduled("cut-left", 0, 1)] };
  const facts = { ...arbalestFacts, "opponent-local-x": 0 };
  const started = scheduler.step(command, { joints, facts }, 1 / 240);
  assert.equal(started.some(({ kind, action }) => kind === "started" && action === "cut-left"), true);
  assert.equal(scheduler.diagnostics()[0].phase, "aligning");
  assert.deepEqual(writes, [],
    "an off-lane armed interval holds its current physical arm instead of driving a nominal guard through a moving torso");
  const waiting = scheduler.step(command, { joints, facts }, ARBALEST_LEFT_SWORD_LANE.waitForLaneS / 2);
  assert.equal(waiting.some(({ kind, action }) => kind === "completed" && action === "cut-left"), false);
  assert.equal(scheduler.diagnostics()[0].phase, "aligning",
    "the admitted opportunity remains in guard while locomotion supplies the missing yaw");
  scheduler.step(command, { joints, facts: { ...facts,
    "opponent-local-x": ARBALEST_LEFT_SWORD_LANE.x,
    "opponent-local-y": 0.2, "opponent-local-z": 1.7 } }, 1 / 240);
  assert.equal(scheduler.diagnostics()[0].phase, "chamber",
    "the physical target is snapshotted only after its centre enters the real arm plane");
});

test("an_aligning_Arbalest_cut_disarms_before_a_moving_carrier_can_fold_its_guard_through_the_torso", () => {
  const graph = arbalestControl();
  const group = graph.groups.find(({ id }) => id === "left-sword-guard");
  const joints = Object.fromEntries(group.joints.map((id) => [id, joint(-1.25, 0.95)]));
  const writes = [];
  const scheduler = new ActionScheduler(graph, CONSTRUCT_CONTROLLERS, {
    write: (row) => writes.push(row),
  });
  const command = { version: 1, requests: [scheduled("cut-left", 0, 1)] };
  scheduler.step(command, { joints, facts: { ...arbalestFacts,
    "opponent-local-x": 0 } }, 1 / 240);
  writes.length = 0;
  const terminal = scheduler.step(command, { joints, facts: { ...arbalestFacts,
    "opponent-local-x": 0, "left-sword-clear": true,
    "left-sword-clearance-m": 0.03 } }, 1 / 240);
  assert.equal(terminal.some(({ kind, action }) => kind === "completed" && action === "cut-left"), true,
    "an armed alignment interval ends as soon as its live semantic clearance is lost");
  assert.deepEqual(writes, [],
    "disarming a now-unsafe alignment must not drive even the nominal guard farther through its owner");
});

test("the_left_sword_uses_its_physical_centre_lane_not_the_launchers_blocker_offset_lane", () => {
  const graph = arbalestControl();
  const group = graph.groups.find(({ id }) => id === "left-sword-guard");
  const joints = Object.fromEntries(group.joints.map((id) => [id, joint(-1.25, 0.95)]));
  const command = { version: 1, requests: [scheduled("cut-left", 0, 1)] };
  const phaseAt = (facts) => {
    const scheduler = new ActionScheduler(graph, CONSTRUCT_CONTROLLERS, { write: () => {} });
    scheduler.step(command, { joints, facts }, 1 / 240);
    return scheduler.diagnostics()[0]?.phase;
  };
  assert.equal(phaseAt({ ...arbalestFacts, "opponent-aim-local-x": 0.60 }), "chamber",
    "launcher clearance must not pull an already reachable opponent out of the arm plane");
  assert.equal(phaseAt({ ...arbalestFacts, "opponent-local-x": 0,
    "opponent-aim-local-x": ARBALEST_LEFT_SWORD_LANE.x }), "aligning",
    "a launcher opening cannot grant nonexistent lateral travel to four X hinges");
});

const wardenFacts = Object.freeze({
  "opponent-local-x": 0,
  "opponent-local-y": 0,
  "opponent-local-z": 4,
  "opponent-local-vx": 0,
  "opponent-local-vy": 0,
  "opponent-local-vz": 0,
  "projectile-speed-mps": 42,
  "line-of-sight": true,
  "launcher-clear": true,
  "launcher-muzzle-local-x": 0,
  "launcher-muzzle-local-y": 0,
  "launcher-muzzle-local-z": 0,
  "launcher-forward-local-x": 0,
  "launcher-forward-local-y": 0,
  "launcher-forward-local-z": 1,
});

test("the_crossbow_Warden_can_bash_while_its_dorsal_mount_fires", () => {
  const graph = wardenControl("crossbow");
  const bash = graph.actions.find(({ id }) => id === "bash");
  assert.deepEqual({ controller: bash.controller, group: bash.group, claims: bash.claims, parameters: bash.parameters }, {
    controller: "warden-shield-bash", group: "shield",
    claims: ["module:warden-shield", "resource:power-shield"], parameters: {},
  });
  const mount = graph.groups.find(({ id }) => id === "dorsal-mount");
  const shield = graph.groups.find(({ id }) => id === "shield");
  const joints = Object.fromEntries([...mount.joints, ...shield.joints].map((id) => [id, joint()]));
  const writes = []; const effects = [];
  const scheduler = new ActionScheduler(graph, CONSTRUCT_CONTROLLERS, {
    write: (target) => writes.push(target), effect: (effect) => effects.push(effect),
  });
  const events = scheduler.step({ version: 1, requests: [scheduled("fire", 0, 30,
    { "target-lane-blend": 0, "target-lateral-offset": 0,
      "aim-epsilon-rad": 0.01, "follow-through-s": 0 }),
  scheduled("bash", 1, 29)] },
    { joints, facts: wardenFacts }, 1 / 240);
  assert.deepEqual(effects, [{ kind: "fire-projectile", module: "dorsal-crossbow" }]);
  assert.equal(events.some(({ kind, action }) => kind === "completed" && action === "fire"), true,
    "the launched public Action must complete before reload makes its capability unavailable");
  assert.equal(writes.some(({ joint: id }) => id === "bearing-shield"), true);
  assert.equal(scheduler.diagnostics().some(({ action, phase }) => action === "bash" && phase === "chamber"), true);
});

test("the_Warden_shield_is_a_joined_frontal_leaf_on_the_physical_bash_axis", () => {
  const blueprint = wardenBlueprint("crossbow");
  const core = blueprint.parts.find(({ id }) => id === "core");
  const joint = blueprint.joints.find(({ id }) => id === "bearing-shield");
  const shield = blueprint.modules.find(({ id }) => id === "warden-shield");
  const plate = shield.geometry.find(({ id }) => id === "plate");
  const brace = shield.geometry.find(({ id }) => id === "brace");
  const axis = joint.angularAxes[0];
  assert.equal(axis.id, "y", "the bash must sweep into the frontal lane rather than nod vertically");
  assert.ok(plate.frame.positionM[2] - plate.shape.sizeM[2] / 2 > core.shape.sizeM[2] / 2,
    "the frontal plate must begin beyond the core face in its neutral pose");
  const braceYaw = 2 * Math.asin(brace.frame.rotation[1]);
  const braceEnd = [brace.frame.positionM[0] + Math.sin(braceYaw) * brace.shape.sizeM[2] / 2,
    brace.frame.positionM[2] + Math.cos(braceYaw) * brace.shape.sizeM[2] / 2];
  assert.ok(Math.hypot(braceEnd[0] - plate.frame.positionM[0], braceEnd[1] - plate.frame.positionM[2]) < 0.05,
    "the diagonal brace must visibly terminate at the real plate");
  assert.equal(shield.mountedContactStriker.localContactPoint[0], plate.frame.positionM[0]);
  assert.equal(shield.mountedContactStriker.localContactPoint[1], 0);
  assert.ok(Math.abs(shield.mountedContactStriker.localContactPoint[2] -
    (plate.frame.positionM[2] + plate.shape.sizeM[2] / 2)) < 1e-12,
  "the authored shove point must lie on the plate's frontal face");
});

test("the_Warden_bash_arms_only_its_drive_and_hold_phases", () => {
  const graph = wardenControl("crossbow");
  const joints = { "bearing-shield": joint(-0.55, 0.55) };
  const scheduler = new ActionScheduler(graph, CONSTRUCT_CONTROLLERS, { write: () => {} });
  const command = { version: 1, requests: [scheduled("bash", 0, 1)] };
  const phaseAfter = (dt) => {
    scheduler.step(command, { joints, facts: {} }, dt);
    return scheduler.diagnostics()[0]?.phase ?? "complete";
  };
  assert.equal(phaseAfter(WARDEN_SHIELD_BASH_V1.chamberS / 2), "chamber");
  assert.equal(phaseAfter(WARDEN_SHIELD_BASH_V1.chamberS / 2 + 0.001), "drive");
  assert.equal(phaseAfter(WARDEN_SHIELD_BASH_V1.driveS + 0.001), "hold");
  assert.equal(phaseAfter(WARDEN_SHIELD_BASH_V1.holdS + 0.001), "recover");
  assert.equal(phaseAfter(WARDEN_SHIELD_BASH_V1.recoverS + 0.001), "complete");
});

test("the_Warden_turns_toward_both_lateral_opponent_signs_before_closing", () => {
  const graph = wardenControl("crossbow");
  const sensors = installedSensorsForBlueprint(wardenBlueprint("crossbow"), WARDEN_SENSORS);
  const turn = (x) => {
    const frame = new SensorFrame(sensors);
    frame.publish("core-upright", true);
    frame.publish("opponent-local-x", x);
    frame.publish("opponent-range", 7);
    frame.publish("line-of-sight", true);
    return new ConstructMind(wardenProgram("crossbow"), graph, sensors).decide(frame, 1).requests
      .find(({ request }) => request.action === "turn")?.request.parameters.yaw;
  };
  assert.equal(turn(-0.6), -1);
  assert.equal(turn(0.2), 1);
});

test("the_Warden_declares_a_centre_mass_lane_and_a_deliberate_fire_window", () => {
  const sensors = installedSensorsForBlueprint(wardenBlueprint("crossbow"), WARDEN_SENSORS);
  assert.equal(sensors.some(({ id }) => id === "opponent-aim-local-x"), true);
  const sight = wardenBlueprint("crossbow").modules.find(({ id }) => id === "warden-sensor");
  assert.equal(sight.sensorChannels.includes("opponent-aim-local-x"), true);
  const fire = wardenControl("crossbow").actions.find(({ id }) => id === "fire");
  assert.deepEqual(fire.parameters, {
    "target-lateral-offset": { kind: "number", min: -0.6, max: 0.6, unit: "metres" },
    "target-lane-blend": { kind: "number", min: 0, max: 1, unit: "scalar" },
    "aim-epsilon-rad": { kind: "number", min: 0.004, max: 0.04, unit: "radians" },
    "follow-through-s": { kind: "number", min: 0, max: 0.25, unit: "seconds" },
  });
  const attack = wardenProgram("crossbow").rules.find(({ id }) => id === "attack-in-range");
  assert.equal(attack.parameters["target-lane-blend"].value.value, 0,
    "the stable public choice selects fresh centre mass inside the generic mount");
  assert.equal(attack.parameters["target-lateral-offset"].value.value, 0,
    "the compatibility offset remains an independent authored correction");
  assert.equal(attack.parameters["aim-epsilon-rad"].value.value, 0.01);
  assert.equal(attack.parameters["follow-through-s"].value.value, 0,
    "the public fire Action completes at launch before physical reload makes it unavailable");
});

test("the_crossbow_Warden_Mind_earns_its_first_fire_request_from_a_live_clinch_bash", () => {
  const graph = wardenControl("crossbow");
  const sensors = installedSensorsForBlueprint(wardenBlueprint("crossbow"), WARDEN_SENSORS);
  const frame = new SensorFrame(sensors);
  frame.publish("core-upright", true);
  frame.publish("opponent-local-x", 0);
  frame.publish("opponent-aim-local-x", 0);
  frame.publish("opponent-range", 1.2);
  frame.publish("line-of-sight", true);
  frame.publish("opponent-upright", true);
  frame.publish("opponent-rising", false);
  frame.publish("reload-dorsal-magazine", 0);
  frame.publish("ammo-dorsal-magazine", 18);
  frame.publish("module-health-dorsal-crossbow", 1);
  frame.publish("module-health-dorsal-magazine", 1);
  frame.publish("power-charge-j", 24_000);
  frame.publish("overheated", false);
  const mind = new ConstructMind(wardenProgram("crossbow"), graph, sensors);
  const beforeBash = mind.decide(frame, 1).requests.map(({ request }) => request.action);
  assert.equal(beforeBash.includes("fire"), false);
  assert.equal(beforeBash.includes("bash"), true);
  const actions = mind.decide(frame, 1, { isActionActive: (action) => action === "bash" }).requests
    .map(({ request }) => request.action);
  assert.equal(actions.includes("fire"), true);
  assert.equal(actions.includes("bash"), true);
});

test("the_crossbow_Warden_requests_a_recoil_brace_while_fire_remains_active", () => {
  const graph = wardenControl("crossbow");
  const sensors = installedSensorsForBlueprint(wardenBlueprint("crossbow"), WARDEN_SENSORS);
  const actionsAt = (range, fireActive) => {
    const frame = new SensorFrame(sensors);
    frame.publish("core-upright", true);
    frame.publish("opponent-local-x", 0);
    frame.publish("opponent-aim-local-x", 0);
    frame.publish("opponent-range", range);
    frame.publish("line-of-sight", true);
    return new ConstructMind(wardenProgram("crossbow"), graph, sensors).decide(frame, 1,
      { isActionActive: (action) => fireActive && action === "fire" }).requests
      .map(({ request }) => request.action);
  };
  assert.equal(actionsAt(6.75, false).includes("brace"), false);
  assert.equal(actionsAt(6.75, true).includes("brace"), true);
});
