/**
 * **How the shared two-hand bar does on ordinary ground** (`createBarProbe`, `src/core/tasks/bar.ts`),
 * measured on the Node core stand, 120 Hz, and not a gate (`tests/experimental.json`): every anatomy,
 * either release, stands through the trial, completes it and returns within 30 mm, and the Warrior's
 * captured return lands within 5 mm. What a trial holds whatever its ending is `core-bar.test.mjs`'s.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { createBarProbe } from "../src/core/tasks/bar.ts";
import { freshEngine, saveStand, loadStand } from "./harness/core-stand.mjs";

const engine = await freshEngine();
function fixture(model, release, support = "pinned", offset = 0) {
  const rendering = new NullEngine(), scene = new Scene(rendering);
  const probe = createBarProbe(scene, engine, { model, release, hz: 120, actuation: "directional", offset, support });
  return { probe, dispose() { probe.dispose(); scene.dispose(); rendering.dispose(); } };
}

test("ordinary ground supports every anatomical bar trial through obstacle contact and either release", (t) => {
  const rows = [];
  for (const model of ["workshop-fighter", "workshop-rogue", "crypt-skeleton"]) for (const release of ["left", "right"]) {
    const f = fixture(model, release, "standing"), p = f.probe;
    try {
      p.world.step(1100);
      const result = p.observe().task;
      assert.equal(p.configuration.pin, null);
      assert.ok(result.captured >= 0 && result.captured < 240, `${model}/${release}: capture ${result.captured}`);
      assert.equal(result.complete, true);
      assert.equal(result.fell, false, `${model}/${release}: physically down`);
      assert.ok(result.supportSteps > 1000);
      assert.equal(result.rejectedSteps, 0);
      assert.ok(result.peakTension < 1e-5 && result.peakFrictionViolation < 1e-5);
      assert.ok(result.movedError !== null && result.movedError < 0.03, `${model}/${release}: shared move ${result.movedError}`);
      assert.ok(result.finalError < 0.03, `${model}/${release}: return ${result.finalError}`);
      assert.ok(result.contactSteps > 0 && result.peakImpulse > 0, "only the named obstacle scores a contact");
      assert.equal(result.releaseContinuous, true);
      assert.ok(result.peakGripGap < 0.002);
      assert.equal(p.body.assist.meter.force, 0); assert.equal(p.body.assist.meter.moment, 0);
      rows.push({ model, release, ...result });
    } finally { f.dispose(); }
  }
  t.diagnostic(JSON.stringify(rows));
});

test("bar return uses a detached, legal captured posture and replays from before capture", () => {
  const offset = (2654435761 / 4294967296 * 2 - 1) * 0.005;
  const f = fixture("workshop-fighter", "right", "standing", offset), p = f.probe;
  try {
    p.world.step(40);
    assert.equal(p.observe().task.guardPosture, null);
    const saved = saveStand(p.world, p.state);
    const capture = () => {
      let before;
      while (p.observe().task.captured < 0 && p.world.steps < 240) { before = p.body.observe(); p.world.step(); }
      const posture = p.observe().task.guardPosture;
      assert.ok(posture);
      assert.deepEqual(posture, before.joints.map((joint, i) => {
        const dof = p.body.muscles.channels[i].dof;
        return Math.max(dof.spec.min.value, Math.min(dof.spec.max.value, joint.angle));
      }));
      const expected = [...posture]; posture.fill(99);
      assert.deepEqual(p.observe().task.guardPosture, expected, "task readings cannot rewrite the return pose");
      return expected;
    };
    const expected = capture(); loadStand(p.world, p.state, saved);
    assert.equal(p.observe().task.guardPosture, null);
    assert.deepEqual(capture(), expected);
    while (!p.complete && p.world.steps < 1440) p.world.step();
    assert.equal(p.complete, true);
    assert.ok(p.observe().task.finalError < 0.005, "the measured return avoids the reference arm pose's conflict");
    assert.equal(p.observe().task.releaseContinuous, true);
    assert.equal(p.observe().task.fell, false);
  } finally { f.dispose(); }
});
