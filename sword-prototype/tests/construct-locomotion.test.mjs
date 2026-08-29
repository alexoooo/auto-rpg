import assert from "node:assert/strict";
import test from "node:test";

import { CONSTRUCT_CONTROLLERS } from "../src/construct/controllers.ts";
import { ActionScheduler } from "../src/construct/scheduler.ts";
import { wardenControl } from "../src/construct/warden.ts";
import { WARDEN_SENSORS, wardenBlueprint, wardenProgram } from "../src/construct/warden.ts";
import { saveConstruct } from "../src/construct/codec.ts";
import { ConstructLabBout } from "../src/construct/lab-bout.ts";
import { createConstructHeadlessArena } from "../scripts/construct-headless-arena.mjs";
import { CONFIG } from "../src/config.ts";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { classifyConstructStuck } from "../src/construct/lab-report.ts";

const readings = (graph) => Object.fromEntries(graph.groups.flatMap((group) => group.joints)
  .map((joint) => [joint, { angleRad: 0, speedRadS: 0, minRad: -1.5, maxRad: 1.5,
    maxSpeedRadS: 4, maxForceNm: 240 }]));

const facts = (graph, supported = 4) => {
  const locomotion = graph.groups.find((group) => group.id === "locomotion");
  return Object.fromEntries(Object.values(locomotion.bindings).map((binding, index) =>
    [`contact:${binding.modules[0]}`, index < supported]));
};

test("four_generic_limbs_become_locomotion_only_through_their_group_and_controller", () => {
  const graph = wardenControl();
  const group = graph.groups.find((candidate) => candidate.id === "locomotion");
  assert.equal(Object.keys(group.bindings).length, 4);
  assert.equal(graph.actions.find((action) => action.id === "move").controller, "quadruped-move");
});

test("move_commands_every_configured_chain_and_requires_supported_contacts", () => {
  const graph = wardenControl();
  const writes = [];
  const scheduler = new ActionScheduler(graph, CONSTRUCT_CONTROLLERS, { write: (target) => writes.push(target) });
  const command = { version: 1, requests: [{ request: { action: "move",
    parameters: { forward: 1, right: 0, speed: 1 } }, priority: 0, sourceIndex: 0 }] };
  scheduler.step(command, { joints: readings(graph), facts: { ...facts(graph), "core-upright": true } }, 1 / 240);
  assert.equal(new Set(writes.map((target) => target.joint)).size, 16);

  const unsupported = new ActionScheduler(graph, CONSTRUCT_CONTROLLERS, { write: () => {} });
  const events = unsupported.step(command, { joints: readings(graph), facts: facts(graph, 2) }, 1 / 240);
  assert.equal(events.some((event) => event.kind === "refused" && /at least three/.test(event.reason)), true);
});

test("locomotion_is_invariant_under_group_member_array_reordering", () => {
  const original = wardenControl();
  const reordered = structuredClone(original);
  const group = reordered.groups.find((candidate) => candidate.id === "locomotion");
  group.joints.reverse(); group.modules.reverse();
  const run = (graph) => {
    const writes = [];
    const scheduler = new ActionScheduler(graph, CONSTRUCT_CONTROLLERS, { write: (target) => writes.push(target) });
    scheduler.step({ version: 1, requests: [{ request: { action: "move",
      parameters: { forward: 0.8, right: -0.2, speed: 1.2 } }, priority: 0, sourceIndex: 0 }] },
    { joints: readings(graph), facts: facts(graph) }, 1 / 240);
    return writes.sort((a, b) => a.joint.localeCompare(b.joint));
  };
  assert.deepEqual(run(reordered), run(original));
});

test("brace_tracks_pose_error_and_pitch_dominant_non_recovery_is_classified_stuck", () => {
  const graph = wardenControl();
  const staticReadings = readings(graph);
  const supported = { ...facts(graph), "core-upright": true, "core-roll-rad": 0, "core-pitch-rad": 0 };
  const brace = new ActionScheduler(graph, CONSTRUCT_CONTROLLERS, { write() {} });
  brace.step({ version: 1, requests: [{ request: { action: "brace", parameters: {} },
    priority: 0, sourceIndex: 0 }] }, { joints: staticReadings, facts: supported }, 1 / 240);
  const braceDiagnostic = brace.diagnostics().find(({ action }) => action === "brace");
  assert.ok(braceDiagnostic.progress > braceDiagnostic.epsilon,
    "an unapplied brace target reports joint pose error instead of zero core roll");

  const recover = new ActionScheduler(graph, CONSTRUCT_CONTROLLERS, { write() {} });
  const command = { version: 1, requests: [{ request: { action: "recover", parameters: {} },
    priority: 0, sourceIndex: 0 }] };
  const fallen = { ...facts(graph, 0), "core-upright": false, "core-roll-rad": 0.001,
    "core-pitch-rad": 1.1 };
  const samples = [];
  for (let step = 1; step <= 7; step += 1) {
    recover.step(command, { joints: staticReadings, facts: fallen }, 1 / 240);
    const diagnostic = recover.diagnostics().find(({ action }) => action === "recover");
    samples.push({ step, side: "left", action: "recover", group: "locomotion", phase: diagnostic.phase,
      progress: diagnostic.progress, epsilon: diagnostic.epsilon, capabilityAvailable: true });
  }
  assert.ok(samples.every(({ progress, epsilon }) => progress > epsilon));
  assert.deepEqual(classifyConstructStuck(samples, 5), [{ side: "left", action: "recover", group: "locomotion",
    phase: "planting", firstStep: 1, lastStep: 7 }]);
});

const physicalSaved = (id, action, parameters) => {
  const program = structuredClone(wardenProgram("crossbow"));
  program.id = id;
  program.rules = [{ id: `${action}-physical`, action, priority: 20, optional: false, dwellS: 0,
    condition: { op: "constant", value: true }, utility: { op: "constant", value: 1 }, parameters }];
  return saveConstruct(id, wardenBlueprint("crossbow"), wardenControl("crossbow"), program, WARDEN_SENSORS);
};

test("turn_and_brace_are_world_physical_behaviors_not_timed_pose_labels", async () => {
  const turn = physicalSaved("turn-physical-probe", "turn", {
    yaw: { kind: "expression", value: { op: "constant", value: 1 } },
  });
  const brace = physicalSaved("brace-physical-probe", "brace", {});
  const arena = await createConstructHeadlessArena();
  const bout = new ConstructLabBout(arena.scene, turn, brace, WARDEN_SENSORS, CONFIG.fighter.separation);
  try {
    const leftRoot = bout.construct("left").runtime.part("core");
    const rightRoot = bout.construct("right").runtime.part("core");
    const initialForward = Vector3.Forward().rotateByQuaternionToRef(leftRoot.node.rotationQuaternion, new Vector3());
    for (let step = 0; step < 240; step += 1) bout.step(1 / CONFIG.world.physicsHz);
    const turnedForward = Vector3.Forward().rotateByQuaternionToRef(leftRoot.node.rotationQuaternion, new Vector3());
    assert.ok(Vector3.Dot(initialForward, turnedForward) < 0.9995, "turn changes the physical core bearing");
    const leftBefore = leftRoot.node.position.clone(); const rightBefore = rightRoot.node.position.clone();
    leftRoot.body.applyImpulse(new Vector3(55, 0, 0), leftRoot.body.getObjectCenterWorld());
    rightRoot.body.applyImpulse(new Vector3(55, 0, 0), rightRoot.body.getObjectCenterWorld());
    for (let step = 0; step < 360; step += 1) bout.step(1 / CONFIG.world.physicsHz);
    const facts = bout.construct("right").control.snapshot().facts;
    const turnDisplacement = Math.abs(leftRoot.node.position.x - leftBefore.x);
    const braceDisplacement = Math.abs(rightRoot.node.position.x - rightBefore.x);
    assert.ok(braceDisplacement < turnDisplacement,
      `brace displacement ${braceDisplacement.toFixed(3)} m must be below unbraced ${turnDisplacement.toFixed(3)} m`);
    assert.ok(typeof facts["core-upright"] === "boolean");
  } finally {
    bout.dispose(); arena.dispose();
  }
});

test("physical_foot_contacts_publish_the_exact_installed_Mind_sensor_and_clear_in_flight", async () => {
  const brace = physicalSaved("contact-sensor-physical-probe", "brace", {});
  const arena = await createConstructHeadlessArena();
  const bout = new ConstructLabBout(arena.scene, brace, brace, WARDEN_SENSORS, CONFIG.fighter.separation);
  try {
    let sample;
    for (let step = 0; step < 180; step += 1) sample = bout.step(1 / CONFIG.world.physicsHz);
    const construct = bout.construct("left");
    const contactIds = ["front-left", "front-right", "rear-left", "rear-right"];
    const installed = contactIds.map((corner) => construct.control.sensors.read(`contact-foot-${corner}`).value);
    assert.ok(installed.filter(Boolean).length >= 3, "settled Warden publishes at least three planted Mind sensors");
    for (const corner of contactIds) {
      assert.equal(construct.control.sensors.read(`contact-foot-${corner}`).value,
        sample.left.snapshot.facts[`contact:foot-${corner}`], `Mind/contact controller parity for ${corner}`);
    }
    for (const part of construct.runtime.parts.values()) {
      arena.scene.getPhysicsEngine().getPhysicsPlugin().setActivationControl(part.body, 1);
      part.body.applyImpulse(new Vector3(0, part.spec.massKg * 3, 0), part.body.getObjectCenterWorld());
    }
    let cleared = false;
    for (let step = 0; step < 120; step += 1) {
      sample = bout.step(1 / CONFIG.world.physicsHz);
      cleared ||= contactIds.every((corner) =>
        construct.control.sensors.read(`contact-foot-${corner}`).value === false);
    }
    assert.equal(cleared, true, "contact sensors clear on a completed airborne solver step instead of latching");
  } finally {
    bout.dispose(); arena.dispose();
  }
});

test("recover_returns_each_supported_longitudinal_impulse_fall_to_upright_contact", async () => {
  const recoverProgram = structuredClone(wardenProgram("crossbow"));
  recoverProgram.id = "recover-physical-probe";
  recoverProgram.rules = [
    { id: "recover-fallen", action: "recover", priority: 20, optional: false, dwellS: 0,
      condition: { op: "not", value: { op: "sensor", id: "core-upright" } },
      utility: { op: "constant", value: 1 }, parameters: {} },
    { id: "brace-upright", action: "brace", priority: 10, optional: false, dwellS: 0,
      condition: { op: "sensor", id: "core-upright" }, utility: { op: "constant", value: 1 }, parameters: {} },
  ];
  const recover = saveConstruct("recover-physical-probe", wardenBlueprint("crossbow"),
    wardenControl("crossbow"), recoverProgram, WARDEN_SENSORS);
  for (const [label, impulse] of [
    ["nose", new Vector3(0, 0, 700)], ["tail", new Vector3(0, 0, -700)],
  ]) {
    const arena = await createConstructHeadlessArena();
    const bout = new ConstructLabBout(arena.scene, recover, recover, WARDEN_SENSORS, CONFIG.fighter.separation);
    try {
    for (let step = 0; step < 120; step += 1) bout.step(1 / CONFIG.world.physicsHz);
    const root = bout.construct("left").runtime.part("core");
    arena.scene.getPhysicsEngine().getPhysicsPlugin().setActivationControl(root.body, 1);
    // Tip the whole compound through an ordinary off-centre collision impulse. Havok's
    // direct angular impulse is deliberately not used here: on this welded dynamic tree it
    // can be absorbed by the constraint solve without ever producing a fallen fixture.
    root.body.applyImpulse(impulse,
      root.body.getObjectCenterWorld().add(new Vector3(0, 1.1, 0)));
    let fell = false; let recoveredAfterFall = false; let facts = bout.construct("left").control.snapshot().facts;
    for (let step = 0; step < 1200; step += 1) {
      facts = bout.step(1 / CONFIG.world.physicsHz).left.snapshot.facts;
      if (facts["core-upright"] === false) fell = true;
      else if (fell) recoveredAfterFall = true;
    }
    assert.equal(fell, true, `${label} fixture must actually cross the fallen threshold`);
    const finalUp = Vector3.Up().rotateByQuaternionToRef(root.node.rotationQuaternion, new Vector3());
    const finalControl = bout.construct("left").control.snapshot();
    assert.equal(facts["core-upright"], true,
      `${label} recover returns the measured core to upright (up=${finalUp.asArray().map((value) => value.toFixed(3)).join(",")}, ` +
      `crossed=${recoveredAfterFall}, active=${JSON.stringify(finalControl.active)}, events=${JSON.stringify(finalControl.events)})`);
    assert.ok(Object.keys(facts).filter((id) => id.startsWith("contact:") && facts[id] === true).length >= 3,
      `${label} recover ends with a supported contact set`);
    } finally {
      bout.dispose(); arena.dispose();
    }
  }
});
