import assert from "node:assert/strict";
import test from "node:test";

import { CONSTRUCT_CONTROLLERS } from "../src/construct/controllers.ts";
import { solveTwoAxisAim } from "../src/construct/mounts.ts";
import { ActionScheduler } from "../src/construct/scheduler.ts";
import { wardenControl } from "../src/construct/warden.ts";
import { wardenBlueprint, wardenProgram, WARDEN_SENSORS } from "../src/construct/warden.ts";
import { saveConstruct } from "../src/construct/codec.ts";
import { ConstructLabBout } from "../src/construct/lab-bout.ts";
import { createConstructHeadlessArena } from "../scripts/construct-headless-arena.mjs";
import { CONFIG } from "../src/config.ts";

test("aim_converges_inside_limits_and_refuses_an_unreachable_direction", () => {
  assert.deepEqual(solveTwoAxisAim({ x: 0, y: 0, z: 1 }, [-1, 1], [-0.5, 0.5]),
    { yawRad: 0, pitchRad: 0, reachable: true, reason: null });
  const unreachable = solveTwoAxisAim({ x: 1, y: 2, z: 0 }, [-0.4, 0.4], [-0.2, 0.2]);
  assert.equal(unreachable.reachable, false);
  assert.match(unreachable.reason, /outside mount limits/);
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
    "projectile-speed-mps": 8, "line-of-sight": true, "launcher-clear": true };
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
