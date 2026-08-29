import assert from "node:assert/strict";
import test from "node:test";

import { validateConstructCommand, validateControlGraph } from "../src/construct/actions.ts";
import { BOOTSTRAP_CONTROLLERS, controllerFactory } from "../src/construct/controllers.ts";
import { ActionScheduler, MotorWriter } from "../src/construct/scheduler.ts";
import { ConstructRecorder } from "../src/construct/recorder.ts";

const graph = Object.freeze({
  version: 1,
  groups: Object.freeze([
    Object.freeze({ id: "left-bank", joints: Object.freeze(["left-yaw"]), modules: Object.freeze([]), bindings: Object.freeze({}) }),
    Object.freeze({ id: "right-bank", joints: Object.freeze(["right-yaw"]), modules: Object.freeze([]), bindings: Object.freeze({}) }),
  ]),
  actions: Object.freeze([
    Object.freeze({ id: "hold-left", controller: "hold-joints", group: "left-bank",
      claims: Object.freeze(["resource:balance"]), parameters: Object.freeze({}) }),
    Object.freeze({ id: "turn-left", controller: "turn-joint-to-angle", group: "left-bank",
      claims: Object.freeze([]), parameters: Object.freeze({
        joint: Object.freeze({ kind: "enum", values: Object.freeze(["left-yaw"]) }),
        "angle-rad": Object.freeze({ kind: "number", min: -1, max: 1, unit: "radians" }),
      }) }),
    Object.freeze({ id: "turn-right", controller: "turn-joint-to-angle", group: "right-bank",
      claims: Object.freeze([]), parameters: Object.freeze({
        joint: Object.freeze({ kind: "enum", values: Object.freeze(["right-yaw"]) }),
        "angle-rad": Object.freeze({ kind: "number", min: -1, max: 1, unit: "radians" }),
      }) }),
  ]),
});

const joint = () => ({ angleRad: 0, speedRadS: 0, minRad: -1, maxRad: 1, maxSpeedRadS: 2, maxForceNm: 20 });
const view = () => ({ joints: { "left-yaw": joint(), "right-yaw": joint() }, facts: {} });
const request = (action, sourceIndex, parameters = {}, priority = action.startsWith("turn") ? 10 : 0) => ({
  request: { action, parameters }, priority, sourceIndex,
});
const command = (...requests) => ({ version: 1, requests });

test("disjoint_actions_run_concurrently_and_shared_joint_claims_never_do", () => {
  const writes = [];
  const scheduler = new ActionScheduler(graph, BOOTSTRAP_CONTROLLERS, { write: (target) => writes.push(target) });
  const events = scheduler.step(command(
    request("hold-left", 4),
    request("turn-left", 2, { joint: "left-yaw", "angle-rad": 0.6 }),
    request("turn-right", 3, { joint: "right-yaw", "angle-rad": -0.4 }),
  ), view(), 1 / 240);
  assert.deepEqual(writes.map((row) => row.joint).sort(), ["left-yaw", "right-yaw"]);
  assert.equal(events.some((row) => row.action === "hold-left" && row.kind === "refused"), true);
  assert.equal(events.filter((row) => row.kind === "started").length, 2);
});

test("priority_then_source_declaration_index_is_the_complete_arbitration_order", () => {
  const run = (requests) => {
    const scheduler = new ActionScheduler(graph, BOOTSTRAP_CONTROLLERS, { write: () => {} });
    return scheduler.step(command(...requests), view(), 1 / 240)
      .filter((row) => row.kind === "admitted").map((row) => row.action);
  };
  const rows = [request("hold-left", 0), request("turn-left", 1, { joint: "left-yaw", "angle-rad": 0.2 })];
  assert.deepEqual(run(rows), ["turn-left"]);
  assert.deepEqual(run([...rows].reverse()), ["turn-left"]);
});

test("an_action_can_write_only_the_motors_its_group_declares", () => {
  const writer = new MotorWriter(["left-yaw"], { write: () => {} });
  assert.doesNotThrow(() => writer.write({ joint: "left-yaw:y", angleRad: 0, maxSpeedRadS: 1, maxForceNm: 1 }));
  assert.throws(() => writer.write({ joint: "right-yaw", angleRad: 0, maxSpeedRadS: 1, maxForceNm: 1 }),
    /foreign joint "right-yaw"/);
});

test("every_declared_angular_axis_can_be_read_held_and_targeted_by_its_suffix", () => {
  const multiaxis = structuredClone(graph);
  multiaxis.actions.find(({ id }) => id === "turn-left").parameters.axis = { kind: "enum", values: ["x", "y"] };
  const state = view();
  state.joints["left-yaw:x"] = { ...joint(), angleRad: 0.15 };
  state.joints["left-yaw:y"] = { ...joint(), angleRad: -0.2 };
  const writes = [];
  const scheduler = new ActionScheduler(multiaxis, BOOTSTRAP_CONTROLLERS, { write: (target) => writes.push(target) });
  scheduler.step(command(request("hold-left", 0)), state, 1 / 240);
  assert.deepEqual(writes.map(({ joint: id }) => id), ["left-yaw:x", "left-yaw:y"]);
  writes.length = 0;
  scheduler.step(command(request("turn-left", 0, { joint: "left-yaw", axis: "y", "angle-rad": 0.5 })), state, 1 / 240);
  assert.deepEqual(writes.map(({ joint: id }) => id), ["left-yaw:y"]);
});

test("unknown_missing_non_finite_and_out_of_range_parameters_are_refused_by_field", () => {
  assert.throws(() => validateConstructCommand(graph, command(request("missing", 0))), /unknown construct action "missing"/);
  assert.throws(() => validateConstructCommand(graph, command(request("turn-left", 0, { joint: "left-yaw" }))),
    /missing parameter "angle-rad"/);
  assert.throws(() => validateConstructCommand(graph, command(request("turn-left", 0,
    { joint: "left-yaw", "angle-rad": Number.NaN }))), /parameter "angle-rad" must be finite/);
  assert.throws(() => validateConstructCommand(graph, command(request("turn-left", 0,
    { joint: "left-yaw", "angle-rad": 2 }))), /outside \[-1, 1\]/);
});

test("a_zero_width_numeric_parameter_is_refused_before_a_controller_or_decoder_can_see_it", () => {
  const invalid = structuredClone(graph);
  invalid.actions.find(({ id }) => id === "turn-left").parameters["angle-rad"] =
    { kind: "number", min: 0.5, max: 0.5, unit: "radians" };
  assert.throws(() => validateControlGraph(invalid), /invalid numeric bounds/);
});

test("hold_and_turn_are_closed_loop_under_the_declared_motor_limits", () => {
  const state = view();
  const writes = [];
  const scheduler = new ActionScheduler(graph, BOOTSTRAP_CONTROLLERS, { write: (target) => writes.push(target) });
  const turn = command(request("turn-left", 0, { joint: "left-yaw", "angle-rad": 0.7 }));
  scheduler.step(turn, state, 1 / 240);
  assert.deepEqual(writes.at(-1), { joint: "left-yaw", angleRad: 0.7, maxSpeedRadS: 2, maxForceNm: 20 });
  state.joints["left-yaw"].angleRad = 0.7;
  const events = scheduler.step(turn, state, 1 / 240);
  assert.equal(events.some(({ action, kind }) => action === "turn-left" && kind === "completed"), true);
  assert.equal(scheduler.diagnostics().length, 0);
});

test("a_retained_controller_observes_a_new_joint_view_after_admission", () => {
  const liveGraph = structuredClone(graph);
  liveGraph.actions.find(({ id }) => id === "turn-left").controller = "complete-on-target";
  const factory = { name: "complete-on-target", create: (context) => {
    let complete = false;
    return {
      enter: () => {},
      step: () => { complete = context.view.joints["left-yaw"].angleRad === 0.7; },
      done: () => complete,
      cancel: () => {},
      diagnostic: () => ({ phase: complete ? "complete" : "waiting", detail: "", progress: complete ? 0 : 1, epsilon: 0.01 }),
    };
  } };
  const scheduler = new ActionScheduler(liveGraph, [...BOOTSTRAP_CONTROLLERS, factory], { write: () => {} });
  const turn = command(request("turn-left", 0, { joint: "left-yaw", "angle-rad": 0.7 }));
  scheduler.step(turn, view(), 1 / 240);
  const converged = view();
  converged.joints["left-yaw"] = { ...joint(), angleRad: 0.7 };
  const events = scheduler.step(turn, converged, 1 / 240);
  assert.equal(events.some(({ action, kind }) => action === "turn-left" && kind === "completed"), true);
  assert.deepEqual(scheduler.diagnostics(), []);
});

test("the_action_recorder_cannot_read_driver_identity", () => {
  const recorder = new ConstructRecorder();
  const scheduler = new ActionScheduler(graph, BOOTSTRAP_CONTROLLERS, { write: () => {} });
  const input = command(request("hold-left", 0));
  recorder.record(input, scheduler.step(input, view(), 1 / 240));
  assert.equal(JSON.stringify(recorder.rows).includes("driver"), false);
  assert.equal(JSON.stringify(recorder.rows).includes("source"), false);
});

test("the_debug_source_and_construct_mind_issue_the_same_ConstructCommand_shape", () => {
  const debug = command(request("turn-left", 3, { joint: "left-yaw", "angle-rad": 0.25 }));
  const mind = command(request("turn-left", 3, { "angle-rad": 0.25, joint: "left-yaw" }));
  assert.doesNotThrow(() => validateConstructCommand(graph, debug));
  assert.doesNotThrow(() => validateConstructCommand(graph, mind));
  assert.deepEqual(structuredClone(debug), structuredClone(mind));
  assert.throws(() => controllerFactory("turn-left"), /unknown construct controller "turn-left"/);
});
