import assert from 'node:assert/strict';
import test from 'node:test';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { PhysicsConstraintAxis } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js';
import { CONFIG } from '../src/config.ts';
import { stepPair } from '../src/fighter.ts';
import { humanMind, idleMind, NEUTRAL } from '../src/mind.ts';
import { boxPart, joint } from '../src/rig.ts';
import { Golem } from '../src/golem/golem.ts';
import { defaultGolemSetup } from '../src/golem/build.ts';
import { TORSO_PLAIN, TORSO_PLATED } from '../src/golem/config.ts';
import { JointActuator, JointServo } from '../src/golem/joint-servo.ts';
import { flatSupportedWorldRegistry } from '../src/supported-locomotion-production.ts';
import { createHeadlessArena } from './harness/golem-headless-arena.mjs';

const DT = 1 / CONFIG.world.physicsHz;
const step = (scene, ms = DT * 1000) => {
  scene._renderId++;
  scene._advancePhysicsEngineStep(ms);
};

test('a physical joint tracks continuous targets, permits direct velocity control, and releases', async () => {
  const arena = await createHeadlessArena({ populateDefaultGeometry: false });
  const { scene } = arena;
  scene.getPhysicsEngine().setGravity(Vector3.Zero());
  const parent = boxPart(scene, { name: 'parent', position: new Vector3(0, 2, 0),
    size: new Vector3(.4, .4, .4), mass: 20, layer: 0, collidesWith: 0 });
  const child = boxPart(scene, { name: 'child', position: new Vector3(0, 2, 0),
    size: new Vector3(.2, .2, .2), mass: 5, layer: 0, collidesWith: 0 });
  const hinge = joint(scene, parent, child, { pivotParent: Vector3.Zero(),
    pivotChild: Vector3.Zero(), swing: { x: { min: -1.4, max: 1.4 } } });
  const angle = () => parent.mesh.rotationQuaternion.conjugate()
    .multiply(child.mesh.rotationQuaternion).toEulerAngles().x;
  const actuator = new JointActuator(hinge, PhysicsConstraintAxis.ANGULAR_X);
  const servo = new JointServo(actuator, angle);
  for (const part of [parent, child]) scene.getPhysicsEngine().getPhysicsPlugin().setActivationControl(part.body, 1);
  try {
    let error = 0;
    // Positive and negative continuous targets, without gestures or an attack state machine.
    for (let i = 0; i < 720; i++) {
      const target = .45 * Math.sin(i * DT * 3);
      servo.track(target, DT, 1);
      step(scene);
      if (i > 120) error = Math.max(error, Math.abs(angle() - target));
    }
    assert.ok(error < .025, `continuous tracking error ${error} rad`);
    assert.ok(Math.abs(parent.mesh.rotationQuaternion.toEulerAngles().x) > .005,
      'the physical parent must receive the opposite reaction');
    // Replace the controller, not the body. No servo callback may secretly oppose this command.
    const start = angle();
    for (let i = 0; i < 120; i++) { actuator.drive(-.6, 1); step(scene); }
    assert.ok(angle() < start - .2, 'direct low-level velocity commands must own the actuator');
    // A small effort ceiling must not erase a large externally applied angular impulse.
    child.body.applyAngularImpulse(new Vector3(.05, 0, 0));
    const velocity = child.body.getAngularVelocity().x;
    servo.seed(angle());
    servo.track(angle(), DT, .01);
    step(scene);
    assert.ok(child.body.getAngularVelocity().x > velocity * .5, 'motor strength must be finite');
    actuator.release();
    const released = child.body.getAngularVelocity().x;
    for (let i = 0; i < 12; i++) { actuator.drive(-100, 10000); step(scene); }
    assert.ok(Math.abs(child.body.getAngularVelocity().x - released) < .02,
      'a released actuator must ignore subsequent commands');
  } finally { arena.dispose(); }
});

const builds = [
  ['default', {}],
  ['plated ram', { torso: 'torso.plated', head: 'head.ram' }],
  ['wheel', { locomotion: 'locomotion.wheel' }],
  ['multileg', { locomotion: 'locomotion.multileg' }],
];

for (const [label, overrides] of builds) {
  for (const frames of [[1000 / 60], [8, 27, 11, 42, 16]]) {
    test(`${label} stays coordinated through startup, human movement and aiming (${frames.length} frame timings)`, async () => {
      const arena = await createHeadlessArena();
      const { scene } = arena;
      const world = flatSupportedWorldRegistry();
      const sources = [0, 1].map(() => ({ state: structuredClone(NEUTRAL) }));
      const pair = ['left', 'right'].map((side, i) => new Golem(scene, {
        side, origin: new Vector3(i ? 4 : -4, 0, 0), facing: i * Math.PI,
        setup: { ...defaultGolemSetup(), ...overrides }, mind: humanMind(sources[i]),
        controlPolicies: [], locomotionWorld: world,
      }));
      const plugin = scene.getPhysicsEngine().getPhysicsPlugin();
      for (const g of pair) for (const { part } of g.limbs) plugin.setActivationControl(part.body, 1);
      let clock = 0, frame = 0, maxTilt = 0, settledTilt = 0, maxSpeed = 0;
      const starts = pair.map(g => g.limbs[0].part.mesh.position.clone());
      const headings = pair.map(g => g.limbs[0].part.mesh.rotationQuaternion.clone());
      const torso = pair.map(g => g.limbs.find(l => l.key.endsWith('trunk.core')).part);
      const head = pair.map(g => g.limbs.find(l => l.key.endsWith('head.head')).part);
      const before = scene.onBeforePhysicsObservable.add(() => {
        for (const source of sources) {
          const a = source.state;
          a.forward = clock >= 2 && clock < 3 ? 1 : clock >= 3 && clock < 4 ? -1 : 0;
          a.strafe = clock >= 4 && clock < 5 ? .6 : 0;
          a.turn = clock >= 5 && clock < 6 ? .3 : 0;
          a.primary.pointerX = clock >= 2 && clock < 6 ? .7 * Math.sin((clock - 2) * Math.PI * 4) : 0;
          a.primary.pointerY = clock >= 2 && clock < 6 ? .25 * Math.sin((clock - 2) * Math.PI * 2) : 0;
        }
        stepPair(...pair, DT, clock);
        clock += DT;
      });
      const after = scene.onAfterPhysicsObservable.add(() => {
        for (const part of [...torso, ...head]) {
          const up = Vector3.Up().applyRotationQuaternion(part.mesh.rotationQuaternion);
          const tilt = Math.acos(Math.max(-1, Math.min(1, up.y))) * 180 / Math.PI;
          assert.ok(Number.isFinite(tilt));
          maxTilt = Math.max(maxTilt, tilt);
          if (clock >= 6.5) settledTilt = Math.max(settledTilt, tilt);
        }
        for (const g of pair) for (const { part } of g.limbs) {
          const speed = part.body.getLinearVelocity().length();
          assert.ok(Number.isFinite(speed));
          maxSpeed = Math.max(maxSpeed, speed);
        }
      });
      try {
        while (clock < 8) step(scene, frames[frame++ % frames.length]);
        // The same neck motor carries extra plate mass on the ram: allow its measured load response.
        assert.ok(maxTilt < (label === 'plated ram' ? 5 : 3), `uncommanded tilt reached ${maxTilt.toFixed(3)} degrees`);
        assert.ok(settledTilt < .5, `still tilted ${settledTilt.toFixed(3)} degrees after stopping`);
        for (const [i, g] of pair.entries()) {
          assert.ok(Vector3.Distance(starts[i], g.limbs[0].part.mesh.position) > .5, 'must actually walk');
          assert.ok(2 * Math.acos(Math.min(1, Math.abs(Quaternion.Dot(headings[i], g.limbs[0].part.mesh.rotationQuaternion)))) > .1, 'must actually turn');
          assert.ok(g.effectorView('primary').anchorStray < .005, 'hand must return to its target');

        }
        assert.ok(maxSpeed > 1, 'the scenario must actually move the limbs');
        scene.onAfterPhysicsObservable.remove(after);
        // Both axes together, on both headings: a two-axis joint must not confuse pitch and yaw.
        for (const source of sources) {
          source.state.posture.trunkLean = .5;
          source.state.posture.trunkTwist = -.6;
        }
        while (clock < 10) step(scene, frames[frame++ % frames.length]);
        const limits = overrides.torso === 'torso.plated' ? TORSO_PLATED : TORSO_PLAIN;
        for (let i = 0; i < pair.length; i++) {
          const relative = pair[i].limbs[0].part.mesh.rotationQuaternion.conjugate()
            .multiply(torso[i].mesh.rotationQuaternion).toEulerAngles();
          assert.ok(Math.abs(relative.x - limits.leanMax * .5) < .02, 'combined pitch must track');
          assert.ok(Math.abs(relative.y + limits.twistMax * .6) < .02, 'combined yaw must track');
        }
        // Ownership changes replace the command source, never the body or its current transform.
        const beforeHandover = torso.map(part => part.mesh.position.clone());
        pair.forEach(g => { g.mind = idleMind(); });
        step(scene);
        torso.forEach((part, i) => assert.ok(Vector3.Distance(beforeHandover[i], part.mesh.position) < .01,
          'handover must not teleport the trunk'));
        while (clock < 12) step(scene, frames[frame++ % frames.length]);
        for (const part of torso) {
          const up = Vector3.Up().applyRotationQuaternion(part.mesh.rotationQuaternion);
          assert.ok(up.y > .999, 'the replacement controller must recover upright');
        }
      } finally {
        scene.onBeforePhysicsObservable.remove(before);
        scene.onAfterPhysicsObservable.remove(after);
        pair.forEach(g => g.dispose());
        arena.dispose();
      }
    });
  }
}

for (const frameMs of [1000 / 60, 1000 / 30]) {
 for (const vertical of [-1, 1]) {
  test(`raised arms settle after a broad player sweep with ${Math.round(1000 / frameMs)} Hz input, vertical ${vertical}`, async () => {
    const arena = await createHeadlessArena();
    const { scene } = arena;
    const world = flatSupportedWorldRegistry();
    const source = { state: structuredClone(NEUTRAL) };
    source.state.primary.reach = 1 / 7;
    source.state.secondary.reach = 1 / 7;
    const pair = ['left', 'right'].map((side, i) => new Golem(scene, {
      side, origin: new Vector3(0, 0, i * 8), facing: i * Math.PI,
      setup: defaultGolemSetup(), mind: humanMind(source), controlPolicies: [], locomotionWorld: world,
    }));
    for (const g of pair) for (const { part } of g.limbs)
      scene.getPhysicsEngine().getPhysicsPlugin().setActivationControl(part.body, 1);
    let clock = 0, peak = 0, residual = 0;
    const before = scene.onBeforePhysicsObservable.add(() => { stepPair(...pair, DT, clock); clock += DT; });
    const after = scene.onAfterPhysicsObservable.add(() => {
      for (const g of pair) for (const { part } of g.limbs) {
        const speed = part.body.getLinearVelocity().length();
        if (clock >= 2 && clock < 3) peak = Math.max(peak, speed);
        if (clock >= 4.5) residual = Math.max(residual, speed);
      }
    });
    try {
      for (let elapsed = 0; elapsed < 7; elapsed += frameMs / 1000) {
        // Real input changes once per display frame, then holds through the solver substeps.
        // Hold the LAST raised pose after the sweep, rather than quietly returning to neutral.
        if (elapsed >= 2 && elapsed < 3) {
          source.state.primary.pointerX = .8 * Math.sin((elapsed - 2) * Math.PI * 4);
          source.state.primary.pointerY = vertical * .8 * Math.cos((elapsed - 2) * Math.PI * 2);
        }
        step(scene, frameMs);
      }
      assert.ok(peak > 5, `the sweep must actually move the weapon: ${peak}`);
      assert.ok(residual < .03, `limbs kept moving after holding the cursor still: ${residual} m/s`);
    } finally {
      scene.onBeforePhysicsObservable.remove(before);
      scene.onAfterPhysicsObservable.remove(after);
      pair.forEach(g => g.dispose()); arena.dispose();
    }
  });
 }
}
