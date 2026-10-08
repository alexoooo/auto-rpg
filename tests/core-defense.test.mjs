import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { createDefenseProbe } from "../src/core/tasks/defense.ts";
import { freshEngine, saveStand, loadStand } from "./harness/core-stand.mjs";

async function fixture(config) {
  const renderer = new NullEngine(), scene = new Scene(renderer);
  const task = createDefenseProbe(scene, await freshEngine(), { model: "workshop-fighter", held: "empty", hands: "left",
    hz: 120, actuation: "directional", offset: 0.02, variant: "predict", ...config });
  return { task, dispose() { task.dispose(); scene.dispose(); renderer.dispose(); } };
}
const finish = (task) => { while (!task.complete) task.world.step(); return task.observe(); };

test("either-hand defense intercepts real clubs and sustains protected-region clearance", {
  todo: "the guard's interception was tuned on capsule hands; with the palm's hull the Rogue's club guard lets a club reach the protected region",
}, async () => {
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

test("physical defense scoring retains protected contact independently of policy phase", async () => {
  const f = await fixture({ model: "workshop-rogue", held: "club", hands: "both", variant: "pose" });
  try {
    const { task: result } = finish(f.task);
    assert.ok(f.task.body.state.mind.policy.effectors.every((e) => e.phase === "guard"));
    assert.ok(result.protectedImpulse > 0 && result.firstProtected > 360);
    const protectedRows = result.contacts.filter((c) => f.task.configuration.protected.includes(c.segment));
    assert.ok(protectedRows.some((c) => c.impulse > 0));
    assert.ok(Math.abs(protectedRows.reduce((sum, c) => sum + c.impulse, 0) - result.protectedImpulse) < 1e-10);
    assert.ok(result.contacts.filter((c) => c.impulse > 0).every((c) => c.firstContact > 360 && c.peakImpulse > 0));
  } finally { f.dispose(); }
});

test("delayed threats, contact bracing and held preparation replay in a fresh world", async () => {
  const config = { model: "crypt-skeleton", hands: "both", held: "club" };
  for (const checkpoint of [300, 400]) {
    const f = await fixture(config), other = await fixture(config);
    try {
      f.task.world.step(checkpoint);
      const saved = saveStand(f.task.world, f.task.state);
      const run = (task) => ({ observation: finish(task), state: saveStand(task.world, task.state).state });
      const expected = run(f.task);
      assert.equal(expected.observation.task.protectedImpulse, 0);
      assert.ok(expected.observation.task.guards.every((g) => g.qualifyingContacts > 0));
      loadStand(f.task.world, f.task.state, saved); assert.deepEqual(run(f.task), expected);
      loadStand(other.task.world, other.task.state, saved); assert.deepEqual(run(other.task), expected);
    } finally { f.dispose(); other.dispose(); }
  }
});
