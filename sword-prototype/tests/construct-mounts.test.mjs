import assert from "node:assert/strict";
import test from "node:test";

import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";

import { Combat } from "../src/combat.ts";
import { Construct } from "../src/construct/construct.ts";
import { CONSTRUCT_CONTROLLERS } from "../src/construct/controllers.ts";
import { solveTwoAxisAim, solveTwoAxisLauncherAim, swordbearerWindLateralOffset,
  SWORDBEARER_TARGET_SWEEP } from "../src/construct/mounts.ts";
import { ActionScheduler } from "../src/construct/scheduler.ts";
import { wardenControl } from "../src/construct/warden.ts";
import { wardenBlueprint, wardenProgram, WARDEN_SENSORS } from "../src/construct/warden.ts";
import { saveConstruct } from "../src/construct/codec.ts";
import { ConstructLabBout } from "../src/construct/lab-bout.ts";
import { createConstructHeadlessArena } from "../scripts/construct-headless-arena.mjs";
import { runConstructWarriorBout } from "../scripts/construct-warrior-bout.mjs";
import { CONFIG } from "../src/config.ts";
import { stepPair } from "../src/fighter.ts";
import { flatSupportedWorldRegistry } from "../src/supported-locomotion-production.ts";
import { unitDefinition } from "../src/units.ts";

test("aim_converges_inside_limits_and_refuses_an_unreachable_direction", () => {
  assert.deepEqual(solveTwoAxisAim({ x: 0, y: 0, z: 1 }, [-1, 1], [-0.5, 0.5]),
    { yawRad: 0, pitchRad: 0, reachable: true, reason: null });
  const unreachable = solveTwoAxisAim({ x: 1, y: 2, z: 0 }, [-0.4, 0.4], [-0.2, 0.2]);
  assert.equal(unreachable.reachable, false);
  assert.match(unreachable.reason, /outside mount limits/);
});

test("the_Swordbearer_outside_feint_is_selected_on_both_sides_of_the_measured_opening_boundary", () => {
  // Exact historical admissions were x=-0.02277/-0.19589 at 2.59960 m; -0.10 is between
  // both mirrors. The nearest frozen wall admission is 2.21 m, below the 2.55 m opening.
  assert.equal(swordbearerWindLateralOffset(2.59960, true, true, -0.02277),
    SWORDBEARER_TARGET_SWEEP.openingLateralOffsetM);
  assert.equal(swordbearerWindLateralOffset(2.59960, true, true, -0.19589),
    SWORDBEARER_TARGET_SWEEP.lateralOffsetM);
  assert.equal(swordbearerWindLateralOffset(2.21, true, true, -0.02277),
    SWORDBEARER_TARGET_SWEEP.lateralOffsetM);
  assert.equal(swordbearerWindLateralOffset(2.59960, false, true, -0.02277),
    SWORDBEARER_TARGET_SWEEP.lateralOffsetM);
  assert.equal(swordbearerWindLateralOffset(2.59960, true, false, 0),
    SWORDBEARER_TARGET_SWEEP.lateralOffsetM);
});

test("launcher_aim_corrects_from_the_compiled_muzzle_ray_instead_of_the_construct_root", () => {
  const solution = solveTwoAxisLauncherAim({ x: 0, y: 0, z: 4 }, {
    origin: { x: 0, y: 0.71, z: 0.29 }, forward: { x: 0, y: 0, z: 1 },
    yawRad: 0, pitchRad: 0,
  }, [-1, 1], [-0.75, 0.65]);
  assert.equal(solution.reachable, true);
  assert.equal(solution.yawRad, 0);
  assert.ok(solution.pitchRad > 0.18 && solution.pitchRad < 0.20,
    `a muzzle 0.71 m above the target needs downward pitch, got ${solution.pitchRad}`);
});

test("the_same_two_axis_group_drives_crossbow_tracking_and_sword_sweep", () => {
  for (const variant of ["crossbow", "sword"]) {
    const graph = wardenControl(variant);
    const group = graph.groups.find((candidate) => candidate.id === "dorsal-mount");
    const joints = Object.fromEntries(group.joints.map((joint) => [joint, {
      angleRad: 0, speedRadS: 0, minRad: -3, maxRad: 3, maxSpeedRadS: 5, maxForceNm: 180,
    }]));
    const writes = [];
    const scheduler = new ActionScheduler(graph, CONSTRUCT_CONTROLLERS, { write: (target) => writes.push(target) });
    const request = variant === "crossbow"
      ? { request: { action: "aim", parameters: { yaw: 0.5, pitch: -0.1 } }, priority: 0, sourceIndex: 0 }
      : { request: { action: "cut", parameters: { direction: 1 } }, priority: 0, sourceIndex: 0 };
    scheduler.step({ version: 1, requests: [request] }, { joints, facts: variant === "sword"
      ? { "opponent-local-x": 0, "opponent-local-y": 0, "opponent-local-z": 1,
          "mounted-sword-anchor-local-x": 0, "mounted-sword-anchor-local-y": 0,
          "mounted-sword-anchor-local-z": 0 }
      : {} }, 1 / 240);
    assert.deepEqual(new Set(writes.map((target) => target.joint)), new Set(group.joints));
  }
});

test("a_jammed_Warden_sword_reverses_each_genuinely_attempted_phase_within_a_bounded_time", () => {
  const graph = wardenControl("sword");
  const mount = graph.groups.find(({ id }) => id === "dorsal-mount");
  const joints = Object.fromEntries(mount.joints.map((joint) => [joint, {
    // A deliberately frozen physical reading models a blade stopped by an opponent or shield.
    // The controller must keep writing the real endpoint, then reverse; it may not report a
    // fabricated contact or wait on exact alignment forever.
    angleRad: 0, speedRadS: 0, minRad: -3, maxRad: 3, maxSpeedRadS: 5, maxForceNm: 180,
  }]));
  const facts = { "opponent-local-x": 0, "opponent-local-y": 0, "opponent-local-z": 1.4,
    "opponent-upright": true, "opponent-rising": false,
    "mounted-sword-anchor-local-x": 0, "mounted-sword-anchor-local-y": 0,
    "mounted-sword-anchor-local-z": 0.55 };
  const writes = [];
  const scheduler = new ActionScheduler(graph, CONSTRUCT_CONTROLLERS,
    { write: (target) => writes.push(target) });
  const command = { version: 1, requests: [{ request: { action: "cut", parameters: { direction: 1 } },
    priority: 1, sourceIndex: 0 }] };
  let sawTimeoutDiagnostic = false; let completed = false;
  for (let step = 0; step < 30 && !completed; step += 1) {
    const events = scheduler.step(command, { joints, facts }, 0.1);
    sawTimeoutDiagnostic ||= scheduler.diagnostics().some(({ detail }) => /phase timeout/.test(detail));
    completed ||= events.some(({ action, kind }) => action === "cut" && kind === "completed");
  }
  assert.equal(sawTimeoutDiagnostic, true, "a bounded reversal must say when obstruction, not alignment, advanced it");
  assert.equal(completed, true, "three finite attempted phases may not hold the dorsal mount forever");
  assert.ok(writes.length >= 6, "the timeout must retain repeated physical motor commands to both real bearings");
});

test("the_sword_mount_has_a_sustained_guard_that_tracks_the_opponent_without_firing", () => {
  const graph = wardenControl("sword");
  const mount = graph.groups.find(({ id }) => id === "dorsal-mount");
  assert.deepEqual(mount.bindings.sword.modules, ["dorsal-sword"]);
  assert.equal(graph.actions.find(({ id }) => id === "guard").controller, "guard-mount");
  const joints = Object.fromEntries(mount.joints.map((joint) => [joint, {
    angleRad: 0, speedRadS: 0, minRad: -3, maxRad: 3, maxSpeedRadS: 5, maxForceNm: 180,
  }]));
  const writes = []; const effects = [];
  const scheduler = new ActionScheduler(graph, CONSTRUCT_CONTROLLERS, {
    write: (target) => writes.push(target), effect: (effect) => effects.push(effect),
  });
  const command = { version: 1, requests: [{ request: { action: "guard", parameters: {} }, priority: 1, sourceIndex: 0 }] };
  scheduler.step(command, { joints, facts: { "opponent-local-x": 1, "opponent-local-y": 0.25,
    "opponent-local-z": 3 } }, 1 / 240);
  assert.deepEqual(new Set(writes.map(({ joint }) => joint)), new Set(mount.joints));
  assert.equal(effects.length, 0);
  assert.match(scheduler.diagnostics()[0].phase, /guard/);
  scheduler.step(command, { joints, facts: { "opponent-local-x": -1, "opponent-local-y": 0,
    "opponent-local-z": 3 } }, 1 / 240);
  assert.equal(scheduler.diagnostics()[0].action, "guard", "guard is a hold, not a one-tick renamed attack");
});

test("mount_roles_are_control_bindings_not_physical_joint_names", () => {
  const graph = structuredClone(wardenControl());
  const mount = graph.groups.find((candidate) => candidate.id === "dorsal-mount");
  const [yaw, pitch] = mount.joints;
  mount.bindings = {
    yaw: { joints: [pitch], modules: [] }, pitch: { joints: [yaw], modules: [] },
    output: mount.bindings.output,
  };
  const joints = Object.fromEntries(mount.joints.map((joint) => [joint, {
    angleRad: 0, speedRadS: 0, minRad: -3, maxRad: 3, maxSpeedRadS: 5, maxForceNm: 180,
  }]));
  const writes = [];
  const scheduler = new ActionScheduler(graph, CONSTRUCT_CONTROLLERS, { write: (target) => writes.push(target) });
  scheduler.step({ version: 1, requests: [{ request: { action: "aim",
    parameters: { yaw: 0.7, pitch: -0.2 } }, priority: 0, sourceIndex: 0 }] }, { joints, facts: {} }, 1 / 240);
  assert.equal(writes.find((target) => target.angleRad === 0.7).joint, pitch);
  assert.equal(writes.find((target) => target.angleRad === -0.2).joint, yaw);
});

test("tracking_leads_a_moving_target_and_fire_waits_for_LOS_self_clearance_and_alignment", () => {
  const graph = wardenControl("crossbow");
  const mount = graph.groups.find((candidate) => candidate.id === "dorsal-mount");
  const joints = Object.fromEntries(mount.joints.map((joint) => [joint, {
    angleRad: 0, speedRadS: 0, minRad: -3, maxRad: 3, maxSpeedRadS: 5, maxForceNm: 180,
  }]));
  const facts = { "opponent-local-x": 1, "opponent-local-y": 0, "opponent-local-z": 4,
    "opponent-local-vx": 2, "opponent-local-vy": 0, "opponent-local-vz": 0,
    "projectile-speed-mps": 8, "line-of-sight": true, "launcher-clear": true,
    "launcher-muzzle-local-x": 0, "launcher-muzzle-local-y": 0.71, "launcher-muzzle-local-z": 0.29,
    "launcher-forward-local-x": 0, "launcher-forward-local-y": 0, "launcher-forward-local-z": 1 };
  const writes = []; const effects = [];
  const tracked = new ActionScheduler(graph, CONSTRUCT_CONTROLLERS, {
    write: (target) => writes.push(target), effect: (effect) => effects.push(effect),
  });
  tracked.step({ version: 1, requests: [{ request: { action: "track", parameters: {} }, priority: 1, sourceIndex: 0 }] },
    { joints, facts }, 1 / 240);
  const yaw = writes.find(({ joint }) => joint === mount.bindings.yaw.joints[0]);
  assert.ok(yaw.angleRad > Math.atan2(1, 4), "lead must aim ahead of the target's current bearing");

  const blocked = new ActionScheduler(graph, CONSTRUCT_CONTROLLERS, {
    write: () => {}, effect: (effect) => effects.push(effect),
  });
  const fireParameters = { "target-lane-blend": 1, "target-lateral-offset": 0, "aim-epsilon-rad": 0.01,
    "follow-through-s": 0.08 };
  blocked.step({ version: 1, requests: [{ request: { action: "fire", parameters: fireParameters }, priority: 1, sourceIndex: 0 }] },
    { joints, facts: { ...facts, "line-of-sight": false } }, 1 / 240);
  assert.equal(effects.length, 0);

  const selfBlocked = new ActionScheduler(graph, CONSTRUCT_CONTROLLERS, {
    write: () => {}, effect: (effect) => effects.push(effect),
  });
  selfBlocked.step({ version: 1, requests: [{ request: { action: "fire", parameters: fireParameters }, priority: 1, sourceIndex: 0 }] },
    { joints, facts: { ...facts, "launcher-clear": false } }, 1 / 240);
  assert.equal(effects.length, 0);
});

test("an_authored_fire_window_delays_release_until_both_mount_axes_are_inside_it", () => {
  const graph = structuredClone(wardenControl("crossbow"));
  const fire = graph.actions.find(({ id }) => id === "fire");
  fire.parameters = {
    "aim-epsilon-rad": { kind: "number", min: 0.004, max: 0.04, unit: "radians" },
  };
  const mount = graph.groups.find(({ id }) => id === "dorsal-mount");
  const yaw = mount.bindings.yaw.joints[0];
  const pitch = mount.bindings.pitch.joints[0];
  const facts = { "opponent-local-x": 0, "opponent-local-y": 0, "opponent-local-z": 4,
    "opponent-local-vx": 0, "opponent-local-vy": 0, "opponent-local-vz": 0,
    "projectile-speed-mps": 42, "line-of-sight": true, "launcher-clear": true,
    "launcher-muzzle-local-x": 0, "launcher-muzzle-local-y": 0,
    "launcher-muzzle-local-z": 0, "launcher-forward-local-x": 0,
    "launcher-forward-local-y": 0, "launcher-forward-local-z": 1 };
  const effects = [];
  const scheduler = new ActionScheduler(graph, CONSTRUCT_CONTROLLERS, {
    write: () => {}, effect: (effect) => effects.push(effect),
  });
  const command = { version: 1, requests: [{ request: { action: "fire",
    parameters: { "aim-epsilon-rad": 0.01 } }, priority: 1, sourceIndex: 0 }] };
  const reading = (angleRad) => ({ angleRad, speedRadS: 0, minRad: -3, maxRad: 3,
    maxSpeedRadS: 5, maxForceNm: 180 });
  const factsAt = (angleRad) => ({ ...facts,
    "launcher-forward-local-x": Math.sin(angleRad),
    "launcher-forward-local-z": Math.cos(angleRad),
  });
  scheduler.step(command, { joints: { [yaw]: reading(0.02), [pitch]: reading(0) }, facts: factsAt(0.02) }, 1 / 240);
  assert.equal(effects.length, 0);
  assert.equal(scheduler.diagnostics()[0].epsilon, 0.01);
  scheduler.step(command, { joints: { [yaw]: reading(0.009), [pitch]: reading(0) }, facts: factsAt(0.009) }, 1 / 240);
  assert.deepEqual(effects, [{ kind: "fire-projectile", module: "dorsal-crossbow" }]);
});

test("launcher_tracking_applies_an_authored_target_height_without_replacing_live_muzzle_geometry", () => {
  const graph = structuredClone(wardenControl("crossbow"));
  const track = graph.actions.find(({ id }) => id === "track");
  track.parameters = {
    "target-height-offset": { kind: "number", min: -0.5, max: 0.75, unit: "metres" },
    "target-lateral-offset": { kind: "number", min: -0.6, max: 0.6, unit: "metres" },
  };
  const mount = graph.groups.find(({ id }) => id === "dorsal-mount");
  const joints = Object.fromEntries(mount.joints.map((joint) => [joint, {
    angleRad: 0, speedRadS: 0, minRad: -3, maxRad: 3, maxSpeedRadS: 5, maxForceNm: 180,
  }]));
  const facts = { "opponent-local-x": 0, "opponent-local-y": 0, "opponent-local-z": 4,
    "opponent-local-vx": 0, "opponent-local-vy": 0, "opponent-local-vz": 0,
    "projectile-speed-mps": 42, "line-of-sight": true, "launcher-clear": true,
    "launcher-muzzle-local-x": 0, "launcher-muzzle-local-y": 0.71, "launcher-muzzle-local-z": 0.29,
    "launcher-forward-local-x": 0, "launcher-forward-local-y": 0, "launcher-forward-local-z": 1 };
  const targetFor = (height, lateral) => {
    const writes = [];
    const scheduler = new ActionScheduler(graph, CONSTRUCT_CONTROLLERS, { write: (target) => writes.push(target) });
    scheduler.step({ version: 1, requests: [{ request: { action: "track",
      parameters: { "target-height-offset": height, "target-lateral-offset": lateral } },
      priority: 1, sourceIndex: 0 }] },
    { joints, facts }, 1 / 240);
    return { yaw: writes.find(({ joint }) => joint === mount.bindings.yaw.joints[0]).angleRad,
      pitch: writes.find(({ joint }) => joint === mount.bindings.pitch.joints[0]).angleRad };
  };
  assert.ok(targetFor(0.4, 0).pitch < targetFor(0, 0).pitch,
    "a higher target must command less downward pitch from the same live muzzle");
  assert.ok(targetFor(0, -0.3).yaw < targetFor(0, 0).yaw,
    "a left target lane must command a leftward correction from the same live muzzle");
});

test("a_stable_lane_blend_uses_fresh_centre_and_aim_facts_without_changing_Action_identity", () => {
  const graph = structuredClone(wardenControl("crossbow"));
  const mount = graph.groups.find(({ id }) => id === "dorsal-mount");
  const joints = Object.fromEntries(mount.joints.map((joint) => [joint, {
    angleRad: 0, speedRadS: 0, minRad: -3, maxRad: 3, maxSpeedRadS: 5, maxForceNm: 180,
  }]));
  const baseFacts = { "opponent-local-y": 0, "opponent-local-z": 4,
    "opponent-local-vx": 0, "opponent-local-vy": 0, "opponent-local-vz": 0,
    "projectile-speed-mps": 42, "line-of-sight": true, "launcher-clear": true,
    "launcher-muzzle-local-x": 0, "launcher-muzzle-local-y": 0,
    "launcher-muzzle-local-z": 0, "launcher-forward-local-x": 0,
    "launcher-forward-local-y": 0, "launcher-forward-local-z": 1 };
  const writes = [];
  const scheduler = new ActionScheduler(graph, CONSTRUCT_CONTROLLERS, {
    write: (target) => writes.push(target), effect: () => {},
  });
  const command = { version: 1, requests: [{ request: { action: "fire", parameters: {
    "target-lane-blend": 0, "target-lateral-offset": 0,
    "aim-epsilon-rad": 0.004, "follow-through-s": 0.08,
  } }, priority: 1, sourceIndex: 0 }] };
  scheduler.step(command, { joints, facts: { ...baseFacts,
    "opponent-local-x": 0.2, "opponent-aim-local-x": -0.3 } }, 1 / 240);
  const firstYaw = writes.findLast(({ joint }) => joint === mount.bindings.yaw.joints[0]).angleRad;
  scheduler.step(command, { joints, facts: { ...baseFacts,
    "opponent-local-x": -0.1, "opponent-aim-local-x": 0.4 } }, 1 / 240);
  const secondYaw = writes.findLast(({ joint }) => joint === mount.bindings.yaw.joints[0]).angleRad;
  assert.ok(firstYaw > 0 && secondYaw < 0, "zero blend must follow the fresh centre rather than a latched lane");
  assert.equal(scheduler.diagnostics().filter(({ action }) => action === "fire").length, 1,
    "fresh facts must not restart the public fire Action");
});

const mixedMaterials = (scene) => {
  const shared = new StandardMaterial("construct-mounts.mixed", scene);
  return Object.freeze({ shared, fighter: Object.freeze({ flesh: shared, cloth: shared, steel: shared,
    leather: shared, brass: shared, hide: shared, wood: shared, arrowAccent: shared }) });
};

test("the_existing_Warden_crossbow_physically_hits_a_stationary_Warrior_torso_in_both_mirrors", async () => {
  const saved = saveConstruct("Production crossbow Warden", wardenBlueprint("crossbow"),
    wardenControl("crossbow", "assisted"), wardenProgram("crossbow", "assisted"), WARDEN_SENSORS);
  for (const constructSide of ["left", "right"]) {
    const report = await runConstructWarriorBout({ saved, sensors: WARDEN_SENSORS,
      warriorPolicy: "idle", warriorLoadout: { primary: "empty", secondary: "empty" },
      constructSide, separationM: 1.2, maxSteps: CONFIG.world.physicsHz * 12 });
    const torso = report.constructContacts.find(({ damage, limb, weapon }) =>
      damage > 0 && limb === "torso" && weapon === "arrow");
    assert.ok(torso, `${constructSide} Warden never landed a physical torso arrow: ${JSON.stringify(
      report.constructContacts)}`);
    assert.equal(torso.effectorId.startsWith("dorsal-crossbow:"), true);
  }
});

test("the_real_Warden_shield_leaf_physically_bashes_a_frontal_Warrior_in_both_mirrors", async () => {
  for (const constructSide of ["left", "right"]) {
    const arena = await createConstructHeadlessArena();
    const materials = mixedMaterials(arena.scene);
    const separation = 1.1;
    const constructOrigin = constructSide === "left" ? Vector3.Zero() : new Vector3(0, 0, separation);
    const warriorOrigin = constructSide === "left" ? new Vector3(0, 0, separation) : Vector3.Zero();
    const warriorSide = constructSide === "left" ? "right" : "left";
    const construct = new Construct({ scene: arena.scene, side: constructSide, origin: constructOrigin,
      facing: constructSide === "left" ? 0 : Math.PI, materials: materials.fighter,
      policyName: "warden-authored" }, "crossbow");
    const warrior = unitDefinition("warrior").build({ scene: arena.scene, side: warriorSide,
      origin: warriorOrigin, facing: warriorSide === "left" ? 0 : Math.PI, materials: materials.fighter,
      policyName: "idle", loadout: { primary: "empty", secondary: "empty" } });
    const reports = [];
    const combat = new Combat(constructSide, construct.strikers, (event) => reports.push(event));
    combat.attach(warrior);
    try {
      for (let step = 0; step < CONFIG.world.physicsHz * 4 &&
          !reports.some(({ effectorId }) => effectorId === "warden-shield"); step += 1) {
        stepPair(constructSide === "left" ? construct : warrior,
          constructSide === "left" ? warrior : construct, 1 / CONFIG.world.physicsHz, combat.now);
        arena.scene._renderId += 1;
        arena.scene._advancePhysicsEngineStep(1000 / CONFIG.world.physicsHz);
        combat.advance(1 / CONFIG.world.physicsHz);
      }
      const bash = reports.find(({ effectorId }) => effectorId === "warden-shield");
      assert.ok(bash, `${constructSide} Warden never made a physical shield contact`);
      assert.equal(bash.report.weapon, "empty");
      assert.deepEqual(bash.report.stabilityShove,
        { kind: "specific-impulse", specificImpulseMps: 0.008 });
    } finally {
      combat.dispose(); warrior.dispose(); construct.dispose(); materials.shared.dispose(false, false); arena.dispose();
    }
  }
});

test("the_real_Warden_shield_clears_its_core_through_cover_and_the_full_bash_envelope", async () => {
  const program = structuredClone(wardenProgram("crossbow"));
  program.id = "warden-shield-clearance-probe";
  program.rules = program.rules.filter(({ id }) => id === "bash-in-clinch");
  program.rules[0].condition = { op: "constant", value: true };
  const saved = saveConstruct("Warden shield clearance", wardenBlueprint("crossbow"),
    wardenControl("crossbow"), program, WARDEN_SENSORS);
  for (const constructSide of ["left", "right"]) {
    const report = await runConstructWarriorBout({ saved, sensors: WARDEN_SENSORS,
      warriorPolicy: "idle", warriorLoadout: { primary: "empty", secondary: "empty" },
      constructSide, separationM: 2.2, maxSteps: CONFIG.world.physicsHz * 2 });
    const phases = new Set(report.qualificationEvents
      .filter(({ kind, action }) => kind === "action-phase" && action === "bash")
      .map(({ phase }) => phase));
    assert.deepEqual([...phases].filter((phase) => ["chamber", "drive", "hold", "recover"].includes(phase)),
      ["chamber", "drive", "hold", "recover"]);
    const clearance = report.qualificationEvents.filter(({ kind, semanticPair }) =>
      kind === "self-clearance" && semanticPair === "shield/core");
    assert.ok(clearance.length > 0, `${constructSide} shield published no live clearance evidence`);
    assert.equal(clearance.every(({ clearanceM, requiredM }) => clearanceM >= requiredM), true,
      `${constructSide} shield crossed its core: ${JSON.stringify(clearance)}`);
    const minimum = Math.min(...clearance.map(({ clearanceM }) => clearanceM));
    // The 2026-09-01 real-Havok bracket measured 59.75/58.44 mm for left/right. Pin a
    // 50 mm floor so a future visual edit cannot consume the physical bash envelope.
    assert.ok(minimum >= 0.05, `${constructSide} live minimum was ${minimum}`);
  }
});

test("a_physical_Warden_sword_tip_traverses_the_commanded_sweep_arc", async () => {
  const program = structuredClone(wardenProgram("sword"));
  program.id = "sword-sweep-physical-probe";
  program.rules = program.rules.filter(({ id }) => id === "attack-in-range");
  program.rules[0].condition = { op: "constant", value: true };
  const saved = saveConstruct("Sword sweep probe", wardenBlueprint("sword"), wardenControl("sword"), program, WARDEN_SENSORS);
  const arena = await createConstructHeadlessArena();
  const bout = new ConstructLabBout(arena.scene, saved, saved, WARDEN_SENSORS, CONFIG.fighter.separation);
  try {
    const striker = bout.construct("left").strikers.find(({ effectorId }) => effectorId === "dorsal-sword");
    assert.ok(striker);
    const points = []; const phases = new Set();
    for (let step = 0; step < 1200; step += 1) {
      bout.step(1 / CONFIG.world.physicsHz);
      points.push(striker.tipPosition().clone());
      const cut = bout.construct("left").control.snapshot().active.find(({ action }) => action === "cut");
      if (cut) phases.add(cut.phase);
    }
    const span = Math.hypot(
      Math.max(...points.map(({ x }) => x)) - Math.min(...points.map(({ x }) => x)),
      Math.max(...points.map(({ z }) => z)) - Math.min(...points.map(({ z }) => z)),
    );
    assert.ok(span > 0.2, `physical sword tip traversed only ${span.toFixed(3)} m`);
    assert.deepEqual([...phases].filter((phase) => ["chamber", "commit", "recover"].includes(phase)),
      ["chamber", "commit", "recover"], "the physical span must contain the commanded three-stage sweep");
  } finally {
    bout.dispose(); arena.dispose();
  }
});

test("the_phase_latched_Warden_sword_completes_contacts_and_clears_its_core_in_both_mirrors", async () => {
  const saved = saveConstruct("Warden sword physical gate", wardenBlueprint("sword"),
    wardenControl("sword", "assisted"), wardenProgram("sword", "assisted"), WARDEN_SENSORS);
  for (const constructSide of ["left", "right"]) {
    const report = await runConstructWarriorBout({ saved, sensors: WARDEN_SENSORS,
      warriorPolicy: "duelist", warriorSeed: 4_140_987_459,
      warriorLoadout: { primary: "sword", secondary: "buckler" },
      constructSide, locomotionMode: "supported", maxSteps: CONFIG.world.physicsHz * 30 }, "sword");
    const phases = new Set(report.qualificationEvents.filter(({ kind, action }) =>
      kind === "action-phase" && action === "cut").map(({ phase }) => phase));
    assert.deepEqual([...phases].filter((phase) => ["chamber", "commit", "recover"].includes(phase)),
      ["chamber", "commit", "recover"], `${constructSide} did not traverse the latched stroke`);
    assert.ok(report.actionTimeline.some(({ action, kind }) => action === "cut" && kind === "completed"),
      `${constructSide} completed no physical cut`);
    assert.ok(report.constructContacts.some(({ sourceModuleId, weapon, damage }) =>
      sourceModuleId === "dorsal-sword" && weapon === "sword" && damage > 0),
    `${constructSide} produced no real blade contact`);
    const clearance = report.qualificationEvents.filter(({ kind, semanticPair }) =>
      kind === "self-clearance" && semanticPair === "dorsal-sword/core");
    assert.ok(clearance.length > 0, `${constructSide} published no sword/core clearance`);
    assert.equal(clearance.every(({ clearanceM, requiredM }) => clearanceM >= requiredM), true,
      `${constructSide} sword crossed its core: ${JSON.stringify(clearance)}`);
    const shieldClearance = report.qualificationEvents.filter(({ kind, semanticPair }) =>
      kind === "self-clearance" && semanticPair === "shield/core");
    assert.ok(shieldClearance.length > 0, `${constructSide} published no shield/core clearance`);
    assert.equal(shieldClearance.every(({ clearanceM, requiredM }) => clearanceM >= requiredM), true,
      `${constructSide} shield crossed its core: ${JSON.stringify(shieldClearance)}`);
  }
});

test("a_physical_Warden_sword_collider_scores_through_Combat_and_changes_target_health", async () => {
  const attackProgram = structuredClone(wardenProgram("sword"));
  attackProgram.id = "sword-contact-acceptance";
  attackProgram.rules = attackProgram.rules.filter(({ id }) => id === "attack-in-range");
  attackProgram.rules[0].condition = { op: "constant", value: true };
  const attacker = saveConstruct("Physical sword attacker", wardenBlueprint("sword"), wardenControl("sword"),
    attackProgram, WARDEN_SENSORS);

  // A real Construct target with an exposed zero-armour mast makes this acceptance about
  // collider -> Combat -> damage ownership, rather than the Warden shield's intentional block.
  const targetBlueprint = structuredClone(wardenBlueprint("crossbow"));
  targetBlueprint.id = "physical-sword-target";
  targetBlueprint.parts = targetBlueprint.parts.filter(({ id }) => id !== "shield-bearing")
    .map((part) => ({ ...part, armour: 0 }));
  targetBlueprint.joints = targetBlueprint.joints.filter(({ id }) => id !== "bearing-shield");
  targetBlueprint.sockets = targetBlueprint.sockets.filter(({ id }) => id !== "socket-shield");
  targetBlueprint.modules = targetBlueprint.modules.filter(({ id }) => id !== "warden-shield");
  const targetControl = structuredClone(wardenControl("crossbow"));
  targetControl.groups = targetControl.groups.filter(({ id }) => id !== "shield").map((group) => ({ ...group,
    joints: group.joints.filter((id) => id !== "bearing-shield") }));
  targetControl.actions = targetControl.actions.filter(({ group }) => group !== "shield");
  const targetProgram = structuredClone(wardenProgram("crossbow"));
  targetProgram.id = "passive-physical-sword-target"; targetProgram.rules = [];
  const target = saveConstruct("Physical sword target", targetBlueprint, targetControl, targetProgram, WARDEN_SENSORS);

  const arena = await createConstructHeadlessArena();
  // The cores start with clearance and the neutral blade starts outside the target footprint.
  // Only the commanded yaw stroke can bring its declared 1.15 m reach in before the assemblies
  // naturally separate under contact.
  const bout = new ConstructLabBout(arena.scene, attacker, target, WARDEN_SENSORS, 0.9, 0,
    { lateralOffsetM: 0.6, separationOffsetM: -0.2, yawOffsetRad: 0 });
  try {
    const before = new Map(target.blueprint.parts.map(({ id }) =>
      [id, bout.construct("right").state.partHealth(id)]));
    let scored = null;
    for (let step = 0; step < 1800 && !scored; step += 1) {
      const sample = bout.step(1 / CONFIG.world.physicsHz);
      scored = sample.left.combat.find(({ report }) => report.damage > 0) ?? null;
    }
    assert.ok(scored, "the physical mounted blade must produce a damaging Combat report");
    assert.equal(scored.effectorId, "dorsal-sword");
    assert.equal(scored.report.weapon, "sword");
    assert.ok(before.has(scored.report.key), `the blade contact must name a target part, got ${scored.report.key}`);
    assert.ok(bout.construct("right").state.partHealth(scored.report.key) < before.get(scored.report.key),
      "Combat damage must reach the target Construct's authoritative health state");
  } finally {
    bout.dispose(); arena.dispose();
  }
});

test("the_authored_sword_Warden_physically_contacts_a_Warrior_in_both_mirrors", async () => {
  for (const constructSide of ["left", "right"]) {
    const arena = await createConstructHeadlessArena();
    const materials = mixedMaterials(arena.scene);
    const locomotionWorld = flatSupportedWorldRegistry();
    const separation = CONFIG.fighter.separation;
    const constructOrigin = constructSide === "left" ? Vector3.Zero() : new Vector3(0, 0, separation);
    const warriorOrigin = constructSide === "left" ? new Vector3(0, 0, separation) : Vector3.Zero();
    const warriorSide = constructSide === "left" ? "right" : "left";
    const construct = new Construct({ scene: arena.scene, side: constructSide, origin: constructOrigin,
      facing: constructSide === "left" ? 0 : Math.PI, materials: materials.fighter,
      policyName: "warden-authored", locomotionMode: "supported", locomotionWorld }, "sword");
    const warrior = unitDefinition("warrior").build({ scene: arena.scene, side: warriorSide,
      origin: warriorOrigin, facing: warriorSide === "left" ? 0 : Math.PI, materials: materials.fighter,
      policyName: "idle", loadout: { primary: "empty", secondary: "empty" },
      locomotionMode: "supported", locomotionWorld });
    const reports = [];
    const combat = new Combat(constructSide, construct.strikers, (event) => reports.push(event));
    combat.attach(warrior);
    try {
      for (let step = 0; step < CONFIG.world.physicsHz * 8 &&
          !reports.some(({ effectorId }) => effectorId === "dorsal-sword"); step += 1) {
        stepPair(constructSide === "left" ? construct : warrior,
          constructSide === "left" ? warrior : construct, 1 / CONFIG.world.physicsHz, combat.now);
        arena.scene._renderId += 1;
        arena.scene._advancePhysicsEngineStep(1000 / CONFIG.world.physicsHz);
        combat.advance(1 / CONFIG.world.physicsHz);
      }
      const cut = reports.find(({ effectorId }) => effectorId === "dorsal-sword");
      assert.ok(cut, `${constructSide} sword Warden never made physical blade contact: ${JSON.stringify({
        range: Vector3.Distance(construct.centre(), warrior.centre()),
        active: construct.control.snapshot().active, facts: construct.control.snapshot().facts,
      })}`);
      assert.equal(cut.report.weapon, "sword");
    } finally {
      combat.dispose(); warrior.dispose(); construct.dispose(); materials.shared.dispose(false, false); arena.dispose();
    }
  }
});
