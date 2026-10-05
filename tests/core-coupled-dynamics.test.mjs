import test from "node:test";
import assert from "node:assert/strict";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { coupledDynamics } from "../src/core/build/coupled-dynamics.ts";
import { articulatedMass } from "../src/core/build/articulated-mass.ts";
import { modelSpec } from "../src/core/human/spec.ts";
import { armed } from "../src/core/human/grip.ts";
import { equipHands } from "../src/core/human/equipment.ts";
import { woodenClub } from "../src/core/items/club.ts";
import { createEquipment } from "../src/core/equipment.ts";
import { sourced } from "../src/core/spec/quantity.ts";
import { coreStand, saveStand, loadStand } from "./harness/core-stand.mjs";

const zero = [0, 0, 0], xyz = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const frame = (position) => ({ position, rotation: [0, 0, 0, 1] });
const close = (a, b, tolerance, label) => assert.ok(Math.abs(a - b) <= tolerance, `${label}: ${a} vs ${b}`);

test("coupled single-grip accelerations agree with compound anatomy under asymmetric effort and gravity", async () => {
  for (const model of ["workshop-fighter", "workshop-rogue", "crypt-skeleton"]) for (const pin of [false, true]) {
    const spec = modelSpec(model), club = woodenClub();
    const separate = await coreStand(spec, { ground: false }), compound = await coreStand(armed(spec, "right", club), { ground: false });
    const item = equipHands(separate.world, separate.built, { id: "club", item: club, primary: "right",
      grips: [{ side: "right", at: zero }], capture: { distance: 0.002, rotationError: 0.00001 } });
    try {
      const fixed = (s) => pin ? [s.built.segments.get("lowerTrunk").body] : [];
      const a = coupledDynamics(separate.built, separate.world.physics.gravity, [item], fixed(separate));
      const b = coupledDynamics(compound.built, compound.world.physics.gravity, [], fixed(compound));
      a.update(); b.update();
      const torque = Array.from({ length: a.channels }, (_, i) => (i % 3 - 1) * 0.07);
      const predicted = a.solve(torque), expected = b.solve(torque);
      expected.forEach((v, i) => close(predicted[i], v, 1e-6 * (1 + Math.abs(v)), `${model}/${pin}/${i}`));
      assert.ok(a.report(predicted).maxConstraintResidual < 1e-8);
      for (const s of separate.built.segments.values()) {
        const at = s.node.position.asArray();
        const pa = a.pointAcceleration(s.body, at, predicted), pb = b.pointAcceleration(compound.built.segments.get(s.spec.name).body, at, expected);
        for (const field of ["linear", "angular"]) pa[field].forEach((v, i) => close(v, pb[field][i], 1e-6 * (1 + Math.abs(v)), field));
      }
      item.release("right"); a.update();
      const released = a.solve(torque), at = item.node.position.asArray();
      const free = a.pointAcceleration(item.body, at, released);
      free.linear.forEach((v, i) => close(v, separate.world.physics.gravity[i], 1e-9, "released free fall"));
      free.angular.forEach((v) => close(v, 0, 1e-9, "released free spin"));
    } finally { item.dispose(); separate.dispose(); compound.dispose(); }
  }
});

const q = (value, unit = "m") => sourced(value, unit, "de-leva-1996", "synthetic coupled-dynamics fixture; not an anatomical measurement");
const mechanicalSpec = () => {
  const speed = { unloadedSpeed: q(20, "rad/s"), curvature: q(0.25, "1"), eccentricCeiling: q(1.4, "1"), eccentricSlopeRatio: q(2, "1") };
  const segment = (name, x, y) => ({ name, proximal: q([x, y - 0.05, 0]), distal: q([x, y + 0.05, 0]),
    mass: q(1, "kg"), centreOfMass: q([x, y, 0]), inertia: q([0.001, 0.001, 0.001], "kg m2"),
    shape: { kind: "capsule", from: q([x, y - 0.04, 0]), to: q([x, y + 0.04, 0]), radius: q(0.01) }, surface: { stiffness: q(1e5, "N/m") } });
  return { family: "test", model: "coupled", mass: q(2, "kg"), stature: q(1.3),
    segments: [segment("left", -0.1, 1), segment("right", 0.1, 1.2)],
    joints: [{ name: "link", parent: "left", child: "right", centre: q([0, 1.1, 0]), dofs: xyz.map((axis, k) => ({
      positive: `p${k}`, negative: `n${k}`, axis: q(axis, "1"), min: q(-1, "rad"), max: q(1, "rad"),
      muscle: { peakPositive: q(2, "N m"), peakNegative: q(2, "N m"), speedPositive: speed, speedNegative: speed } })) }] };
};
const localFrame = (body, world) => {
  const inverse = Quaternion.Inverse(body.node.rotationQuaternion), p = new Vector3(...world).subtract(body.node.position);
  p.applyRotationQuaternionToRef(inverse, p);
  return { position: p.asArray(), rotation: inverse.asArray() };
};
const pointVelocity = (body, at) => {
  const c = new Vector3(...body.massProperties.centre);
  c.applyRotationQuaternionToRef(body.node.rotationQuaternion, c).addInPlace(body.node.position);
  return body.linearVelocityToRef(new Vector3()).add(Vector3.Cross(body.angularVelocityToRef(new Vector3()), new Vector3(...at).subtract(c))).asArray();
};

async function mechanicalFixture(hz) {
  const s = await coreStand(mechanicalSpec(), { ground: false, gravity: false, hz });
  const left = s.built.segments.get("left").body, right = s.built.segments.get("right").body;
  const item = createEquipment(s.world, { id: "bar", item: woodenClub(), pose: frame([0, 0.9, 0]),
    capture: { distance: 0.002, rotationError: 0.00001 }, grips: [
      { name: "left", body: left, bodyFrame: localFrame(left, [0, 1, 0]), itemFrame: frame([0, 0.1, 0]) },
      { name: "right", body: right, bodyFrame: localFrame(right, [0, 1.2, 0]), itemFrame: frame([0, 0.3, 0]) }] });
  item.tryGrip("left"); item.tryGrip("right");
  return { s, left, right, item, dispose() { item.dispose(); s.dispose(); } };
}

test("coupled loop predicts physical force and joint-torque response through either release and replay", async (t) => {
  const readings = [];
  for (const release of [[], ["left"], ["right"], ["left", "right"]]) {
    const fixture = await mechanicalFixture(3840), { s, left, right, item } = fixture;
    try {
      for (const hand of release) item.release(hand);
      const model = coupledDynamics(s.built, zero, [item]), impact = articulatedMass(s.built, [item]);
      model.update(); impact.update();
      const at = [0.05, 1.4, 0.08], force = [4, 8, 10], torque = [0.4, -0.3, 0.2];
      const pure = model.solve(zero, [{ body: item.body, point: at, force, moment: zero }]);
      const mobility = impact.mobility(item.body, at), expected = mobility.map((row) => row.reduce((sum, v, i) => sum + v * force[i], 0));
      model.pointAcceleration(item.body, at, pure).linear.forEach((v, i) => close(v, expected[i], 1e-8, "impact/force agreement"));
      const prediction = model.solve(torque, [{ body: item.body, point: at, force, moment: zero }]);
      const acceleration = model.pointAcceleration(item.body, at, prediction).linear;
      assert.ok(model.report(prediction).maxConstraintResidual < 1e-9);
      const saved = saveStand(s.world, {});
      const branch = () => {
        for (let i = 0; i < 3; i++) {
          item.body.applyForce(new Vector3(...force), new Vector3(...at));
          right.applyTorque(new Vector3(...torque)); left.applyTorque(new Vector3(...torque).scale(-1));
          s.step();
        }
        return pointVelocity(item.body, at).map((v) => v / (3 * s.world.dt));
      };
      const measured = branch(), scale = Math.hypot(...acceleration);
      readings.push({ release, predicted: acceleration, measured, report: model.report(prediction) });
      measured.forEach((v, i) => close(v, acceleration[i], 0.02 * scale, `${release}/${i}`));
      loadStand(s.world, {}, saved); assert.deepEqual(branch(), measured);
    } finally { fixture.dispose(); }
  }
  t.diagnostic(JSON.stringify(readings));
});

test("a moving closed loop carries centripetal and gyroscopic acceleration through its grips", async (t) => {
  const fixture = await mechanicalFixture(480), { s, left, right, item } = fixture;
  try {
    const bodies = [left, right, item.body], spin = new Vector3(2, 3, 4);
    const centre = (b) => {
      const c = new Vector3(...b.massProperties.centre);
      return c.applyRotationQuaternionToRef(b.node.rotationQuaternion, c).addInPlace(b.node.position);
    };
    for (const b of bodies) {
      const c = centre(b), velocity = Vector3.Cross(spin, c);
      b.applyImpulse(velocity.scale(b.massProperties.mass), c);
      // Holder inertia is isotropic and the club starts with world-aligned principal axes.
      b.applyTorqueImpulse(new Vector3(...b.massProperties.moments.map((v, i) => v * spin.asArray()[i])));
    }
    s.step(8);
    const model = coupledDynamics(s.built, zero, [item]), impact = articulatedMass(s.built, [item]), errors = [], residuals = [];
    const reversed = coupledDynamics(s.built, zero, [{ body: item.body, motionConstraints: () => [...item.motionConstraints()].reverse() }]);
    const read = () => bodies.flatMap((b) => [...b.angularVelocityToRef(new Vector3()).asArray(), ...b.linearVelocityToRef(new Vector3()).asArray()]);
    for (let sample = 0; sample < 20; sample++) {
      const before = read(), change = before.map(() => 0);
      for (let step = 0; step < 4; step++) {
        model.update(); const a = model.solve(zero);
        reversed.update(); const other = reversed.solve(zero);
        a.forEach((v, i) => close(v, other[i], 1e-8 * (1 + Math.abs(v)), "constraint order"));
        const report = model.report(a);
        assert.equal(report.coordinates - report.rank, 6, "the rigid assembly retains all six floating freedoms");
        residuals.push(report.maxConstraintResidual);
        impact.update(); assert.equal(impact.report().freedoms, 6);
        bodies.forEach((body, i) => {
          const predicted = model.pointAcceleration(body, centre(body).asArray(), a);
          [...predicted.angular, ...predicted.linear].forEach((v, j) => { change[6 * i + j] += v * s.world.dt; });
        });
        s.step();
      }
      const measured = read().map((v, i) => v - before[i]);
      errors.push(Math.hypot(...measured.map((v, i) => v - change[i])) / Math.hypot(...measured));
    }
    errors.sort((a, b) => a - b);
    t.diagnostic(JSON.stringify({ medianRelativeError: errors[10], maxRelativeError: errors.at(-1), maxConstraintResidual: Math.max(...residuals) }));
    assert.ok(errors[10] < 0.05, `median relative acceleration error ${errors[10]}`);
    assert.ok(Math.max(...residuals) < 0.02, `relative-motion error leaves acceleration residual ${Math.max(...residuals)}`);
  } finally { fixture.dispose(); }
});

test("constraint reactions reproduce the constrained acceleration as loads on the free model", async () => {
  const fixture = await mechanicalFixture(120), { s, left, right, item } = fixture;
  try {
    const model = coupledDynamics(s.built, [0, -9.80665, 0], [item]);
    const free = coupledDynamics(s.built, [0, -9.80665, 0], [{ body: item.body, motionConstraints: () => [] }]);
    const rows = [left, right].flatMap((body) => xyz.map((axis) => [{ body, point: body.node.position.asArray(), linear: axis, angular: zero }]));
    const torque = [0.4, -0.3, 0.2], loads = [{ body: item.body, point: [0.1, 1.4, 0.2], force: [4, 8, 10], moment: [0.1, 0.2, 0.3] }];
    for (const release of [null, "left", "right"]) {
      if (release) item.release(release);
      model.update(rows); free.update();
      const prediction = model.solve(torque, loads), reactions = model.reactions(torque, loads);
      const equivalent = free.solve(torque, loads.concat(reactions.flatMap((r) => r.loads)));
      prediction.forEach((v, i) => close(equivalent[i], v, 1e-8 * (1 + Math.abs(v)), `reaction ${release}/${i}`));
      assert.ok(reactions.every((r) => Number.isFinite(r.multiplier)));
      assert.equal(reactions.length, model.report(prediction).constraints);
      const saved = model.reactions(torque, loads);
      reactions[0].loads[0].force[0] = 999;
      assert.deepEqual(model.reactions(torque, loads), saved, "returned loads are detached");
    }
  } finally { fixture.dispose(); }
});

test("normal-only support rows preserve tangential motion, expose tension and disappear on update", async () => {
  const s = await coreStand(mechanicalSpec(), { ground: false });
  try {
    const bodies = [...s.built.segments.values()].map((seg) => seg.body), at = (b) => {
      const p = new Vector3(...b.massProperties.centre);
      return p.applyRotationQuaternionToRef(b.node.rotationQuaternion, p).addInPlace(b.node.position).asArray();
    };
    const model = coupledDynamics(s.built, s.world.physics.gravity);
    const rows = bodies.map((body) => [{ body, point: at(body), linear: [0, 1, 0], angular: zero }]);
    model.update(rows);
    const prediction = model.solve(zero), reactions = model.reactions(zero);
    for (const body of bodies) close(model.pointAcceleration(body, at(body), prediction).linear[1], 0, 1e-10, "normal support");
    close(reactions.reduce((sum, r) => sum + r.loads[0].force[1], 0), 2 * 9.80665, 1e-9, "weight borne");
    assert.ok(reactions.every((r) => r.multiplier > 0));
    const pushed = model.solve(zero, bodies.map((body) => ({ body, point: at(body), force: [1, 0, 0], moment: zero })));
    for (const body of bodies) close(model.pointAcceleration(body, at(body), pushed).linear[0], 1, 1e-9, "unwelded sliding");
    const lifted = model.reactions(zero, bodies.map((body) => ({ body, point: at(body), force: [0, 20, 0], moment: zero })));
    assert.ok(lifted.every((r) => r.multiplier < 0), "maintaining this assumed contact would require tension");
    model.update([...rows, ...rows]);
    const duplicate = model.reactions(zero);
    close(duplicate.reduce((sum, r) => sum + r.loads[0].force[1], 0), 2 * 9.80665, 1e-9, "redundancy does not duplicate load");
    const read = model.solve(zero);
    rows[0][0].point[0] = 999;
    assert.deepEqual(model.solve(zero), read, "an update freezes supplied geometry");
    model.update();
    assert.deepEqual(model.reactions(zero), []);
    for (const body of bodies) close(model.pointAcceleration(body, at(body), model.solve(zero)).linear[1], -9.80665, 1e-9, "removed supports free-fall");
  } finally { s.dispose(); }
});
