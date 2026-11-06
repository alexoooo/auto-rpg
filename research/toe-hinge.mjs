/**
 * Isolate a light toe spring from a gait. Free torque, loaded tip and heel-up ground cases use
 * coordinate Rapier, the core's solver settings and a synthetic 50 g slab. Stiffness and damping
 * use the toe model in SOURCES["falisse-2022-toes"]. Optional contact-layer and inertia controls
 * diagnose numerical conditioning; their values are fixture settings, not a proposed anatomy.
 *
 * node research/toe-hinge.mjs --mode native|layer|conditioning --pitch 0.5 --out <file.json>
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { loadEngine } from '../src/core/physics/engines.ts';
import { rapierModule } from '../src/core/physics/rapier.ts';
import { Quaternion, Vector3 } from '../src/core/math/vector.ts';
import { sin, cos, atan2 } from '../src/core/math/real.ts';

const { values: options } = parseArgs({ options: { mode: { type: 'string', default: 'native' },
  pitch: { type: 'string', default: '0.5' }, frequency: { type: 'string', default: '0' }, out: { type: 'string' } } });
const configurations = {
  native: [null, 'tip-load', 'toeoff'].flatMap(contact => [0, 2].map(damping => ({ contact, damping, layer: false, inertiaScale: 1 }))),
  layer: [0, 2].flatMap(damping => [false, true].map(layer => ({ contact: 'toeoff', damping, layer, inertiaScale: 1 }))),
  conditioning: [1, 10, 100].map(inertiaScale => ({ contact: 'toeoff', damping: 2, layer: true, inertiaScale })),
};
if (!options.out || !Object.hasOwn(configurations, options.mode)) throw Error('--out and --mode native, layer or conditioning name the experiment');
const contactPitch = Number(options.pitch);
if (!Number.isFinite(contactPitch) || contactPitch < 0 || contactPitch > Math.PI / 2) throw Error('--pitch lies between zero and pi/2 radians');
const frequency = Number(options.frequency);
if (!Number.isFinite(frequency) || frequency < 0) throw Error('--frequency is nonnegative Hz');

const fixture = Object.freeze({ mass: .05, width: .1, length: .06, thickness: .025, stiffness: 25,
  seconds: 4, ramp: 1, readLast: 1, torque: 2, force: 500,
  layerStiffness: 1e6, layerDamping: 0, layerDepth: .0005, amplitude: .25 });
const engine = await loadEngine('rapier-coordinate'), R = await rapierModule();

async function play({ hz, contact, damping, layer, inertiaScale }) {
  const physics = engine.createPhysics({ hz, gravity: false });
  try {
    const pitch = contact ? contactPitch : 0, height = contact === 'toeoff' ? .001 : contact ? .05 : 1;
    const rotation = new Quaternion(sin(pitch / 2), 0, 0, cos(pitch / 2));
    const pose = name => ({ name, position: new Vector3(0, height, 0), rotation: rotation.clone() });
    const base = physics.addBody(pose('held-foot'), [{ kind: 'box', centre: [0, .03, -.1], size: [.1, .06, .2] }],
      { mass: 1, centre: [0, .03, -.1], moments: [.01, .01, .01], orientation: Quaternion.Identity() });
    base.setFixed(true);
    if (frequency && contact === 'toeoff') base.rigid.setBodyType(R.RigidBodyType.KinematicPositionBased, true);
    const { mass, width, length, thickness } = fixture, toePose = pose('toe');
    if (contact === 'toeoff') toePose.rotation = Quaternion.Identity();
    const moments = [mass * (length ** 2 + thickness ** 2) / 12, mass * (width ** 2 + length ** 2) / 12,
      mass * (width ** 2 + thickness ** 2) / 12].map(value => value * inertiaScale);
    const toe = physics.addBody(toePose, [{ kind: 'box', centre: [0, thickness / 2, length / 2], size: [width, thickness, length] }],
      { mass, centre: [0, thickness / 2, length / 2], moments, orientation: Quaternion.Identity() });
    const joint = physics.addJoint(base, toe, { anchorParent: [0, 0, 0], anchorChild: [0, 0, 0],
      frameParent: Quaternion.Identity(), frameChild: Quaternion.Identity(), limits: [[-Math.PI / 2, Math.PI / 2]] });
    if (contact) physics.addFixedBox([0, -.5, 0], [10, 1, 10]);
    if (layer) {
      const raw = physics.raw, step = raw.step.bind(raw), collider = toe.rigid.collider(0);
      collider.setActiveHooks(collider.activeHooks() | R.ActiveHooks.MODIFY_SOLVER_CONTACTS);
      raw.step = (events, hooks) => step(events, { ...hooks, contactLayer: (a, b) => a === collider.handle || b === collider.handle
        ? [fixture.layerStiffness, fixture.layerDamping, fixture.layerDepth] : null });
    }
    const samples = [], dt = 1 / hz, centre = new Vector3(), spin = new Vector3(), parentSpin = new Vector3();
    for (let i = 0; i < fixture.seconds * hz; i++) {
      joint.setSpring(0, 0, fixture.stiffness, 1000, 1000);
      if (damping) {
        // The public spring is undamped; flush it before applying the native damping control.
        const native = joint.raw;
        native.rawSet.jointConfigureMotorPosition(native.handle, R.JointAxis.AngX, 0, fixture.stiffness, damping);
      }
      const load = Math.min(1, (i + 1) / (fixture.ramp * hz));
      if (frequency && contact === 'toeoff') {
        const moving = pitch + fixture.amplitude * sin(2 * Math.PI * frequency * (i + 1) * dt);
        base.rigid.setNextKinematicRotation({ x: sin(moving / 2), y: 0, z: 0, w: cos(moving / 2) });
      }
      if (contact === 'tip-load') {
        centre.set(0, thickness / 2, length / 2).applyRotationQuaternionToRef(toe.pose.rotation, centre).addInPlace(toe.pose.position);
        toe.applyForce(new Vector3(0, -fixture.force * load, 0), centre);
      } else if (contact === null) toe.applyTorque(new Vector3(fixture.torque * load, 0, 0));
      physics.step(dt);
      const q = Quaternion.Inverse(base.pose.rotation).multiply(toe.pose.rotation), angle = 2 * atan2(q.x, q.w);
      let deepest = 0;
      for (const x of [-width / 2, width / 2]) for (const y of [0, thickness]) for (const z of [0, length]) {
        const point = new Vector3(x, y, z).applyRotationQuaternionToRef(toe.pose.rotation, new Vector3()).add(toe.pose.position);
        deepest = Math.max(deepest, -point.y);
      }
      if (i >= (fixture.seconds - fixture.readLast) * hz) samples.push({ angle, deepest,
        spring: joint.motorStepImpulse(0) / dt, speed: toe.angularVelocityToRef(spin).x - base.angularVelocityToRef(parentSpin).x,
        normalImpulseRate: physics.contactsOf(toe).reduce((sum, value) => sum + value.impulse / dt, 0),
        hingeError: toe.pose.position.subtract(base.pose.position).length() });
    }
    const mean = name => samples.reduce((sum, sample) => sum + sample[name], 0) / samples.length;
    return { hz, contact: contact ?? 'free', pitch, frequency: contact === 'toeoff' ? frequency : 0, damping, layer, inertiaScale,
      deepest: mean('deepest'), maxDepth: Math.max(...samples.map(sample => sample.deepest)), angle: mean('angle'),
      freePrediction: contact === null ? fixture.torque / fixture.stiffness : null,
      spring: mean('spring'), staticSpring: -fixture.stiffness * mean('angle'),
      endVelocityLaw: -fixture.stiffness * mean('angle') - damping * mean('speed'),
      normalImpulseRate: mean('normalImpulseRate'), endSpeed: mean('speed'),
      angleRange: Math.max(...samples.map(sample => sample.angle)) - Math.min(...samples.map(sample => sample.angle)),
      hingeError: Math.max(...samples.map(sample => sample.hingeError)) };
  } finally { physics.dispose(); }
}

const rows = [];
for (const hz of [120, 480]) for (const config of configurations[options.mode]) {
  const row = await play({ hz, ...config }); rows.push(row); console.log(JSON.stringify(row));
}
mkdirSync(dirname(options.out), { recursive: true });
writeFileSync(options.out, JSON.stringify({
  question: 'Does a light passive toe retain its spring law and ground clearance under contact?',
  engine: engine.name, revision: engine.revision, mode: options.mode, fixture,
  reading: 'Last-second means. Motor torque is step-integrated; velocity law uses end-step velocity. Contact locations are not used as centres of pressure.', rows,
}, null, 2) + '\n');
