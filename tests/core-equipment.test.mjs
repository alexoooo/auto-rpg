import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { createWorld } from "../src/core/world.ts";
import { createEquipment } from "../src/core/equipment.ts";
import { woodenClub } from "../src/core/items/club.ts";
import { saveState, loadState } from "../src/core/state.ts";
import { freshEngine } from "./harness/core-stand.mjs";

const engine = await freshEngine(), identity = [0, 0, 0, 1];
const frame = (position, rotation = identity) => ({ position, rotation });

// Node stand, Rapier, 120 Hz. Two free 1 kg holders and the sourced wooden club.
async function fixture({ gravity = false, secondFrame = frame([0, 0.3, 0]) } = {}) {
  const rendering = new NullEngine(), scene = new Scene(rendering);
  const world = createWorld(scene, engine, { gravity, actuation: "directional" });
  const holder = (name, position) => {
    const node = new TransformNode(name, scene);
    node.position.set(...position); node.rotationQuaternion = Quaternion.Identity();
    return world.physics.addBody(node, [{ kind: "sphere", centre: [0, 0, 0], radius: 0.035 }], {
      mass: 1, centre: [0, 0, 0], moments: [0.001, 0.001, 0.001], orientation: Quaternion.Identity(),
    });
  };
  const left = holder("left", [-0.1, 1, 0]), right = holder("right", [0.1, 1.2, 0]);
  const item = createEquipment(world, { id: "club-1", item: woodenClub(), pose: frame([0, 0.9, 0]),
    capture: { distance: 0.002, rotationError: 0.00001 },
    grips: [
      { name: "left", body: left, bodyFrame: frame([0.1, 0, 0]), itemFrame: frame([0, 0.1, 0]) },
      { name: "right", body: right, bodyFrame: frame([-0.1, 0, 0]), itemFrame: secondFrame },
    ],
  });
  const bodies = [left, right, item.body];
  const velocities = () => bodies.map((b) => [b.linearVelocityToRef(new Vector3()).asArray(), b.angularVelocityToRef(new Vector3()).asArray()]);
  const save = () => ({ physics: world.physics.save(), state: saveState(world.state) });
  const load = (s) => { world.physics.load(s.physics); loadState(world.state, s.state); };
  return { world, left, right, item, bodies, velocities, save, load,
    dispose() { item.dispose(); world.dispose(); scene.dispose(); rendering.dispose(); } };
}
const close = (a, b, tolerance, message) => assert.ok(Math.abs(a - b) < tolerance, `${message}: ${a} vs ${b}`);

test("one item has one mass with two grips, and release of either grip preserves motion", async () => {
  for (const released of ["left", "right"]) {
    const f = await fixture();
    try {
      assert.equal(f.item.tryGrip("left"), true);
      assert.equal(f.item.tryGrip("right"), true);
      const mass = 2 + woodenClub().mass.value;
      close(f.bodies.reduce((sum, b) => sum + b.engineMass(), 0), mass, 1e-6, "total mass");
      f.left.applyImpulse(new Vector3(0, 0, 0.5), f.left.node.position);
      f.world.step(60);
      const momentum = f.bodies.reduce((sum, b) => sum + b.engineMass() * b.linearVelocityToRef(new Vector3()).z, 0);
      close(momentum, 0.5, 1e-5, "internal grips conserve linear momentum");
      for (const grip of f.item.observe().grips) assert.ok(grip.distance < 0.001, JSON.stringify(grip));
      const before = f.velocities(), observed = f.item.observe();
      f.item.release(released);
      assert.deepEqual(f.velocities(), before, "release applies no impulse or velocity assignment");
      assert.deepEqual(f.item.observe().position, observed.position);
      assert.deepEqual(f.item.observe().rotation, observed.rotation);
      assert.deepEqual(f.item.observe().grips.map((g) => [g.name, g.attached]), [["left", released !== "left"], ["right", released !== "right"]]);
      f.world.step(120);
      const grips = f.item.observe().grips;
      assert.ok(grips.find((g) => g.name !== released).distance < 0.001, "remaining hand holds");
      assert.ok(grips.find((g) => g.name === released).distance > 0.005, "released hand travels independently");
      close(f.bodies.reduce((sum, b) => sum + b.engineMass(), 0), mass, 1e-6, "release preserves mass");
    } finally { f.dispose(); }
  }
});

test("grip release, reattachment and saved topology replay in place and in a fresh world", async () => {
  const f = await fixture(), other = await fixture();
  try {
    f.item.tryGrip("left"); f.item.tryGrip("right");
    f.left.applyImpulse(new Vector3(0, 0, 0.5), f.left.node.position);
    f.world.step(20);
    const attached = f.save();
    f.item.release("left");
    const released = f.save(), atRelease = f.item.observe();
    assert.equal(f.item.tryGrip("left"), true, "a reachable regrip is accepted");
    const reattached = f.save();
    const branch = () => {
      const rows = [];
      for (let i = 0; i < 30; i++) { if (i === 5) f.item.release("right"); f.world.step(); rows.push(f.item.observe()); }
      return rows;
    };
    const first = branch();
    f.load(reattached);
    assert.deepEqual(branch(), first);
    f.load(released);
    assert.deepEqual(f.item.observe(), atRelease);
    other.load(released);
    assert.deepEqual(other.item.observe(), atRelease);
    for (let i = 0; i < 30; i++) { f.world.step(); other.world.step(); assert.deepEqual(other.item.observe(), f.item.observe()); }
    f.item.release("right"); f.world.step(20);
    f.load(attached);
    assert.deepEqual(f.item.observe().grips.map((g) => g.attached), [true, true]);
  } finally { f.dispose(); other.dispose(); }
});

test("capture rejects unreachable position or orientation without changing the item", async () => {
  for (const secondFrame of [frame([0, 0.4, 0]), frame([0, 0.3, 0], [1, 0, 0, 0])]) {
    const f = await fixture({ secondFrame });
    try {
      const before = f.item.observe(), velocities = f.velocities();
      assert.equal(f.item.tryGrip("right"), false);
      assert.deepEqual(f.item.observe(), before);
      assert.deepEqual(f.velocities(), velocities);
      assert.equal(f.item.tryGrip("left"), true);
      assert.throws(() => f.item.tryGrip("missing"), /no grip/);
      assert.throws(() => { before.grips[0].attached = true; }, TypeError);
    } finally { f.dispose(); }
  }
});

test("released item retains collision shape identity and detached observations", async () => {
  const f = await fixture({ gravity: true });
  try {
    f.world.physics.addFixedBox([0, -0.5, 0], [10, 1, 10]);
    f.item.tryGrip("left"); f.item.tryGrip("right");
    f.item.release("left"); f.item.release("right");
    let hit = null;
    for (let i = 0; i < 240 && !hit; i++) {
      f.world.step();
      const o = f.item.observe();
      if (o.contacts.some((c) => c.fixed !== null && c.impulse > 0)) hit = o;
    }
    assert.ok(hit, "released club collides with the floor");
    assert.equal(hit.id, "club-1"); assert.equal(hit.name, "wooden club"); assert.equal(hit.substance, "wood");
    const contacts = hit.contacts.filter((c) => c.fixed !== null && c.impulse > 0);
    assert.ok(contacts.every((c) => c.pairs.length > 0 && c.pairs.every((p) => p.mine === 0 || p.mine === 1)));
    const frozen = JSON.stringify(hit);
    f.world.step(20);
    assert.equal(JSON.stringify(hit), frozen);
    f.item.dispose(); f.item.dispose();
    assert.throws(() => f.item.tryGrip("left"), /disposed/);
  } finally { f.dispose(); }
});

test("a shared item closes a constrained loop and replay retains the loop after either release", async () => {
  for (const released of ["left", "right"]) {
    const f = await fixture({ gravity: true });
    try {
      f.world.physics.addJoint(f.left, f.right, {
        anchorParent: [0.1, 0.1, 0], anchorChild: [-0.1, -0.1, 0],
        frameParent: Quaternion.Identity(), frameChild: Quaternion.Identity(), limits: [[-1, 1], [-1, 1], [-1, 1]],
      });
      f.left.setFixed(true);
      f.item.tryGrip("left"); f.item.tryGrip("right");
      f.world.step(120);
      for (const grip of f.item.observe().grips) assert.ok(grip.distance < 0.001);
      const before = f.save();
      const branch = () => {
        f.item.release(released);
        f.item.body.applyImpulse(new Vector3(0, 0, 0.2), new Vector3(0, 1.5, 0));
        f.world.step(120);
        const reading = f.item.observe();
        assert.ok(reading.grips.find((g) => g.name !== released).distance < 0.001);
        assert.ok(reading.position.every(Number.isFinite));
        return reading;
      };
      const result = branch();
      f.load(before);
      assert.deepEqual(branch(), result);
    } finally { f.dispose(); }
  }
});

test("incompatible grip topology is refused without modifying the live world", async () => {
  const f = await fixture();
  try {
    f.item.tryGrip("left"); f.item.tryGrip("right");
    const before = f.save();
    const extra = f.world.physics.addGrip(f.left, f.right, {
      anchorParent: [0.1, 0.1, 0], anchorChild: [-0.1, -0.1, 0],
      frameParent: Quaternion.Identity(), frameChild: Quaternion.Identity(),
    });
    const live = f.save();
    assert.throws(() => f.load(before), /other bodies, joints or colliders/);
    assert.deepEqual(f.save(), live);
    extra.attach(); extra.dispose(); extra.dispose();
    assert.equal(extra.attached, false);
    assert.throws(() => extra.attach(), /disposed/);
    f.load(before);
    assert.deepEqual(f.item.observe().grips.map((g) => g.attached), [true, true]);
  } finally { f.dispose(); }
});

test("equipment forwards CCD through the physical path against a moving defense", () => {
  for (const ccd of [false, true]) {
    const rendering = new NullEngine(), scene = new Scene(rendering);
    const world = createWorld(scene, engine, { gravity: false });
    const spec = woodenClub();
    const item = createEquipment(world, { id: "projectile", item: spec, pose: frame([0, 1, 0]),
      ccd, grips: [], capture: { distance: 0, rotationError: 0 } });
    try {
      const node = new TransformNode("moving-defense", scene);
      node.position.set(0.4, 1.35, 0); node.rotationQuaternion = Quaternion.Identity();
      const defense = world.physics.addBody(node, [{ kind: "box", centre: [0, 0, 0], size: [0.01, 0.8, 1] }], {
        mass: 10, centre: [0, 0, 0], moments: [1, 1, 1], orientation: Quaternion.Identity(),
      });
      defense.applyImpulse(new Vector3(-10, 0, 0), node.position);
      item.body.applyImpulse(new Vector3(120 * spec.mass.value, 0, 0), new Vector3(0, 1 + spec.centreOfMass.value[1], 0));
      let hit = false;
      for (let i = 0; i < 5; i++) { world.step(); hit ||= item.observe().contacts.some((c) => c.other === "moving-defense" && c.impulse > 0); }
      assert.equal(hit, ccd);
    } finally { item.dispose(); world.dispose(); scene.dispose(); rendering.dispose(); }
  }
});
