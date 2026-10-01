/**
 * **Two worlds asked for at once are two worlds**: each asks for the engine before the other's
 * has loaded, as two bouts built together do, and each then steps and is disposed alone.
 * The engine loads once a realm, so this file holds the one test and its first act is the two
 * loads: after any other load, a second would find the engine there and show nothing.
 * Node, a NullEngine scene, 120 Hz.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Quaternion } from "@babylonjs/core/Maths/math.vector.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { Scene } from "@babylonjs/core/scene.js";
import { CORE_ENGINE, freshEngine } from "./harness/core-stand.mjs";

const HZ = 120, SIDE = 0.2, HEIGHT = 5;
const MASS = { mass: 1, centre: [0, 0, 0], moments: [SIDE * SIDE / 6, SIDE * SIDE / 6, SIDE * SIDE / 6], orientation: Quaternion.Identity() };

/** A box in the air over a ground, in a world of its own. */
async function falling() {
  const physics = (await freshEngine()).createPhysics({ hz: HZ, gravity: true });
  const scene = new Scene(new NullEngine());
  physics.addFixedBox([0, -0.5, 0], [20, 1, 20]);
  const node = new TransformNode("box", scene);
  node.position.set(0, HEIGHT, 0);
  node.rotationQuaternion = Quaternion.Identity();
  physics.addBody(node, [{ kind: "box", centre: [0, 0, 0], size: [SIDE, SIDE, SIDE] }], MASS);
  const step = (n) => { for (let i = 0; i < n; i++) physics.step(1 / HZ); };
  return { node, step, dispose: () => { physics.dispose(); scene.dispose(); } };
}

test(`two ${CORE_ENGINE} worlds asked for at once are two worlds`, async () => {
  const [a, b] = await Promise.all([falling(), falling()]);
  a.step(60);
  const fallen = a.node.position.y;
  assert.ok(fallen < HEIGHT - 1, `half a second on, the first world's box is at ${fallen} m`);
  assert.equal(b.node.position.y, HEIGHT, "and the second world has not stepped");
  a.dispose();
  b.step(60);
  assert.equal(b.node.position.y, fallen, "the second falls as the first did, the first gone");
  // A world asked for alone, the engine loaded, falls the same.
  const c = await falling();
  c.step(60);
  assert.equal(c.node.position.y, fallen);
  b.dispose();
  c.dispose();
});
