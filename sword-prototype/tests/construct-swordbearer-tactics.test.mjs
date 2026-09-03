import assert from "node:assert/strict";
import test from "node:test";

import { humanoidBlueprint, humanoidControl, HUMANOID_SENSORS } from "../src/construct/humanoid.ts";
import { mirrorConstructCommand } from "../src/construct/learning/mirror.ts";
import { installedSensorsForBlueprint, SensorFrame } from "../src/construct/sensors.ts";
import { SwordbearerTactics, SWORDBEARER_TACTICS_V1 } from "../src/construct/swordbearer-tactics.ts";

const graph = humanoidControl();
const sensors = installedSensorsForBlueprint(humanoidBlueprint(), HUMANOID_SENSORS);
const frame = ({ range = 1.7, upright = true, visible = true, sword = true, leftArm = true,
  weaponPresent = false, weaponSpeed = 0, weaponZ = 1, weaponVz = 0 } = {}) => {
  const result = new SensorFrame(sensors);
  const values = {
    "core-upright": upright, "line-of-sight": visible, "sword-ready": sword, "left-arm-ready": leftArm,
    "opponent-range": range, "sword-core-clearance-m": 0.08,
    "opponent-weapon-present": weaponPresent, "opponent-weapon-speed-mps": weaponSpeed,
    "opponent-weapon-local-z": weaponZ, "opponent-weapon-local-vz": weaponVz,
  };
  for (const [id, value] of Object.entries(values)) result.publish(id, value);
  return result;
};
const actions = (command) => command.requests.map(({ request }) => request.action);
const locomotionActions = new Set(["advance", "withdraw", "orbit-left", "orbit-right", "recover"]);
const runtime = (sweep = false) => ({ isActionActive: (action) => action === "sweep" && sweep });

test("the_authored_Swordbearer_turns_and_moves_through_declared_combat_actions", () => {
  const tactics = new SwordbearerTactics(graph, sensors);
  const approach = tactics.decide(frame({ range: 2.6 }), 0.1, runtime());
  assert.deepEqual(actions(approach).slice(0, 2), ["advance", "guard"]);
  assert.deepEqual(approach.requests[0].request.parameters, { forward: 1, right: 0, yaw: 0,
    speed: SWORDBEARER_TACTICS_V1.approachSpeedMps });

  const orbit = tactics.decide(frame({ range: 1.7 }), 0.1, runtime());
  assert.equal(tactics.diagnostic().phase, "orbit-right");
  assert.equal(orbit.requests[0].request.action, "orbit-right");
  assert.deepEqual(orbit.requests[0].request.parameters, {
    forward: 0.35, right: 0.80, yaw: 0.70, speed: 1.05,
  });
  assert.ok(Math.abs(orbit.requests[0].request.parameters.right) > 0 &&
    Math.abs(orbit.requests[0].request.parameters.yaw) > 0,
  "an orbit must request true lateral carrier motion and true yaw together");

  const mirrored = mirrorConstructCommand(orbit, graph, humanoidBlueprint());
  assert.deepEqual(mirrored.requests[0].request, { action: "orbit-left", parameters: {
    forward: 0.35, right: -0.80, yaw: -0.70, speed: 1.05,
  } }, "a mirrored carrier must reverse the local right and yaw axes together");
});

test("the_authored_Swordbearer_commits_a_latched_sweep_then_withdraws_and_changes_lane", () => {
  const tactics = new SwordbearerTactics(graph, sensors);
  tactics.decide(frame({ range: 1.7 }), 0.1, runtime()); // enter orbit
  tactics.decide(frame({ range: 1.7 }), 0.5, runtime()); // chamber
  const commit = tactics.decide(frame({ range: 1.7 }), 0.2, runtime());
  assert.equal(tactics.diagnostic().phase, "commit");
  assert.equal(actions(commit).includes("sweep"), true);
  assert.deepEqual(commit.requests[0].request, { action: "advance", parameters: {
    forward: 0, right: 0, yaw: 0.28, speed: 0,
  } }, "a physical stroke keeps its target lane while visibly turning through the declared biped carrier");

  const held = tactics.decide(frame({ range: 1.7, visible: false }), 0.1, runtime(true));
  assert.equal(actions(held).includes("sweep"), true,
    "a momentarily occluded admitted sweep keeps its scheduler-owned target latch");
  const withdrawal = tactics.decide(frame({ range: 1.7 }), 0.1, runtime(false));
  assert.equal(tactics.diagnostic().phase, "withdraw");
  assert.equal(withdrawal.requests[0].request.action, "withdraw");
  const nextLane = tactics.decide(frame({ range: 1.7 }), 0.6, runtime(false));
  assert.equal(tactics.diagnostic().phase, "orbit-left");
  assert.equal(nextLane.requests[0].request.action, "orbit-left",
    "a completed/cancelled physical stroke cannot leave the director on its original orbit side");
});

test("the_authored_Swordbearer_uses_the_real_left_arm_only_for_a_visible_incoming_weapon", () => {
  const threatened = new SwordbearerTactics(graph, sensors);
  const command = threatened.decide(frame({ range: 1.6, weaponPresent: true, weaponSpeed: 6,
    weaponZ: 0.5, weaponVz: -1 }), 0.1, runtime());
  assert.equal(threatened.diagnostic().phase, "guard");
  assert.equal(actions(command).includes("offhand-guard"), true);
  assert.equal(actions(command).includes("sweep"), false);

  const missingArm = new SwordbearerTactics(graph, sensors);
  const withoutArm = missingArm.decide(frame({ range: 1.6, leftArm: false, weaponPresent: true,
    weaponSpeed: 6, weaponZ: 0.5, weaponVz: -1 }), 0.1, runtime());
  assert.equal(actions(withoutArm).includes("offhand-guard"), false,
    "losing the off-hand removes defense only; it may not remove the supported locomotion Action");
  assert.equal(actions(withoutArm).includes("advance"), true);

  const hidden = new SwordbearerTactics(graph, sensors);
  const unseen = hidden.decide(frame({ range: 1.6, visible: false, weaponPresent: true,
    weaponSpeed: 8, weaponZ: 0.5, weaponVz: -2 }), 0.1, runtime());
  assert.equal(actions(unseen).includes("offhand-guard"), false,
    "a hidden weapon velocity is not an action-authorizing threat fact");
});

test("a_destroyed_sword_or_left_arm_removes_only_its_dependent_tactical_behaviour", () => {
  const swordless = new SwordbearerTactics(graph, sensors);
  const swordlessCommand = swordless.decide(frame({ range: 1.6, sword: false }), 0.1, runtime());
  assert.equal(actions(swordlessCommand).includes("sweep"), false);
  assert.equal(actions(swordlessCommand).some((action) => locomotionActions.has(action)), true,
    "weapon loss may remove the mounted attack but not the physical carrier Action");

  const armless = new SwordbearerTactics(graph, sensors);
  const armlessCommand = armless.decide(frame({ range: 1.6, leftArm: false, weaponPresent: true,
    weaponSpeed: 6, weaponZ: 0.5, weaponVz: -1 }), 0.1, runtime());
  assert.equal(actions(armlessCommand).includes("offhand-guard"), false);
  assert.equal(actions(armlessCommand).some((action) => locomotionActions.has(action)), true,
    "left-arm loss may remove the posture guard but not locomotion or the remaining sword controller");

});
