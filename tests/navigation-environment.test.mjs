import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { createNavigationTask } from "../src/core/tasks/navigation.ts";
import { createEnvironment } from "../src/core/tasks/environment.ts";
import { CLASSIC, FIGHTING } from "../src/core/mind/config.ts";
import { freshEngine } from "./harness/core-stand.mjs";
import { BUILD_IDENTITY } from "../src/build-identity.ts";

test("the shared environment measures range following against a physically moving sensed body", async () => {
  const physics = await freshEngine();
  const mind = { ...CLASSIC, tactics: { ...FIGHTING, list: [{ kind: "follow-orders" }] } };
  const config = { model: "workshop-fighter", mind, at: { x: 0, z: 0 }, solids: [],
    orders: { move: { kind: "range", focus: "target", near: 1, far: 1.5 }, face: null },
    target: { model: "workshop-rogue", mind, at: { x: 0, z: 3 },
      orders: { move: { kind: "direct", direction: { x: 0, z: 1 } }, pace: .15, face: null } } };
  const environment = createEnvironment(config, config => {
    const engine = new NullEngine(), scene = new Scene(engine), task = createNavigationTask(scene, physics, config);
    return { ...task, dispose() { task.dispose(); scene.dispose(); engine.dispose(); } };
  }, { buildIdentity: BUILD_IDENTITY, policyPeriodSteps: 1, maxSteps: 1800 });
  try {
    const initial = environment.reset(9);
    assert.equal(initial.invalid, null);
    assert.ok(initial.metrics.distance > 2.5);
    assert.throws(() => environment.act({ orders: { move: { x: 0, z: 1 }, face: null } }), /invalid navigation orders/);
    environment.act({ orders: config.orders });
    environment.step(120);
    const snapshot = environment.save();
    const finish = () => {
      let row = environment.observe();
      while (!row.terminated && !row.truncated && !row.invalid) row = environment.step(120);
      return row;
    };
    const first = finish();
    assert.equal(first.invalid, null);
    assert.equal(first.reason, "arrived", JSON.stringify(first.metrics));
    assert.equal(first.observation.body.down, false);
    assert.ok(first.observation.target.centre[2] > initial.observation.target.centre[2] + .2, "the target actually travelled");
    assert.ok(first.metrics.distance >= 1 && first.metrics.distance <= 1.5);
    assert.equal(first.metrics.obstacleContactSteps, 0);
    environment.load(snapshot);
    assert.deepEqual(finish(), first);
  } finally { environment.dispose(); }
});
