import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { Scene } from "@babylonjs/core/scene.js";
import { createRapierPhysics, rapierModule } from "../src/core/engine/rapier.ts";

test("Rapier's effort sum retains each saturated impulse at high substep counts", async () => {
  const R = await rapierModule();
  for (const count of [16, 32, 64, 128, 256, 512]) for (const sense of [-1, 1]) {
    const engine = new NullEngine(), scene = new Scene(engine);
    const physics = createRapierPhysics(R, { hz: 120, gravity: false });
    try {
      physics.raw.numSolverIterations = count;
      const bodies = ["parent", "rotor"].map((name) => {
        const node = new TransformNode(name, scene);
        node.rotationQuaternion = Quaternion.Identity();
        return physics.addBody(node, [], { mass: 1, centre: [0, 0, 0], moments: [.02, .02, .02], orientation: Quaternion.Identity() });
      });
      bodies[0].setFixed(true);
      const joint = physics.raw.createImpulseJoint(R.JointData.revolute(
        { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }), bodies[0].rigid, bodies[1].rigid, true);
      const raw = physics.raw.impulseJoints.raw, axis = R.JointAxis.AngX;
      raw.jointConfigureMotor(joint.handle, axis, 0, sense * 1e6, 0, Infinity);
      raw.jointSetMotorForceBounds(joint.handle, axis, -149.3, 149.3);
      physics.step(1 / 120);
      const last = raw.jointMotorImpulse(joint.handle, axis), sum = raw.jointMotorStepImpulse(joint.handle, axis);
      assert.ok(Math.abs(last) > 0, "a driven rotor saturates every substep");
      assert.equal(sum, last * count, `${count} substeps, sense ${sense}`);
      const saved = physics.save();
      physics.step(1 / 120);
      physics.load(saved);
      assert.equal(physics.raw.impulseJoints.raw.jointMotorStepImpulse(joint.handle, axis), sum, "the precise sum survives serialization");
    } finally { physics.dispose(); scene.dispose(); engine.dispose(); }
  }
});

test("Rapier sums motor effort across islands with different substep counts, including a CCD collision", async () => {
  const R = await rapierModule(), engine = new NullEngine(), scene = new Scene(engine);
  const physics = createRapierPhysics(R, { hz: 120, gravity: false });
  const dt = 1 / 120, inertia = 0.02;
  const body = (name, position) => {
    const node = new TransformNode(name, scene);
    node.position.set(...position);
    node.rotationQuaternion = Quaternion.Identity();
    return physics.addBody(node, [{ kind: "sphere", centre: [0, 0, 0], radius: 0.1 }],
      { mass: 1, centre: [0, 0, 0], moments: [inertia, inertia, inertia], orientation: Quaternion.Identity() });
  };
  try {
    physics.raw.numSolverIterations = 4;
    physics.raw.integrationParameters.maxCcdSubsteps = 8;
    const rotors = [0, 4, 12].map((extra, k) => {
      const parent = body(`parent${k}`, [10 * k, 0, 0]), child = body(`rotor${k}`, [10 * k, 0, 0]);
      parent.setFixed(true);
      child.rigid.setAdditionalSolverIterations(extra);
      const joint = physics.addJoint(parent, child, {
        anchorParent: [0, 0, 0], anchorChild: [0, 0, 0], frameParent: Quaternion.Identity(),
        frameChild: Quaternion.Identity(), limits: [[-1, 1]],
      });
      const torque = k === 1 ? -0.24 : 0.12;
      joint.setMotorBounds(0, Math.sign(torque) * 10, 0.24, 0.12);
      return { child, joint, torque };
    });
    const projectile = body("projectile", [-2, 5, 0]);
    projectile.rigid.enableCcd(true);
    projectile.rigid.setLinvel({ x: 480, y: 0, z: 0 }, true);
    physics.addFixedBox([0, 5, 0], [0.02, 2, 2]);
    physics.step(dt);
    assert.ok(projectile.node.position.x < 0, `CCD stopped the crossing sphere: ${projectile.node.position.x}`);
    for (const { child, joint, torque } of rotors) {
      const impulse = joint.motorStepImpulse(0), momentum = child.angularVelocityToRef(new Vector3()).x * inertia;
      assert.ok(Math.abs(impulse - torque * dt) < 2e-8, `${impulse}, expected ${torque * dt}`);
      assert.ok(Math.abs(impulse - momentum) < 2e-8, `${impulse}, momentum ${momentum}`);
      assert.ok(Math.abs(impulse) > Math.abs(physics.raw.impulseJoints.raw.jointMotorImpulse(joint.raw.handle, R.JointAxis.AngX)) * 2,
        "the accumulated read differs from a last-substep read");
    }
    for (const { child } of rotors) child.setFixed(true);
    physics.step(dt);
    for (const { joint } of rotors) assert.equal(Math.abs(joint.motorStepImpulse(0)), 0, "an inactive island resets its nonzero total");
  } finally { physics.dispose(); scene.dispose(); engine.dispose(); }
});
