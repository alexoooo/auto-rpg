import test from "node:test";
import assert from "node:assert/strict";
import { createRapierPhysics, rapierModule } from "../src/core/physics/rapier.ts";
import { Quaternion, Vector3 } from "../src/core/math/vector.ts";

async function articulatedToe(pitch = 0) {
  const R = await rapierModule(), physics = createRapierPhysics(R, { hz: 120, gravity: false });
  const pose = (name, rotation) => ({ name, position: new Vector3(0, .001, 0), rotation });
  const parent = physics.addBody(pose("foot", new Quaternion(Math.sin(pitch / 2), 0, 0, Math.cos(pitch / 2))),
    [{ kind: "box", centre: [0, .03, -.1], size: [.1, .06, .2] }],
    { mass: 1, centre: [0, .03, -.1], moments: [.01, .01, .01], orientation: Quaternion.Identity() });
  parent.setFixed(true);
  const child = physics.addBody(pose("toe", Quaternion.Identity()),
    [{ kind: "box", centre: [0, .0125, .03], size: [.1, .025, .06] }],
    { mass: .05, centre: [0, .0125, .03], moments: [.00002, .00006, .00004], orientation: Quaternion.Identity() });
  const raw = physics.raw, zero = { x: 0, y: 0, z: 0 }, axis = { x: 1, y: 0, z: 0 };
  const hinge = raw.createMultibodyJoint(R.JointData.revolute(zero, zero, axis), parent.rigid, child.rigid, true);
  hinge.setContactsEnabled(false);
  const motor = raw.createImpulseJoint(R.JointData.generic(zero, zero, axis, 0), parent.rigid, child.rigid, true);
  motor.setContactsEnabled(false);
  const set = raw.impulseJoints.raw, stiffness = 25;
  set.jointConfigureMotorModel(motor.handle, R.JointAxis.AngX, R.MotorModel.ForceBased);
  set.jointConfigureMotorPosition(motor.handle, R.JointAxis.AngX, 0, stiffness, 0);
  set.jointSetMotorMaxForce(motor.handle, R.JointAxis.AngX, 1000);
  return { R, physics, raw, child, stiffness, motor, set };
}

test("an articulated force-based angular spring uses radians", async () => {
  const f = await articulatedToe(), applied = 2, torque = new Vector3(applied, 0, 0), dt = 1 / 120;
  try {
    for (let step = 0; step < 480; step++) { f.child.applyTorque(torque); f.physics.step(dt); }
    const q = f.child.pose.rotation, angle = 2 * Math.atan2(q.x, q.w);
    assert.ok(Math.abs(angle) > .01, "fixture did not load its spring");
    assert.ok(Math.abs(angle - applied / f.stiffness) < 1e-4, `angle ${angle}, expected ${applied / f.stiffness}`);
    const balancing = -f.set.jointMotorStepImpulse(f.motor.handle, f.R.JointAxis.AngX) / dt;
    assert.ok(Math.abs(balancing + applied) < 1e-4, `balancing torque ${balancing}, applied ${applied}`);
  } finally { f.physics.dispose(); }
});

test("an articulated contact enforces its material compression cap", async () => {
  const f = await articulatedToe(.5), cap = .0005;
  let calls = 0;
  try {
    f.physics.addFixedBox([0, -.5, 0], [10, 1, 10]);
    const collider = f.child.rigid.collider(0), step = f.raw.step.bind(f.raw);
    collider.setActiveHooks(collider.activeHooks() | f.R.ActiveHooks.MODIFY_SOLVER_CONTACTS);
    f.raw.step = (events, hooks) => step(events, { ...hooks, contactLayer: (a, b) => {
      if (a !== collider.handle && b !== collider.handle) return null;
      calls++; return [1e6, 0, cap];
    } });
    for (let step = 0; step < 480; step++) f.physics.step(1 / 120);
    assert.ok(calls > 0 && f.physics.contactsOf(f.child).some(c => c.impulse > 0), "fixture did not bear on its material contact");
    let depth = 0;
    for (const x of [-.05, .05]) for (const y of [0, .025]) for (const z of [0, .06]) {
      const corner = new Vector3(x, y, z).applyRotationQuaternionToRef(f.child.pose.rotation, new Vector3()).add(f.child.pose.position);
      depth = Math.max(depth, -corner.y);
    }
    assert.ok(depth <= cap + 1e-6, `compression ${depth}, cap ${cap}`);
  } finally { f.physics.dispose(); }
});

test("a contact-layer callback defect reaches the world-step caller unchanged", async () => {
  const R = await rapierModule(), world = new R.World({ x: 0, y: 0, z: 0 }), queue = new R.EventQueue(true);
  const failure = new Error("contact layer failed"), marker = {}, hooks = Object.freeze({ marker,
    filterContactPair(...args) { assert.equal(this.marker, marker); assert.equal(args.length, 4); return R.SolverFlags.COMPUTE_IMPULSE; },
    contactLayer() { assert.equal(this.marker, marker); calls++; throw failure; } });
  let calls = 0;
  try {
    const body = world.createRigidBody(R.RigidBodyDesc.dynamic());
    const flags = R.ActiveHooks.MODIFY_SOLVER_CONTACTS | R.ActiveHooks.FILTER_CONTACT_PAIRS;
    world.createCollider(R.ColliderDesc.ball(1).setActiveHooks(flags), body);
    world.createCollider(R.ColliderDesc.ball(1).setTranslation(.5, 0, 0).setActiveHooks(flags));
    assert.throws(() => world.step(queue, hooks), error => error === failure);
    assert.ok(calls > 0, "fixture did not reach its contact material hook");
  } finally { queue.free(); world.free(); }
});
