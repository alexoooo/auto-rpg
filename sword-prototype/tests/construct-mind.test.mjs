import assert from "node:assert/strict";
import test from "node:test";

import { ConstructMind } from "../src/construct/mind.ts";
import { CONSTRUCT_PROGRAM_LIMITS, expressionType, parseProgram, validateProgram } from "../src/construct/program.ts";
import { installedSensorsForBlueprint, SensorFrame } from "../src/construct/sensors.ts";

const sensors = Object.freeze([
  Object.freeze({ id: "self-upright", unit: "boolean", source: "self" }),
  Object.freeze({ id: "opponent-range", unit: "metres", source: "opponent" }),
  Object.freeze({ id: "line-of-sight", unit: "boolean", source: "opponent" }),
]);

const graph = Object.freeze({
  version: 1,
  groups: Object.freeze([
    Object.freeze({ id: "locomotion", joints: Object.freeze(["hip"]), modules: Object.freeze([]), bindings: Object.freeze({}) }),
    Object.freeze({ id: "dorsal-mount", joints: Object.freeze(["yaw"]), modules: Object.freeze(["crossbow"]), bindings: Object.freeze({}) }),
  ]),
  actions: Object.freeze([
    Object.freeze({ id: "walk", controller: "hold-joints", group: "locomotion",
      claims: Object.freeze([]), parameters: Object.freeze({ speed: Object.freeze({ kind: "number", min: 0, max: 2, unit: "metres-per-second" }) }) }),
    Object.freeze({ id: "fire", controller: "hold-joints", group: "dorsal-mount",
      claims: Object.freeze(["resource:ammo-bolts"]), parameters: Object.freeze({}) }),
  ]),
});

const program = Object.freeze({
  version: 1,
  id: "warden-basic",
  rules: Object.freeze([
    Object.freeze({ id: "fire-in-range", action: "fire", priority: 10, optional: true, dwellS: 0,
      condition: Object.freeze({ op: "and", values: Object.freeze([
        Object.freeze({ op: "sensor", id: "line-of-sight" }),
        Object.freeze({ op: "lt", left: Object.freeze({ op: "sensor", id: "opponent-range" }),
          right: Object.freeze({ op: "constant", value: 5, unit: "metres" }) }),
      ]) }), utility: Object.freeze({ op: "constant", value: 2 }), parameters: Object.freeze({}) }),
    Object.freeze({ id: "close-range", action: "walk", priority: 0, optional: false, dwellS: 0.1,
      condition: Object.freeze({ op: "sensor", id: "self-upright" }),
      utility: Object.freeze({ op: "constant", value: 1 }),
      parameters: Object.freeze({ speed: Object.freeze({ kind: "expression", value: Object.freeze({
        op: "constant", value: 1, unit: "metres-per-second",
      }) }) }) }),
  ]),
});

const frame = () => {
  const values = new SensorFrame(sensors);
  values.publish("self-upright", true);
  values.publish("opponent-range", 3);
  values.publish("line-of-sight", true);
  return values;
};

test("multi_axis_joint_sensor_ids_name_each_configured_axis_without_changing_one_axis_ids", () => {
  const installed = installedSensorsForBlueprint({ modules: [], joints: [
    { id: "hinge", angularAxes: [{ id: "z" }] },
    { id: "gimbal", angularAxes: [{ id: "x" }, { id: "y" }] },
  ] }, []);
  assert.deepEqual(installed.map(({ id, unit }) => [id, unit]), [
    ["joint-angle-gimbal-x", "radians"], ["joint-angle-gimbal-y", "radians"],
    ["joint-angle-hinge", "radians"], ["joint-speed-gimbal-x", "radians-per-second"],
    ["joint-speed-gimbal-y", "radians-per-second"], ["joint-speed-hinge", "radians-per-second"],
  ]);
});

test("a_program_reads_only_sensors_its_blueprint_installed", () => {
  const bad = structuredClone(program);
  bad.rules[0].condition.values[0] = { op: "sensor", id: "opponent-policy" };
  assert.throws(() => validateProgram(bad, graph, sensors), /unknown sensor "opponent-policy"/);
  const values = frame();
  assert.throws(() => values.read("opponent-policy"), /uninstalled sensor "opponent-policy"/);
});

test("active_action_expressions_read_scheduler_state_without_becoming_hardware_sensors", () => {
  const continuation = structuredClone(program);
  continuation.rules = [continuation.rules[0]];
  continuation.rules[0].condition = { op: "active", action: "fire" };
  const parsed = parseProgram(JSON.stringify(continuation), graph, sensors);
  const noHardwareFacts = new SensorFrame(sensors);
  const mind = new ConstructMind(parsed, graph, sensors);
  assert.deepEqual(mind.decide(noHardwareFacts, 1,
    { isActionActive: (action) => action === "fire" }).requests.map(({ request }) => request.action), ["fire"]);
  assert.deepEqual(mind.decide(noHardwareFacts, 1,
    { isActionActive: () => false }).requests, [],
  "an inactive action cannot bootstrap itself from a continuation expression");

  const unknown = structuredClone(continuation);
  unknown.rules[0].condition.action = "teleport";
  assert.throws(() => validateProgram(unknown, graph, sensors), /unknown active action "teleport"/);
});

test("a_destroyed_sensor_suppresses_its_rules_instead_of_reusing_the_previous_fact", () => {
  const mind = new ConstructMind(program, graph, sensors);
  assert.deepEqual(mind.decide(frame()).requests.map(({ request }) => request.action), ["fire", "walk"]);
  const afterLoss = new SensorFrame(sensors);
  afterLoss.publish("self-upright", true);
  const command = mind.decide(afterLoss);
  assert.deepEqual(command.requests.map(({ request }) => request.action), ["walk"]);
  assert.deepEqual(mind.diagnostic().rules[0], {
    rule: "fire-in-range", utility: 0, selected: false,
    decisiveFacts: { "line-of-sight": "unavailable", "opponent-range": "unavailable" },
  });
});

test("unknown_actions_groups_sensors_operators_and_non_finite_values_are_refused_by_name", () => {
  const badAction = structuredClone(program);
  badAction.rules[1].action = "teleport";
  assert.throws(() => validateProgram(badAction, graph, sensors), /unknown required action "teleport"/);
  const badConstant = structuredClone(program);
  badConstant.rules[1].utility.value = Number.NaN;
  assert.throws(() => validateProgram(badConstant, graph, sensors), /constant must be finite/);
});

test("the_program_editor_cannot_compare_incompatible_sensor_units", () => {
  const map = new Map(sensors.map((sensor) => [sensor.id, sensor]));
  assert.throws(() => expressionType({ op: "lt", left: { op: "sensor", id: "opponent-range" },
    right: { op: "sensor", id: "self-upright" } }, map), /compares metres with boolean/);
});

test("rule_selection_is_stable_under_object_key_order_and_changes_under_rule_order", () => {
  const original = new ConstructMind(program, graph, sensors).decide(frame());
  const keyOrder = structuredClone(program);
  keyOrder.rules[0].condition = { values: keyOrder.rules[0].condition.values, op: "and" };
  assert.deepEqual(new ConstructMind(keyOrder, graph, sensors).decide(frame()), original);
  const reversed = structuredClone(program);
  reversed.rules.reverse();
  assert.notDeepEqual(new ConstructMind(reversed, graph, sensors).decide(frame()), original);
});

test("compatible_rules_emit_concurrent_requests_with_stable_source_indices", () => {
  const command = new ConstructMind(program, graph, sensors).decide(frame());
  assert.deepEqual(command.requests.map(({ request, sourceIndex, priority }) => ({
    action: request.action, sourceIndex, priority,
  })), [
    { action: "fire", sourceIndex: 0, priority: 10 }, { action: "walk", sourceIndex: 1, priority: 0 },
  ]);
});

test("an_optional_missing_module_rule_is_skipped_while_a_required_one_refuses_the_program", () => {
  const withoutFire = { ...graph, actions: graph.actions.filter((action) => action.id !== "fire") };
  assert.deepEqual(validateProgram(program, withoutFire, sensors).enabledRuleIndices, [1]);
  const required = structuredClone(program);
  required.rules[0].optional = false;
  assert.throws(() => validateProgram(required, withoutFire, sensors), /unknown required action "fire"/);
});

test("every_action_diagnostic_names_the_rule_and_sensor_values_that_selected_it", () => {
  const mind = new ConstructMind(program, graph, sensors);
  mind.decide(frame());
  const diagnostic = mind.diagnostic();
  assert.deepEqual({ program: diagnostic.program, selectedRules: diagnostic.selectedRules,
    requests: diagnostic.requests }, {
      program: "warden-basic",
      selectedRules: ["fire-in-range", "close-range"],
      requests: ["fire", "walk"],
    });
  assert.deepEqual(diagnostic.rules, [
    { rule: "fire-in-range", utility: 2, selected: true,
      decisiveFacts: { "line-of-sight": true, "opponent-range": 3 } },
    { rule: "close-range", utility: 1, selected: true,
      decisiveFacts: { "self-upright": true } },
  ]);
});

test("oversize_or_overdepth_programs_refuse_before_evaluator_allocation", () => {
  const text = JSON.stringify(program);
  assert.deepEqual(parseProgram(text, graph, sensors), program);
  assert.throws(() => parseProgram(" ".repeat(CONSTRUCT_PROGRAM_LIMITS.maxBytes + 1), graph, sensors),
    /exceeds 1048576 bytes/);
  const deep = structuredClone(program);
  let expression = { op: "sensor", id: "self-upright" };
  for (let index = 0; index <= CONSTRUCT_PROGRAM_LIMITS.maxExpressionDepth; index += 1) {
    expression = { op: "not", value: expression };
  }
  deep.rules[0].condition = expression;
  assert.throws(() => parseProgram(JSON.stringify(deep), graph, sensors), /exceeds expression depth 64/);
});

test("dwell_delays_a_live_rule_without_changing_direct_inspection", () => {
  const mind = new ConstructMind(program, graph, sensors);
  assert.deepEqual(mind.decide(frame(), 0.04).requests.map(({ request }) => request.action), ["fire"]);
  assert.deepEqual(mind.decide(frame(), 0.04).requests.map(({ request }) => request.action), ["fire"]);
  assert.deepEqual(mind.decide(frame(), 0.02).requests.map(({ request }) => request.action), ["fire", "walk"]);
});
