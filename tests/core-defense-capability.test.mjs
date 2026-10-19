/**
 * **How well the defense task's guard defends** (`createDefenseProbe`, `src/core/tasks/defense.ts`),
 * measured on the Node core stand, 120 Hz, and not a gate (`tests/experimental.json`): every anatomy,
 * either hand, empty or with a club, prepares, blocks every club after it is thrown and keeps it off
 * the protected region. What a trial holds whatever its ending is `core-defense.test.mjs`'s.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { createDefenseProbe } from "../src/core/tasks/defense.ts";
import { freshEngine } from "./harness/core-stand.mjs";

async function fixture(config) {
  const renderer = new NullEngine(), scene = new Scene(renderer);
  const task = createDefenseProbe(scene, await freshEngine(), { model: "workshop-fighter", held: "empty", hands: "left",
    hz: 120, actuation: "directional", offset: 0.02, variant: "predict", ...config });
  return { task, dispose() { task.dispose(); scene.dispose(); renderer.dispose(); } };
}
const finish = (task) => { while (!task.complete) task.world.step(); return task.observe(); };

test("either-hand defense intercepts real clubs and sustains protected-region clearance", async () => {
  for (const model of ["workshop-fighter", "workshop-rogue", "crypt-skeleton"]) for (const [hands, held] of [["left", "empty"], ["right", "club"]]) {
    const f = await fixture({ model, hands, held });
    try {
      const { task: result } = finish(f.task), label = `${model}/${hands}/${held}`;
      assert.equal(result.steps, 1200); assert.equal(result.prepared, true, label);
      assert.equal(result.protectedImpulse, 0, label); assert.equal(result.firstProtected, -1, label);
      assert.equal(result.fell, false, label); assert.equal(result.rejectedSteps, 0, label);
      assert.ok(result.guards.every((g) => g.qualifyingContacts > 0 && g.firstBlock > 360 && g.closing > 0.05), label);
      assert.equal(f.task.body.assist.meter.force, 0); assert.equal(f.task.body.assist.meter.moment, 0);
    } finally { f.dispose(); }
  }
});
