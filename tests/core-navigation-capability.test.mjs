/** Physical navigation capability on the shared Node task, Rapier, 120 Hz, balance 0. */
import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { createNavigationTask } from "../src/core/tasks/navigation.ts";
import { createEnvironment } from "../src/core/tasks/environment.ts";
import { CLASSIC, FIGHTING } from "../src/core/mind/config.ts";
import { placeMovement } from "../src/core/mind/movement.ts";
import { navigationPath } from "../src/core/mind/navigation.ts";
import { bodyClearance } from "../src/core/mind/sensed-bounds.ts";
import { modelSpec } from "../src/core/models.ts";
import { freshEngine } from "./harness/core-stand.mjs";

const physics = await freshEngine();
const mind = { ...CLASSIC, tactics: { ...FIGHTING, list: [{ kind: "follow-orders" }] } };
const radius = bodyClearance(modelSpec("workshop-fighter")) + .08;
const box = (name, x, z, width, depth) => ({ name, kind: "box", centre: [x, 1, z], size: [width, 2, depth] });
const orders = point => ({ move: placeMovement(point, .2), face: null });

function environment(at, goal, solids) {
  const config = { model: "workshop-fighter", mind, at, solids, orders: orders(goal) };
  return createEnvironment(config, config => {
    const rendering = new NullEngine(), scene = new Scene(rendering), task = createNavigationTask(scene, physics, config);
    return { ...task, dispose() { task.dispose(); scene.dispose(); rendering.dispose(); } };
  }, { policyPeriodSteps: 1, maxSteps: 2400 });
}

function finish(environment) {
  let result = environment.observe();
  while (!result.terminated && !result.truncated && !result.invalid) result = environment.step(60);
  return result;
}

function row(name, result) {
  return { name, seconds: result.steps / 120, reason: result.reason, invalid: result.invalid,
    status: result.observation?.navigation?.status, ...result.metrics };
}

const cases = [
  { name: "corner", at: { x: -2, z: -2 }, goal: { x: 2, z: 2 },
    solids: [box("upright", 0, -.5, .5, 2), box("crossbar", .75, .5, 2, .5)] },
  { name: "narrow passage", at: { x: 0, z: -2 }, goal: { x: 0, z: 2 },
    solids: [box("left", -1.1, 0, .6, 2.4), box("right", 1.1, 0, .6, 2.4)] },
  ...[-.4, 0, .4].map(x => ({ name: `column start ${x}`, at: { x, z: -1.8 }, goal: { x: -x, z: 1.8 },
    solids: [box("column", 0, 0, .6, .6)] })),
];

for (const scenario of cases) test(`navigation reaches and stops: ${scenario.name}`, t => {
  assert.ok(navigationPath(scenario.at, scenario.goal, scenario.solids, radius).length,
    `${scenario.name}: invalid fixture has no geometric route at ${radius}m clearance`);
  const trial = environment(scenario.at, scenario.goal, scenario.solids);
  try {
    trial.reset(31); trial.act({ orders: orders(scenario.goal) });
    const result = finish(trial), measured = row(scenario.name, result);
    t.diagnostic(JSON.stringify(measured));
    assert.equal(result.invalid, null, JSON.stringify(measured));
    assert.equal(result.reason, "arrived", JSON.stringify(measured));
    assert.equal(result.metrics.falls, 0, JSON.stringify(measured));
    assert.equal(result.metrics.obstacleContactSteps, 0, JSON.stringify(measured));
    assert.ok(result.metrics.speed <= .25, JSON.stringify(measured));
  } finally { trial.dispose(); }
});

test("navigation replaces a destination while the body is already moving", t => {
  const start = { x: 0, z: -1.5 }, first = { x: 0, z: 3 }, replacement = { x: 2, z: 0 };
  const trial = environment(start, first, []);
  try {
    trial.reset(32); trial.act({ orders: orders(first) });
    const moving = trial.step(240);
    assert.equal(moving.invalid, null);
    assert.equal(moving.terminated, false, "fixture reached the first goal before its replacement");
    assert.ok(moving.metrics.speed > .1, `fixture is not moving: ${JSON.stringify(moving.metrics)}`);
    trial.act({ orders: orders(replacement) });
    const result = finish(trial), measured = row("moved destination", result);
    t.diagnostic(JSON.stringify(measured));
    assert.equal(result.invalid, null, JSON.stringify(measured));
    assert.equal(result.reason, "arrived", JSON.stringify(measured));
    assert.equal(result.metrics.falls, 0, JSON.stringify(measured));
    assert.ok(result.metrics.distance <= .2, JSON.stringify(measured));
    assert.deepEqual(result.observation.navigation.goal, replacement);
  } finally { trial.dispose(); }
});

test("navigation reports an enclosed objective unreachable and stays on its reachable side", t => {
  const at = { x: 0, z: -3 }, goal = { x: 0, z: 0 };
  const solids = [box("north", 0, 1, 2.5, .5), box("south", 0, -1, 2.5, .5),
    box("west", -1, 0, .5, 2.5), box("east", 1, 0, .5, 2.5)];
  assert.deepEqual(navigationPath(at, goal, solids, radius), [], "fixture must be geometrically unreachable");
  const trial = environment(at, goal, solids);
  try {
    trial.reset(33); trial.act({ orders: orders(goal) });
    const result = trial.step(600), measured = row("blocked route", result);
    t.diagnostic(JSON.stringify(measured));
    assert.equal(result.invalid, null, JSON.stringify(measured));
    assert.equal(result.terminated, false);
    assert.equal(result.observation.navigation.status, "unreachable", JSON.stringify(measured));
    assert.equal(result.metrics.falls, 0, JSON.stringify(measured));
    assert.equal(result.metrics.obstacleContactSteps, 0, JSON.stringify(measured));
    const centre = result.observation.body.centre;
    assert.ok(Math.hypot(centre[0] - at.x, centre[2] - at.z) < .2, JSON.stringify(measured));
  } finally { trial.dispose(); }
});
