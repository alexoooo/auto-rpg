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
import { CONFIG } from "../src/config.ts";
import { stepPair } from "../src/fighter.ts";
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
    scheduler.step({ version: 1, requests: [request] }, { joints, facts: {} }, 1 / 240);
    assert.deepEqual(new Set(writes.map((target) => target.joint)), new Set(group.joints));
  }
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
  blocked.step({ version: 1, requests: [{ request: { action: "fire", parameters: {} }, priority: 1, sourceIndex: 0 }] },
    { joints, facts: { ...facts, "line-of-sight": false } }, 1 / 240);
  assert.equal(effects.length, 0);

  const selfBlocked = new ActionScheduler(graph, CONSTRUCT_CONTROLLERS, {
    write: () => {}, effect: (effect) => effects.push(effect),
  });
  selfBlocked.step({ version: 1, requests: [{ request: { action: "fire", parameters: {} }, priority: 1, sourceIndex: 0 }] },
    { joints, facts: { ...facts, "launcher-clear": false } }, 1 / 240);
  assert.equal(effects.length, 0);
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

const mixedMaterials = (scene) => {
  const shared = new StandardMaterial("construct-mounts.mixed", scene);
  return Object.freeze({ shared, fighter: Object.freeze({ flesh: shared, cloth: shared, steel: shared,
    leather: shared, brass: shared, hide: shared, wood: shared, arrowAccent: shared }) });
};

test("the_existing_Warden_crossbow_physically_hits_a_stationary_Warrior_torso_in_both_mirrors", async () => {
  for (const constructSide of ["left", "right"]) {
    const arena = await createConstructHeadlessArena();
    const materials = mixedMaterials(arena.scene);
    const separation = CONFIG.fighter.separation;
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
      for (let step = 0; step < CONFIG.world.physicsHz * 6 &&
          !reports.some(({ report }) => report.damage > 0 && report.key === "torso"); step += 1) {
        stepPair(constructSide === "left" ? construct : warrior,
          constructSide === "left" ? warrior : construct, 1 / CONFIG.world.physicsHz, combat.now);
        arena.scene._renderId += 1;
        arena.scene._advancePhysicsEngineStep(1000 / CONFIG.world.physicsHz);
        combat.advance(1 / CONFIG.world.physicsHz);
      }
      const torso = reports.find(({ report }) => report.damage > 0 && report.key === "torso");
      assert.ok(torso, `${constructSide} Warden never landed a physical torso arrow`);
      assert.equal(torso.effectorId.startsWith("dorsal-crossbow:"), true);
      assert.equal(torso.report.weapon, "arrow");
    } finally {
      combat.dispose();
      warrior.dispose();
      construct.dispose();
      materials.shared.dispose(false, false);
      arena.dispose();
    }
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
    assert.deepEqual([...phases].filter((phase) => ["wind", "commit", "recover"].includes(phase)),
      ["wind", "commit", "recover"], "the physical span must contain the commanded three-stage sweep");
  } finally {
    bout.dispose(); arena.dispose();
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
  targetControl.actions = targetControl.actions.filter(({ id }) => id !== "cover");
  const targetProgram = structuredClone(wardenProgram("crossbow"));
  targetProgram.id = "passive-physical-sword-target"; targetProgram.rules = [];
  const target = saveConstruct("Physical sword target", targetBlueprint, targetControl, targetProgram, WARDEN_SENSORS);

  const arena = await createConstructHeadlessArena();
  // The cores start with longitudinal clearance and the neutral blade starts outside the
  // target footprint. Only the commanded yaw stroke can bring its declared 1.15 m reach in.
  const bout = new ConstructLabBout(arena.scene, attacker, target, WARDEN_SENSORS, 0.9, 0,
    { lateralOffsetM: 1.0, separationOffsetM: 0, yawOffsetRad: 0 });
  try {
    const before = bout.construct("right").state.partHealth("dorsal-yaw");
    let scored = null;
    for (let step = 0; step < 1800 && !scored; step += 1) {
      const sample = bout.step(1 / CONFIG.world.physicsHz);
      scored = sample.left.combat.find(({ report }) => report.damage > 0) ?? null;
    }
    assert.ok(scored, "the physical mounted blade must produce a damaging Combat report");
    assert.equal(scored.effectorId, "dorsal-sword");
    assert.equal(scored.report.weapon, "sword");
    assert.equal(scored.report.key, "dorsal-yaw");
    assert.ok(bout.construct("right").state.partHealth("dorsal-yaw") < before,
      "Combat damage must reach the target Construct's authoritative health state");
  } finally {
    bout.dispose(); arena.dispose();
  }
});
