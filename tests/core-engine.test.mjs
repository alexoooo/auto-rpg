/**
 * **The engine contract** (`src/core/engine/engine.ts`), checked on the engine the Node stand runs
 * (`CORE_ENGINE`, Rapier unless named): the clauses the rest of the core's tests lean on without
 * naming. A 1 kg box slid on the ground slows at the contract's friction times g; dropped, it does
 * not bounce; the engine holds the mass the core set, and a box is no hull; a ground taken out from
 * under a box lets it fall, and a body from another world is refused a joint; a box drifting at a
 * millimetre a second keeps drifting, where a sleeping one would stop and read zero; a force
 * through a step is integrated as gravity is and lasts that step alone; a box resting on another
 * touches it, pushed with its weight, and the ground is no body; a fixed box turns about up; and a
 * world loaded from a save goes on as it went on from the save, its contacts, its fixed colliders
 * and its bodies the ones it had, a force asked for the next step with them, and a save of another
 * world refused.
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

test("a force through a step is integrated as gravity is, and lasts that step alone", async () => {
  const weight = new Vector3(0, MASS.mass * STANDARD_GRAVITY.value, 0), inertia = MASS.moments[1];
  // Its weight upward at its centre each step holds a box where it is; an impulse before the step would lead gravity through the solver's sub-steps.
  const held = await box({ height: 1, ground: false });
  try {
    for (let i = 0; i < 60; i++) { held.body.applyForce(weight, held.node.position); held.step(1); }
    assert.ok(Math.abs(held.node.position.y - 1) < 1e-6 && speed(held.body) < 1e-6, `held at ${held.node.position.y} m, ${speed(held.body)} m/s`);
    // Not given again, it is gone: the box falls from rest, half of g over 0.5 s squared.
    held.step(60);
    const fell = 1 - held.node.position.y;
    assert.ok(fell > 1.2 && fell < 1.26, `fell ${fell} m in 0.5 s`);
  } finally { held.dispose(); }
  // A moment through one step turns the box at the moment times the step over its inertia, and no faster after.
  const turned = await box({ ground: false, gravity: false });
  try {
    turned.body.applyTorque(new Vector3(0, 0.01, 0));
    turned.step(1);
    const after = turned.body.angularVelocityToRef(new Vector3()).y;
    assert.ok(Math.abs(after - 0.01 / HZ / inertia) < 1e-6, `${after} rad/s after a step of 0.01 N m`);
    turned.step(10);
    assert.ok(Math.abs(turned.body.angularVelocityToRef(new Vector3()).y - after) < 1e-6, "and the same ten steps on");
    assert.ok(speed(turned.body) < 1e-9, "a moment moves nothing");
  } finally { turned.dispose(); }
  // A force off the centre is the force and its moment about the centre.
  const pushed = await box({ ground: false, gravity: false });
  try {
    pushed.body.applyForce(new Vector3(0, 0, 1), pushed.node.position.add(new Vector3(0.1, 0, 0)));
    pushed.step(1);
    const v = pushed.body.linearVelocityToRef(new Vector3()), w = pushed.body.angularVelocityToRef(new Vector3());
    assert.ok(Math.abs(v.z - 1 / HZ / MASS.mass) < 1e-6 && Math.hypot(v.x, v.y) < 1e-9, `moving at ${v}`);
    assert.ok(Math.abs(w.y + 0.1 / HZ / inertia) < 1e-5 && Math.hypot(w.x, w.z) < 1e-9, `turning at ${w}`);
    pushed.step(10);
    assert.ok(Math.abs(pushed.body.linearVelocityToRef(new Vector3()).z - v.z) < 1e-6, "and no faster ten steps on");
  } finally { pushed.dispose(); }
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

test("a fixed hull stands where its points are in the world", async () => {
  // An eight-sided post 0.4 m across and 1 m tall at x = 3, as the arena's are: a ball dropped on it rests on its top,
  // and one dropped beside it falls. A ball, since a body is capsules and balls: Rapier lets a 0.2 m box sink about
  // 1.6 cm into this post's top and stay there, which the contract does not ask about.
  const post = Array.from({ length: 16 }, (_, i) => {
    const a = (i % 8) * Math.PI / 4;
    return [3 + 0.2 * Math.cos(a), i < 8 ? 0 : 1, 0.2 * Math.sin(a)];
  });
  const radius = SIDE / 2;
  for (const [x, caught] of [[3, true], [2.5, false]]) {
    const b = await box({ ground: false, height: 5 });
    try {
      b.physics.addFixedShape({ kind: "hull", points: post });
      const node = new TransformNode("ball", b.node.getScene());
      node.position.set(x, 1.5, 0); node.rotationQuaternion = Quaternion.Identity();
      const moment = 0.4 * radius * radius;
      b.physics.addBody(node, [{ kind: "sphere", centre: [0, 0, 0], radius }],
        { mass: 1, centre: [0, 0, 0], moments: [moment, moment, moment], orientation: Quaternion.Identity() });
      b.step(HZ);
      const y = node.position.y;
      if (caught) assert.ok(Math.abs(y - 1 - radius) < 0.002, `a ball dropped on the post rests on its top: ${y}`);
      else assert.ok(y < 0, `a ball dropped beside the post falls past it: ${y}`);
    } finally { b.dispose(); }
  }
});

/** Each body's pose and velocity, as numbers. */
const stateOf = (bodies) => bodies.flatMap((body) => {
  const p = body.node.position, q = body.node.rotationQuaternion;
  const v = body.linearVelocityToRef(new Vector3()), w = body.angularVelocityToRef(new Vector3());
  return [p.x, p.y, p.z, q.x, q.y, q.z, q.w, v.x, v.y, v.z, w.x, w.y, w.z];
});
/** A box on `b`'s, a little off its centre, rested half a second and then shoved along the lower box's top: sliding at the last step. */
const stacked = (b) => {
  const top = add(b, "top", [0.03, 1.5 * SIDE, 0]);
  b.step(HZ / 2 - 3);
  top.applyImpulse(new Vector3(0.5, 0, 0), top.node.position.clone());
  b.step(3);
  return top;
};

test("a world loaded from a save goes on as it went on from the save", async () => {
  const b = await box();
  try {
    const top = stacked(b), both = [b.body, top];
    const saved = b.physics.save(), at = stateOf(both);
    assert.ok(speed(top) > 0.1, `the top box slides at ${speed(top)} m/s at the save`);
    const trail = [];
    for (let i = 0; i < 30; i++) { b.step(1); trail.push(stateOf(both)); }
    // The control: knocked off the lower box, it is somewhere else.
    top.applyImpulse(new Vector3(3, 2, 0), top.node.position.clone());
    b.step(HZ / 2);
    assert.ok(top.node.position.x > 1, `knocked to ${top.node.position.x} m`);
    b.physics.load(saved);
    assert.deepEqual(stateOf(both), at, "both boxes are where they were at the save, moving as they were");
    assert.deepEqual(b.physics.save(), saved, "and a save of the loaded world is the save it loaded");
    const again = [];
    for (let i = 0; i < 30; i++) { b.step(1); again.push(stateOf(both)); }
    assert.deepEqual(again, trail);
  } finally { b.dispose(); }
});

test("a force asked for the step after a save is given through that step after a load, and no longer", async () => {
  const held = await box({ height: 1, ground: false });
  try {
    held.body.applyForce(new Vector3(0, MASS.mass * STANDARD_GRAVITY.value, 0), held.node.position);
    const saved = held.physics.save();
    held.step(1);
    assert.ok(speed(held.body) < 1e-6, `held through the step: ${speed(held.body)} m/s`);
    held.step(1);
    const went = stateOf([held.body]);
    assert.ok(Math.abs(went[8] + STANDARD_GRAVITY.value / HZ) < 1e-6, `falling at ${went[8]} m/s a step on`);
    held.step(HZ / 4);
    held.physics.load(saved);
    held.step(2);
    assert.deepEqual(stateOf([held.body]), went);
  } finally { held.dispose(); }
});

test("a loaded world keeps the last step's contacts, its fixed colliders and its bodies' identity", async () => {
  const b = await box();
  try {
    const top = stacked(b);
    const saved = b.physics.save(), read = (contacts) => contacts.map(({ point, normal, impulse }) => ({ point, normal, impulse }));
    const touched = b.physics.contactsOf(top);
    assert.deepEqual(touched.map((c) => c.other), [b.body]);
    top.applyImpulse(new Vector3(3, 2, 0), top.node.position.clone());
    b.step(HZ / 2);
    assert.deepEqual(b.physics.contactsOf(top), [], "knocked off, it touches no body");
    b.physics.load(saved);
    const again = b.physics.contactsOf(top);
    assert.deepEqual(read(again), read(touched), "before any step, the contacts of the step before the save");
    assert.equal(again[0].other, b.body, "and the body touched is the object it was");
    // A body made before the save takes an impulse after the load: its speed changes by the impulse over its mass.
    const before = top.linearVelocityToRef(new Vector3());
    top.applyImpulse(new Vector3(0, 0, 2), top.node.position.clone());
    const gained = top.linearVelocityToRef(new Vector3()).subtract(before);
    assert.ok(Math.abs(gained.z - 2 / MASS.mass) < 1e-6 && Math.hypot(gained.x, gained.y) < 1e-9, `gained ${gained}`);
    // The ground made before the save is taken out after the load.
    const resting = b.node.position.y;
    b.floor.dispose();
    b.step(HZ / 2);
    assert.ok(b.node.position.y < resting - 0.5, `${b.node.position.y} m, from ${resting}`);
  } finally { b.dispose(); }
});

test("a save of another world is refused, and the world it was offered to is untouched", async () => {
  const two = await box(), twin = await box();
  // One body where `two` has two; `two`'s count of bodies, the second made, removed and made again;
  // `two`'s bodies and a fixed box more; `two`'s bodies and a joint between them. And `ghost`: `fewer`'s
  // body and colliders, and a body more that has no shape.
  const others = { fewer: await box(), reborn: await box(), walled: await box(), jointed: await box() }, ghost = await box();
  try {
    const tops = [stacked(two), stacked(twin)], above = [0.03, 1.5 * SIDE, 0];
    others.reborn.physics.removeBody(add(others.reborn, "first", above));
    add(others.reborn, "second", above);
    add(others.walled, "top", above);
    others.walled.physics.addFixedBox([5, 0.5, 0], [1, 1, 1]);
    others.jointed.physics.addJoint(others.jointed.body, add(others.jointed, "top", above), FRAMES);
    for (const [name, other] of Object.entries(others)) {
      other.step(HZ / 2);
      assert.throws(() => two.physics.load(other.physics.save()), /other bodies, joints or colliders/, name);
    }
    const node = new TransformNode("ghost", ghost.node.getScene());
    node.rotationQuaternion = Quaternion.Identity();
    ghost.physics.addBody(node, [], MASS);
    ghost.step(HZ / 2);
    assert.throws(() => others.fewer.physics.load(ghost.physics.save()), /other bodies, joints or colliders/, "a body more");
    assert.throws(() => two.physics.load(new Uint8Array(8)), /not a Rapier world/);
    two.step(30); twin.step(30);
    assert.deepEqual(stateOf([two.body, tops[0]]), stateOf([twin.body, tops[1]]), "it steps on as its twin, which was offered none");
    // Its twin's save it takes, and is then where its twin is.
    twin.step(7);
    two.physics.load(twin.physics.save());
    assert.deepEqual(stateOf([two.body, tops[0]]), stateOf([twin.body, tops[1]]));
  } finally { two.dispose(); twin.dispose(); ghost.dispose(); for (const other of Object.values(others)) other.dispose(); }
});
