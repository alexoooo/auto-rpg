/**
 * **The support entry task** (`createSupportEntryProbe`, `src/core/tasks/support-entry.ts`), on the
 * Node core stand, the coordinate engine, 120 Hz: a fallen Warrior's entry stays within its effort,
 * unassisted, and replays. The policy alone is `core-support-entry-policy.test.mjs`'s; whether it
 * acquires and keeps support is `core-support-entry-capability.test.mjs`'s.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { createSupportEntryProbe } from "../src/core/tasks/support-entry.ts";
import { saveState, loadState } from "../src/core/state.ts";
import { freshEngine } from "./harness/core-stand.mjs";

test("a fallen Warrior's support entry stays within its effort, unassisted, and replays, whatever its ending", async () => {
  const render = new NullEngine(), scene = new Scene(render);
  const probe = createSupportEntryProbe(scene, await freshEngine("rapier-coordinate"), { model: "workshop-fighter", direction: 1, hz: 120, actuation: "directional" });
  try {
    assert.ok(probe.world.steps > 120 && probe.state.task.fell === true, "the fixture did not reach its case: the Warrior is not down when the task begins");
    assert.equal(probe.state.task.steps, 0);
    const state = { world: probe.world.state, ...probe.state };
    probe.world.step(240); const saved = { physics: probe.world.physics.save(), state: saveState(state) };
    const branch = () => {
      const hash = createHash("sha256");
      while (!probe.complete) { probe.world.step(); hash.update(JSON.stringify(probe.body.observe())); }
      return { observation: probe.observe(), state: saveState(state), digest: hash.digest("hex") };
    };
    const result = branch(), outcome = result.observation.task;
    assert.ok(outcome.steps <= 4800 && outcome.peakEffortViolation < .0001, JSON.stringify(outcome));
    assert.equal(probe.body.assist.meter.force, 0); assert.equal(probe.body.assist.meter.moment, 0);
    probe.world.physics.load(saved.physics); loadState(state, saved.state); assert.deepEqual(branch(), result);
  } finally { probe.dispose(); scene.dispose(); render.dispose(); }
});
