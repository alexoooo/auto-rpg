import assert from "node:assert/strict";
import test from "node:test";

import { humanoidBlueprint, humanoidControl, humanoidProgram, HUMANOID_SENSORS } from "../src/construct/humanoid.ts";
import { applySupportedLocomotionAlternatives, deriveCapabilities } from "../src/construct/capabilities.ts";
import { CONSTRUCT_CONTROLLERS, supportedLocomotionControllerDescriptor } from "../src/construct/controllers.ts";
import { ActionScheduler } from "../src/construct/scheduler.ts";
import { deriveLocomotionAuthority, resolveSupportCarrier, supportCarrierIsLive } from "../src/construct/assisted-locomotion.ts";
import { SUPPORTED_BIPED_LIMP_V1 } from "../src/construct/biped.ts";
import { controllerChoicesForSelection } from "../src/forge/control-editor.ts";
import { ConstructMind } from "../src/construct/mind.ts";
import { SensorFrame } from "../src/construct/sensors.ts";

const blueprint = humanoidBlueprint();
const graph = humanoidControl();
const allJoints = () => new Set(blueprint.joints.map(({ id }) => id));
const allModules = () => new Set(blueprint.modules.map(({ id }) => id));
const resources = Object.freeze({ chargeJ: 24_000, heatJ: 0, overheated: false,
  ammunition: Object.freeze({}), reloadS: Object.freeze({}) });
const hardware = (lostJoints = [], lostModules = []) => ({
  joints: new Set([...allJoints()].filter((id) => !lostJoints.includes(id))),
  modules: new Set([...allModules()].filter((id) => !lostModules.includes(id))),
  sensors: new Set(), resources,
});
const capabilities = (availability, requested = []) => applySupportedLocomotionAlternatives(graph,
  deriveCapabilities(graph, availability), requested);
const capability = (rows, id) => rows.find(({ action }) => action === id);
const action = (id) => graph.actions.find((row) => row.id === id);
const group = (id) => graph.groups.find((row) => row.id === id);

test("one_severed_leg_cancels_full_move_and_admits_only_the_intact_named_limp_group", () => {
  const intact = capabilities(hardware());
  assert.deepEqual(["move", "limp-left", "limp-right"].map((id) => [id,
    capability(intact, id).available, capability(intact, id).reason]), [
    ["move", true, null],
    ["limp-left", false, 'primary locomotion action "move" remains available'],
    ["limp-right", false, 'primary locomotion action "move" remains available'],
  ]);

  const leftLost = capabilities(hardware(["left-hip"]));
  assert.equal(capability(leftLost, "move").available, false);
  assert.match(capability(leftLost, "move").reason, /left-hip/);
  assert.equal(capability(leftLost, "limp-left").available, false);
  assert.match(capability(leftLost, "limp-left").reason, /left-hip/);
  assert.deepEqual(capability(leftLost, "limp-right"), {
    action: "limp-right", group: "locomotion-limp-right", available: true, reason: null,
    parameterBounds: { forward: [-1, 1], right: [-1, 1], yaw: [-1, 1],
      speed: [0, SUPPORTED_BIPED_LIMP_V1.MAX_SPEED_MPS] },
  });
});

test("full_move_excludes_both_limps_and_two_limp_requests_cannot_share_one_balance_resource", () => {
  const bothRequested = capabilities(hardware(["waist"]), ["limp-right", "limp-left"]);
  for (const id of ["limp-left", "limp-right"]) {
    assert.equal(capability(bothRequested, id).available, false);
    assert.match(capability(bothRequested, id).reason,
      /fallback locomotion actions "limp-left", "limp-right" were requested together/);
  }

  const reversedGraph = { ...graph, actions: [...graph.actions].reverse() };
  const reversed = applySupportedLocomotionAlternatives(reversedGraph,
    deriveCapabilities(reversedGraph, hardware(["waist"])), ["limp-left", "limp-right"]);
  assert.deepEqual(Object.fromEntries(bothRequested.map((row) => [row.action, [row.available, row.reason]])),
    Object.fromEntries(reversed.map((row) => [row.action, [row.available, row.reason]])));
});

test("two_lost_humanoid_supports_release_the_carrier_and_fall", () => {
  const rows = capabilities(hardware(["left-hip", "right-hip"]));
  for (const id of ["move", "limp-left", "limp-right"]) assert.equal(capability(rows, id).available, false, id);
  const availability = { livingJointIds: hardware(["left-hip", "right-hip"]).joints,
    installedModuleIds: allModules(), isPartAttached: () => true };
  for (const id of ["locomotion", "locomotion-limp-left", "locomotion-limp-right"]) {
    assert.equal(supportCarrierIsLive(resolveSupportCarrier(blueprint, group(id)), availability).live, false, id);
  }
});

test("a_limp_uses_only_its_surviving_chain_at_its_measured_lower_authority", () => {
  const selectedAction = action("limp-right");
  const selectedGroup = group(selectedAction.group);
  const descriptor = supportedLocomotionControllerDescriptor(selectedAction.controller);
  const authority = deriveLocomotionAuthority(blueprint, selectedGroup, selectedAction, descriptor);
  const writes = []; const stages = [];
  const port = { authority: () => authority, stage: (row) => stages.push(row),
    priorSample: () => ({ request: null }), clearSubmission() {}, clearAll() {} };
  const joints = {};
  for (const joint of blueprint.joints) for (const axis of joint.angularAxes) {
    const reading = { angleRad: 0, speedRadS: 0, minRad: axis.minRad, maxRad: axis.maxRad,
      maxSpeedRadS: axis.maxSpeedRadS, maxForceNm: axis.maxTorqueNm };
    joints[`${joint.id}:${axis.id}`] = reading;
    if (joint.angularAxes.length === 1) joints[joint.id] = reading;
  }
  const scheduler = new ActionScheduler({ version: 1, groups: [selectedGroup], actions: [selectedAction] },
    CONSTRUCT_CONTROLLERS, { write: (row) => writes.push(row) }, port);
  const events = scheduler.step({ version: 1, requests: [{ request: { action: "limp-right",
    parameters: { forward: 1, right: 1, yaw: 1, speed: SUPPORTED_BIPED_LIMP_V1.MAX_SPEED_MPS } },
    priority: 1, sourceIndex: 0 }] }, { joints, facts: { "contact:contact-right-foot": true } }, 1 / 240);
  assert.equal(events.some(({ kind }) => kind === "refused" || kind === "failed"), false, JSON.stringify(events));
  assert.equal(writes.some(({ joint }) => joint.startsWith("left-")), false);
  assert.equal(writes.some(({ joint }) => joint.startsWith("right-")), true);
  assert.equal(stages.length, 1);
  assert.ok(Math.hypot(stages[0].request.localForward, stages[0].request.localRight) <= 0.4 + 1e-12);
  assert.ok(Math.abs(stages[0].request.localRight) < Math.abs(stages[0].request.localForward));
  assert.equal(stages[0].request.yaw, SUPPORTED_BIPED_LIMP_V1.MAX_YAW_FRACTION);
  assert.equal(authority.gaitStabilityScale, SUPPORTED_BIPED_LIMP_V1.GAIT_STABILITY_SCALE);
});

test("Forge_can_author_supported_and_fallback_actions_from_registry_descriptors", () => {
  for (const side of ["left", "right"]) {
    const selectedGroup = group(`locomotion-limp-${side}`);
    const choice = controllerChoicesForSelection(selectedGroup, blueprint)
      .find(({ controller }) => controller === `supported-biped-limp-${side}`);
    assert.ok(choice, `${side} limp is exposed by compatibility data`);
    assert.deepEqual(choice.bindings.map(({ role }) => role), [`${side}-foot`, "balance-chain"]);
    assert.deepEqual(choice.supportedLocomotion.alternative,
      { family: "supported-biped-move", rank: "fallback" });
  }
  assert.equal(controllerChoicesForSelection(group("locomotion-limp-left"), blueprint)
    .some(({ controller }) => controller === "supported-biped-limp-right"), false,
  "the UI cannot substitute the other limb's descriptor by array order");
});

test("authored_humanoid_rules_recover_close_retreat_turn_and_offer_only_the_named_contact_fallback", () => {
  const decide = (overrides) => {
    const frame = new SensorFrame(HUMANOID_SENSORS);
    const values = Object.fromEntries(HUMANOID_SENSORS.map(({ id, unit }) =>
      [id, unit === "boolean" ? false : 0]));
    Object.assign(values, { "core-upright": true, "line-of-sight": true,
      "opponent-range": 1.4, "opponent-local-x": 0, "opponent-blocker-present": false,
      "contact-left-foot": true, "contact-right-foot": true }, overrides);
    for (const sensor of HUMANOID_SENSORS) frame.publish(sensor.id, values[sensor.id]);
    return new ConstructMind(humanoidProgram(), graph, HUMANOID_SENSORS).decide(frame, 1).requests;
  };
  const actions = (rows) => rows.map(({ request }) => request.action);
  assert.ok(actions(decide({ "core-upright": false })).includes("recover"));
  assert.ok(actions(decide({ "opponent-range": 3.2 })).includes("move"));
  assert.equal(decide({ "opponent-range": 3.2 }).find(({ request }) => request.action === "move")
    .request.parameters.forward, 1);
  assert.equal(decide({ "opponent-range": 0.5 }).find(({ request }) => request.action === "move")
    .request.parameters.forward, -1);
  assert.equal(decide({ "opponent-local-x": 0.4 }).find(({ request }) => request.action === "turn")
    .request.parameters.yaw, 1);

  const degraded = decide({ "opponent-range": 3.2, "contact-left-foot": false,
    "contact-right-foot": true });
  assert.equal(actions(degraded).includes("limp-left"), false);
  assert.equal(actions(degraded).includes("limp-right"), true);
  assert.ok(degraded.find(({ request }) => request.action === "move").priority >
    degraded.find(({ request }) => request.action === "limp-right").priority);
});
