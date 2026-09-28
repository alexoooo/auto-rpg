import assert from 'node:assert/strict';
import test from 'node:test';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { CONFIG } from '../src/config.ts';
import { BODY_OVER_SHIPPED } from '../src/golem/config.ts';
import { stepPair } from '../src/fighter.ts';
import { Golem } from '../src/golem/golem.ts';
import { defaultGolemSetup } from '../src/golem/build.ts';
import { skeletonSetup } from '../src/golem/skeleton/presets.ts';
import { idleMind } from '../src/mind.ts';
import { flatSupportedWorldRegistry } from '../src/supported-locomotion-production.ts';
import { createHeadlessArena } from './harness/golem-headless-arena.mjs';

const FIXED = 1 / CONFIG.world.physicsHz;

/**
 * Named setups rather than chain ids. The two stone rows overwrite the default body's chains, as
 * this test always has; a skeleton's arm cannot be put on a stone body (that is a mixed family and
 * is refused), so its row is the skeleton's own body.
 */
const withChain = (chain) => () => {
  const setup = defaultGolemSetup();
  setup.primary = { ...setup.primary, chain };
  setup.secondary = { ...setup.secondary, chain };
  return setup;
};
const IDLE_SETUPS = { wrist: withChain('wrist'), reach: withChain('reach'), skeleton: () => skeletonSetup() };
/**
 * The shove each row's trunk takes, N.s: 80 on the body it was written for. Stone's trunk and its
 * waist torques both took `BODY_OVER_SHIPPED` in physical contact session 04, so its shove does too;
 * the skeleton's mass did not move.
 */
const SHOVE_NS = { wrist: 80 * BODY_OVER_SHIPPED, reach: 80 * BODY_OVER_SHIPPED, skeleton: 80 };

for (const [name, build] of Object.entries(IDLE_SETUPS)) {
  for (const frames of [[1000 / 60], [8, 27, 11, 42, 16]]) {
    test(`idle ${name} arms settle with ${frames.length === 1 ? 'steady' : 'jittered'} frames and recover from a shove`, async () => {
      const arena = await createHeadlessArena();
      const { scene } = arena;
      const world = flatSupportedWorldRegistry();
      const setup = build();
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
        // Finite joint servos have a small static load error; the endpoint is no longer pinned.
        assert.ok(stray < 0.002, `hand missed its commanded point by ${stray * 1000} mm`);
      };
      try {
        run(4);
        assertSettled();
        const torso = pair[0].limbs.find(limb => limb.key.endsWith('trunk.core')).part;
        const atRest = torso.mesh.position.clone();
        // An impact above the bracing motor budget; small impulses can now be actively caught.
        torso.body.applyImpulse(new Vector3(0, 0, SHOVE_NS[name]), torso.mesh.position);
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
