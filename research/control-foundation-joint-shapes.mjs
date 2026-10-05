/** Run one pinned joint-shape probe in its own process: a native panic can poison its WASM realm. */
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { Quaternion } from "@babylonjs/core/Maths/math.vector.js";
import { rapierModule, loadRapier } from "../src/core/engine/rapier.ts";
import { createWorld } from "../src/core/world.ts";
import { anglesOf } from "../src/core/build/joint-state.ts";
import { saveState, loadState } from "../src/core/state.ts";

const representation = process.argv[2], freedoms = Number(process.argv[3]);
const xSense = Number(process.argv[4] ?? 1), ySense = Number(process.argv[5] ?? 1);
if (!["impulse", "multibody"].includes(representation) || ![2, 3].includes(freedoms)
  || ![-1, 1].includes(xSense) || ![-1, 1].includes(ySense)) throw new Error("expected representation, freedoms (2 or 3), x/y senses (+/-1)");
const R = await rapierModule(), rendering = new NullEngine(), scene = new Scene(rendering);
const engine = await loadRapier(true, true), world = createWorld(scene, engine, { hz: 120, gravity: false, actuation: "directional" });
const configuration = { representation, freedoms, xSense, ySense, engineRevision: engine.revision,
  hz: 120, gravity: false, contacts: false, assists: false, mass: 1, inertia: [.02, .02, .02],
  speed: 2, effort: 10, limits: [[-.4, .4], [-.4, .4], [-.02, .02]].slice(0, freedoms), stageSteps: 120 };
let phase = "construct";
try {
  const make = (name) => {
    const node = new TransformNode(name, scene); node.rotationQuaternion = Quaternion.Identity();
    return world.physics.addBody(node, [], { mass: configuration.mass, centre: [0, 0, 0], moments: configuration.inertia, orientation: Quaternion.Identity() });
  };
  const parent = make("parent"), child = make("rotor"); parent.setFixed(true);
  const M = R.JointAxesMask;
  const locked = M.LinX | M.LinY | M.LinZ | (freedoms === 2 ? M.AngZ : 0);
  const data = R.JointData.generic({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, locked);
  const joint = representation === "impulse" ? world.physics.raw.createImpulseJoint(data, parent.rigid, child.rigid, true)
    : world.physics.raw.createMultibodyJoint(data, parent.rigid, child.rigid, true);
  const handle = joint.handle;
  const raw = () => representation === "impulse" ? world.physics.raw.impulseJoints.raw : world.physics.raw.multibodyJoints.raw;
  const axes = [R.JointAxis.AngX, R.JointAxis.AngY, R.JointAxis.AngZ];
  for (let i = 0; i < freedoms; i++) {
    raw().jointSetLimits(handle, axes[i], ...configuration.limits[i]);
    raw().jointConfigureMotor(handle, axes[i], 0, 0, 0, Infinity);
    raw().jointSetMotorForceBounds(handle, axes[i], -configuration.effort, configuration.effort);
  }
  const stage = (axis, sense) => {
    for (let i = 0; i < freedoms; i++) raw().jointConfigureMotor(handle, axes[i], 0, i === axis ? sense * configuration.speed : 0, 0, Infinity);
    world.step(configuration.stageSteps);
    const q = child.rigid.rotation();
    return { axis, sense, angles: anglesOf(new Quaternion(q.x, q.y, q.z, q.w), { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }, [0, 0, 0]),
      rotation: [q.x, q.y, q.z, q.w], limits: axes.slice(0, freedoms).map((a) => [raw().jointLimitsMin(handle, a), raw().jointLimitsMax(handle, a)]) };
  };
  phase = "step";
  const first = stage(0, xSense);
  const snapshot = { physics: world.physics.save(), state: saveState(world.state) };
  const branch = () => ({ rows: [stage(1, ySense), stage(-1, 0)], state: saveState(world.state) });
  const measured = branch(); world.physics.load(snapshot.physics); loadState(world.state, snapshot.state);
  const replay = branch();
  console.log(JSON.stringify({ configuration, outcome: { supported: true, first, rows: measured.rows,
    replayExact: JSON.stringify(measured) === JSON.stringify(replay) } }));
  world.dispose(); scene.dispose(); rendering.dispose();
} catch (error) {
  console.log(JSON.stringify({ configuration, outcome: { supported: false, phase, error: String(error) } }));
  // A native panic may retain a borrow; process exit releases this isolated realm without calling it again.
}
