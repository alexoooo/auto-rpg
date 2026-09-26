import assert from 'node:assert/strict';
import test from 'node:test';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { createHeadlessArena } from './harness/golem-headless-arena.mjs';
import { Golem } from '../src/golem/golem.ts';
import { defaultGolemSetup } from '../src/golem/build.ts';
import { NEUTRAL } from '../src/mind.ts';

/** A mind that hands the body whatever the test has written into `source.state`. */
const scripted = (source) => ({ name: 'scripted', decide: () => source.state });
import { stepPair } from '../src/fighter.ts';
import { flatSupportedWorldRegistry } from '../src/supported-locomotion-production.ts';
import { CHAIN_REACH as R } from '../src/golem/config.ts';
import { CONFIG } from '../src/config.ts';

// The control step is the solver's substep at whatever rate it runs: a clock advanced by a literal
// 1/240 runs at half speed under 120 Hz physics, and every window below then reads the wrong seconds.
const SUBSTEP = 1 / CONFIG.world.physicsHz;

// Compare the actual elbow with the geometric pose requested by the public command axes.
// A stationary hand alone cannot detect an elbow swinging around it.
const elbowError = (g, parts) => {
  const { trunk, upper, local } = parts;
  const axes = g.effectorView('primary').axes;
  const command = name => axes.find(axis => axis.id === name).commanded;
  const beta = Math.acos(Math.max(-1, Math.min(1,
    (command('reach') ** 2 - R.upperLength ** 2 - R.foreLength ** 2) / (2 * R.upperLength * R.foreLength))));
  const alpha = Math.atan2(R.foreLength * Math.sin(beta), R.upperLength + R.foreLength * Math.cos(beta));
  const pitch = command('lift') + Math.PI / 2 - alpha;
  const target = new Vector3(
    R.upperLength * Math.sin(pitch) * Math.sin(command('swing')),
    -R.upperLength * Math.cos(pitch),
    R.upperLength * Math.sin(pitch) * Math.cos(command('swing')),
  ).add(local).applyRotationQuaternion(trunk.mesh.rotationQuaternion).add(trunk.mesh.position);
  const actual = new Vector3(0, -R.upperLength / 2, 0)
    .applyRotationQuaternion(upper.mesh.rotationQuaternion).add(upper.mesh.position);
  return Vector3.Distance(target, actual);
};

for (const hz of [1, 2]) for (const lift of [-.6, 0, .6]) for (const reach of [-.5, .5]) {
 for (const frames of (lift === 0 && reach === .5 ? [[1000 / 60], [1000 / 30], [8, 27, 11, 42, 16]] : [[1000 / 60]])) {
  test(`elbow tracks through ${hz} Hz reversals at lift ${lift}, reach ${reach}, frames ${frames.join("/")}`, async () => {
    const arena = await createHeadlessArena();
    const { scene } = arena;
    const source = { state: structuredClone(NEUTRAL) };
    const world = flatSupportedWorldRegistry();
    const pair = ['left', 'right'].map((side, i) => new Golem(scene, {
      side, origin: new Vector3(0, 0, i * 8), facing: i * Math.PI,
      setup: defaultGolemSetup(), mind: scripted(source), controlPolicies: [], locomotionWorld: world,
    }));
    const parts = pair.map(g => {
      const get = key => g.limbs.find(limb => limb.key.endsWith(key)).part;
      const trunk = get('trunk.core'), collar = get('primary.collar'), upper = get('primary.upperArm');
      return { trunk, upper, local: collar.mesh.position.subtract(trunk.mesh.position)
        .applyRotationQuaternion(trunk.mesh.rotationQuaternion.conjugate()) };
    });
    for (const g of pair) for (const { part } of g.limbs)
      scene.getPhysicsEngine().getPhysicsPlugin().setActivationControl(part.body, 1);
    let clock = 0, maxElbow = 0, maxHand = 0, peakSpeed = 0, residual = 0;
    const before = scene.onBeforePhysicsObservable.add(() => { stepPair(...pair, SUBSTEP, clock); clock += SUBSTEP; });
    const after = scene.onAfterPhysicsObservable.add(() => {
      for (let i = 0; i < pair.length; i++) {
        if (clock >= 2.5 && clock < 5) {
          maxElbow = Math.max(maxElbow, elbowError(pair[i], parts[i]));
          maxHand = Math.max(maxHand, pair[i].effectorView('primary').anchorStray);
          peakSpeed = Math.max(peakSpeed, parts[i].upper.body.getLinearVelocity().length());
        }
        if (clock >= 6) for (const { part } of pair[i].limbs)
          residual = Math.max(residual, part.body.getLinearVelocity().length());
      }
    });
    try {
      let elapsed = 0, frame = 0;
      while (elapsed < 7) {
        source.state.primary.pointerY = lift;
        source.state.primary.reach = reach;
        if (elapsed >= 2 && elapsed < 5)
          source.state.primary.pointerX = .8 * Math.sin((elapsed - 2) * Math.PI * 2 * hz);
        scene._renderId++;
        const ms = frames[frame++ % frames.length];
        scene._advancePhysicsEngineStep(ms);
        elapsed += ms / 1000;
      }
      assert.ok(peakSpeed > .10, 'the elbow must actually sweep');
      assert.ok(maxElbow < (hz === 1 ? .03 : .08), `moving elbow missed by ${maxElbow} m`);
      assert.ok(maxHand < .08, `moving hand missed by ${maxHand} m`);
      assert.ok(residual < .03, `arm still moving a second after the sweep: ${residual} m/s`);
    } finally {
      scene.onBeforePhysicsObservable.remove(before);
      scene.onAfterPhysicsObservable.remove(after);
      pair.forEach(g => g.dispose()); arena.dispose();
    }
  });
}
}

test('coordinated arm yields to a physical obstruction and recovers without stored windup', async () => {
  const arena = await createHeadlessArena();
  const { scene } = arena;
  const world = flatSupportedWorldRegistry();
  const source = { state: structuredClone(NEUTRAL) };
  const pair = ['left', 'right'].map((side, i) => new Golem(scene, {
    side, origin: new Vector3(0, 0, i * 8), facing: i * Math.PI,
    setup: defaultGolemSetup(), mind: scripted(source), controlPolicies: [], locomotionWorld: world,
  }));
  let clock = 0;
  const before = scene.onBeforePhysicsObservable.add(() => { stepPair(...pair, SUBSTEP, clock); clock += SUBSTEP; });
  const advance = seconds => {
    const until = clock + seconds;
    while (clock < until) { scene._renderId++; scene._advancePhysicsEngineStep(1000 / 60); }
  };
  let obstacle;
  try {
    for (const g of pair) for (const { part } of g.limbs)
      scene.getPhysicsEngine().getPhysicsPlugin().setActivationControl(part.body, 1);
    advance(2);
    const forearm = pair[0].limbs.find(l => l.key.endsWith('primary.forearm')).part;
    const beforeImpulse = forearm.mesh.position.clone();
    forearm.body.applyImpulse(new Vector3(0, 0, 30), forearm.mesh.position);
    scene._renderId++; scene._advancePhysicsEngineStep(1000 / 60);
    assert.ok(Vector3.Distance(beforeImpulse, forearm.mesh.position) > .005, 'finite motors must permit impact displacement');
    advance(2);
    assert.ok(pair[0].effectorView('primary').anchorStray < .005, 'arm must recover after impact');
    // Place a world obstacle across the held endpoint: the arm must give way rather than
    // teleporting through it, accumulating command error, or driving against a second anchor.
    const { boxPart } = await import('../src/rig.ts');
    obstacle = boxPart(scene, { name: 'arm-obstruction', position: pair[0].effectorView('primary').anchor.clone(),
      size: new Vector3(.3, .3, .3), mass: 0, layer: 1, collidesWith: 0xffffffff });
    advance(1);
    assert.ok(pair[0].effectorView('primary').anchorStray > .02, 'obstruction must physically block the hand');
    obstacle.body.dispose(); obstacle.shape.dispose(); obstacle.mesh.dispose(); obstacle = null;
    advance(2);
    assert.ok(pair[0].effectorView('primary').anchorStray < .005, 'removing obstruction must restore tracking');
  } finally {
    if (obstacle) { obstacle.body.dispose(); obstacle.shape.dispose(); obstacle.mesh.dispose(); }
    scene.onBeforePhysicsObservable.remove(before);
    pair.forEach(g => g.dispose()); arena.dispose();
  }
});
