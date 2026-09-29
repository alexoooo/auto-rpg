/**
 * `jointAngles` reads a joint in the engine's own coordinates: the angles a Havok limit or motor
 * acts on. Node stand, two rods.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { PhysicsConstraintMotorType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import { anglesOf, jointAngles, jointTracker, relativeRotationToRef } from "../src/core/build/joint-state.ts";
import { sourced } from "../src/core/spec/quantity.ts";
import { coreStand } from "./harness/core-stand.mjs";

const q = (value, unit = "m") => sourced(value, unit, "de-leva-1996", "a stand-in leaf for the joint-state tests");

/** Axes tilted off the world's, so a decomposition that forgot them cannot pass by accident. */
const X = [0.8, 0.6, 0], Y = [-0.6, 0.8, 0], Z = [0, 0, 1];
const R = (axis, angle) => Quaternion.RotationAxis(new Vector3(...axis), angle);

test("a rotation composed in either of Havok's orders about a joint's axes reads back as its angles", () => {
  const cases = [[0.5, 0, 0], [0, 0.4, 0], [0, 0, -0.3], [0.5, 0.4, 0.3], [-0.7, 0.6, -0.5], [2.5, -1.2, 3], [-3, 1.3, -2.2]];
  const compose = {
    xyz: ([a, b, c]) => R(X, a).multiply(R(Y, b)).multiply(R(Z, c)),
    yxz: ([a, b, c]) => R(Y, b).multiply(R(X, a)).multiply(R(Z, c)),
  };
  for (const order of ["xyz", "yxz"]) {
    for (const abc of cases) {
      // The inner of the two outer turns lies within a quarter turn: b in xyz, a in yxz.
      const angles = order === "xyz" ? abc : [abc[1], abc[0], abc[2]];
      const read = anglesOf(compose[order](angles), { x: X, y: Y, z: Z }, order, [0, 0, 0]);
      angles.forEach((angle, k) => assert.ok(Math.abs(read[k] - angle) < 1e-6, `${order} ${angles} read as ${read}`));
    }
  }
});

function rods(dofs) {
  const segment = (name, proximal, distal, mass) => ({
    name, proximal: q(proximal), distal: q(distal), mass: q(mass, "kg"),
    centreOfMass: q(proximal.map((p, i) => (p + distal[i]) / 2)),
    inertia: q([0.02 * mass, 0.004 * mass, 0.03 * mass], "kg m2"),
    shape: { kind: "capsule", from: q(proximal), to: q(distal), radius: q(0.04) },
  });
  return {
    family: "test", model: "rods", mass: q(3, "kg"), stature: q(1.5),
    segments: [segment("upper", [0, 1.5, 0], [0, 1, 0], 2), segment("lower", [0, 1, 0], [0.1, 0.55, 0.05], 1)],
    joints: [{ name: "middle", parent: "upper", child: "lower", centre: q([0, 1, 0]),
      dofs: dofs.map(([positive, axis]) => ({ positive, negative: `not ${positive}`, axis: q(axis, "1"),
        min: q(-1.5, "rad"), max: q(1.5, "rad"), muscle: { peakPositive: q(50, "N m"), peakNegative: q(50, "N m") } })) }],
  };
}

/**
 * Havok's position motor, made stiff, holds each freedom at its target in Havok's own measure; the
 * reader must see that target. The motor's stiffness and damping are Havok's own settings, reached
 * through the plugin because Babylon does not expose them.
 */
async function heldAt(dofs, targets) {
  const stand = await coreStand(rods(dofs), { gravity: false, ground: false });
  try {
    const joint = stand.built.joints.get("middle");
    stand.built.segments.get("upper").body.setMotionType(0 /* STATIC */);
    const hk = stand.scene.getPhysicsEngine().getPhysicsPlugin()._hknp;
    const native = [hk.ConstraintAxis.ANGULAR_X, hk.ConstraintAxis.ANGULAR_Y, hk.ConstraintAxis.ANGULAR_Z];
    joint.dofs.forEach((dof, k) => {
      joint.constraint.setAxisMotorType(dof.axis, PhysicsConstraintMotorType.POSITION);
      joint.constraint.setAxisMotorTarget(dof.axis, dof.sign * targets[k]);
      joint.constraint.setAxisMotorMaxForce(dof.axis, 1e4);
      for (const id of [].concat(joint.constraint._pluginData)) {
        hk.HP_Constraint_SetAxisMotorStiffness(id, native[k], 1000);
        hk.HP_Constraint_SetAxisMotorDamping(id, native[k], 1);
      }
    });
    stand.step(stand.seconds(2));
    return jointAngles(joint);
  } finally { stand.dispose(); }
}

test("a joint held by the engine at its targets reads those targets, each freedom in its own sense", async () => {
  const cases = [
    [[["x", X], ["y", Y], ["z", Z]], [0.5, 0.4, 0.3]],
    [[["x", X], ["y", Y], ["z", Z]], [-0.7, 0.6, -0.5]],
    // Only a third freedom can run against its constraint axis, which is X cross Y.
    [[["minus x", X.map((c) => -c)], ["y", Y], ["z", Z]], [0.5, -0.4, 0.3]],
    [[["x", X], ["y", Y]], [0.6, -0.3]],
    [[["x", X]], [-0.9]],
  ];
  for (const [dofs, targets] of cases) {
    const read = await heldAt(dofs, targets);
    targets.forEach((target, k) => assert.ok(Math.abs(read[k] - target) < 0.002, `${dofs.map((d) => d[0])} held at ${targets} read ${read}`));
  }
});

/**
 * A velocity motor drives the relative angular velocity along its parent-fixed axis, and the
 * tracker's speed is that component: driven freedoms read their targets while a free one, pushed,
 * makes the joint's spin wander off any fixed axis.
 */
test("a joint driven by velocity motors reads each driven freedom's target as its speed", async () => {
  const cases = [
    [[["x", X], ["y", Y], ["z", Z]], [1, -0.8, null]],
    // X cross (minus Y) is minus Z, so this z runs against its constraint axis.
    [[["x", X], ["minus y", Y.map((c) => -c)], ["z", Z]], [0.8, null, -1]],
    [[["x", X], ["y", Y]], [0.9, -0.7]],
    [[["minus x", X.map((c) => -c)]], [1.2]],
  ];
  for (const [dofs, rates] of cases) {
    const stand = await coreStand(rods(dofs), { gravity: false, ground: false });
    try {
      const joint = stand.built.joints.get("middle");
      stand.built.segments.get("upper").body.setMotionType(0 /* STATIC */);
      joint.dofs.forEach((dof, k) => {
        if (rates[k] === null) return;
        joint.constraint.setAxisMotorType(dof.axis, PhysicsConstraintMotorType.VELOCITY);
        joint.constraint.setAxisMotorTarget(dof.axis, dof.sign * rates[k]);
        joint.constraint.setAxisMotorMaxForce(dof.axis, 200);
      });
      stand.built.segments.get("lower").body.applyImpulse(new Vector3(0.3, 0.1, -0.4), new Vector3(0.1, 0.55, 0.05));
      stand.step(stand.seconds(0.25));
      const tracker = jointTracker(joint);
      const angularVelocity = (segment) => { const w = new Vector3(); segment.body.getAngularVelocityToRef(w); return w; };
      const seen = rates.map(() => 0);
      for (let i = 0; i < stand.seconds(0.25); i++) {
        stand.step(1);
        tracker.update(angularVelocity);
        tracker.speeds.forEach((speed, k) => { if (rates[k] !== null) seen[k] = Math.max(seen[k], Math.abs(speed - rates[k])); });
        // A limit met would stop a motor short of its target: stay clear of the rods' 1.5 rad.
        assert.ok(tracker.angles.every((angle) => Math.abs(angle) < 1.3), `${dofs.map((d) => d[0])} neared a limit at ${tracker.angles}`);
      }
      assert.ok(Math.max(...seen) < 0.005, `${dofs.map((d) => d[0])} driven at ${rates} strayed by ${seen}`);
      if (rates.includes(null)) {
        const free = rates.indexOf(null);
        assert.ok(Math.abs(tracker.speeds[free]) > 0.1, `the free freedom stayed still: ${tracker.speeds}`);
      }
    } finally { stand.dispose(); }
  }
});

/**
 * With both rods tumbling free and no motor, Havok moves the nodes with the bodies' velocities, so
 * the change of the joint's relative rotation across a step is its speed: the tracker, reading
 * velocities, agrees with it. The parent turns and spins here, so a reading that ignored the
 * parent's spin or read the axes in the world would not. Measured, 0.13 rad/s apart at 6 rad/s: a
 * finite rotation of a tumbling pair is not quite its rate.
 */
test("a joint tumbling free reads the speed its relative rotation changes at", async () => {
  const stand = await coreStand(rods([["x", X], ["y", Y], ["z", Z]]), { gravity: false, ground: false });
  try {
    const joint = stand.built.joints.get("middle");
    const upper = stand.built.segments.get("upper").body, lower = stand.built.segments.get("lower").body;
    upper.applyImpulse(new Vector3(0.9, -0.2, 0.5), new Vector3(0.05, 1.45, -0.03));
    lower.applyImpulse(new Vector3(-0.3, 0.4, 0.6), new Vector3(0.1, 0.55, 0.05));
    stand.step(stand.seconds(0.05));
    const tracker = jointTracker(joint);
    const angularVelocity = (segment) => { const w = new Vector3(); segment.body.getAngularVelocityToRef(w); return w; };
    const dt = 1 / stand.seconds(1);
    const axes = joint.dofs.map((dof, k) => [joint.axes.x, joint.axes.y, joint.axes.z][k].map((c) => c * dof.sign));
    const relative = () => relativeRotationToRef(joint, new Quaternion());
    let before = relative(), worst = 0, parentSpin = 0, largest = 0;
    for (let i = 0; i < stand.seconds(0.08); i++) {
      stand.step(1);
      // Havok integrates positions with the velocity the step ends with, which the next step begins with.
      tracker.update(angularVelocity);
      const after = relative();
      const change = after.multiply(Quaternion.Inverse(before));
      if (change.w < 0) change.scaleInPlace(-1);
      const s = Math.hypot(change.x, change.y, change.z), rate = 2 * Math.atan2(s, change.w) / (s * dt);
      axes.forEach((axis, k) => {
        const differenced = rate * (change.x * axis[0] + change.y * axis[1] + change.z * axis[2]);
        worst = Math.max(worst, Math.abs(tracker.speeds[k] - differenced));
        largest = Math.max(largest, Math.abs(differenced));
      });
      parentSpin = Math.max(parentSpin, angularVelocity(joint.parent).length());
      // A limit's impulse, like a motor's, moves the nodes behind the velocity: stay clear of 1.5 rad.
      assert.ok(tracker.angles.every((angle) => Math.abs(angle) < 1.4), `neared a limit at ${tracker.angles}`);
      before = after;
    }
    assert.ok(parentSpin > 1 && largest > 1, `the pair tumbles: parent ${parentSpin}, joint ${largest} rad/s`);
    assert.ok(worst < 0.03 * largest, `tracker against the differenced rotation: ${worst} rad/s off, at up to ${largest}`);
  } finally { stand.dispose(); }
});
