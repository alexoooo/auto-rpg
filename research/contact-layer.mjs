import { pathToFileURL } from "node:url";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { freshEngine } from "../tests/harness/core-stand.mjs";

/** Node two-sphere stand, zero gravity: pair-local compression, unloading and pressure. */
export async function layerTrial({ hz = 120, stiffness = 500, dampingRatio = .5, fixed = true, force = 0, speed = .2, seconds = 1, point = true, direction = [0, 1, 0], turnAt = null, angularSpeed = 0 } = {}) {
  const engine = new NullEngine(), scene = new Scene(engine), physics = (await freshEngine("rapier-coordinate")).createPhysics({ hz, gravity: false });
  const mass = { mass: 1, centre: [0, 0, 0], moments: [.001, .001, .001], orientation: Quaternion.Identity() };
  const make = (name, y, material) => {
    const node = new TransformNode(name, scene); node.position.y = y; node.rotationQuaternion = Quaternion.Identity();
    return physics.addBody(node, [{ kind: "sphere", centre: [0, 0, 0], radius: .05 }], mass, { materials: [material] });
  };
  const first = make("point", -.101, point ? { point: { direction, alignment: .5, depth: .008 } } : {});
  const second = make("material", 0, { layer: { stiffness, dampingRatio, depth: .008 } }); second.setFixed(fixed);
  const at = new Vector3(), impulse = new Vector3(0, speed, 0), v = new Vector3(), w = new Vector3();
  first.applyImpulse(impulse, first.node.position);
  let work = 0, depth = 0, symmetry = 0, tailWork = 0, peak = 0;
  const samples = [];
  try {
    for (let i = 0; i < Math.round(hz * seconds); i++) {
      if (turnAt !== null && i === Math.round(hz * turnAt)) first.applyTorqueImpulse(at.set(0, 0, mass.moments[2] * angularSpeed));
      if (force) first.applyForce(at.set(0, force, 0), first.node.position);
      physics.step(1 / hz);
      const contacts = physics.materialContacts();
      const increment = contacts.reduce((sum, c) => sum + c.work, 0);
      work += increment; if (i >= hz * (seconds - .2)) tailWork += increment;
      const compression = Math.max(0, .1 - (second.node.position.y - first.node.position.y));
      depth = Math.max(depth, compression); peak = Math.max(peak, ...contacts.map(c => c.depth), 0);
      const one = first.linearVelocityToRef(v).y, two = second.linearVelocityToRef(w).y;
      if (!fixed && !force) symmetry = Math.max(symmetry, Math.abs(one + two - speed));
      if ((i + 1) % Math.max(1, hz / 120) === 0) samples.push({ time: (i + 1) / hz, compression, work, one, two });
    }
    const one = first.linearVelocityToRef(v).y, two = second.linearVelocityToRef(w).y;
    return { harness: "Node two-sphere stand", engine: physics.engine, hz, stiffness, dampingRatio, fixed, force, point, direction, turnAt, angularSpeed,
      work, tailWork, depth, peak, symmetry, initialEnergy: speed * speed / 2,
      remainingEnergy: (one * one + two * two) / 2, samples };
  } finally { physics.dispose(); scene.dispose(); engine.dispose(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const stiffness of [250, 500, 1000, 2000]) for (const dampingRatio of [.25, .5, 1]) {
    const coarse = await layerTrial({ stiffness, dampingRatio }), fine = await layerTrial({ stiffness, dampingRatio, hz: 960 });
    delete coarse.samples; delete fine.samples;
    console.log(JSON.stringify({ coarse, fine, relativeDifference: Math.abs(coarse.work - fine.work) / fine.work }));
  }
}
