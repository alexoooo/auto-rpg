/**
 * `buildBody` on a spec small enough to reason about: two rods and one joint, Node stand.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { PhysicsConstraintMotorType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import { sourced } from "../src/core/spec/quantity.ts";
import { coreStand, relativeRotation, spinOnce } from "./harness/core-stand.mjs";

const q = (value, unit = "m") => sourced(value, unit, "de-leva-1996", "a stand-in leaf for the builder's tests");

const muscle = () => ({ peakPositive: q(50, "N m"), peakNegative: q(50, "N m") });

/** Two rods: a parent from 1.5 m down to 1 m, and a child hanging from it, tilted in x and z. */
function rods(dofs, range = [-1, 1]) {
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
        min: q(range[0], "rad"), max: q(range[1], "rad"), muscle: muscle() })) }],
  };
}

const close = (a, b, tolerance, what) => assert.ok(Math.abs(a - b) <= tolerance, `${what}: ${a} against ${b}`);

test("a built segment's mass, centre of mass and inertia are the spec's, and its node sits on its frame", async () => {
  const stand = await coreStand(rods([["bend", [1, 0, 0]]]), { gravity: false, ground: false });
  try {
    for (const segment of stand.built.segments.values()) {
      const props = segment.body.getMassProperties();
      close(props.mass, segment.spec.mass.value, 1e-6, `${segment.spec.name} mass`);
      // Havok carries inertia per kilogram (H49); the next test reads it by how the body turns.
      const inertia = segment.spec.inertia.value;
      ["x", "y", "z"].forEach((axis, i) => close(props.inertia[axis] * props.mass, inertia[i], 1e-6, `${segment.spec.name} I${axis}`));
      // The centre of mass, carried to the world through the node, is where the spec put it.
      const world = Vector3.TransformCoordinates(props.centerOfMass, segment.node.computeWorldMatrix(true));
      segment.spec.centreOfMass.value.forEach((c, i) => close(world.asArray()[i], c, 1e-6, `${segment.spec.name} centre of mass`));
      // The node's y axis runs down the segment.
      const y = Vector3.Up().applyRotationQuaternion(segment.node.rotationQuaternion);
      segment.frame.y.forEach((c, i) => close(y.asArray()[i], c, 1e-7, `${segment.spec.name} frame y`));
    }
  } finally { stand.dispose(); }
});

/**
 * **Read the inertia by what it does, not by what it reads back**: a segment built alone, weightless,
 * given an angular impulse of its spec inertia times 1 rad/s about each frame axis, turns at 1 rad/s
 * about that axis. A read-back returns whatever was written, in whatever unit: the build that gave
 * Havok kg m2 where it takes kg m2 per kilogram (H49) passed a read-back and turned the 2 kg rod
 * here at half the rate.
 */
test("a built segment turns under an impulse as its spec's inertia says", async () => {
  const spec = rods([["bend", [1, 0, 0]]]);
  for (const segment of spec.segments) {
    for (const [i, axisName] of ["x", "y", "z"].entries()) {
      const spin = await spinOnce({ ...spec, segments: [segment], joints: [] }, segment.name, axisName, segment.inertia.value[i]);
      close(spin.along, 1, 0.01, `${segment.name} about ${axisName}`);
      close(spin.across, 0, 0.01, `${segment.name} about ${axisName}, off its axis`);
    }
  }
});

/**
 * Drive one freedom with a velocity motor and hold the rest; the child must turn about the
 * freedom's axis in Babylon's positive sense, `Quaternion.RotationAxis(axis, +angle)`.
 */
async function turnOne(dofs, index, { speed = 1, seconds = 0.25, range, force = 1000 } = {}) {
  const stand = await coreStand(rods(dofs, range), { gravity: false, ground: false });
  try {
    const joint = stand.built.joints.get("middle");
    stand.built.segments.get("upper").body.setMotionType(0 /* STATIC */);
    joint.dofs.forEach((dof, k) => {
      joint.constraint.setAxisMotorType(dof.axis, PhysicsConstraintMotorType.VELOCITY);
      joint.constraint.setAxisMotorTarget(dof.axis, k === index ? dof.sign * speed : 0);
      joint.constraint.setAxisMotorMaxForce(dof.axis, force);
    });
    stand.step(stand.seconds(seconds));
    const turned = relativeRotation(joint);
    const axis = new Vector3(...joint.dofs[index].spec.axis.value);
    const angle = 2 * Math.acos(Math.min(1, Math.abs(turned.w)));
    const about = new Vector3(turned.x, turned.y, turned.z).scale(Math.sign(turned.w));
    return { angle, along: Vector3.Dot(about.normalize(), axis) };
  } finally { stand.dispose(); }
}

test("a freedom turns its child in its own positive sense, whichever way its axis runs", async () => {
  const cases = [
    [[["x", [1, 0, 0]]], 0],
    [[["minus x", [-1, 0, 0]]], 0],
    [[["x", [1, 0, 0]], ["y", [0, 1, 0]], ["z", [0, 0, 1]]], 2],
    [[["x", [1, 0, 0]], ["y", [0, 1, 0]], ["minus z", [0, 0, -1]]], 2],
    [[["z", [0, 0, 1]], ["x", [1, 0, 0]]], 1],
  ];
  for (const [dofs, index] of cases) {
    const { angle, along } = await turnOne(dofs, index);
    const name = dofs[index][0];
    assert.ok(angle > 0.15 && angle < 0.3, `${name}: turned ${angle} rad in a quarter second at 1 rad/s`);
    assert.ok(along > 0.99, `${name}: turned about ${along} of its axis, in the positive sense`);
  }
});

test("the reference pose reads as no rotation at every joint", async () => {
  const stand = await coreStand(rods([["x", [1, 0, 0]], ["y", [0, 1, 0]], ["z", [0, 0, 1]]]), { gravity: false, ground: false });
  try {
    const rest = relativeRotation(stand.built.joints.get("middle"));
    // Babylon builds a quaternion from axes through a float32 matrix.
    close(Math.abs(rest.w), 1, 1e-7, "rest rotation");
  } finally { stand.dispose(); }
});

/**
 * Limits, driven into by a motor of 10 N m, well above the rod's needs and not so far above them
 * that it drives through the limit (at 1000 N m it does, by 0.05 rad on an X axis, and a
 * one-freedom joint's locked axes give by more than a radian).
 */
const LIMIT_TEST = { speed: 3, seconds: 1, range: [-0.2, 0.6], force: 10 };

/**
 * The first freedom's axis is the constraint's X, so its sense never flips; a flipped third
 * freedom is the next test's minus z.
 */
test("a joint's first freedom stops at its own range, on both sides of an asymmetric one", async () => {
  const { range } = LIMIT_TEST;
  const cases = [
    [[["x", [1, 0, 0]]], 0],
    [[["minus x", [-1, 0, 0]]], 0],
    [[["x", [1, 0, 0]], ["y", [0, 1, 0]], ["z", [0, 0, 1]]], 0],
    [[["minus x", [-1, 0, 0]], ["y", [0, 1, 0]], ["z", [0, 0, -1]]], 0],
  ];
  for (const [dofs, index] of cases) {
    const name = `${dofs[index][0]} of ${dofs.length}`;
    const up = await turnOne(dofs, index, LIMIT_TEST);
    close(up.angle * Math.sign(up.along), range[1], 0.005, `${name} driven past its maximum`);
    const down = await turnOne(dofs, index, { ...LIMIT_TEST, speed: -LIMIT_TEST.speed });
    close(down.angle * Math.sign(down.along), range[0], 0.005, `${name} driven past its minimum`);
  }
});

/**
 * **A characterisation, not a wish.** In a joint with three freedoms, Havok holds the second and
 * third to their ranges only roughly (Node stand, 10 N m, 1 s, range -0.2 to 0.6 rad):
 * - the second passes its maximum to 0.618 and its minimum to -0.209, and turning it drags the
 *   third about 0.22 rad off zero against a motor holding it there;
 * - the third stops short, at 0.551 and -0.152, and a third freedom whose axis runs against the
 *   constraint's Z (minus z) does the same in its own sense, so its range was flipped right.
 * The first freedom is exact (the test above). If this test fails, the engine changed: read the
 * new numbers and rewrite the note in docs/plans/2026-09-28-core-foundation.md with them.
 */
test("a three-freedom joint holds its second and third freedoms to their ranges only roughly", async () => {
  const z = [["x", [1, 0, 0]], ["y", [0, 1, 0]], ["z", [0, 0, 1]]];
  const minusZ = [["x", [1, 0, 0]], ["y", [0, 1, 0]], ["minus z", [0, 0, -1]]];
  const reached = [];
  for (const [dofs, index] of [[z, 1], [z, 2], [minusZ, 2]]) {
    for (const sense of [1, -1]) {
      const { angle, along } = await turnOne(dofs, index, { ...LIMIT_TEST, speed: sense * LIMIT_TEST.speed });
      reached.push(Math.round(angle * along * 100) / 100);
    }
  }
  assert.deepEqual(reached, [0.62, -0.21, 0.55, -0.15, 0.55, -0.15]);
});
