import assert from "node:assert/strict";
import test from "node:test";

import { blankBlocker, selectBlocker } from "../src/action-primitives.ts";
import { humanoidBlueprint, humanoidControl, humanoidSavedConstruct, HUMANOID_SENSORS } from
  "../src/construct/humanoid.ts";
import { ConstructMind } from "../src/construct/mind.ts";
import { installedSensorsForBlueprint, SensorFrame } from "../src/construct/sensors.ts";
import { SWORDBEARER_DUELIST, swordbearerDuelistProgram } from "../src/construct/swordbearer-duelist.ts";
import { constructWarriorWinner, constructStandingThresholds, isConstructStanding,
  runConstructWarriorBout } from
  "../scripts/construct-warrior-bout.mjs";
import { withDurabilityMultiplier } from "../scripts/construct-warrior-curriculum.mjs";

const blueprint = humanoidBlueprint();
const graph = humanoidControl();
const sensors = installedSensorsForBlueprint(blueprint, HUMANOID_SENSORS);
const program = swordbearerDuelistProgram(graph, sensors);

const command = ({ range = 1.4, blocker = true, visible = true, upright = true,
  opponentX = 0, sweepActive = false } = {}) => {
  const frame = new SensorFrame(sensors);
  const values = {
    "core-upright": upright, "core-roll-rad": 0, "core-pitch-rad": 0,
    "opponent-range": range, "opponent-relative-speed": 0,
    "opponent-local-x": opponentX, "opponent-local-y": 0, "opponent-local-z": range,
    "opponent-local-vx": 0, "opponent-local-vy": 0, "opponent-local-vz": 0,
    "opponent-blocker-present": blocker, "opponent-blocker-local-x": blocker ? -0.4 : 0,
    "opponent-blocker-local-y": 0, "opponent-blocker-local-z": blocker ? range : 0,
    "line-of-sight": visible, "contact-left-foot": true, "contact-right-foot": true,
    "slip-left-foot": 0, "slip-right-foot": 0,
  };
  for (const [id, value] of Object.entries(values)) if (sensors.some((sensor) => sensor.id === id)) {
    frame.publish(id, value);
  }
  return new ConstructMind(program, graph, sensors).decide(frame, 1,
    { isActionActive: (action) => sweepActive && action === "sweep" });
};
const commandActions = (options) => command(options).requests.map(({ request }) => request.action);

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

test("millimetre_lane_crossings_cannot_restart_the_Swordbearer_sweep", () => {
  const direction = (opponentX) => command({ opponentX }).requests
    .find(({ request }) => request.action === "sweep")?.request.parameters.direction;
  assert.equal(direction(-0.001), 1);
  assert.equal(direction(0.001), 1);
  assert.equal(direction(0), 1, "direction is stable across the noisy centre crossing");
});

test("an_admitted_Swordbearer_sweep_survives_a_momentary_loss_of_its_admission_facts", () => {
  assert.equal(commandActions({ range: 0.8, visible: false, sweepActive: false }).includes("sweep"), false);
  assert.equal(commandActions({ range: 0.8, visible: false, sweepActive: true }).includes("sweep"), true,
    "the authored Mind must keep requesting a live physical stroke until its controller completes");
  const sweep = program.rules.find(({ action }) => action === "sweep");
  const clinch = program.rules.find(({ id }) => id === "guard-clinch");
  assert.ok(sweep.priority > clinch.priority,
    "clinch guard must not pre-empt the mounted stroke at the retreat boundary");
});

test("the_live_Swordbearer_sweep_completes_and_wounds_the_Warrior_torso_in_both_mirrors", async () => {
  const saved = withDurabilityMultiplier(humanoidSavedConstruct(), 1, HUMANOID_SENSORS);
  for (const constructSide of ["left", "right"]) {
    const report = await runConstructWarriorBout({ saved, sensors: HUMANOID_SENSORS,
      warriorPolicy: "duelist", warriorSeed: 4157765078, constructSide, maxSteps: 30 * 240 });
    const completed = report.actionTimeline.filter(({ action, kind }) =>
      action === "sweep" && kind === "completed");
    assert.ok(completed.length >= 2,
      `${constructSide} completed only ${completed.length} live mounted sweeps`);
    const torsoContact = report.constructContacts.find((row) => row.limb === "torso" &&
      row.damage > 0 && row.blocked === false && row.sourceModuleId === "effigy-sword" &&
      row.effectorId === "effigy-sword" && row.action === "sweep" && row.actionInstanceId &&
      row.standingAtStep === true);
    assert.ok(torsoContact,
      `${constructSide} produced no upright, action-scoped sword damage on the real Warrior torso`);
    for (const prefix of ["full-close", "full-turn", "full-retreat"]) {
      assert.ok(report.selectedRules.some((id) => id.startsWith(prefix)),
        `${constructSide} never selected ${prefix} locomotion`);
    }
  }
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

test("a_mounted_shield_is_described_as_a_blocker_without_pretending_it_is_a_hand", () => {
  const body = { shoulder: { x: 0, y: 1, z: 0 }, hands: {}, effectors: [
    { weapon: "buckler", lost: false, tip: { x: -0.7, y: 1.1, z: 0.2 } },
    { weapon: "bow", lost: false, tip: { x: 0, y: 1.4, z: 0.4 } },
  ] };
  const result = selectBlocker(body, blankBlocker());
  assert.equal(result.found, true);
  assert.equal(result.source, null);
  assert.equal(result.outboard, -1);
  assert.deepEqual(result.tip, { x: -0.7, y: 1.1, z: 0.2 });
  body.effectors[0].lost = true;
  assert.equal(selectBlocker(body, result).found, false);
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
