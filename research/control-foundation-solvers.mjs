/** Pinned binding and rotor probes; a reduced-coordinate tree is not a replacement-contract proof. */
import { performance } from "node:perf_hooks";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { Quaternion } from "@babylonjs/core/Maths/math.vector.js";
import { loadRapier, rapierModule } from "../src/core/engine/rapier.ts";
import { createWorld } from "../src/core/world.ts";
import { saveState, loadState } from "../src/core/state.ts";

export async function solverTrial(job) {
  const R = await rapierModule();
  const rendering = new NullEngine(), scene = new Scene(rendering);
  const world = createWorld(scene, await loadRapier(), { hz: job.hz, gravity: false, actuation: job.actuation });
  const physics = world.physics;
  const body = (name) => {
    const node = new TransformNode(name, scene); node.rotationQuaternion = Quaternion.Identity();
    return physics.addBody(node, [], { mass: 1, centre: [0, 0, 0], moments: [job.inertia, job.inertia / 4, job.inertia], orientation: Quaternion.Identity() });
  };
  const parent = body("parent"), child = body("rotor");
  parent.setFixed(true);
  const data = R.JointData.revolute({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
  const joint = job.representation === "impulse" ? physics.raw.createImpulseJoint(data, parent.rigid, child.rigid, true)
    : job.representation === "multibody" ? physics.raw.createMultibodyJoint(data, parent.rigid, child.rigid, true) : null;
  if (!joint) { world.dispose(); scene.dispose(); rendering.dispose(); throw new Error(`unknown joint representation ${job.representation}`); }
  const handle = joint.handle, childHandle = child.rigid.handle;
  const set = () => job.representation === "impulse" ? physics.raw.impulseJoints.raw : physics.raw.multibodyJoints.raw;
  const required = ["jointSetLimits", "jointConfigureMotor", "jointSetMotorForceBounds", "jointMotorStepImpulse", "jointSetLocalFrame1", "jointSetLocalFrame2"];
  const bindings = Object.fromEntries(required.map((name) => [name, typeof set()[name] === "function"]));
  try {
    set().jointSetLimits(handle, R.JointAxis.AngX, -job.limit, job.limit);
    set().jointConfigureMotor(handle, R.JointAxis.AngX, 0, job.sense * job.speed, 0, Infinity);
    set().jointSetMotorForceBounds(handle, R.JointAxis.AngX, -job.positive, job.negative);
    const read = () => {
      const body = physics.raw.getRigidBody(childHandle), q = body.rotation(), w = body.angvel();
      return { angle: 2 * Math.atan2(q.x, q.w), speed: w.x,
        effortImpulse: bindings.jointMotorStepImpulse ? -set().jointMotorStepImpulse(handle, R.JointAxis.AngX) : null };
    };
    world.step();
    const first = read(), snapshot = { physics: physics.save(), state: saveState(world.state) };
    const run = () => {
      const rows = [];
      set().jointSetMotorForceBounds(handle, R.JointAxis.AngX, 0, 0);
      for (let i = 0; i < job.coastSteps; i++) { world.step(); rows.push({ phase: "coast", ...read() }); }
      set().jointSetMotorForceBounds(handle, R.JointAxis.AngX, -job.positive, job.negative);
      for (let i = 1; i < job.steps; i++) { world.step(); rows.push({ phase: "driven", ...read() }); }
      return rows;
    };
    const start = performance.now(), rows = run();
    const elapsed = performance.now() - start;
    physics.load(snapshot.physics); loadState(world.state, snapshot.state);
    const replay = run();
    const nominalImpulse = job.sense * (job.sense > 0 ? job.positive : job.negative) / job.hz;
    return { status: "measured", outcome: { bindings, adapterBindingsAvailable: Object.values(bindings).every(Boolean),
      first, nominalImpulse, firstAngularMomentum: job.inertia * first.speed,
      end: rows.at(-1), maxAbsoluteAngle: Math.max(Math.abs(first.angle), ...rows.map((r) => Math.abs(r.angle))),
      replayExact: JSON.stringify(rows) === JSON.stringify(replay), rows },
      timing: { steps: job.steps + job.coastSteps - 1, meanStepMs: elapsed / (job.steps + job.coastSteps - 1) },
      limits: ["aligned single hinge only; no arbitrary joint frames, contacts or closed-loop proof",
        "multibody native angular damping remains at its unexposed default",
        "net angular momentum is not a substitute for an accumulated motor-effort read"] };
  } finally { world.dispose(); scene.dispose(); rendering.dispose(); }
}
