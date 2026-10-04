import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { createWorld } from "../src/core/world.ts";
import { freshEngine, saveStand, loadStand } from "./harness/core-stand.mjs";

async function stand() {
  const rendering = new NullEngine(), scene = new Scene(rendering);
  const world = createWorld(scene, await freshEngine(), { gravity: false, actuation: "directional" });
  const body = (name, at, shapes, moments = [0.01, 0.01, 0.01], ccd = false) => {
    const node = new TransformNode(name, scene); node.position.set(...at); node.rotationQuaternion = Quaternion.Identity();
    return world.physics.addBody(node, shapes, { mass: 1, centre: [0, 0, 0], moments, orientation: Quaternion.Identity() }, { ccd });
  };
  return { world, body, dispose() { world.dispose(); scene.dispose(); rendering.dispose(); } };
}
const sphere = (radius) => [{ kind: "sphere", centre: [0, 0, 0], radius }];
const velocity = (b) => b.linearVelocityToRef(new Vector3()).asArray();

test("release from an overlapping grasp is impulse-free until clearance, then collision returns and replays", async () => {
  for (const ccd of [false, true]) {
    const f = await stand();
    try {
      const hand = f.body("hand", [0, 1, 0], sphere(0.1));
      const item = f.body("item", [0.02, 1, 0], sphere(0.05), [0.01, 0.01, 0.01], ccd);
      const grip = f.world.physics.addGrip(hand, item, { anchorParent: [0.02, 0, 0], anchorChild: [0, 0, 0],
        frameParent: Quaternion.Identity(), frameChild: Quaternion.Identity() });
      grip.attach();
      for (const b of [hand, item]) b.applyImpulse(new Vector3(0, 0, 1), b.node.position);
      f.world.step(3);
      const before = [velocity(hand), velocity(item)], separation = item.node.position.subtract(hand.node.position).asArray();
      grip.release();
      assert.deepEqual([velocity(hand), velocity(item)], before);
      f.world.step();
      assert.ok(Math.abs(item.node.position.x - hand.node.position.x - separation[0]) < 1e-6,
        "overlap recovery must not kick the just-released item away");
      assert.deepEqual([velocity(hand), velocity(item)], before);
      assert.equal(grip.attached, false);
      assert.equal(grip.collisionSuppressed, true);
      const saved = saveStand(f.world, {});
      const branch = () => {
        item.applyImpulse(new Vector3(1, 0, 0), item.node.position);
        f.world.step(24);
        assert.equal(grip.collisionSuppressed, false, "geometric clearance restores collisions");
        item.applyImpulse(new Vector3(-2, 0, 0), item.node.position);
        let hit = false;
        for (let i = 0; i < 24; i++) {
          f.world.step();
          hit ||= f.world.physics.contactsOf(item).some((c) => c.other === hand && c.impulse > 0);
        }
        assert.equal(hit, true, "a later impact against the former hand is physical");
        return [item.node.position.asArray(), hand.node.position.asArray(), velocity(item), velocity(hand)];
      };
      const result = branch();
      loadStand(f.world, {}, saved);
      assert.equal(grip.collisionSuppressed, true);
      assert.deepEqual(branch(), result);
    } finally { f.dispose(); }
  }
});

test("CCD honors a joint's excluded pair while retaining a separate obstacle", async () => {
  const run = async (mode, ccd) => {
    const f = await stand();
    try {
      const wall = { kind: "box", centre: [0, 0.25, 0.4], size: [1, 0.02, 0.01] };
      const parent = f.body("parent", [0, 0, 0], mode === "joint" ? [wall] : []);
      parent.setFixed(true);
      const child = f.body("bar", [0, 0, 0], [{ kind: "capsule", from: [0, -0.5, 0], to: [0, 0.5, 0], radius: 0.015 }], [0.09, 0.001, 0.09], ccd);
      f.world.physics.addJoint(parent, child, { anchorParent: [0, 0, 0], anchorChild: [0, 0, 0],
        frameParent: Quaternion.Identity(), frameChild: Quaternion.Identity(), limits: [[-3, 3]] });
      if (mode === "external") f.world.physics.addFixedShape(wall);
      child.applyTorqueImpulse(new Vector3(0.09 * 80, 0, 0));
      const rows = [];
      for (let i = 0; i < 5; i++) {
        f.world.step(); rows.push([child.node.position.asArray(), child.node.rotationQuaternion.asArray(), velocity(child)]);
      }
      return rows;
    } finally { f.dispose(); }
  };
  for (const ccd of [false, true]) {
    const free = await run("free", ccd);
    assert.deepEqual(await run("joint", ccd), free, "a collider on the joint partner must not clamp the sweep");
    assert.notDeepEqual(await run("external", ccd), free, "the same shape on a separate obstacle must stop the sweep");
  }
});
