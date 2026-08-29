import assert from "node:assert/strict";
import test from "node:test";

import { CONFIG } from "../src/config.ts";
import { saveConstruct } from "../src/construct/codec.ts";
import { humanoidBlueprint, humanoidControl, HUMANOID_SENSORS } from "../src/construct/humanoid.ts";
import { ConstructMind } from "../src/construct/mind.ts";
import { ActionScheduler } from "../src/construct/scheduler.ts";
import { CONSTRUCT_CONTROLLERS } from "../src/construct/controllers.ts";
import { installedSensorsForBlueprint, SensorFrame } from "../src/construct/sensors.ts";
import { SWORDBEARER_DUELIST, swordbearerDuelistProgram } from "../src/construct/swordbearer-duelist.ts";
import { runConstructWarriorBout } from "../scripts/construct-warrior-bout.mjs";

const blueprint = humanoidBlueprint();
const graph = humanoidControl();
const sensors = installedSensorsForBlueprint(blueprint, HUMANOID_SENSORS);
const program = swordbearerDuelistProgram(graph, sensors);

const facts = ({ upright = true, range = 3.4, lateral = 0, relativeSpeed = 0.2, visible = true } = {}) => ({
  "core-upright": upright, "core-roll-rad": 0, "core-pitch-rad": 0, "core-speed-mps": 0,
  "core-yaw-rate-rad-s": 0, "opponent-range": range, "opponent-relative-speed": relativeSpeed,
  "opponent-local-x": lateral, "opponent-local-y": 0.2, "opponent-local-z": range,
  "opponent-local-vx": 0, "opponent-local-vy": 0, "opponent-local-vz": 0,
  "projectile-speed-mps": 1, "line-of-sight": visible,
  "contact:contact-left-foot": true, "contact:contact-right-foot": true,
  "contact-contact-left-foot": true, "contact-contact-right-foot": true,
  "slip:contact-left-foot": 0, "slip:contact-right-foot": 0,
  "slip-contact-left-foot": 0, "slip-contact-right-foot": 0,
});

const frame = (values) => {
  const result = new SensorFrame(sensors);
  const installed = new Set(sensors.map(({ id }) => id));
  for (const [id, value] of Object.entries(facts(values))) if (installed.has(id)) result.publish(id, value);
  return result;
};
const decide = (values) => new ConstructMind(program, graph, sensors).decide(frame(values), 1);
const actions = (values) => decide(values).requests.map(({ request }) => request.action);

const jointReading = (minRad = -1.5, maxRad = 1.5) => ({ angleRad: 0, speedRadS: 0,
  minRad, maxRad, maxSpeedRadS: 5, maxForceNm: 500 });
const schedulerView = (values) => {
  const joints = {};
  for (const joint of blueprint.joints) {
    for (const axis of joint.angularAxes) joints[`${joint.id}:${axis.id}`] = jointReading(axis.minRad, axis.maxRad);
    if (joint.angularAxes.length === 1) joints[joint.id] = joints[`${joint.id}:${joint.angularAxes[0].id}`];
  }
  return { joints, facts: facts(values) };
};

test("the_Swordbearer_duelist_targets_only_the_explicit_biped_and_sword_Action_surface", () => {
  assert.equal(program.id, "swordbearer-warrior-duelist");
  const actionsById = new Map(graph.actions.map((action) => [action.id, action.controller]));
  assert.deepEqual([...new Set(program.rules.map(({ action }) => action))].sort(),
    ["brace", "guard", "move", "recover", "stabilize", "sweep", "turn"]);
  assert.equal(actionsById.get("move"), "biped-move");
  assert.equal(actionsById.get("turn"), "biped-turn");
  assert.equal(actionsById.get("brace"), "biped-brace");
  assert.equal(actionsById.get("recover"), "biped-recover");
  assert.equal(program.rules.some(({ action }) => action.includes("quadruped") || action === "cut" || action === "cover"), false);
});

test("recovery_facing_distance_guard_and_sweep_are_disjoint_scheduler_decisions", () => {
  const cases = [
    [{ upright: false, range: 1.4, relativeSpeed: 4.2 }, ["recover", "stabilize"]],
    [{ range: 3.4, lateral: 0 }, ["guard", "brace", "stabilize"]],
    [{ range: 3.4, lateral: 1.4 }, ["turn", "stabilize"]],
    [{ range: 1.4, lateral: 0.1, relativeSpeed: 0.2 }, ["sweep", "brace", "stabilize"]],
    [{ range: 1.4, lateral: -0.1, relativeSpeed: 0.2 }, ["sweep", "brace", "stabilize"]],
    [{ range: 1.4, lateral: 0.1, relativeSpeed: 4.2 }, ["sweep", "brace", "stabilize"]],
    [{ range: 0.6, lateral: 0.1, relativeSpeed: 0.2 }, ["move", "stabilize"]],
  ];
  for (const [values, expected] of cases) {
    const command = decide(values);
    assert.deepEqual(command.requests.map(({ request }) => request.action), expected, JSON.stringify(values));
    const writes = [];
    const events = new ActionScheduler(graph, CONSTRUCT_CONTROLLERS, { write: (target) => writes.push(target) })
      .step(command, schedulerView(values), 1 / CONFIG.world.physicsHz);
    assert.equal(events.some(({ kind }) => kind === "refused" || kind === "failed"), false,
      `${JSON.stringify(values)}: ${JSON.stringify(events)}`);
    assert.ok(writes.length > 0, `${JSON.stringify(values)} must reach public motors`);
  }
  assert.equal(decide({ range: 1.4, lateral: 0.1 }).requests[0].request.parameters.direction, 1);
  assert.equal(decide({ range: 1.4, lateral: -0.1 }).requests[0].request.parameters.direction, -1);
  assert.deepEqual(decide({ range: 0.6, lateral: 0.1 }).requests[0].request.parameters,
    { forward: -1, right: -0.45, speed: SWORDBEARER_DUELIST.retreatSpeedMps });
});

test("mutating_the_strike_boundary_changes_the_public_command_cell", () => {
  assert.deepEqual(actions({ range: SWORDBEARER_DUELIST.strikeBelowM - 0.01, relativeSpeed: 0.2 }),
    ["sweep", "brace", "stabilize"]);
  assert.deepEqual(actions({ range: SWORDBEARER_DUELIST.strikeBelowM + 0.01, relativeSpeed: 0.2 }),
    ["guard", "brace", "stabilize"]);
});

test("a_real_Warrior_view_receives_the_mounted_sword_physics_without_a_fake_hand", async () => {
  const saved = saveConstruct("Swordbearer Duelist", blueprint, graph, program, HUMANOID_SENSORS);
  const report = await runConstructWarriorBout({ saved, maxSteps: 240 });
  assert.equal(report.physics, "real-havok-fixed-240hz");
  assert.equal(report.mountedThreatVisibleToWarriorMind, true);
  assert.equal(report.perceivedEffectors.length, 1);
  const [effector] = report.perceivedEffectors;
  assert.equal(effector.weapon, "sword");
  assert.equal(effector.lost, false);
  for (const point of [effector.anchor, effector.tip, effector.tipVelocity]) {
    assert.equal(Object.values(point).every(Number.isFinite), true);
  }
  const reach = Math.hypot(effector.tip.x - effector.anchor.x,
    effector.tip.y - effector.anchor.y, effector.tip.z - effector.anchor.z);
  assert.ok(Math.abs(reach - effector.reach) < 1e-9, "published reach is the real anchor-to-tip distance");
});
