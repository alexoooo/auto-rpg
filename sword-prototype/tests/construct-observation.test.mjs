import assert from "node:assert/strict";
import test from "node:test";

import { deriveCapabilities } from "../src/construct/capabilities.ts";
import { actionCandidates } from "../src/construct/learning/candidates.ts";
import { CONSTRUCT_GRAPH_CONTRACT, CONSTRUCT_GRAPH_CONTRACT_DIGEST, CONSTRUCT_GRAPH_LIMITS } from
  "../src/construct/learning/contract.ts";
import { encodeConstructObservation, mirrorConstructObservation, validateConstructObservation } from
  "../src/construct/learning/observation.ts";
import { mirrorConstructCandidates, mirrorConstructCommand, mirrorConstructControlGraph } from
  "../src/construct/learning/mirror.ts";
import { canonicalIntegrityJson, integrityDigest } from "../src/construct/integrity.ts";
import { WARDEN_SENSORS, wardenBlueprint, wardenControl } from "../src/construct/warden.ts";

const resourceView = Object.freeze({ chargeJ: 1000, heatJ: 0, overheated: false,
  ammunition: Object.freeze({ "dorsal-magazine": 10 }), reloadS: Object.freeze({ "dorsal-magazine": 0 }) });

const state = (blueprint, control, installed = new Set(blueprint.modules.map(({ id }) => id))) => {
  const hardware = { joints: new Set(blueprint.joints.map(({ id }) => id)), modules: installed,
    sensors: new Set(["line-of-sight"]), resources: resourceView };
  return {
    partHealth: {}, attachedParts: new Set(blueprint.parts.map(({ id }) => id)), jointIntegrity: {},
    jointAngleRad: {}, jointSpeedRadS: {}, installedModules: installed,
    sensors: [{ id: "opponent-range", unit: "metres", value: 3 }],
    capabilities: deriveCapabilities(control, hardware),
  };
};

test("two_four_and_six_limb_blueprints_encode_without_padding_or_truncation", () => {
  const base = wardenBlueprint(); const control = wardenControl();
  const four = encodeConstructObservation(base, control, WARDEN_SENSORS, state(base, control));
  const remove = (count) => {
    const copy = structuredClone(base);
    const removed = new Set(["rear-left", "rear-right"].slice(0, count));
    copy.parts = copy.parts.filter((part) => ![...removed].some((corner) => part.id.includes(corner)));
    copy.joints = copy.joints.filter((joint) => copy.parts.some((part) => part.id === joint.childPart));
    const deadSockets = new Set(copy.sockets.filter((socket) => !copy.parts.some((part) => part.id === socket.part)).map(({ id }) => id));
    copy.sockets = copy.sockets.filter((socket) => !deadSockets.has(socket.id));
    copy.modules = copy.modules.filter((module) => !deadSockets.has(module.socket));
    const graph = structuredClone(control);
    const locomotion = graph.groups.find((group) => group.id === "locomotion");
    locomotion.joints = locomotion.joints.filter((id) => copy.joints.some((joint) => joint.id === id));
    locomotion.modules = locomotion.modules.filter((id) => copy.modules.some((module) => module.id === id));
    for (const corner of removed) delete locomotion.bindings[corner];
    return encodeConstructObservation(copy, graph, WARDEN_SENSORS, state(copy, graph));
  };
  const two = remove(2);
  const sixBlueprint = structuredClone(base); const sixControl = structuredClone(control);
  for (const [source, target] of [["rear-left", "middle-left"], ["rear-right", "middle-right"]]) {
    const replace = (value) => value.replace(source, target);
    sixBlueprint.parts.push(...structuredClone(base.parts.filter(({ id }) => id.includes(source)))
      .map((part) => ({ ...part, id: replace(part.id) })));
    sixBlueprint.joints.push(...structuredClone(base.joints.filter(({ id }) => id.includes(source)))
      .map((joint) => ({ ...joint, id: replace(joint.id), parentPart: replace(joint.parentPart), childPart: replace(joint.childPart) })));
    sixBlueprint.sockets.push(...structuredClone(base.sockets.filter(({ id }) => id.includes(source)))
      .map((socket) => ({ ...socket, id: replace(socket.id), part: replace(socket.part) })));
    sixBlueprint.modules.push(...structuredClone(base.modules.filter(({ id }) => id.includes(source)))
      .map((module) => ({ ...module, id: replace(module.id), socket: replace(module.socket) })));
    const locomotion = sixControl.groups.find(({ id }) => id === "locomotion");
    const binding = structuredClone(locomotion.bindings[source]);
    binding.joints = binding.joints.map(replace); binding.modules = binding.modules.map(replace);
    locomotion.bindings[target] = binding;
    locomotion.joints.push(...binding.joints); locomotion.modules.push(...binding.modules);
    sixControl.groups.find(({ id }) => id === "whole-body").joints.push(...binding.joints);
  }
  const six = encodeConstructObservation(sixBlueprint, sixControl, WARDEN_SENSORS, state(sixBlueprint, sixControl));
  assert.ok(two.nodes.length < four.nodes.length && four.nodes.length < six.nodes.length);
  assert.equal(four.nodes.some((node) => node.id.startsWith("padding")), false);
});

test("blueprint_array_order_does_not_change_canonical_graph_order_or_features", () => {
  const blueprint = wardenBlueprint(); const control = wardenControl();
  const expected = encodeConstructObservation(blueprint, control, WARDEN_SENSORS, state(blueprint, control));
  const reordered = structuredClone(blueprint);
  reordered.parts.reverse(); reordered.joints.reverse(); reordered.modules.reverse(); reordered.sockets.reverse();
  assert.deepEqual(encodeConstructObservation(reordered, control, WARDEN_SENSORS, state(reordered, control)), expected);
});

test("mirror_twice_returns_exact_graph_and_candidate_bytes", () => {
  const blueprint = wardenBlueprint(); const control = wardenControl();
  const graph = encodeConstructObservation(blueprint, control, WARDEN_SENSORS, state(blueprint, control));
  assert.deepEqual(mirrorConstructObservation(mirrorConstructObservation(graph)), graph);
  const candidates = actionCandidates(control, state(blueprint, control).capabilities);
  assert.deepEqual(mirrorConstructCandidates(mirrorConstructCandidates(candidates, control, blueprint), control, blueprint),
    candidates);
  assert.deepEqual(mirrorConstructControlGraph(mirrorConstructControlGraph(control, blueprint), blueprint), control);
  const command = Object.freeze({ version: 1, requests: Object.freeze([
    Object.freeze({ request: Object.freeze({ action: "move", parameters: Object.freeze({ forward: 0.5,
      right: 0.75, speed: 1.25 }) }), priority: 0, sourceIndex: 0 }),
    Object.freeze({ request: Object.freeze({ action: "cover", parameters: Object.freeze({
      joint: "bearing-shield", "angle-rad": 0.3 }) }), priority: 0, sourceIndex: 1 }),
  ]) });
  assert.deepEqual(mirrorConstructCommand(mirrorConstructCommand(command, control, blueprint), control, blueprint), command);
});

test("mirror_uses_polar_axial_and_declared_joint_axis_parity_while_swapping_symmetric_roles", () => {
  const blueprint = wardenBlueprint(); const control = wardenControl();
  const dynamic = { ...state(blueprint, control),
    partRelativePositionM: { "limb-front-left-upper": [2, 0, 0] },
    partLinearVelocityMps: { "limb-front-left-upper": [4, 0, 0] },
    partAngularVelocityRadS: { "limb-front-left-upper": [1, 2, 3] },
    partLocalForward: { "limb-front-left-upper": [0.2, 0.3, 0.4] },
    partLocalUp: { "limb-front-left-upper": [0.5, 0.6, 0.7] },
    jointAngleRad: { "bearing-front-left-upper": 0.2, "bearing-dorsal-yaw": 0.3, "bearing-shield": 0.4 },
    jointSpeedRadS: { "bearing-front-left-upper": 0.4, "bearing-dorsal-yaw": 0.5, "bearing-shield": 0.6 } };
  const graph = encodeConstructObservation(blueprint, control, WARDEN_SENSORS, dynamic);
  const mirrored = mirrorConstructObservation(graph);
  const source = graph.nodes.find(({ id }) => id === "limb-front-left-upper");
  const target = mirrored.nodes.find(({ id }) => id === "limb-front-right-upper");
  assert.equal(target.features[5], -source.features[5]);
  assert.equal(target.features[8], -source.features[8]);
  assert.deepEqual(target.features.slice(11, 14), [source.features[11], -source.features[12], -source.features[13]]);
  assert.equal(target.features[14], -source.features[14]);
  assert.equal(target.features[17], -source.features[17]);
  const x = graph.nodes.find(({ id }) => id === "bearing-front-left-upper");
  const mirroredX = mirrored.nodes.find(({ id }) => id === "bearing-front-right-upper");
  const y = graph.nodes.find(({ id }) => id === "bearing-dorsal-yaw");
  const mirroredY = mirrored.nodes.find(({ id }) => id === "bearing-dorsal-yaw");
  const z = graph.nodes.find(({ id }) => id === "bearing-shield");
  const mirroredZ = mirrored.nodes.find(({ id }) => id === "bearing-shield");
  assert.deepEqual(mirroredX.features.slice(2, 4), x.features.slice(2, 4), "axial x rotations keep sign");
  assert.deepEqual(mirroredY.features.slice(10, 12), y.features.slice(10, 12).map((value) => -value),
    "axial y rotations negate");
  assert.deepEqual(mirroredZ.features.slice(18, 20), z.features.slice(18, 20).map((value) => -value),
    "axial z rotations negate");
});

test("two_and_three_axis_joints_encode_each_declared_axis_and_mirror_limits_involutively", () => {
  const blueprint = structuredClone(wardenBlueprint()); const control = wardenControl();
  const joint = blueprint.joints.find(({ id }) => id === "bearing-dorsal-yaw");
  const source = structuredClone(joint.angularAxes[0]);
  joint.angularAxes = [
    { ...source, id: "x", minRad: -0.2, maxRad: 0.4, maxSpeedRadS: 3 },
    { ...source, id: "y", minRad: -0.5, maxRad: 0.7, maxSpeedRadS: 4 },
    { ...source, id: "z", minRad: -0.8, maxRad: 0.9, maxSpeedRadS: 5 },
  ];
  const dynamic = { ...state(blueprint, control), jointAngleRad: {
    "joint-angle-bearing-dorsal-yaw-x": 0.1, "joint-angle-bearing-dorsal-yaw-y": 0.2,
    "joint-angle-bearing-dorsal-yaw-z": 0.3,
  }, jointSpeedRadS: {
    "joint-speed-bearing-dorsal-yaw-x": 1, "joint-speed-bearing-dorsal-yaw-y": 2,
    "joint-speed-bearing-dorsal-yaw-z": 3,
  } };
  const graph = encodeConstructObservation(blueprint, control, WARDEN_SENSORS, dynamic);
  const row = graph.nodes.find(({ id }) => id === joint.id);
  assert.deepEqual([row.features[1], row.features[9], row.features[17]], [1, 1, 1]);
  assert.ok(row.features[2] > 0 && row.features[10] > 0 && row.features[18] > 0);
  const mirrored = mirrorConstructObservation(graph).nodes.find(({ id }) => id === joint.id);
  assert.equal(mirrored.features[2], row.features[2]);
  assert.equal(mirrored.features[10], -row.features[10]);
  assert.equal(mirrored.features[18], -row.features[18]);
  assert.equal(mirrored.features[12], -row.features[13]);
  assert.equal(mirrored.features[13], -row.features[12]);
  assert.deepEqual(mirrorConstructObservation(mirrorConstructObservation(graph)), graph);

  joint.angularAxes.pop();
  const two = encodeConstructObservation(blueprint, control, WARDEN_SENSORS, state(blueprint, control));
  const twoRow = two.nodes.find(({ id }) => id === joint.id);
  assert.deepEqual([twoRow.features[1], twoRow.features[9], twoRow.features[17]], [1, 1, 0]);
});

test("resources_contacts_and_active_actions_are_dynamic_graph_features", () => {
  const blueprint = wardenBlueprint(); const control = wardenControl();
  const graph = encodeConstructObservation(blueprint, control, WARDEN_SENSORS, {
    ...state(blueprint, control), moduleContact: new Set(["foot-front-left"]),
    resourceChargeFraction: 0.4, resourceHeatFraction: 0.25,
    ammunitionFraction: { "dorsal-magazine": 0.5 }, activeActions: new Set(["fire/dorsal-mount"]),
  });
  assert.equal(graph.nodes.find(({ id }) => id === "foot-front-left").features[4], 1);
  assert.equal(graph.nodes.find(({ id }) => id === "warden-power").features[5], 0.4);
  assert.equal(graph.nodes.find(({ id }) => id === "dorsal-crossbow").features[6], 0.25);
  assert.equal(graph.nodes.find(({ id }) => id === "dorsal-magazine").features[7], 0.5);
  assert.equal(graph.nodes.find(({ id }) => id === "fire").features[2], 1);
});

test("a_destroyed_module_changes_only_its_dynamic_rows_edges_and_capabilities", () => {
  const blueprint = wardenBlueprint(); const control = wardenControl();
  const all = new Set(blueprint.modules.map(({ id }) => id)); const lost = new Set(all); lost.delete("dorsal-crossbow");
  const before = encodeConstructObservation(blueprint, control, WARDEN_SENSORS, state(blueprint, control, all));
  const afterState = state(blueprint, control, lost);
  const after = encodeConstructObservation(blueprint, control, WARDEN_SENSORS, afterState);
  const changed = after.nodes.filter((node, index) => JSON.stringify(node.features) !== JSON.stringify(before.nodes[index].features));
  assert.deepEqual(new Set(changed.map(({ id }) => id)), new Set(["dorsal-crossbow", "aim", "fire", "track"]));
});

test("an_uninstalled_sensor_cannot_leak_an_opponent_feature_into_the_graph", () => {
  const blueprint = wardenBlueprint(); const control = wardenControl();
  const noOpponentSensors = WARDEN_SENSORS.filter((sensor) => sensor.source !== "opponent");
  const graph = encodeConstructObservation(blueprint, control, noOpponentSensors,
    { ...state(blueprint, control), sensors: [] });
  assert.equal(graph.nodes.some((node) => node.id === "opponent-range"), false);
});

test("a_destroyed_sensor_module_suppresses_even_a_caller_supplied_opponent_value", () => {
  const blueprint = wardenBlueprint(); const control = wardenControl();
  const installed = new Set(blueprint.modules.map(({ id }) => id));
  installed.delete("warden-sensor");
  const current = state(blueprint, control, installed);
  current.sensors = [{ id: "opponent-range", unit: "metres", value: 9 }];
  const graph = encodeConstructObservation(blueprint, control, WARDEN_SENSORS, current);
  assert.deepEqual(graph.nodes.find(({ id }) => id === "opponent-range").features.slice(0, 2), [0, 0]);
});

test("candidate_rows_cover_every_available_action_once_and_no_unavailable_action", () => {
  const blueprint = wardenBlueprint(); const control = wardenControl(); const current = state(blueprint, control);
  const candidates = actionCandidates(control, current.capabilities);
  assert.equal(new Set(candidates.map(({ action }) => action)).size, candidates.length);
  assert.deepEqual(candidates.map(({ action }) => action), current.capabilities.filter(({ available }) => available)
    .map(({ action }) => action).sort());
  assert.match(CONSTRUCT_GRAPH_CONTRACT_DIGEST, /^[0-9a-f]{8}$/);
});

test("every_contract_field_participates_in_the_digest_and_stale_versions_refuse_early", () => {
  assert.equal(CONSTRUCT_GRAPH_LIMITS.maxNodes, 1_151);
  assert.equal(CONSTRUCT_GRAPH_LIMITS.maxEdges, 29_694);
  for (const field of Object.keys(CONSTRUCT_GRAPH_CONTRACT)) {
    const changed = structuredClone(CONSTRUCT_GRAPH_CONTRACT);
    changed[field] = typeof changed[field] === "number" ? changed[field] + 1 : `${JSON.stringify(changed[field])}-changed`;
    assert.notEqual(integrityDigest(canonicalIntegrityJson(changed)), CONSTRUCT_GRAPH_CONTRACT_DIGEST, field);
  }
  const stale = structuredClone(encodeConstructObservation(wardenBlueprint(), wardenControl(), WARDEN_SENSORS,
    state(wardenBlueprint(), wardenControl())));
  stale.version = 1;
  assert.throws(() => validateConstructObservation(stale), /version 1 is unsupported/);
});
