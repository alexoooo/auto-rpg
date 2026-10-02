/**
 * `buildBody` on a spec small enough to reason about: two rods and one joint, Node stand.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { sourced } from "../src/core/spec/quantity.ts";
import { jointAngles } from "../src/core/build/joint-state.ts";
import { coreStand, relativeRotation, spinOnce } from "./harness/core-stand.mjs";

const q = (value, unit = "m") => sourced(value, unit, "de-leva-1996", "a stand-in leaf for the builder's tests");

const muscle = () => ({ peakPositive: q(50, "N m"), peakNegative: q(50, "N m") });

/** Two rods: a parent from 1.5 m down to 1 m, and a child hanging from it, tilted in x and z. */
function rods(dofs, range = [-1, 1]) {
  const segment = (name, proximal, distal, mass) => ({
    name, proximal: q(proximal), distal: q(distal), mass: q(mass, "kg"),
    centreOfMass: q(proximal.map((p, i) => (p + distal[i]) / 2)),
    inertia: q([0.02 * mass, 0.004 * mass, 0.03 * mass], "kg m2"),
    shape: { kind: "capsule", from: q(proximal), to: q(distal), radius: q(0.04) }, surface: { stiffness: q(1e5, "N/m") },
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
      const { rigid } = segment.body;
      close(rigid.mass(), segment.spec.mass.value, 1e-6, `${segment.spec.name} mass`);
      // Rapier's inertia is kg m2 about its principal axes, whose frame it reports; turned back to
      // the body's own axes it is the spec's. The next test reads it by how the body turns.
      const inertia = segment.spec.inertia.value, moments = rigid.principalInertia(), f = rigid.principalInertiaLocalFrame();
      const frame = new Quaternion(f.x, f.y, f.z, f.w), principal = [Vector3.Right(), Vector3.Up(), Vector3.Forward()].map((a) => a.applyRotationQuaternion(frame));
      const tensor = (i, j) => principal.reduce((sum, a, k) => sum + [moments.x, moments.y, moments.z][k] * a.asArray()[i] * a.asArray()[j], 0);
      [0, 1, 2].forEach((i) => [0, 1, 2].forEach((j) => close(tensor(i, j), i === j ? inertia[i] : 0, 1e-6, `${segment.spec.name} I${i}${j}`)));
      // The centre of mass, carried to the world through the node, is where the spec put it.
      const c = rigid.localCom(), world = new Vector3(c.x, c.y, c.z).applyRotationQuaternion(segment.node.rotationQuaternion).addInPlace(segment.node.position);
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
 * about that axis. A read-back returns whatever was written, in whatever unit, so it cannot catch
 * an inertia handed to the engine in the wrong unit; the spin can.
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
    stand.built.segments.get("upper").body.setFixed(true);
    joint.dofs.forEach((dof, k) => joint.joint.setMotor(k, k === index ? dof.sign * speed : 0, force));
    stand.step(stand.seconds(seconds));
    const turned = relativeRotation(joint);
    const axis = new Vector3(...joint.dofs[index].spec.axis.value);
    const angle = 2 * Math.acos(Math.min(1, Math.abs(turned.w)));
    const about = new Vector3(turned.x, turned.y, turned.z).scale(Math.sign(turned.w));
    return { angle, along: Vector3.Dot(about.normalize(), axis), angles: jointAngles(joint) };
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
 * Limits, driven into by a motor of 10 N m, well above the rod's needs. A far stronger motor
 * still stops at the bound, but in a joint of three it drives the other freedoms off their holds:
 * Rapier's limit row pushes along the parent-fixed axis, not along its angle's gradient, and the
 * two part once the other angles are off zero.
 */
const LIMIT_TEST = { speed: 3, seconds: 1, range: [-0.2, 0.6], force: 10 };

/**
 * Every freedom stops at its own range, read as the limit reads it (`jointAngles`), on both sides
 * of an asymmetric one, whichever way its axis runs. The freedoms held at zero by their 10 N m
 * motors give a little to the pressed one; that is not what this reads.
 */
test("every freedom stops at its own range, on both sides of an asymmetric one", async () => {
  const { range } = LIMIT_TEST;
  const x = [["x", [1, 0, 0]]], three = [["x", [1, 0, 0]], ["y", [0, 1, 0]], ["z", [0, 0, 1]]];
  const cases = [
    [x, 0],
    [[["minus x", [-1, 0, 0]]], 0],
    [three, 0], [three, 1], [three, 2],
    [[["minus x", [-1, 0, 0]], ["y", [0, 1, 0]], ["z", [0, 0, -1]]], 0],
    [[["x", [1, 0, 0]], ["y", [0, 1, 0]], ["minus z", [0, 0, -1]]], 2],
    [[["z", [0, 0, 1]], ["x", [1, 0, 0]]], 0],
    [[["z", [0, 0, 1]], ["x", [1, 0, 0]]], 1],
  ];
  for (const [dofs, index] of cases) {
    const name = `${dofs[index][0]} of ${dofs.length}`;
    const up = await turnOne(dofs, index, LIMIT_TEST);
    close(up.angles[index], range[1], 0.001, `${name} driven past its maximum`);
    const down = await turnOne(dofs, index, { ...LIMIT_TEST, speed: -LIMIT_TEST.speed });
    close(down.angles[index], range[0], 0.001, `${name} driven past its minimum`);
  }
});

/**
 * A hull is built from its points, in its segment's frame: the built hull's vertices, read back
 * from Rapier, span the points' extents along the frame's axes. Rapier keeps a hull's corners where
 * the points put them, to float32 precision.
 */
test("a hull shape is built from its points, in its segment's frame", async () => {
  const spec = rods([["bend", [1, 0, 0]]]);
  const corners = [];
  for (const x of [-0.05, 0.12]) for (const y of [0.98, 0.6]) for (const z of [-0.04, 0.07]) corners.push([x + y / 10, y, z - x / 5]);
  const points = [...corners, [0.02, 0.8, 0.01], [0.03, 0.7, 0.02]];
  spec.segments[1] = { ...spec.segments[1], shape: { kind: "hull", points: points.map((p) => q(p)) } };
  const stand = await coreStand(spec, { gravity: false, ground: false });
  try {
    const segment = stand.built.segments.get("lower"), frame = segment.frame;
    const local = points.map((p) => [frame.x, frame.y, frame.z].map((e) => e.reduce((sum, c, i) => sum + c * (p[i] - frame.origin[i]), 0)));
    // The hull's vertices as the engine built them, in the body's frame.
    const vertices = segment.body.hullVertices(0);
    assert.ok(vertices && vertices.length >= 8, "a hull");
    [0, 1, 2].forEach((i) => {
      const along = vertices.map((v) => v[i]);
      close(Math.min(...along), Math.min(...local.map((p) => p[i])), 1e-6, `min ${i}`);
      close(Math.max(...along), Math.max(...local.map((p) => p[i])), 1e-6, `max ${i}`);
    });
  } finally { stand.dispose(); }
});
