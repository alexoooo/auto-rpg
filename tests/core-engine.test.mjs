/**
 * **The engine contract** (`src/core/engine/engine.ts`), checked on the engine the Node stand runs
 * (`CORE_ENGINE`, Rapier unless named): the clauses the rest of the core's tests lean on without
 * naming. A 1 kg box slid on the ground slows at the contract's friction times g; dropped, it does
 * not bounce; the engine holds the mass the core set, and a box is no hull; a ground taken out from
 * under a box lets it fall, and a body from another world is refused a joint; a box drifting at a
 * millimetre a second keeps drifting, where a sleeping one would stop and read zero (H08); a box
 * resting on another touches it, pushed with its weight, and the ground is no body; and a fixed box
 * turns about up.
 * Node, a NullEngine scene, 120 Hz.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { Scene } from "@babylonjs/core/scene.js";
import { CONTACT_FRICTION } from "../src/core/engine/engine.ts";
import { STANDARD_GRAVITY } from "../src/core/spec/constants.ts";
import { CORE_ENGINE, freshEngine } from "./harness/core-stand.mjs";

const HZ = 120, SIDE = 0.2;
const MASS = { mass: 1, centre: [0, 0, 0], moments: [SIDE * SIDE / 6, SIDE * SIDE / 6, SIDE * SIDE / 6], orientation: Quaternion.Identity() };

async function box({ height = SIDE / 2, ground = true, gravity = true } = {}) {
  const scene = new Scene(new NullEngine());
  const physics = (await freshEngine()).createPhysics({ hz: HZ, gravity });
  const floor = ground ? physics.addFixedBox([0, -0.5, 0], [20, 1, 20]) : null;
  const node = new TransformNode("box", scene);
  node.position.set(0, height, 0);
  node.rotationQuaternion = Quaternion.Identity();
  const body = physics.addBody(node, [{ kind: "box", centre: [0, 0, 0], size: [SIDE, SIDE, SIDE] }], MASS);
  const step = (n) => { for (let i = 0; i < n; i++) physics.step(1 / HZ); };
  return { physics, floor, node, body, step, dispose: () => { physics.dispose(); scene.dispose(); } };
}
const speed = (body) => body.linearVelocityToRef(new Vector3()).length();
/** Another box in `b`'s world, at `at`. */
const add = (b, name, at) => {
  const node = new TransformNode(name, b.node.getScene());
  node.position.set(...at);
  node.rotationQuaternion = Quaternion.Identity();
  return b.physics.addBody(node, [{ kind: "box", centre: [0, 0, 0], size: [SIDE, SIDE, SIDE] }], MASS);
};
const FRAMES = { anchorParent: [0, 0, 0], anchorChild: [0, 0, 0], frameParent: Quaternion.Identity(), frameChild: Quaternion.Identity(), limits: [[-1, 1]] };

test(`the ${CORE_ENGINE} world names its engine and holds the mass the core set`, async () => {
  const b = await box();
  try {
    assert.equal(b.physics.engine, CORE_ENGINE);
    assert.ok(Math.abs(b.body.engineMass() - 1) < 1e-6, `${b.body.engineMass()}`);
    b.body.setMassProperties({ ...MASS, mass: 3 });
    assert.ok(Math.abs(b.body.engineMass() - 3) < 1e-6, `${b.body.engineMass()}`);
    assert.equal(b.body.hullVertices(0), null, "a box is no hull");
  } finally { b.dispose(); }
});

test("a box slid on the ground slows at the contract's friction times g", async () => {
  const b = await box();
  try {
    b.step(HZ / 2);
    b.body.applyImpulse(new Vector3(2, 0, 0), b.node.position.clone());
    b.step(1);
    const from = speed(b.body);
    b.step(HZ / 4);
    const slowing = (from - speed(b.body)) / 0.25, expected = CONTACT_FRICTION * STANDARD_GRAVITY.value;
    assert.ok(Math.abs(slowing - expected) < 0.02 * expected, `${slowing} m/s2, the contract's ${expected}`);
  } finally { b.dispose(); }
});

test("a box dropped on the ground does not bounce", async () => {
  const b = await box({ height: 0.6 });
  try {
    let rose = 0, lowest = Infinity;
    for (let i = 0; i < HZ; i++) {
      b.step(1);
      lowest = Math.min(lowest, b.node.position.y);
      rose = Math.max(rose, b.node.position.y - lowest);
    }
    assert.ok(rose < 0.002, `it rose ${rose} m off the ground`);
  } finally { b.dispose(); }
});

test("a box falls when its ground is taken out, and a body from another world is refused a joint", async () => {
  const b = await box(), other = await box();
  try {
    b.step(HZ / 2);
    const resting = b.node.position.y;
    b.floor.dispose();
    b.floor.dispose();
    b.step(HZ / 2);
    assert.ok(b.node.position.y < resting - 0.5, `${b.node.position.y} m, from ${resting}`);
    assert.throws(() => b.physics.addJoint(b.body, other.body, FRAMES), /not in this/);
  } finally { b.dispose(); other.dispose(); }
});

test("a box drifting at a millimetre a second in free space keeps drifting: nothing sleeps", async () => {
  const b = await box({ ground: false, gravity: false }), drift = 0.001;
  try {
    b.body.applyImpulse(new Vector3(drift * MASS.mass, 0, 0), b.node.position.clone());
    b.step(5 * HZ);
    // An engine that sleeps a slow body would have stopped this one, and would read it at a perfect zero.
    assert.ok(Math.abs(speed(b.body) - drift) < 0.01 * drift, `${speed(b.body)} m/s after 5 s, from ${drift}`);
    assert.ok(Math.abs(b.node.position.x - 5 * drift) < 0.01 * 5 * drift, `${b.node.position.x} m in 5 s`);
  } finally { b.dispose(); }
});

test("a box resting on another touches it, pushed down on it with its weight each step, and the ground is no body", async () => {
  const b = await box();
  try {
    const top = add(b, "top", [0, 1.5 * SIDE, 0]), beside = add(b, "beside", [SIDE + 0.01, SIDE / 2, 0]);
    b.step(HZ / 2);
    const [down, ...more] = b.physics.contactsOf(top);
    assert.equal(more.length, 0);
    assert.equal(down.other, b.body);
    assert.ok(Math.hypot(down.normal[0], down.normal[1] + 1, down.normal[2]) < 1e-3, `${down.normal}: from the top box into the lower`);
    assert.ok(Math.abs(down.point[1] - SIDE) < 0.005, `${down.point} m, where the boxes meet`);
    const weight = MASS.mass * STANDARD_GRAVITY.value / HZ;
    assert.ok(Math.abs(down.impulse - weight) < 0.05 * weight, `${down.impulse} N s, a step of its weight ${weight}`);
    const up = b.physics.contactsOf(b.body);
    assert.deepEqual(up.map((c) => c.other), [top], "the lower box touches the upper, and not the ground or the box a centimetre off");
    assert.ok(Math.hypot(up[0].normal[0], up[0].normal[1] - 1, up[0].normal[2]) < 1e-3, `${up[0].normal}`);
    assert.deepEqual(b.physics.contactsOf(beside), []);
  } finally { b.dispose(); }
});

test("a fixed box turned a quarter about up lies across where it lay", async () => {
  for (const [turn, caught] of [[0, true], [Math.PI / 2, false]]) {
    const b = await box({ ground: false, height: 5 });
    try {
      b.physics.addFixedBox([0, 0.5, 0], [2, 0.2, 0.2], turn);
      const dropped = add(b, "dropped", [0.5, 1, 0]);
      b.step(HZ);
      const y = dropped.node.position.y;
      assert.equal(y > 0.5, caught, `turned ${turn}: the box at ${y} m`);
    } finally { b.dispose(); }
  }
});
