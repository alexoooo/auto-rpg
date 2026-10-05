import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
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

test("anatomical two-hand loading swings against an obstacle and survives either grip release", (t) => {
  const rows = [];
  for (const model of ["workshop-fighter", "workshop-rogue", "crypt-skeleton"]) for (const release of ["left", "right"]) {
    const f = fixture(model, release), p = f.probe;
    try {
      p.world.step(1100);
      const reading = p.observe(), result = reading.task;
      assert.ok(result.captured >= 0 && result.captured < 240, `${model}/${release}: capture ${result.captured}`);
      assert.equal(result.complete, true);
      assert.ok(result.movedError !== null && result.movedError < 0.03, `${model}/${release}: shared motion ${result.movedError}`);
      assert.ok(result.contactSteps > 0 && result.peakImpulse > 0, "the shared item physically meets the obstacle");
      assert.equal(result.releaseContinuous, true, "release changes neither pose nor velocity before the physics step");
      assert.ok(result.peakGripGap < 0.002, `actual attachment gap ${result.peakGripGap}`);
      assert.ok(result.finalError < 0.03, `${model}/${release}: position-only return ${result.finalError}`);
      assert.deepEqual(reading.body.equipment[0].grips.map((g) => [g.name, g.attached]), [["right", release !== "right"], ["left", release !== "left"]]);
      assert.equal(p.body.assist.meter.force, 0); assert.equal(p.body.assist.meter.moment, 0);
      rows.push({ model, release, ...result });
    } finally { f.dispose(); }
  }
  t.diagnostic(JSON.stringify(rows));
});

test("the shared bar replays impact and release in place and in an equivalent fresh world", () => {
  for (const support of ["pinned", "standing"]) {
  const a = fixture("workshop-fighter", "right", support), b = fixture("workshop-fighter", "right", support), p = a.probe, q = b.probe;
  try {
    p.world.step(280);
    assert.ok(p.observe().body.equipment[0].grips.every((g) => g.attached));
    const saved = saveStand(p.world, p.state);
    const branch = () => { p.world.step(820); return { observation: p.observe(), state: saveStand(p.world, p.state).state }; };
    const expected = branch();
    loadStand(p.world, p.state, saved); assert.deepEqual(branch(), expected);
    loadStand(q.world, q.state, saved); q.world.step(820);
    assert.deepEqual(q.observe(), expected.observation);
    assert.deepEqual(saveStand(q.world, q.state).state, expected.state);
  } finally { a.dispose(); b.dispose(); }
  }
});

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

test("the shared bar waits for measured return readiness within the original deadline", () => {
  const seed = 1, fraction = (((seed + 1) * 2654435761) >>> 0) / 4294967296;
  const f = fixture("crypt-skeleton", "right", "standing", (fraction * 2 - 1) * 0.005), p = f.probe;
  try {
    p.world.step(240);
    const captured = p.observe().task.captured;
    p.world.step(captured + 875 - p.world.steps);
    const centre = new Vector3(...p.item.body.massProperties.centre).applyRotationQuaternion(p.item.node.rotationQuaternion).addInPlace(p.item.node.position);
    // Synthetic readiness disturbance, measured in docs/reference/bar-posture.md.
    p.item.body.applyImpulse(new Vector3(4, 0, 0), centre);
    let peakError = 0;
    while (p.world.steps < captured + 901) { p.world.step(); peakError = Math.max(peakError, p.observe().task.finalError); }
    assert.ok(peakError > 0.03, "the physical disturbance interrupts return readiness");
    assert.equal(p.complete, false, "the finish time alone cannot complete an unready return");
    assert.ok(p.observe().task.returnHeld < 30);
    while (!p.complete && p.world.steps < 1440) p.world.step();
    assert.equal(p.complete, true);
    assert.ok(p.observe().task.returnHeld >= 30);
    assert.ok(p.observe().task.finalError < 0.03);
    assert.equal(p.observe().task.fell, false);
  } finally { f.dispose(); }
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
