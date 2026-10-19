/**
 * **How a fallen Warrior's support entry does** (`createSupportEntryProbe`, `src/core/tasks/support-entry.ts`),
 * measured on the Node core stand, the coordinate engines, 120 Hz, and not a gate
 * (`tests/experimental.json`): from four fall directions it acquires support and holds it within
 * 20 mm, but for the one it is known to drift from. What an entry holds whatever its ending is
 * `core-support-entry.test.mjs`'s.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { createSupportEntryProbe } from "../src/core/tasks/support-entry.ts";
import { saveState, loadState } from "../src/core/state.ts";
import { freshEngine } from "./harness/core-stand.mjs";

test("a fallen Warrior acquires measured support through the independent policy and replays", async (t) => {
  const cells = [["rapier-coordinate", 1, true], ...[0, 1, 2, 3].map((direction) => ["rapier-coordinate-coulomb", direction, direction !== 1])];
  for (const [profile, direction, success] of cells) {
    const render = new NullEngine(), scene = new Scene(render);
    const probe = createSupportEntryProbe(scene, await freshEngine(profile), { model: "workshop-fighter", direction, hz: 120, actuation: "directional" });
    try {
      assert.ok(probe.world.steps > 120); assert.equal(probe.state.task.steps, 0); assert.equal(probe.state.task.fell, true);
      const state = { world: probe.world.state, ...probe.state };
      probe.world.step(240); const saved = { physics: probe.world.physics.save(), state: saveState(state) };
      const branch = () => {
        const hash = createHash("sha256");
        while (!probe.complete) { probe.world.step(); hash.update(JSON.stringify(probe.body.observe())); }
        return { observation: probe.observe(), state: saveState(state), digest: hash.digest("hex") };
      };
      const result = branch(), outcome = result.observation.task;
      assert.equal(outcome.success, success, JSON.stringify(outcome));
      assert.ok(outcome.peakSupportSteps > 1200); assert.equal(outcome.lostSupport, false);
      if (success) { assert.equal(outcome.continuedSteps, 1200); assert.ok(outcome.peakDrift < .02); }
      else { assert.equal(outcome.steps, 4800); assert.ok(outcome.peakDrift > .02); }
      assert.ok(outcome.peakEffortViolation < .0001);
      assert.equal(probe.body.assist.meter.force, 0); assert.equal(probe.body.assist.meter.moment, 0);
      probe.world.physics.load(saved.physics); loadState(state, saved.state); assert.deepEqual(branch(), result);
      t.diagnostic(JSON.stringify({ profile, direction, outcome, digest: result.digest }));
    } finally { probe.dispose(); scene.dispose(); render.dispose(); }
  }
});
