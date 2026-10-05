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

test("every anatomy transfers support, lifts either foot, places it and continues upright", (t) => {
  const rows = [];
  for (const model of ["workshop-fighter", "workshop-rogue", "crypt-skeleton"]) for (const side of ["left", "right"]) {
    const f = fixture(model, side), p = f.probe;
    try {
      finish(p);
      const { task: result, body } = p.observe(), settings = p.configuration.settings;
      assert.equal(p.complete, true, `${model}/${side}: ${JSON.stringify(result)}`);
      assert.equal(result.fell, false);
      assert.equal(result.rejectedSteps, 0);
      assert.deepEqual(result.transitions.map((s) => s.phase), ["lift", "place", "recenter", "complete"]);
      assert.ok(result.transitions[0].loadFraction < settings.unloadFraction);
      assert.equal(result.transitions[1].loadFraction, 0);
      assert.ok(result.transitions[2].loadFraction > 0);
      assert.ok(result.transitions[3].loadFraction > 0.25 && result.transitions[3].loadFraction < 0.75);
      assert.ok(result.peakLift > settings.lift - settings.liftTolerance);
      assert.ok(result.flightSteps >= settings.holdSeconds * p.configuration.hz);
      assert.ok(result.returnError < 0.01, `${model}/${side}: return ${result.returnError}`);
      assert.ok(result.continuedSteps >= 120);
      assert.ok(result.peakTension < settings.contact.forceTolerance && result.peakFrictionViolation < settings.contact.forceTolerance);
      for (const side of ["left", "right"]) assert.ok(body.contacts.some((c) => c.segment === `foot.${side}` && c.fixed !== null && c.impulse > 0));
      assert.equal(p.body.assist.meter.force, 0); assert.equal(p.body.assist.meter.moment, 0);
      rows.push({ model, side, ...result });
    } finally { f.dispose(); }
  }
  t.diagnostic(JSON.stringify(rows));
});

test("support mode changes and measured phase gates replay through an equivalent fresh world", () => {
  const a = fixture("crypt-skeleton", "right"), b = fixture("crypt-skeleton", "right"), p = a.probe, q = b.probe;
  try {
    p.world.step(350);
    assert.equal(p.observe().task.phase, "lift");
    const saved = saveStand(p.world, p.state);
    const branch = (probe) => { finish(probe); return { observation: probe.observe(), state: saveStand(probe.world, probe.state).state }; };
    const expected = branch(p);
    loadStand(p.world, p.state, saved); assert.deepEqual(branch(p), expected);
    loadStand(q.world, q.state, saved); assert.deepEqual(branch(q), expected);
  } finally { a.dispose(); b.dispose(); }
});
