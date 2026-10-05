import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { coreStand, saveStand, loadStand } from "../tests/harness/core-stand.mjs";
import { sourced } from "../src/core/spec/quantity.ts";
import { CONTACT_FRICTION } from "../src/core/engine/engine.ts";
import { planarSupportPoints } from "../src/core/build/planar-support.ts";
import { coupledDynamics } from "../src/core/build/coupled-dynamics.ts";
import { predictPointContacts } from "../src/core/build/contact-step.ts";

const zero = [0, 0, 0], q = (v, unit = "m") => sourced(v, unit, "de-leva-1996", "synthetic contact-step slab");
const spec = { family: "test", model: "contact-step-slab", mass: q(1, "kg"), stature: q(.1), joints: [], segments: [{
  name: "slab", proximal: q([0, .1, 0]), distal: q(zero), mass: q(1, "kg"), centreOfMass: q([0, .05, 0]),
  inertia: q([.02, .04, .04], "kg m2"), shape: { kind: "box", centre: q([0, .05, 0]), size: q([.6, .1, .4]) }, surface: { stiffness: q(1e5, "N/m") },
}] };

/** Known external loads exercise contact transitions without a controller applying its predicted reactions. */
export async function contactTransitions({ hz = 120, sense = 1, spin = 0 } = {}) {
  if (![120, 1920].includes(hz) || ![-1, 1].includes(sense) || ![0, 3].includes(spin)) throw new Error("invalid contact transition experiment");
  const stand = await coreStand(spec, { hz, engine: "rapier-coordinate-coulomb" });
  try {
    stand.step(hz); const body = stand.built.segments.get("slab").body;
    const model = coupledDynamics(stand.built, stand.world.physics.gravity);
    const centre = () => new Vector3(...body.massProperties.centre).applyRotationQuaternion(body.node.rotationQuaternion).add(body.node.position);
    if (spin) { body.applyTorqueImpulse(new Vector3(0, sense * spin * .04, 0)); stand.step(); }
    const settings = { dt: 1 / hz, friction: CONTACT_FRICTION, iterations: 2048, impulseTolerance: 1e-10, velocityTolerance: 1e-7 };
    const snapshot = saveStand(stand.world, {});
    const branch = () => {
      const phases = Object.fromEntries(["drive", "coast", "hold", "lift", "fall"].map((name) => [name, {
        steps: 0, rejected: 0, work: 0, linearError: 0, angularError: 0, normalViolation: 0, impulseResidual: 0,
        acceptedNormalViolation: 0, acceptedImpulseResidual: 0,
        modes: { free: 0, sticking: 0, sliding: 0 },
      }]));
      const trace = createHash("sha256"), failures = [], samples = [];
      for (let k = 0; k < 4 * hz; k++) {
        const time = k / hz, name = time < 1 ? "drive" : time < 2 ? "coast" : time < 3 ? "hold" : time < 3.25 ? "lift" : "fall";
        const force = name === "drive" ? [sense * 7, 0, 0] : name === "hold" ? [sense * 3, 0, 0] : name === "lift" ? [0, 15, 0] : zero;
        const com = centre(), velocity = body.linearVelocityToRef(new Vector3()).asArray(), spin = body.angularVelocityToRef(new Vector3()).asArray();
        const supports = planarSupportPoints({ kind: "box", centre: body.massProperties.centre, size: [.6, .1, .4] },
          body.node.position.asArray(), body.node.rotationQuaternion, [0, 1, 0], .001);
        const contacts = supports.filter((point) => point[1] < .005).map((point) => ({ body, point, normal: [0, 1, 0], normalVelocity: -Math.max(point[1], 0) * hz }));
        const loads = [{ body, point: com.asArray(), force, moment: zero }];
        model.update(); const before = saveStand(stand.world, {});
        const prediction = predictPointContacts(model, [], contacts, loads, settings);
        assert.deepEqual(saveStand(stand.world, {}), before, "predicted contacts do not move the physical world");
        assert.ok(prediction.acceleration && prediction.status !== "nonfinite");
        const motion = model.pointAcceleration(body, com.asArray(), prediction.acceleration);
        body.applyForce(new Vector3(...force), com); stand.step();
        const actual = { position: body.node.position.asArray(), rotation: body.node.rotationQuaternion.asArray(),
          velocity: body.linearVelocityToRef(new Vector3()).asArray(), spin: body.angularVelocityToRef(new Vector3()).asArray(),
          contacts: stand.world.physics.contactsOf(body, (other) => other === null), state: saveStand(stand.world, {}).state };
        const linearError = Math.max(...actual.velocity.map((v, i) => Math.abs(v - velocity[i] - motion.linear[i] / hz)));
        const angularError = Math.max(...actual.spin.map((v, i) => Math.abs(v - spin[i] - motion.angular[i] / hz)));
        const phase = phases[name]; phase.steps++;
        phase.linearError = Math.max(phase.linearError, linearError); phase.angularError = Math.max(phase.angularError, angularError);
        phase.work = Math.max(phase.work, prediction.work); phase.normalViolation = Math.max(phase.normalViolation, prediction.normalViolation);
        phase.impulseResidual = Math.max(phase.impulseResidual, prediction.impulseResidual);
        if (prediction.status !== "converged") {
          phase.rejected++;
          failures.push({ time, status: prediction.status, work: prediction.work, linearError, angularError,
            normalViolation: prediction.normalViolation, impulseResidual: prediction.impulseResidual });
        } else {
          phase.acceptedNormalViolation = Math.max(phase.acceptedNormalViolation, prediction.normalViolation);
          phase.acceptedImpulseResidual = Math.max(phase.acceptedImpulseResidual, prediction.impulseResidual);
          for (const contact of prediction.contacts) phase.modes[contact.mode]++;
        }
        phase.final = { height: centre().y, velocity: actual.velocity, spin: actual.spin };
        if (k % (hz / 120) === 0) samples.push({ time, phase: name, height: centre().y, velocity: actual.velocity, spin: actual.spin,
          status: prediction.status, modes: prediction.contacts.map((c) => c.mode), linearError, angularError });
        trace.update(JSON.stringify(actual));
      }
      return { phases, failures, samples, observationSha256: trace.digest("hex") };
    };
    const result = branch(); loadStand(stand.world, {}, snapshot); assert.deepEqual(branch(), result);
    return { harness: "Node core stand", engine: stand.world.physics.engine, revision: stand.world.physics.revision,
      hz, sense, spin, settings, replay: true, ...result };
  } finally { stand.dispose(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const hz of [120, 1920]) for (const sense of [-1, 1]) console.log(JSON.stringify(await contactTransitions({ hz, sense })));
  for (const sense of [-1, 1]) console.log(JSON.stringify(await contactTransitions({ sense, spin: 3 })));
}
