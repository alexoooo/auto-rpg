import test from "node:test";
import assert from "node:assert/strict";
import { layerTrial } from "../research/contact-layer.mjs";

test("a pair-local layer dissipates reaction work, respects its backstop and conserves momentum", async () => {
  const row = await layerTrial({ fixed: false });
  assert.ok(row.work > .001 && row.work <= row.initialEnergy, JSON.stringify(row));
  assert.ok(row.depth > .001 && row.depth <= .0081, JSON.stringify(row));
  assert.ok(row.symmetry < 1e-6, JSON.stringify(row));
  assert.ok(Math.abs(row.work + row.remainingEnergy - row.initialEnergy) < .001, JSON.stringify(row));
});

test("elastic unloading returns stored work, and stationary pressure adds no work", async () => {
  const elastic = await layerTrial({ dampingRatio: 0, speed: .1 });
  assert.ok(Math.abs(elastic.work) < .0002, JSON.stringify(elastic));
  const pressure = await layerTrial({ force: 20, speed: 0, seconds: 2 });
  assert.ok(pressure.depth <= .0081 && pressure.depth > .0079, JSON.stringify(pressure));
  assert.ok(Math.abs(pressure.tailWork) < .00001, JSON.stringify(pressure));
});

test("side contact keeps the ordinary rigid response and has no material work", async () => {
  for (const direction of [[1, 0, 0], [0, -1, 0]]) {
    const row = await layerTrial({ direction });
    assert.equal(row.work, 0);
    assert.ok(row.depth < .001, JSON.stringify(row));
  }
});

test("material work at 120 Hz holds the 960 Hz reference", async () => {
  for (const stiffness of [250, 500, 1000, 2000]) for (const dampingRatio of [.25, .5, 1]) {
    const coarse = await layerTrial({ stiffness, dampingRatio }), fine = await layerTrial({ stiffness, dampingRatio, hz: 960 });
    assert.ok(Math.abs(coarse.work - fine.work) / fine.work <= .1, JSON.stringify({ coarse: coarse.work, fine: fine.work, stiffness, dampingRatio }));
  }
});


/** Node plane-pressure stand, rapier-coordinate, 120 Hz: angular motion does not release a loaded point. */
test("an admitted point keeps its layer through rotation and forks until physical release", async () => {
  const { NullEngine } = await import("@babylonjs/core/Engines/nullEngine.js");
  const { Scene } = await import("@babylonjs/core/scene.js");
  const { TransformNode } = await import("@babylonjs/core/Meshes/transformNode.js");
  const { Quaternion, Vector3 } = await import("@babylonjs/core/Maths/math.vector.js");
  const { createWorld } = await import("../src/core/world.ts");
  const { saveState, loadState } = await import("../src/core/state.ts");
  const { freshEngine } = await import("./harness/core-stand.mjs");
  const rig = async () => {
    const engine = new NullEngine(), scene = new Scene(engine), world = createWorld(scene, await freshEngine("rapier-coordinate"), { gravity: false });
    const node = new TransformNode("point", scene); node.position.y = -.101; node.rotationQuaternion = Quaternion.Identity();
    const fixed = new TransformNode("slab", scene); fixed.rotationQuaternion = Quaternion.Identity();
    const mass = { mass: 1, centre: [0, 0, 0], moments: [.001, .001, .001], orientation: Quaternion.Identity() };
    const point = world.physics.addBody(node, [{ kind: "sphere", centre: [0, 0, 0], radius: .05 }], mass,
      { materials: [{ point: { direction: [0, 1, 0], alignment: .5, depth: .008 } }] });
    const slab = world.physics.addBody(fixed, [{ kind: "box", centre: [0, 0, 0], size: [20, .1, 4] }], mass,
      { materials: [{ layer: { stiffness: 500, dampingRatio: .5, depth: .008 } }] }); slab.setFixed(true);
    const force = new Vector3(), torque = new Vector3();
    return { world, point, releases: 0, loaded: 0, advance() {
      const step = world.steps;
      if (step < 240) { point.applyForce(force.set(0, 3, 0), node.position); if (step > 24) point.applyTorque(torque.set(0, 0, .1)); }
      else if (step < 270) point.applyForce(force.set(0, -3, 0), node.position);
      world.step();
      if (world.physics.contactsOf(point).some(c => c.other === slab && c.impulse > 0)) {
        this.loaded++;
        assert.equal(world.contactWork.released.length, 0);
        assert.equal(world.contactWork.active.size, 1);
      }
      this.releases += world.contactWork.released.length;
    }, dispose() { world.dispose(); scene.dispose(); engine.dispose(); } };
  };
  const first = await rig(), twin = await rig();
  try {
    const direction = new Vector3();
    do {
      first.advance(); new Vector3(0, 1, 0).applyRotationQuaternionToRef(first.point.node.rotationQuaternion, direction);
    } while (first.world.steps < 180 && direction.y >= .5);
    assert.ok(direction.y < .5, "the point has rotated outside its initial admission cone");
    const saved = saveState({ world: first.world.state });
    twin.world.physics.load(first.world.physics.save()); loadState({ world: twin.world.state }, saved);
    for (let i = first.world.steps; i < 360; i++) {
      first.advance(); twin.advance();
      assert.deepEqual(twin.world.contactWork, first.world.contactWork);
      assert.deepEqual(twin.point.node.position.asArray(), first.point.node.position.asArray());
      assert.deepEqual(twin.point.node.rotationQuaternion.asArray(), first.point.node.rotationQuaternion.asArray());
    }
    assert.ok(first.loaded > 220);
    assert.equal(first.releases, 1); assert.equal(twin.releases, 1);
    assert.equal(first.world.contactWork.active.size, 0);
  } finally { first.dispose(); twin.dispose(); }
});
