import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { createPointStrikeProbe } from "../src/core/tasks/point-strike.ts";
import { freshEngine, saveStand, loadStand } from "./harness/core-stand.mjs";

async function fixture(config = {}) {
  const render = new NullEngine(), scene = new Scene(render);
  const task = createPointStrikeProbe(scene, await freshEngine(), { model: "workshop-fighter", hands: "both", held: "club",
    hz: 120, actuation: "directional", offset: 0, miss: false, centreControl: true, continueSeconds: 10, shared: {}, ...config });
  return { task, dispose() { task.dispose(); scene.dispose(); render.dispose(); } };
}

test("a shared strike acquires its second grip before contact and releases either hand continuously", async () => {
  for (const release of [undefined, "left", "right"]) {
    const f = await fixture({ shared: release ? { release } : {} }), t = f.task;
    try {
      assert.equal(t.items.length, 1);
      assert.deepEqual(t.items[0].observe().grips.map((g) => [g.name, g.attached]), [["right", true], ["left", false]]);
      while (!t.complete && t.world.time < 17) t.world.step();
      const { task: result, body } = t.observe();
      assert.ok(t.complete, JSON.stringify(result));
      assert.equal(result.fell, false); assert.equal(result.rejectedSteps, 0);
      assert.ok(result.shared.captured > 0 && result.shared.captured < result.strikes[0].firstHit);
      assert.ok(result.shared.sharedHits > 0 && result.strikes[0].closing > 0.05);
      assert.ok(result.shared.peakGripGap < t.configuration.sharedSettings.gripTolerance);
      assert.ok(result.strikes[0].returnError < t.configuration.settings.tolerance);
      assert.equal(body.equipment.length, 1);
      assert.deepEqual(body.equipment[0].grips.map((g) => [g.name, g.attached]), [["right", release !== "right"], ["left", release !== "left"]]);
      if (release) {
        assert.equal(result.shared.releaseContinuous, true);
        assert.ok(result.shared.releasedAt > result.strikes[0].firstHit);
      } else assert.equal(result.shared.releasedAt, -1);
      assert.equal(t.body.assist.meter.force, 0); assert.equal(t.body.assist.meter.moment, 0);
    } finally { f.dispose(); }
  }
});

test("shared capture, a miss, and return after release replay in another physical world", async () => {
  const config = { model: "workshop-rogue", miss: true, shared: { release: "right" } }, f = await fixture(config), other = await fixture(config);
  try {
    f.task.world.step(60);
    assert.equal(f.task.observe().task.shared.captured, -1, "checkpoint precedes the physical second grip");
    const checkpoint = saveStand(f.task.world, f.task.state);
    const run = (t) => {
      const trace = createHash("sha256");
      while (!t.complete && t.world.time < 17) { t.world.step(); trace.update(JSON.stringify(t.observe())); }
      return { observation: t.observe(), state: saveStand(t.world, t.state).state, trace: trace.digest("hex") };
    };
    const expected = run(f.task), result = expected.observation.task;
    assert.ok(f.task.complete); assert.equal(result.fell, false); assert.equal(result.rejectedSteps, 0);
    assert.equal(result.shared.sharedHits, 0); assert.equal(result.strikes[0].contacts, 0);
    assert.equal(result.shared.releaseContinuous, true);
    assert.ok(result.strikes[0].returnError < f.task.configuration.settings.tolerance);
    loadStand(f.task.world, f.task.state, checkpoint); assert.deepEqual(run(f.task), expected);
    loadStand(other.task.world, other.task.state, checkpoint); assert.deepEqual(run(other.task), expected);
  } finally { f.dispose(); other.dispose(); }
});
