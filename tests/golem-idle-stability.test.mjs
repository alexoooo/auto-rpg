import assert from 'node:assert/strict';
import test from 'node:test';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { CONFIG } from '../src/config.ts';
import { stepPair } from '../src/fighter.ts';
import { Golem } from '../src/golem/golem.ts';
import { defaultGolemSetup } from '../src/golem/build.ts';
import { idleMind } from '../src/mind.ts';
import { flatSupportedWorldRegistry } from '../src/supported-locomotion-production.ts';
import { createHeadlessArena } from './harness/golem-headless-arena.mjs';
import { boxPart } from '../src/rig.ts';
import { AnchorDrive, DEFAULT_ANCHOR_AXES } from '../src/golem/anchor-drive.ts';

const FIXED = 1 / CONFIG.world.physicsHz;

test('a mounted arm drive starts in place, exchanges momentum, and releases its target', async () => {
  const arena = await createHeadlessArena({ populateDefaultGeometry: false });
  const { scene } = arena;
  scene.getPhysicsEngine().setGravity(Vector3.Zero());
  const rotation = Quaternion.RotationYawPitchRoll(0.7, 0.3, -0.2);
  const origin = new Vector3(1, 2, 3);
  const socket = new Vector3(0.2, 0, 0);
  const local = new Vector3(0.8, 0, 0);
  const world = () => local.rotateByQuaternionToRef(rotation, new Vector3()).add(origin);
  const reference = boxPart(scene, { name: 'reference', position: origin, rotation,
    size: new Vector3(0.2, 0.2, 0.2), mass: 20, layer: 0, collidesWith: 0 });
  const target = boxPart(scene, { name: 'target', position: world(), rotation,
    size: new Vector3(0.1, 0.1, 0.1), mass: 5, layer: 0, collidesWith: 0 });
  const drive = new AnchorDrive(scene, { name: 'mounted', reference, referencePivot: socket,
    target, position: world(), rotation,
    parameters: { ...DEFAULT_ANCHOR_AXES, angular: [] } });
  const step = () => { scene._renderId++; scene._advancePhysicsEngineStep(1000 * FIXED); };
  const momentum = () => reference.body.getLinearVelocity().scale(20)
    .add(target.body.getLinearVelocity().scale(5)).length();
  try {
    for (const part of [reference, target]) {
      scene.getPhysicsEngine().getPhysicsPlugin().setActivationControl(part.body, 1);
    }
    const initial = target.mesh.position.clone();
    for (let i = 0; i < 120; i++) step();
    assert.ok(Vector3.Distance(initial, target.mesh.position) < 1e-5,
      'construction must initialize the local motor target before the first solver step');
    local.x += 0.2;
    const wanted = world();
    for (let i = 0; i < 120; i++) {
      drive.drive(FIXED, wanted, rotation);
      step();
      if (i === 0) {
        const applied = target.body.getLinearVelocity().length() * 5;
        assert.ok(applied > 0.1, 'the first driven step must apply a measurable impulse');
        assert.ok(momentum() < applied * 0.01,
          'the initial arm impulse must have an opposite reaction within solver precision');
      }
    }
    assert.ok(Vector3.Distance(initial, target.mesh.position) > 0.1, 'the arm must actually move');
    assert.ok(Vector3.Distance(origin, reference.mesh.position) > 0.01, 'the reference must receive the reaction');
    assert.ok(drive.stray() < 0.001, 'a rotated reference must reach the world command');
    drive.release();
    const freeVelocity = new Vector3(0, 0, 1);
    target.body.setLinearVelocity(freeVelocity);
    for (let i = 0; i < 60; i++) {
      drive.drive(FIXED, initial, rotation);
      step();
    }
    assert.ok(Vector3.Distance(target.body.getLinearVelocity(), freeVelocity) < 1e-5,
      'a released drive must exert no force even if it receives another command');
  } finally {
    drive.dispose();
    arena.dispose();
  }
});

for (const chain of ['wrist', 'reach']) {
  for (const frames of [[1000 / 60], [8, 27, 11, 42, 16]]) {
    test(`idle ${chain} arms settle with ${frames.length === 1 ? 'steady' : 'jittered'} frames and recover from a shove`, async () => {
      const arena = await createHeadlessArena();
      const { scene } = arena;
      const world = flatSupportedWorldRegistry();
      const setup = defaultGolemSetup();
      setup.primary = { ...setup.primary, chain };
      setup.secondary = { ...setup.secondary, chain };
      // Opposite headings, well outside contact range: no collision can explain the shaking.
      const pair = ['left', 'right'].map((side, i) => new Golem(scene, {
        side, origin: new Vector3(0, 0, i * 6), facing: i * Math.PI,
        setup, mind: idleMind(), controlPolicies: [], locomotionWorld: world,
      }));
      const plugin = scene.getPhysicsEngine().getPhysicsPlugin();
      const beforeBodies = plugin.numBodies;
      let clock = 0;
      let frame = 0;
      const control = scene.onBeforePhysicsObservable.add(() => {
        stepPair(...pair, FIXED, clock);
        clock += FIXED;
      });
      for (const golem of pair) for (const { part } of golem.limbs) {
        plugin.setActivationControl(part.body, 1);
      }
      const run = seconds => {
        const end = clock + seconds;
        while (clock < end) {
          scene._renderId++;
          scene._advancePhysicsEngineStep(frames[frame++ % frames.length]);
        }
      };
      const assertSettled = () => {
        const parts = pair.flatMap(golem => golem.limbs.map(limb => limb.part));
        const origins = parts.map(part => part.mesh.position.clone());
        let movement = 0;
        let speed = 0;
        let stray = 0;
        // Sample every solver step, so a frame rate cannot alias a fast oscillation away.
        const sample = scene.onAfterPhysicsObservable.add(() => {
          parts.forEach((part, i) => {
            movement = Math.max(movement, Vector3.Distance(part.mesh.position, origins[i]));
            speed = Math.max(speed, part.body.getLinearVelocity().length());
          });
          for (const golem of pair) for (const hand of ['primary', 'secondary']) {
            const view = golem.effectorView(hand);
            assert.ok(view && Number.isFinite(view.anchorStray));
            stray = Math.max(stray, view.anchorStray);
          }
        });
        run(3);
        scene.onAfterPhysicsObservable.remove(sample);
        assert.ok(movement < 0.001, `idle bodies moved ${movement * 1000} mm`);
        assert.ok(speed < 0.01, `idle body speed reached ${speed} m/s`);
        assert.ok(stray < 0.001, `hand missed its commanded point by ${stray * 1000} mm`);
      };
      try {
        run(4);
        assertSettled();
        const torso = pair[0].limbs.find(limb => limb.key.endsWith('trunk.core')).part;
        const atRest = torso.mesh.position.clone();
        torso.body.applyImpulse(new Vector3(0, 0, 20), torso.mesh.position);
        let displaced = 0;
        const sample = scene.onAfterPhysicsObservable.add(() => {
          displaced = Math.max(displaced, Vector3.Distance(torso.mesh.position, atRest));
        });
        run(1);
        scene.onAfterPhysicsObservable.remove(sample);
        assert.ok(displaced > 0.001, `the torso must respond physically to a shove: ${displaced} m`);
        run(5);
        assertSettled();
        assert.equal(plugin.numBodies, beforeBodies, 'settling must not replace or remove bodies');
      } finally {
        scene.onBeforePhysicsObservable.remove(control);
        for (const golem of pair) golem.dispose();
        arena.dispose();
      }
    });
  }
}
