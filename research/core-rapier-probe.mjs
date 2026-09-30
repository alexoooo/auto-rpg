/**
 * **What Rapier's generic joint does, read on a stand** (Node, the core's engine module alone).
 *
 * A fixed parent and a rod child joined at the rod's end by a joint of three angular freedoms whose
 * axes are tilted off the world's, no gravity:
 *
 * - **limit**: freedom 0 limited to +-0.6 rad and driven past it while the other two are driven to
 *   large angles; each limited angle read as 2 atan2(q_k, w) and as 2 asin(q_k), the reading that
 *   stops at 0.6 is the limit's measure;
 * - **motor**: all three driven at set speeds, the relative angular velocity read along the
 *   parent-fixed axes and along the child's own;
 * - **saturation**: one freedom driven far past what its ceiling can reach in a step, the change of
 *   speed against ceiling x step / inertia;
 * - **gyroscope**: a free box of unequal moments spun, its angular momentum and energy over a second;
 * - **brake**: a 1 kg rod hung on a pin under gravity, its motor asking for no motion well under its
 *   ceiling, how far it creeps in the second after a settling one, across the solver's iterations
 *   and PGS passes, the ceiling and the motor model.
 *
 *     node research/core-rapier-probe.mjs [--hz 120]
 */
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { createRapierPhysics, rapierModule } from "../src/core/engine/rapier.ts";

const argv = process.argv.slice(2);
const hz = Number(argv[argv.indexOf("--hz") + 1] || 120);
const R = await rapierModule();
const scene = new Scene(new NullEngine());

// The joint's axes: an orthonormal frame turned off the world's.
const frame = Quaternion.RotationYawPitchRoll(0.4, -0.3, 0.7);
const axisOf = (v) => v.applyRotationQuaternion(frame);
const axes = [axisOf(new Vector3(1, 0, 0)), axisOf(new Vector3(0, 1, 0)), axisOf(new Vector3(0, 0, 1))];

function rig({ limits, mass = 2, moments = [0.02, 0.005, 0.02] }) {
  const physics = createRapierPhysics(R, { hz, gravity: false });
  const nodeOf = (name) => { const n = new TransformNode(name, scene); n.rotationQuaternion = Quaternion.Identity(); return n; };
  const parentNode = nodeOf("parent"), childNode = nodeOf("child");
  const box = { kind: "box", centre: [0, 0, 0], size: [0.1, 0.1, 0.1] };
  const parent = physics.addBody(parentNode, [box], { mass: 5, centre: [0, 0, 0], moments: [0.1, 0.1, 0.1], orientation: Quaternion.Identity() });
  parent.setFixed(true);
  childNode.position.set(0, -0.3, 0);
  const child = physics.addBody(childNode, [{ kind: "capsule", from: [0, 0.25, 0], to: [0, -0.25, 0], radius: 0.03 }],
    { mass, centre: [0, 0, 0], moments, orientation: Quaternion.Identity() });
  const joint = physics.addJoint(parent, child, {
    anchorParent: [0, -0.05, 0], anchorChild: [0, 0.25, 0], frameParent: frame, frameChild: frame, limits,
  });
  return { physics, parent, child, joint, childNode };
}

/** The child's rotation relative to the parent (held at identity), in the joint's axes: (w, x, y, z), w >= 0. */
function jointQuaternion(node) {
  const q = node.rotationQuaternion, s = q.w < 0 ? -1 : 1, v = new Vector3(q.x, q.y, q.z);
  return [s * q.w, ...axes.map((a) => s * Vector3.Dot(v, a))];
}

const f = (x, d = 4) => x.toFixed(d);
const out = { hz };

// Limit.
{
  const r = rig({ limits: [[-0.6, 0.6], [-2.5, 2.5], [-2.5, 2.5]] });
  const rows = [];
  for (const [s1, s2] of [[0, 0], [1.2, 0], [0, 1.2], [1.0, -0.9], [1.4, 1.4]]) {
    r.joint.setMotor(0, 2, 50); r.joint.setMotor(1, s1, 50); r.joint.setMotor(2, s2, 50);
    for (let i = 0; i < hz; i++) r.physics.step(1 / hz);
    r.joint.setMotor(0, 0.5, 50); r.joint.setMotor(1, 0, 50); r.joint.setMotor(2, 0, 50);
    for (let i = 0; i < hz / 2; i++) r.physics.step(1 / hz);
    const [w, x, y, z] = jointQuaternion(r.childNode);
    rows.push({ asked: [s1, s2], atan2: [x, y, z].map((c) => f(2 * Math.atan2(c, w))), asin: [x, y, z].map((c) => f(2 * Math.asin(c))) });
  }
  out.limit = rows;
  r.physics.dispose();
}

// Motor axis.
{
  const r = rig({ limits: [[-3, 3], [-3, 3], [-3, 3]] });
  // First turn about X alone, so the child's axes stand off the parent's; then drive all three.
  r.joint.setMotor(0, 1.6, 200); r.joint.setMotor(1, 0, 200); r.joint.setMotor(2, 0, 200);
  for (let i = 0; i < hz / 2; i++) r.physics.step(1 / hz);
  const target = [0, 0.7, -0.4];
  target.forEach((s, k) => r.joint.setMotor(k, s, 200));
  const rows = [];
  for (let i = 1; i <= hz; i++) {
    r.physics.step(1 / hz);
    if (i % (hz / 4) !== 0) continue;
    const w = r.child.angularVelocityToRef(new Vector3());
    const own = axes.map((a) => a.applyRotationQuaternion(r.childNode.rotationQuaternion));
    rows.push({ t: f(i / hz, 2), parentFixed: axes.map((a) => f(Vector3.Dot(w, a))), childFixed: own.map((a) => f(Vector3.Dot(w, a))) });
  }
  out.motor = { target, rows };
  r.physics.dispose();
}

// Saturation: freedom 0 of a one-freedom joint, the rod's inertia about the joint's X.
{
  const r = rig({ limits: [[-3, 3]] });
  const ceiling = 3, I = [];
  r.joint.setMotor(0, 50, ceiling);
  const speeds = [];
  for (let i = 0; i < 6; i++) {
    r.physics.step(1 / hz);
    speeds.push(Vector3.Dot(r.child.angularVelocityToRef(new Vector3()), axes[0]));
  }
  // The rod's inertia about the joint's X through the anchor: its own plus m d^2, d = 0.25 m square to X.
  const X = axes[0], m = 2, d = new Vector3(0, 0.25, 0);
  const own = 0.02 * X.x * X.x + 0.005 * X.y * X.y + 0.02 * X.z * X.z;
  const across = d.subtract(X.scale(Vector3.Dot(d, X))).lengthSquared();
  I.push(own + m * across);
  out.saturation = { ceiling, inertia: f(I[0], 5), expected: f(ceiling / hz / I[0]), perStep: speeds.map((s, i) => f(s - (i ? speeds[i - 1] : 0))) };
  r.physics.dispose();
}

// Gyroscope.
{
  const physics = createRapierPhysics(R, { hz, gravity: false });
  const node = new TransformNode("box", scene);
  node.rotationQuaternion = Quaternion.Identity();
  const body = physics.addBody(node, [{ kind: "box", centre: [0, 0, 0], size: [0.1, 0.2, 0.3] }],
    { mass: 1, centre: [0, 0, 0], moments: [0.010, 0.002, 0.006], orientation: Quaternion.Identity() });
  body.rigid.setAngvel({ x: 3, y: 5, z: 1 }, true);
  const I = [0.010, 0.002, 0.006];
  // Angular momentum (world) and kinetic energy from the body-frame spin.
  const read = () => {
    const w = body.angularVelocityToRef(new Vector3()), q = node.rotationQuaternion;
    const wb = w.applyRotationQuaternion(Quaternion.Inverse(q));
    const Lb = new Vector3(I[0] * wb.x, I[1] * wb.y, I[2] * wb.z), L = Lb.applyRotationQuaternion(q);
    return { w: [w.x, w.y, w.z].map((x) => f(x)), L: [L.x, L.y, L.z].map((x) => f(x, 5)), E: f(0.5 * Vector3.Dot(wb, Lb), 5) };
  };
  const rows = [read()];
  for (let i = 1; i <= hz; i++) { physics.step(1 / hz); if (i % (hz / 4) === 0) rows.push(read()); }
  out.gyroscope = rows;
  physics.dispose();
}

// Brake.
{
  const creep = ({ iterations = 16, pgs = 2, ceiling = 50, model }) => {
    const physics = createRapierPhysics(R, { hz, gravity: true });
    physics.raw.numSolverIterations = iterations;
    physics.raw.numInternalPgsIterations = pgs;
    const nodeOf = (name) => { const n = new TransformNode(name, scene); n.rotationQuaternion = Quaternion.Identity(); return n; };
    const post = physics.addBody(nodeOf("post"), [{ kind: "box", centre: [0, 0, 0], size: [0.1, 0.1, 0.1] }],
      { mass: 5, centre: [0, 0, 0], moments: [0.1, 0.1, 0.1], orientation: Quaternion.Identity() });
    post.setFixed(true);
    const node = nodeOf("rod");
    node.position.set(0.15, -0.2, 0);
    const rod = physics.addBody(node, [{ kind: "capsule", from: [-0.15, 0.2, 0], to: [0.15, -0.2, 0], radius: 0.03 }],
      { mass: 1, centre: [0, 0, 0], moments: [0.02, 0.004, 0.03], orientation: Quaternion.Identity() });
    // The pin about world z: the joint's X turned onto z.
    const pin = Quaternion.RotationAxis(new Vector3(0, 1, 0), -Math.PI / 2);
    const joint = physics.addJoint(post, rod, { anchorParent: [0, 0, 0], anchorChild: [-0.15, 0.2, 0], frameParent: pin, frameChild: pin, limits: [[-3, 3]] });
    if (model !== undefined) physics.raw.impulseJoints.raw.jointConfigureMotorModel(joint.raw.handle, R.JointAxis.AngX, model);
    joint.setMotor(0, 0, ceiling);
    const angle = () => 2 * Math.atan2(node.rotationQuaternion.z, node.rotationQuaternion.w);
    for (let i = 0; i < hz; i++) physics.step(1 / hz);
    const settled = angle();
    for (let i = 0; i < hz; i++) physics.step(1 / hz);
    const degrees = (angle() - settled) * 180 / Math.PI;
    physics.dispose();
    return f(degrees, 3);
  };
  out.brake = {
    iterations: Object.fromEntries([4, 16, 64].map((n) => [n, creep({ iterations: n })])),
    pgs: Object.fromEntries([1, 2, 8].map((n) => [n, creep({ pgs: n })])),
    ceiling: Object.fromEntries([5, 50, 1e4].map((n) => [n, creep({ ceiling: n })])),
    model: { accelerationBased: creep({ model: R.MotorModel.AccelerationBased }), forceBased: creep({ model: R.MotorModel.ForceBased }) },
  };
}

console.log(JSON.stringify(out, null, 1));
