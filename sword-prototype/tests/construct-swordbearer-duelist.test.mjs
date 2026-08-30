import assert from "node:assert/strict";
import test from "node:test";

import { blankBlocker, selectBlocker } from "../src/action-primitives.ts";
import { humanoidBlueprint, humanoidControl, HUMANOID_SENSORS } from "../src/construct/humanoid.ts";
import { ConstructMind } from "../src/construct/mind.ts";
import { installedSensorsForBlueprint, SensorFrame } from "../src/construct/sensors.ts";
import { SWORDBEARER_DUELIST, swordbearerDuelistProgram } from "../src/construct/swordbearer-duelist.ts";
import { constructWarriorWinner, constructStandingThresholds, isConstructStanding } from
  "../scripts/construct-warrior-bout.mjs";

const blueprint = humanoidBlueprint();
const graph = humanoidControl();
const sensors = installedSensorsForBlueprint(blueprint, HUMANOID_SENSORS);
const program = swordbearerDuelistProgram(graph, sensors);

const commandActions = ({ range = 1.4, blocker = true, visible = true, upright = true } = {}) => {
  const frame = new SensorFrame(sensors);
  const values = {
    "core-upright": upright, "core-roll-rad": 0, "core-pitch-rad": 0,
    "opponent-range": range, "opponent-relative-speed": 0,
    "opponent-local-x": 0, "opponent-local-y": 0, "opponent-local-z": range,
    "opponent-local-vx": 0, "opponent-local-vy": 0, "opponent-local-vz": 0,
    "opponent-blocker-present": blocker, "opponent-blocker-local-x": blocker ? -0.4 : 0,
    "opponent-blocker-local-y": 0, "opponent-blocker-local-z": blocker ? range : 0,
    "line-of-sight": visible, "contact-left-foot": true, "contact-right-foot": true,
    "slip-left-foot": 0, "slip-right-foot": 0,
  };
  for (const [id, value] of Object.entries(values)) if (sensors.some((sensor) => sensor.id === id)) {
    frame.publish(id, value);
  }
  return new ConstructMind(program, graph, sensors).decide(frame, 1).requests.map(({ request }) => request.action);
};

test("the_rejected_single_arm_beat_and_contact_latch_are_absent_from_the_Swordbearer", () => {
  assert.equal(graph.actions.some(({ id }) => id === "beat-cut"), false);
  assert.equal(graph.groups.some(({ id }) => id === "sword-braced-attack"), false);
  assert.equal(program.rules.some(({ action }) => action === "beat-cut"), false);
  assert.equal(HUMANOID_SENSORS.some(({ id }) => id.includes("sword-blocker")), false);
  assert.equal(blueprint.modules.some(({ striker }) => striker && "contactSensorId" in striker), false);
  assert.equal(graph.actions.find(({ id }) => id === "move").controller, "supported-biped-move");
  assert.equal(graph.actions.find(({ id }) => id === "sweep").controller, "swordbearer-target-sweep");
  // Assisted support made a described shield a physical sweep target instead of a reason to
  // abandon both closing and attacking. Blocker presence changes neither public Action here.
  assert.deepEqual(commandActions({ range: 1.4, blocker: true }), ["move", "sweep", "stabilize"]);
  assert.deepEqual(commandActions({ range: 1.4, blocker: false }), ["move", "sweep", "stabilize"]);
});

test("the_safe_Swordbearer_never_aims_at_a_described_blocker_without_line_of_sight", () => {
  // Losing sight suppresses every aimed weapon Action without suppressing supported locomotion.
  // Removing `visible` from either sweep rule therefore adds `sweep` and fails this whole record.
  assert.deepEqual(commandActions({ range: 1.4, blocker: true, visible: false }), ["move", "stabilize"]);
  assert.deepEqual(commandActions({ range: SWORDBEARER_DUELIST.strikeBelowM + 0.01 }),
    ["move", "guard", "stabilize"]);
});

test("the_raw_described_blocker_selects_attached_shields_and_clears_without_a_stale_latch", () => {
  const hand = (weapon, x, lost = false) => ({ weapon, lost, outboard: x < 0 ? -1 : 1,
    tip: { x, y: 1, z: 0.8 } });
  const body = { hands: { primary: hand("sword", 0.4), secondary: hand("buckler", -0.5) } };
  const result = selectBlocker(body, blankBlocker());
  assert.equal(result.found, true); assert.equal(result.source, "secondary");
  assert.deepEqual(result.tip, { x: -0.5, y: 1, z: 0.8 });
  body.hands.secondary.lost = true;
  assert.equal(selectBlocker(body, result).found, false);
  assert.deepEqual(result.tip, { x: 0, y: 0, z: 0 });
});

test("mixed_bout_verdict_and_standing_thresholds_are_vitality_and_profile_derived", () => {
  assert.equal(constructWarriorWinner(0, 1), "warrior");
  assert.equal(constructWarriorWinner(1, 0), "construct");
  assert.equal(constructWarriorWinner(0, 0), "draw");
  const thresholds = constructStandingThresholds({ vitalHeight: 1, crownHeight: 1.8 });
  assert.equal(isConstructStanding({ rootUp: 0.9, torsoHeightM: 0.95, headAboveTorsoM: 0.5 }, thresholds), true);
  assert.equal(isConstructStanding({ rootUp: 0.9, torsoHeightM: 0.85, headAboveTorsoM: 0.5 }, thresholds), false);
  const small = constructStandingThresholds({ vitalHeight: 0.55, crownHeight: 0.90 });
  assert.ok(Math.abs(small.minimumTorsoHeightM - 0.495) < 1e-12);
  assert.ok(Math.abs(small.minimumHeadAboveTorsoM - 0.175) < 1e-12);
  assert.equal(isConstructStanding({ rootUp: 0.9, torsoHeightM: 0.52, headAboveTorsoM: 0.20 }, small), true,
    "the host must not impose a human-height floor on a deliberately smaller construct profile");
});
