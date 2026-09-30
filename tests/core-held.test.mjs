/**
 * **An item held in a segment is one rigid body with it** (`src/core/build/rigid.ts`): the two
 * masses, their centre, and their inertia about it with products, turned to principal axes for
 * the engine. Read against a sum written another way, and against the engine's own response to an
 * impulse (Node core stand, Rapier).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { heldFrame, heldPoint, principalOf, rigidOf } from "../src/core/build/rigid.ts";
import { frameOf } from "../src/core/spec/body.ts";
import { sourced } from "../src/core/spec/quantity.ts";
import { add, cross, dot, scale, sub } from "../src/core/spec/vec.ts";
import { coreStand } from "./harness/core-stand.mjs";

const q = (value, unit = "m") => sourced(value, unit, "de-leva-1996", "a stand-in leaf for the held-item tests");
const close = (a, b, tolerance, what) => assert.ok(Math.abs(a - b) <= tolerance, `${what}: ${a} against ${b}`);

/** A lone segment off every axis, holding a rod turned off every axis, at an offset. */
function holder() {
  const segment = {
    name: "grip", proximal: q([0.1, 1, 0.05]), distal: q([0.25, 0.9, 0.2]), mass: q(0.6, "kg"),
    centreOfMass: q([0.17, 0.955, 0.12]), inertia: q([0.0012, 0.0004, 0.0015], "kg m2"),
    shape: { kind: "capsule", from: q([0.11, 0.99, 0.06]), to: q([0.24, 0.91, 0.19]), radius: q(0.03) },
  };
  const rod = {
    name: "rod", mass: q(1.1, "kg"), centreOfMass: q([0.004, 0.42, -0.006]), inertia: q([0.04, 0.0009, 0.045], "kg m2"),
    shapes: [{ kind: "capsule", from: q([0, 0.02, 0]), to: q([0, 0.6, 0]), radius: q(0.02) }, { kind: "sphere", centre: q([0, 0.6, 0]), radius: q(0.04) }],
    points: { head: q([0, 0.6, 0]) },
  };
  return {
    family: "test", model: "holder", mass: q(1.7, "kg"), stature: q(1), segments: [segment], joints: [],
    wounds: { hp: q(1, "1"), vital: [], whole: [] },
    held: [{ segment: "grip", item: rod, origin: q([0.2, 0.93, 0.15]), along: q([0.2, 0.9, -0.4], "1"), across: q([1, -0.1, 0.3], "1") }],
  };
}

/** A tensor's matrix, rows. */
const matrix = ([xx, yy, zz, xy, xz, yz]) => [[xx, xy, xz], [xy, yy, yz], [xz, yz, zz]];
const times = (m, v) => m.map((row) => dot(row, v));

test("a segment that holds nothing is its own numbers", () => {
  const spec = { ...holder(), held: [] }, [segment] = spec.segments;
  const rigid = rigidOf(spec, segment);
  assert.deepEqual(rigid, { mass: 0.6, centre: segment.centreOfMass.value, tensor: [0.0012, 0.0004, 0.0015, 0, 0, 0], shapes: [segment.shape] });
});

test("principal moments and right-handed axes rebuild the tensor", () => {
  for (const tensor of [[0.03, 0.01, 0.025, 0.004, -0.006, 0.002], [2, 2, 1, 0, 0, 0.5], [1, 1, 1, 0, 0, 0], [0.5, 0.2, 0.4, 0, 0.1, 0]]) {
    const { moments, axes } = principalOf(tensor);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) close(dot(axes[i], axes[j]), i === j ? 1 : 0, 1e-12, `axes ${i}.${j}`);
    const z = cross(axes[0], axes[1]);
    for (let k = 0; k < 3; k++) close(z[k], axes[2][k], 1e-12, "right-handed");
    const rebuilt = matrix(tensor).map((row, i) => row.map((_, j) => moments.reduce((sum, m, k) => sum + m * axes[k][i] * axes[k][j], 0)));
    matrix(tensor).forEach((row, i) => row.forEach((entry, j) => close(rebuilt[i][j], entry, 1e-12, `entry ${i}${j}`)));
  }
});

test("held, the rigid body has both masses, their centre, and the angular momentum of both about it", () => {
  const spec = holder(), [segment] = spec.segments, [held] = spec.held;
  const rigid = rigidOf(spec, segment);
  close(rigid.mass, 1.7, 1e-12, "mass");
  const frame = heldFrame(held), own = frameOf(segment);
  const rodCentre = heldPoint(held, held.item.centreOfMass).value;
  const centre = scale(add(scale(segment.centreOfMass.value, 0.6), scale(rodCentre, 1.1)), 1 / 1.7);
  for (let k = 0; k < 3; k++) close(rigid.centre[k], centre[k], 1e-12, `centre ${k}`);
  // Written another way: for a spin w, each piece's own I w plus m d x (w x d), in the body frame.
  const pieces = [
    { m: 0.6, c: segment.centreOfMass.value, moments: segment.inertia.value, axes: [own.x, own.y, own.z] },
    { m: 1.1, c: rodCentre, moments: held.item.inertia.value, axes: [frame.x, frame.y, frame.z] },
  ];
  const T = matrix(rigid.tensor);
  for (const w of [[1, 0, 0], [0, 1, 0], [0, 0, 1], [0.3, -0.7, 0.5]]) {
    let L = [0, 0, 0];
    for (const p of pieces) {
      const d = sub(p.c, rigid.centre);
      p.axes.forEach((a, k) => { L = add(L, scale(a, p.moments[k] * dot(a, w))); });
      L = add(L, scale(cross(d, cross(w, d)), p.m));
    }
    // The tensor is in the segment frame: turn w into it and the answer back out.
    const wIn = [dot(w, own.x), dot(w, own.y), dot(w, own.z)], Lin = times(T, wIn);
    const back = add(scale(own.x, Lin[0]), add(scale(own.y, Lin[1]), scale(own.z, Lin[2])));
    for (let k = 0; k < 3; k++) close(back[k], L[k], 1e-12, `L ${k} for w ${w}`);
  }
  // Its shapes: the segment's, then the rod's two, placed.
  assert.equal(rigid.shapes.length, 3);
  assert.deepEqual(rigid.shapes[2].centre.value, heldPoint(held, held.item.points.head).value);
});

/**
 * The engine keeps a free body's angular momentum, not its spin (`src/core/build/dynamics.ts`), so
 * the momentum an impulse gives is read with the segment frame where the step left it.
 */
test("the engine holds the rigid body: its mass, centre and inertia, read back by an impulse on every axis", async () => {
  const spec = holder(), [segment] = spec.segments;
  const rigid = rigidOf(spec, segment), rest = frameOf(segment);
  const T = matrix(rigid.tensor);
  // The segment frame as the node carries it now.
  const frameNow = (node) => {
    const turn = node.rotationQuaternion.multiply(Quaternion.Inverse(Quaternion.RotationQuaternionFromAxis(...["x", "y", "z"].map((a) => new Vector3(...rest[a])))));
    return Object.fromEntries(["x", "y", "z"].map((a) => [a, new Vector3(...rest[a]).applyRotationQuaternion(turn).asArray()]));
  };
  for (const axis of [[1, 0, 0], [0, 1, 0], [0, 0, 1], [0.48, 0.6, -0.64]]) {
    const stand = await coreStand(spec, { gravity: false, ground: false });
    try {
      const { body, node } = stand.built.segments.get("grip");
      close(body.engineMass(), 1.7, 1e-6, "mass");
      const impulse = 0.01;
      body.applyTorqueImpulse(new Vector3(...axis).scale(impulse));
      stand.step(1);
      const w = new Vector3();
      body.angularVelocityToRef(w);
      const own = frameNow(node);
      const wIn = [dot([w.x, w.y, w.z], own.x), dot([w.x, w.y, w.z], own.y), dot([w.x, w.y, w.z], own.z)];
      const L = times(T, wIn), want = [dot(axis, own.x), dot(axis, own.y), dot(axis, own.z)].map((a) => a * impulse);
      for (let k = 0; k < 3; k++) close(L[k], want[k], 2e-3 * impulse, `L ${k} about ${axis}`);
    } finally { stand.dispose(); }
  }
  // A push at the rod's head, off the centre: the centre moves at J / m and the body turns by
  // (head - centre) x J, which only the right centre gives.
  const stand = await coreStand(spec, { gravity: false, ground: false });
  try {
    const { body, node } = stand.built.segments.get("grip");
    const head = heldPoint(spec.held[0], spec.held[0].item.points.head).value, J = [0.4, -1, 0.7];
    body.applyImpulse(new Vector3(...J), new Vector3(...head));
    stand.step(1);
    const v = new Vector3(), w = new Vector3();
    body.linearVelocityToRef(v);
    body.angularVelocityToRef(w);
    const own = frameNow(node);
    [v.x, v.y, v.z].forEach((c, k) => close(c, J[k] / 1.7, 1e-2 * Math.abs(J[1]) / 1.7, `v ${k}`));
    const wIn = [dot([w.x, w.y, w.z], own.x), dot([w.x, w.y, w.z], own.y), dot([w.x, w.y, w.z], own.z)];
    const moment = cross(sub(head, rigid.centre), J), L = times(T, wIn);
    const want = [dot(moment, own.x), dot(moment, own.y), dot(moment, own.z)];
    for (let k = 0; k < 3; k++) close(L[k], want[k], 2e-3 * Math.hypot(...moment), `L ${k} from the push`);
  } finally { stand.dispose(); }
});

test("a body refuses to hold an item in a segment it does not have", async () => {
  const spec = holder();
  await assert.rejects(coreStand({ ...spec, held: [{ ...spec.held[0], segment: "tail" }] }, { gravity: false, ground: false }), /no tail/);
});
