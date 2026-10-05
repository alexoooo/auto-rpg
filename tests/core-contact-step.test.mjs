import test from "node:test";
import assert from "node:assert/strict";
import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector.js";
import { predictPointContacts } from "../src/core/build/contact-step.ts";
import { coupledDynamics } from "../src/core/build/coupled-dynamics.ts";
import { coreStand, saveStand, loadStand } from "./harness/core-stand.mjs";
import { lone } from "./fixtures/lone.mjs";
import { contactTransitions } from "../research/contact-step.mjs";
import { linkedContacts } from "../research/contact-linked.mjs";

const settings = { dt: 1 / 120, friction: .5, iterations: 64, impulseTolerance: 1e-10, velocityTolerance: 1e-7 };
const zero = [0, 0, 0];

test("contact impulses are covariant, detached and diagnostic, with explicit empty and invalid cases", async () => {
  const stand = await coreStand(lone("contact", "ball", 1), { gravity: false, ground: false });
  try {
    const body = stand.built.segments.get("ball").body, model = coupledDynamics(stand.built, zero), saved = saveStand(stand.world, {});
    const rotation = new Quaternion(.2, -.3, .4, .5).normalize(), rotate = (v) => new Vector3(...v).applyRotationQuaternion(rotation).asArray();
    const trial = (turn) => {
      loadStand(stand.world, {}, saved);
      const centre = new Vector3(...body.massProperties.centre).applyRotationQuaternion(body.node.rotationQuaternion).add(body.node.position);
      const contact = { body, point: centre.add(new Vector3(...turn([0, -.05, 0]))).asArray(), normal: turn([0, 1, 0]), normalVelocity: 0 };
      const loads = [{ body, point: centre.asArray(), force: turn([20, -10, 30]), moment: zero }];
      model.update(); const before = saveStand(stand.world, {});
      const result = predictPointContacts(model, [], [contact], loads, settings);
      assert.equal(result.status, "converged"); assert.equal(result.contacts[0].mode, "sliding");
      assert.deepEqual(saveStand(stand.world, {}), before);
      const detached = structuredClone(result); result.contacts[0].impulse[0] = 999; result.acceleration[0] = 999;
      assert.deepEqual(predictPointContacts(model, [], [contact], loads, settings), detached);
      const empty = predictPointContacts(model, [], [], loads, settings);
      assert.equal(empty.status, "converged"); assert.equal(empty.work, 0); assert.deepEqual(empty.contacts, []);
      assert.deepEqual(empty.acceleration, model.solve([], loads));
      for (const config of [{ dt: 0 }, { dt: Infinity }, { friction: -1 }, { friction: NaN }, { iterations: 0 },
        { iterations: 1.5 }, { impulseTolerance: 0 }, { velocityTolerance: Infinity }]) {
        assert.throws(() => predictPointContacts(model, [], [contact], loads, { ...settings, ...config }), /settings/);
      }
      for (const invalid of [{ normal: zero }, { point: [NaN, 0, 0] }, { normalVelocity: Infinity }]) {
        assert.throws(() => predictPointContacts(model, [], [{ ...contact, ...invalid }], loads, settings), /geometry|normal/);
      }
      return detached;
    };
    const first = trial((v) => v), second = trial(rotate);
    for (const field of ["impulse", "velocity"]) {
      const expected = rotate(first.contacts[0][field]);
      assert.ok(second.contacts[0][field].every((v, k) => Math.abs(v - expected[k]) < 1e-10), field);
    }
    const fixed = coupledDynamics(stand.built, zero, [], [body]); fixed.update();
    assert.throws(() => predictPointContacts(fixed, [], [{ body, point: zero, normal: [0, 1, 0], normalVelocity: 0 }], [], settings), /singular/);
  } finally { stand.dispose(); }
});

test("linked supports use compatible velocities through sliding and stopping under prescribed loads", async (t) => {
  const readings = [];
  for (const hz of [120, 1920]) for (const sense of [-1, 1]) for (const torque of hz === 120 ? [0, .4] : [0]) {
    const row = await linkedContacts({ hz, sense, torque });
    assert.equal(row.replay, true);
    for (const phase of Object.values(row.phases)) {
      assert.ok(phase.linearError < .004 && phase.angularError < .003, JSON.stringify(row.phases));
      assert.ok(phase.acceptedNormalViolation <= row.settings.velocityTolerance);
      assert.ok(phase.acceptedImpulseResidual <= row.settings.impulseTolerance);
      assert.ok(phase.acceptedConeViolation <= row.settings.impulseTolerance);
      if (torque === 0) assert.equal(phase.rejected, 0);
    }
    assert.equal(row.phases.drive.rejected, 0);
    assert.ok(row.phases.drive.modes.sliding > 0 && row.phases.coast.modes.sticking > 0);
    for (const body of row.phases.drive.final) assert.ok(sense * body.velocity[0] > 2);
    for (const body of row.phases.coast.final) {
      assert.ok(Math.hypot(...body.velocity) < .001);
      assert.ok(Math.abs(body.height - .05) < .001);
    }
    for (const failure of row.failures) {
      assert.ok(torque !== 0 && failure.time >= 1 && failure.time < 2);
      assert.ok(failure.normalViolation > row.settings.velocityTolerance || failure.impulseResidual > row.settings.impulseTolerance
        || failure.coneViolation > row.settings.impulseTolerance);
    }
    readings.push({ hz, sense, torque, phases: row.phases, failures: row.failures, observationSha256: row.observationSha256 });
  }
  t.diagnostic(JSON.stringify(readings));
});

test("measured contact transitions validate established modes and expose uncertified fine-step landings", async (t) => {
  const rows = [];
  for (const [hz, spin] of [[120, 0], [1920, 0], [120, 3]]) for (const sense of [-1, 1]) {
    const row = await contactTransitions({ hz, sense, spin }), { drive, coast, hold, lift, fall } = row.phases;
    assert.equal(row.replay, true);
    for (const phase of Object.values(row.phases)) {
      assert.ok(phase.acceptedNormalViolation <= row.settings.velocityTolerance);
      assert.ok(phase.acceptedImpulseResidual <= row.settings.impulseTolerance);
    }
    for (const phase of [drive, coast, hold, lift]) {
      assert.equal(phase.rejected, 0); assert.ok(phase.linearError < .005 && phase.angularError < .025, JSON.stringify(row.phases));
      assert.ok(phase.normalViolation <= row.settings.velocityTolerance && phase.impulseResidual <= row.settings.impulseTolerance);
    }
    assert.ok(drive.modes.sliding > 0 && sense * drive.final.velocity[0] > 2);
    assert.ok(coast.modes.sliding > 0 && coast.modes.sticking > 0);
    assert.ok(hold.modes.sticking > 0 && hold.modes.sliding === 0);
    assert.ok(Math.hypot(...hold.final.velocity) < .001 && Math.abs(hold.final.height - .05) < .001);
    assert.ok(lift.modes.free > 0 && lift.final.height > .2);
    assert.ok(Math.hypot(...fall.final.velocity) < .005 && Math.abs(fall.final.height - .05) < .001);
    if (hz === 120) {
      assert.equal(fall.rejected, 0); assert.ok(fall.linearError < .01 && fall.angularError < .05);
    } else {
      for (const failure of row.failures) {
        assert.ok(failure.time > 3.25); assert.equal(failure.status, "iteration-limit");
        assert.ok(failure.normalViolation > row.settings.velocityTolerance || failure.impulseResidual > row.settings.impulseTolerance);
      }
    }
    rows.push({ hz, sense, spin, phases: row.phases, failures: row.failures, observationSha256: row.observationSha256 });
  }
  t.diagnostic(JSON.stringify(rows));
});
