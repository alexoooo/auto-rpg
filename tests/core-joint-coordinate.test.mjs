import test from "node:test";
import assert from "node:assert/strict";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { jointCoordinateMotion } from "../src/core/build/joint-coordinate.ts";
import { jointAngles, rotationOfToRef } from "../src/core/build/joint-state.ts";

import { coupledDynamics } from "../src/core/build/coupled-dynamics.ts";
import { sourced } from "../src/core/spec/quantity.ts";
import { coreStand, saveStand, loadStand } from "./harness/core-stand.mjs";

const axes = { x: [0.8, 0.6, 0], y: [-0.6, 0.8, 0], z: [0, 0, 1] };
const turn = (axis, angle) => Quaternion.RotationAxis(new Vector3(...axis).normalize(), angle);
function fixture(angles, signs, parentSpin, childSpin) {
  const parentRest = turn([1, -2, 3], 0.4), childRest = turn([-2, 3, 1], -0.7);
  const parentRotation = turn([3, 1, -2], 0.9), relative = rotationOfToRef(axes, ...angles, new Quaternion());
  const childRotation = parentRotation.multiply(Quaternion.Inverse(parentRest)).multiply(relative).multiply(childRest);
  const segment = (rest, rotation, spin) => ({ rest, node: { rotationQuaternion: rotation }, body: {
    angularVelocityToRef(out) { return out.set(...spin); },
  } });
  const joint = { axes, dofs: signs.map((sign) => ({ sign })),
    parent: segment(parentRest, parentRotation, parentSpin), child: segment(childRest, childRotation, childSpin) };
  const advance = (q, spin, dt) => {
    const speed = Math.hypot(...spin);
    return speed ? turn(spin, dt * speed).multiply(q) : q.clone();
  };
  return { joint, at(dt) {
    joint.parent.node.rotationQuaternion = advance(parentRotation, parentSpin, dt);
    joint.child.node.rotationQuaternion = advance(childRotation, childSpin, dt);
  } };
}

test("measured coordinate rows and curvature follow independent world rotations", (t) => {
  let worstRate = 0, worstBias = 0, peakBias = 0, motorDifference = 0;
  const h = 1e-5;
  for (const angles of [[0.6, -0.8, 1.2], [-2.4, 1.9, -1.5], [0.3, 0.7, 0.001]]) {
    for (const signs of [[1], [-1, 1], [1, -1, -1]]) {
      const f = fixture(angles, signs, [0.8, -1.2, 0.3], [-0.9, 0.4, 1.6]);
      for (let axis = 0; axis < signs.length; axis++) {
        f.at(0); const motion = jointCoordinateMotion(f.joint, axis);
        assert.deepEqual(motion.row.map((entry) => entry.linear), [[0, 0, 0], [0, 0, 0]]);
        motion.row[0].angular.forEach((v, i) => assert.equal(motion.row[1].angular[i], -v));
        f.at(-h); const before = jointCoordinateMotion(f.joint, axis), angleBefore = jointAngles(f.joint)[axis];
        f.at(h); const after = jointCoordinateMotion(f.joint, axis), angleAfter = jointAngles(f.joint)[axis];
        worstRate = Math.max(worstRate, Math.abs((angleAfter - angleBefore) / (2 * h) - motion.rate));
        worstBias = Math.max(worstBias, Math.abs((after.rate - before.rate) / (2 * h) + motion.target));
        peakBias = Math.max(peakBias, Math.abs(motion.target));
        f.at(0);
        const worldAxis = new Vector3(...[axes.x, axes.y, axes.z][axis]).applyRotationQuaternion(
          f.joint.parent.node.rotationQuaternion.multiply(Quaternion.Inverse(f.joint.parent.rest)));
        const motorRate = signs[axis] * Vector3.Dot(worldAxis, new Vector3(-1.7, 1.6, 1.3));
        motorDifference = Math.max(motorDifference, Math.abs(motorRate - motion.rate));
        f.joint.child.node.rotationQuaternion.scaleInPlace(-1);
        const flipped = jointCoordinateMotion(f.joint, axis);
        assert.ok(Math.abs(flipped.rate - motion.rate) < 1e-12);
        assert.ok(Math.abs(flipped.target - motion.target) < 1e-12);
      }
    }
  }
  assert.ok(peakBias > 3 && motorDifference > 1, "fixture distinguishes curvature and motor axes");
  assert.ok(worstRate < 1e-7 && worstBias < 1e-7, JSON.stringify({ worstRate, worstBias }));
  t.diagnostic(JSON.stringify({ worstRate, worstBias, peakBias, motorDifference }));
});

test("undefined coordinates are explicit and axis validation leaves the bodies untouched", () => {
  const parent = { rest: Quaternion.Identity(), node: { rotationQuaternion: Quaternion.Identity() } };
  const child = { rest: Quaternion.Identity(), node: { rotationQuaternion: new Quaternion(0, 1, 0, 0) } };
  const joint = { parent, child, axes: { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }, dofs: [{ sign: 1 }] };
  assert.equal(jointCoordinateMotion(joint, 0), null);
  for (const axis of [-1, 1, 0.5, NaN]) assert.throws(() => jointCoordinateMotion(joint, axis), /invalid joint coordinate axis/);
  assert.deepEqual(child.node.rotationQuaternion.asArray(), [0, 1, 0, 0]);
});

const q = (value, unit = "m") => sourced(value, unit, "de-leva-1996", "synthetic joint-stop fixture");
function hinge() {
  const segment = (name, y, mass) => ({ name, proximal: q([0, y, 0]), distal: q([0, y - 0.4, 0]),
    mass: q(mass, "kg"), centreOfMass: q([0, y - 0.2, 0]), inertia: q([0.02, 0.004, 0.02], "kg m2"),
    shape: { kind: "capsule", from: q([0, y, 0]), to: q([0, y - 0.4, 0]), radius: q(0.03) },
    surface: { stiffness: q(1e5, "N/m") } });
  return { model: "stop", mass: q(3, "kg"), stature: q(1),
    segments: [segment("parent", 1, 2), segment("child", 0.6, 1)],
    joints: [{ name: "hinge", parent: "parent", child: "child", centre: q([0, 0.6, 0]), dofs: [{
      positive: "bend", negative: "extend", axis: q([1, 0, 0], "1"), min: q(-0.3, "rad"), max: q(0.3, "rad"),
      muscle: { peakPositive: q(2, "N m"), peakNegative: q(2, "N m") },
    }] }] };
}

test("a pressed stop predicts the loaded hinge and permits inward release", async (t) => {
  const readings = [];
  for (const sense of [-1, 1]) {
    const stand = await coreStand(hinge(), { ground: false, gravity: false, pinned: "parent", hz: 1920, engine: "rapier-coordinate" });
    try {
      const joint = stand.built.joints.get("hinge"), parent = joint.parent.body;
      joint.joint.setMotor(0, 10 * sense, 2);
      stand.step(stand.seconds(1));
      const motion = jointCoordinateMotion(joint, 0), torque = [2 * sense];
      assert.ok(Math.abs(motion.angle - sense * 0.3) < 0.001);
      const model = coupledDynamics(stand.built, [0, 0, 0], [], [parent]);
      const evaluate = () => {
        const row = model.motionRow(motion.row), acceleration = model.solve(torque);
        return row.coefficients.reduce((sum, v, i) => sum + v * acceleration[i], row.bias) - motion.target;
      };
      const saved = saveStand(stand.world, {});
      model.update(); const free = evaluate();
      model.update([motion.row], [motion.target]); const stopped = evaluate();
      const reaction = model.reactionMultipliers(torque).at(-1);
      assert.ok(reaction * sense < -1.9, "the stop opposes outward actuator torque");
      assert.deepEqual(saveStand(stand.world, {}), saved, "prediction has no physical authority");
      const measure = () => {
        const before = jointCoordinateMotion(joint, 0).rate;
        stand.step(16);
        return (jointCoordinateMotion(joint, 0).rate - before) / (16 * stand.world.dt);
      };
      const measured = measure(); loadStand(stand.world, {}, saved); assert.equal(measure(), measured);
      assert.ok(Math.abs(stopped) < 1e-8 && Math.abs(measured) < 0.01);
      assert.ok(free * sense > 20, "omitting the stop predicts a distinguishable outward acceleration");
      loadStand(stand.world, {}, saved);
      joint.joint.setMotor(0, -10 * sense, 2); torque[0] *= -1;
      model.update([motion.row], [motion.target]);
      assert.ok(model.reactionMultipliers(torque).at(-1) * sense > 1.9, "holding this row would require a pulling stop");
      model.update(); const released = evaluate(), measuredRelease = measure();
      assert.ok(released * sense < -20 && Math.abs(released - measuredRelease) < 0.1);
      readings.push({ sense, free, stopped, reaction, measured, released, measuredRelease });
    } finally { stand.dispose(); }
  }
  t.diagnostic(JSON.stringify(readings));
});
