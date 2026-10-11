import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { freshEngine, saveStand, loadStand } from '../tests/harness/core-stand.mjs';
import { createWorld } from '../src/core/world.ts';
import { modelSpec } from '../src/core/models.ts';
import { withSoles } from '../src/core/human/sole.ts';
import { frameOf } from '../src/core/spec/body.ts';

/** Actual boot dimensions and sole law under a declared external load, then free unloading. */
export async function recoverySoleTrial({ model = 'workshop-fighter', weightShare = .5 } = {}) {
  const spec = withSoles(modelSpec(model)), foot = spec.segments.find(s => s.name === 'foot.left');
  assert.equal(foot.shape.kind, 'box');
  assert.ok(weightShare > 0 && Number.isFinite(weightShare));
  const frame = frameOf(foot), axes = [frame.x, frame.y, frame.z];
  assert.ok(axes.every(axis => axis.every(v => v === 0 || Math.abs(v) === 1)), 'the fixture uses an axis-aligned reference boot');
  const size = [0, 1, 2].map(k => axes.reduce((sum, axis, i) => sum + Math.abs(axis[k]) * foot.shape.size.value[i], 0));
  const mass = foot.mass.value;
  const sole = Object.fromEntries(Object.entries(foot.surface.sole).map(([k, q]) => [k, q.value]));
  const engine = new NullEngine(), scene = new Scene(engine), world = createWorld(scene, await freshEngine('rapier-coordinate'));
  const physics = world.physics, gravity = -physics.gravity[1];
  physics.addFixedBox([0, -.5, 0], [4, 1, 4]);
  const node = new TransformNode('loaded recovery sole', scene);
  node.position.y = size[1] / 2; node.rotationQuaternion = Quaternion.Identity();
  const moments = [0, 1, 2].map(k => axes.reduce((sum, axis, i) => sum + Math.abs(axis[k]) * foot.inertia.value[i], 0));
  const body = physics.addBody(node, [{ kind: 'box', centre: [0, 0, 0], size }],
    { mass, centre: [0, 0, 0], moments, orientation: Quaternion.Identity() }, { materials: [{ sole }] });
  const force = Math.max(0, spec.segments.reduce((sum, s) => sum + s.mass.value, 0) * gravity * weightShare - mass * gravity);
  const load = new Vector3(0, -force, 0), velocity = new Vector3(), spin = new Vector3();
  const read = () => {
    body.linearVelocityToRef(velocity); body.angularVelocityToRef(spin);
    const compression = Math.max(0, size[1] / 2 - node.position.y);
    return { compression, speed: velocity.length(), energy: .5 * mass * velocity.lengthSquared()
      + .5 * moments.reduce((sum, value, i) => sum + value * [spin.x, spin.y, spin.z][i] ** 2, 0)
      + mass * gravity * (node.position.y - size[1] / 2) + .5 * sole.stiffness * compression * compression };
  };
  try {
    for (let i = 0; i < 240; i++) { body.applyForce(load, node.position); world.step(); }
    const loaded = read(), expectedLoaded = (force + mass * gravity) / sole.stiffness, checkpoint = saveStand(world, {});
    const unload = () => {
      const trace = []; let peakEnergy = loaded.energy, peakCompression = loaded.compression;
      for (let i = 0; i < 240; i++) {
        world.step(); const row = read(); trace.push(row);
        peakEnergy = Math.max(peakEnergy, row.energy); peakCompression = Math.max(peakCompression, row.compression);
      }
      return { trace, final: read(), peakEnergy, peakCompression };
    };
    const released = unload(); loadStand(world, {}, checkpoint);
    assert.deepEqual(unload(), released, 'loaded-contact unloading must replay exactly');
    const expectedUnloaded = mass * gravity / sole.stiffness;
    return { harness: 'Node isolated Warrior/Rogue boot with declared vertical payload; World.step', model, engine: physics.engine,
      revision: physics.revision, hz: world.hz, size, mass, sole, weightShare, force, loaded, expectedLoaded, expectedUnloaded,
      final: released.final, peakCompression: released.peakCompression, energyIncrease: released.peakEnergy - loaded.energy,
      replay: true, pass: Math.abs(loaded.compression - expectedLoaded) < .0002
        && Math.abs(released.final.compression - expectedUnloaded) < .0002 && released.final.speed < .001
        && released.peakCompression <= sole.depth + .002 && released.peakEnergy - loaded.energy < .001 };
  } finally { world.dispose(); scene.dispose(); engine.dispose(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  for (const model of ['workshop-fighter', 'workshop-rogue']) for (const weightShare of [.5, 1])
    console.log(JSON.stringify(await recoverySoleTrial({ model, weightShare })));
}
