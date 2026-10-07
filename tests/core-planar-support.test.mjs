import test from "node:test";
import assert from "node:assert/strict";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { planarSupportPoints } from "../src/core/build/planar-support.ts";
import { planarContactAcceleration } from "../src/core/build/contact-curvature.ts";
import { coupledDynamics } from "../src/core/build/coupled-dynamics.ts";
import { CONTACT_FRICTION } from "../src/core/engine/engine.ts";
import { sourced } from "../src/core/spec/quantity.ts";
import { coreStand, saveStand, loadStand } from "./harness/core-stand.mjs";

const zero = [0, 0, 0], up = [0, 1, 0], identity = Quaternion.Identity();
const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const close = (actual, expected) => {
  assert.equal(actual.length, expected.length);
  actual.forEach((p, i) => p.forEach((v, k) => assert.ok(Math.abs(v - expected[i][k]) < 1e-12, JSON.stringify({ actual, expected }))));
};

test("geometric plane support selects sphere, capsule endpoint/line and polyhedral features", () => {
  const sphere = { kind: "sphere", centre: [.3, .2, -.1], radius: .2 };
  const quarter = new Quaternion(0, 0, Math.sqrt(.5), Math.sqrt(.5));
  close(planarSupportPoints(sphere, [2, 3, 4], quarter, [0, 2, 0], 0), [[1.8, 3.1, 3.9]]);
  const capsule = { kind: "capsule", from: [-1, 0, 0], to: [1, 0, 0], radius: .1 };
  close(planarSupportPoints(capsule, zero, identity, up, 0), [[-1, -.1, 0], [1, -.1, 0]]);
  close(planarSupportPoints(capsule, zero, quarter, up, 1e-9), [[0, -1.1, 0]]);
  close(planarSupportPoints(capsule, zero, identity, [.6, .8, 0], 0), [[-1.06, -.08, 0]]);
  close(planarSupportPoints(capsule, zero, identity, [-.6, -.8, 0], 0), [[1.06, .08, 0]]);
  const nearLine = { ...capsule, to: [1, 1e-5, 0] };
  assert.equal(planarSupportPoints(nearLine, zero, identity, up, 1e-6).length, 1);
  assert.equal(planarSupportPoints(nearLine, zero, identity, up, 2e-5).length, 2);
  const box = { kind: "box", centre: zero, size: [2, 4, 6] };
  close(planarSupportPoints(box, zero, identity, up, 0), [[-1, -2, -3], [-1, -2, 3], [1, -2, -3], [1, -2, 3]]);
  close(planarSupportPoints(box, zero, identity, [1, 1, 1], 0), [[-1, -2, -3]]);
  const hull = { kind: "hull", points: [zero, [1, 0, 0], [0, 0, 1], [0, 1, 0], zero] };
  assert.deepEqual(planarSupportPoints(hull, zero, identity, up, 0), [zero, [1, 0, 0], [0, 0, 1]]);
  for (const shape of [sphere, capsule, box, hull]) {
    const before = structuredClone(shape), points = planarSupportPoints(shape, zero, identity, up, 1e-9);
    const shift = new Vector3(2, 3, 4), normal = new Vector3(...up).applyRotationQuaternion(quarter).asArray();
    close(planarSupportPoints(shape, shift.asArray(), quarter, normal, 1e-9),
      points.map((p) => new Vector3(...p).applyRotationQuaternion(quarter).add(shift).asArray()));
    points[0][0] = 999; assert.deepEqual(shape, before, "support points are detached from geometry");
  }
  for (const tolerance of [-1, NaN, Infinity]) assert.throws(() => planarSupportPoints(sphere, zero, identity, up, tolerance), /invalid/);
  for (const normal of [zero, [0, NaN, 0], [0, Infinity, 0]]) assert.throws(() => planarSupportPoints(sphere, zero, identity, normal, 0), /invalid/);
  assert.throws(() => planarSupportPoints(sphere, zero, new Quaternion(0, 0, 0, 0), up, 0), /invalid/);
  assert.throws(() => planarSupportPoints({ kind: "hull", points: new Array(2) }, zero, identity, up, 0), /geometry/);
  assert.throws(() => planarSupportPoints({ ...sphere, radius: -1 }, zero, identity, up, 0), /geometry/);
});

const q = (v, unit = "m") => sourced(v, unit, "de-leva-1996", "synthetic sliding sphere");
const radius = .1, hz = 1920;
const spec = { model: "slider", mass: q(1, "kg"), stature: q(.2), joints: [], segments: [{
  name: "sphere", proximal: q([0, .2, 0]), distal: q(zero), mass: q(1, "kg"), centreOfMass: q([0, .1, 0]),
  inertia: q([.004, .004, .004], "kg m2"), shape: { kind: "sphere", centre: q([0, .1, 0]), radius: q(radius) },
  surface: { stiffness: q(1e5, "N/m") },
}] };

test("geometric sphere support predicts loaded sliding through the coupled dynamics", async (t) => {
  const readings = [];
  for (const sense of [-1, 1]) {
    const stand = await coreStand(spec, { hz, engine: "rapier-coordinate", actuation: "directional" });
    try {
      stand.step(hz); const body = stand.built.segments.get("sphere").body;
      const centre = () => new Vector3(...body.massProperties.centre).applyRotationQuaternion(body.node.rotationQuaternion).add(body.node.position);
      body.applyImpulse(new Vector3(sense, 0, 0), centre()); stand.step();
      const model = coupledDynamics(stand.built, stand.world.physics.gravity), snapshot = saveStand(stand.world, {});
      const branch = () => {
        let linearError = 0, angularError = 0, cachedNormalError = 0, normalLoadError = 0, minSlip = Infinity;
        for (let k = 0; k < 77; k++) {
          const manifold = stand.world.physics.contactManifoldsOf(body, (other) => other === null)[0];
          assert.ok(manifold && manifold.impulse > 0);
          const normal = manifold.normal.map((v) => -v), spin = body.angularVelocityToRef(new Vector3()), velocity = body.linearVelocityToRef(new Vector3());
          const shape = { kind: "sphere", centre: body.massProperties.centre, radius };
          const at = planarSupportPoints(shape, body.node.position.asArray(), body.node.rotationQuaternion, normal, 1e-6)[0];
          const predict = (point) => {
            const localVelocity = Vector3.Cross(spin, new Vector3(...point).subtract(centre())).add(velocity).asArray();
            const speedNormal = dot(localVelocity, normal), slip = localVelocity.map((v, i) => v - speedNormal * normal[i]);
            const speed = Math.hypot(...slip); minSlip = Math.min(minSlip, speed); assert.ok(speed > .1);
            const direction = normal.map((v, i) => v - CONTACT_FRICTION * slip[i] / speed);
            model.update(); const free = model.solve([]), loaded = model.solve([], [{ body, point, force: direction, moment: zero }]);
            const a0 = model.pointAcceleration(body, point, free).linear, a1 = model.pointAcceleration(body, point, loaded).linear;
            const target = planarContactAcceleration(shape, normal, spin.asArray());
            const load = (dot(target, normal) - dot(a0, normal)) / dot(a1.map((v, i) => v - a0[i]), normal);
            const force = direction.map((v) => v * load);
            assert.ok(load > 0 && dot(force, slip) < 0, "support pushes and kinetic friction dissipates slip");
            return { load, motion: model.pointAcceleration(body, centre().asArray(), model.solve([], [{ body, point, force, moment: zero }])) };
          };
          const before = saveStand(stand.world, {}), geometric = predict(at), cached = predict(manifold.points[0].point);
          assert.deepEqual(saveStand(stand.world, {}), before, "prediction applies no forces to physics");
          normalLoadError = Math.max(normalLoadError, Math.abs(geometric.load + stand.world.physics.gravity[1]));
          assert.ok(normalLoadError < 1e-5);
          cachedNormalError = Math.max(cachedNormalError, Math.abs(cached.motion.linear[1]));
          stand.step();
          const measured = body.linearVelocityToRef(new Vector3()).subtract(velocity).scale(hz).asArray();
          const angular = body.angularVelocityToRef(new Vector3()).subtract(spin).scale(hz).asArray();
          linearError = Math.max(linearError, ...measured.map((v, i) => Math.abs(v - geometric.motion.linear[i])));
          angularError = Math.max(angularError, ...angular.map((v, i) => Math.abs(v - geometric.motion.angular[i])));
        }
        assert.ok(linearError < .001 && angularError < .1, JSON.stringify({ linearError, angularError }));
        assert.ok(cachedNormalError > .01, "cached feature midpoints expose the lever-arm defect");
        return { linearError, angularError, cachedNormalError, normalLoadError, minSlip, finalVelocity: body.linearVelocityToRef(new Vector3()).asArray() };
      };
      const result = branch(); loadStand(stand.world, {}, snapshot); assert.deepEqual(branch(), result);
      readings.push({ hz, sense, ...result });
    } finally { stand.dispose(); }
  }
  t.diagnostic(JSON.stringify(readings));
});
