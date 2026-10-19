/**
 * **The support transition** (`src/core/tasks/support.ts`), on its own Rapier world, 120 Hz: each
 * anatomy lifting either foot enters the lift, passes the phases in their order, keeps its contacts
 * within the force tolerance and uses no assist, however the transfer ends; a fork made in the lift
 * plays the same in its own world and a fresh one. Whether it completes upright is
 * `core-support-transition-capability.test.mjs`'s.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { createSupportProbe } from "../src/core/tasks/support.ts";
import { freshEngine, saveStand, loadStand } from "./harness/core-stand.mjs";

const engine = await freshEngine();
function fixture(model, side) {
  const rendering = new NullEngine(), scene = new Scene(rendering);
  const probe = createSupportProbe(scene, engine, { model, side, hz: 120, actuation: "directional", liftOffset: 0 });
  return { probe, dispose() { probe.dispose(); scene.dispose(); rendering.dispose(); } };
}
function finish(p) { while (!p.complete && p.world.steps < 1440) p.world.step(); }

test("every anatomy's support transfer keeps its contact within tolerance, unassisted, and passes its phases in order, whatever its ending", () => {
  for (const model of ["workshop-fighter", "workshop-rogue", "crypt-skeleton"]) for (const side of ["left", "right"]) {
    const f = fixture(model, side), p = f.probe;
    try {
      finish(p);
      const { task: result } = p.observe();
      assert.ok(result.transitions.length > 0 && result.transitions[0].phase === "lift", `${model}/${side}: the fixture did not reach its case`);
      const order = ["lift", "place", "recenter", "complete"];
      assert.deepEqual(result.transitions.map((s) => s.phase), order.slice(0, result.transitions.length), `${model}/${side}`);
      assert.ok(result.transitions.every((s) => Number.isFinite(s.loadFraction)), `${model}/${side}: ${JSON.stringify(result.transitions)}`);
      assert.equal(result.rejectedSteps, 0, `${model}/${side}`);
      const tolerance = p.configuration.settings.contact.forceTolerance;
      assert.ok(result.peakTension < tolerance && result.peakFrictionViolation < tolerance, `${model}/${side}: ${result.peakTension}, ${result.peakFrictionViolation}`);
      assert.ok(Number.isFinite(result.returnError) && Number.isFinite(result.peakLift), `${model}/${side}`);
      assert.equal(p.body.assist.meter.force, 0); assert.equal(p.body.assist.meter.moment, 0);
    } finally { f.dispose(); }
  }
});

test("support mode changes and measured phase gates replay through an equivalent fresh world", () => {
  const a = fixture("crypt-skeleton", "right"), b = fixture("crypt-skeleton", "right"), p = a.probe, q = b.probe;
  try {
    // The fork is half a second into the lift, which lasts about a second: the branch crosses every later phase gate.
    while (p.observe().task.phase !== "lift" && p.world.steps < 1440) p.world.step();
    p.world.step(60);
    assert.equal(p.observe().task.phase, "lift", "the fixture did not reach its case");
    const saved = saveStand(p.world, p.state);
    const branch = (probe) => { finish(probe); return { observation: probe.observe(), state: saveStand(probe.world, probe.state).state }; };
    const expected = branch(p);
    loadStand(p.world, p.state, saved); assert.deepEqual(branch(p), expected);
    loadStand(q.world, q.state, saved); assert.deepEqual(branch(q), expected);
  } finally { a.dispose(); b.dispose(); }
});
