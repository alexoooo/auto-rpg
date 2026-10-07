import test from "node:test";
import assert from "node:assert/strict";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { planarContactAcceleration } from "../src/core/build/contact-curvature.ts";
import { coupledDynamics } from "../src/core/build/coupled-dynamics.ts";
import { sourced } from "../src/core/spec/quantity.ts";
import { coreStand, saveStand, loadStand } from "./harness/core-stand.mjs";

const zero = [0, 0, 0], xyz = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const q = (value, unit = "m") => sourced(value, unit, "de-leva-1996", "synthetic rolling-contact fixture");
const radius = 0.1;
function roller(kind) {
  const capsule = kind === "capsule";
  return { model: "roller", mass: q(1, "kg"), stature: q(0.2), joints: [], segments: [{
    name: "roller", proximal: q(capsule ? [0, radius, -0.3] : [0, radius, 0]), distal: q(capsule ? [0, radius, 0.3] : [0, 2 * radius, 0]),
    mass: q(1, "kg"), centreOfMass: q([0, radius, 0]), inertia: q(capsule ? [0.04, 0.005, 0.04] : [0.004, 0.004, 0.004], "kg m2"),
    shape: capsule ? { kind, from: q([0, radius, -0.2]), to: q([0, radius, 0.2]), radius: q(radius) }
      : { kind, centre: q([0, radius, 0]), radius: q(radius) }, surface: { stiffness: q(1e5, "N/m") },
  }] };
}

test("planar curvature targets rotate with the plane and preserve flat support vertices", () => {
  const sphere = { kind: "sphere", centre: zero, radius }, capsule = { kind: "capsule", from: zero, to: [0, 1, 0], radius };
  const normal = [0, 1, 0], spin = [2, 3, -4], expected = [-0.6, 2, 1.2];
  const turn = Quaternion.RotationAxis(new Vector3(1, 2, 3).normalize(), 0.7);
  const rotated = (v) => new Vector3(...v).applyRotationQuaternion(turn).asArray();
  for (const shape of [sphere, capsule]) {
    const result = planarContactAcceleration(shape, normal, spin);
    result.forEach((v, i) => assert.ok(Math.abs(v - expected[i]) < 1e-12));
    const changed = planarContactAcceleration(shape, rotated(normal), rotated(spin));
    rotated(expected).forEach((v, i) => assert.ok(Math.abs(v - changed[i]) < 1e-12));
    assert.ok(planarContactAcceleration(shape, normal, [0, 3, 0]).every((v) => v === 0));
  }
  for (const shape of [{ kind: "box", centre: zero, size: [1, 1, 1] }, { kind: "hull", points: xyz }]) {
    assert.deepEqual(planarContactAcceleration(shape, normal, spin), zero);
  }
});

test("curved rolling supports predict normal motion without a fictitious downward acceleration", async (t) => {
  const readings = [];
  for (const kind of ["sphere", "capsule"]) for (const speed of [0, -1, 1, 3]) {
    const stand = await coreStand(roller(kind), { hz: 1920 });
    try {
      const body = stand.built.segments.get("roller").body;
      const centre = () => new Vector3(...body.massProperties.centre).applyRotationQuaternion(body.node.rotationQuaternion).addInPlace(body.node.position);
      stand.step(240);
      body.applyImpulse(new Vector3(speed, 0, 0), centre());
      body.applyTorqueImpulse(new Vector3(0, 0, -speed / radius * (kind === "capsule" ? 0.005 : 0.004)));
      stand.step(4);
      const rows = stand.world.physics.contactManifoldsOf(body, (other) => other === null).flatMap((m) => m.points
        .filter((p) => p.distance <= 0.005).flatMap((p) => xyz.map((linear) => [{ body, point: p.point, linear, angular: zero }])));
      assert.ok(rows.length >= 3);
      const model = coupledDynamics(stand.built, stand.world.physics.gravity), spin = body.angularVelocityToRef(new Vector3()).asArray();
      const shape = kind === "sphere" ? { kind, centre: zero, radius } : { kind, from: [0, 0, -0.2], to: [0, 0, 0.2], radius };
      const target = planarContactAcceleration(shape, [0, 1, 0], spin), targets = rows.map((_, i) => target[i % 3]);
      const saved = saveStand(stand.world, {});
      model.update(rows); const welded = model.pointAcceleration(body, centre().asArray(), model.solve([])).linear;
      model.update(rows, targets); const corrected = model.pointAcceleration(body, centre().asArray(), model.solve([])).linear;
      let geometric = null;
      if (kind === "sphere") {
        const point = centre().add(new Vector3(0, -radius, 0)).asArray();
        model.update(xyz.map((linear) => [{ body, point, linear, angular: zero }]), target);
        geometric = model.pointAcceleration(body, centre().asArray(), model.solve([])).linear;
        assert.ok(geometric.every((v) => Math.abs(v) < 1e-8), "current sphere geometry predicts unaccelerated rolling");
        model.update(rows, targets);
      }
      assert.deepEqual(saveStand(stand.world, {}), saved, "prediction cannot change the physical world");
      targets.fill(999); assert.deepEqual(model.pointAcceleration(body, centre().asArray(), model.solve([])).linear, corrected, "targets are sampled at update");
      assert.throws(() => model.update(rows, [0]), /one finite acceleration target/);
      assert.throws(() => model.update(rows, rows.map(() => NaN)), /one finite acceleration target/);
      assert.throws(() => model.update(rows, new Array(rows.length)), /one finite acceleration target/);
      assert.deepEqual(model.pointAcceleration(body, centre().asArray(), model.solve([])).linear, corrected, "invalid input leaves the previous model usable");
      const before = body.linearVelocityToRef(new Vector3());
      const branch = () => { stand.step(120); return body.linearVelocityToRef(new Vector3()).subtract(before).scale(1 / (120 * stand.world.dt)).asArray(); };
      const measured = branch(); loadStand(stand.world, {}, saved); assert.deepEqual(branch(), measured);
      if (speed !== 0) assert.ok(welded[1] < -0.98 * speed * speed / radius);
      assert.ok(Math.abs(corrected[1]) < 0.02 && Math.abs(measured[1]) < 0.02, `${kind}/${speed}: ${corrected}/${measured}`);
      if (geometric) geometric.forEach((v, i) => assert.ok(Math.abs(v - measured[i]) < 0.02));
      readings.push({ kind, speed, points: rows.length / 3, welded, corrected, geometric, measured });
    } finally { stand.dispose(); }
  }
  t.diagnostic(JSON.stringify(readings));
});
