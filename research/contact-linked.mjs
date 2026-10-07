import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { coreStand, saveStand, loadStand } from "../tests/harness/core-stand.mjs";
import { sourced } from "../src/core/spec/quantity.ts";
import { CONTACT_FRICTION } from "../src/core/engine/engine.ts";
import { planarSupportPoints } from "../src/core/build/planar-support.ts";
import { coupledDynamics } from "../src/core/build/coupled-dynamics.ts";
import { predictPointContacts } from "../src/core/build/contact-step.ts";

const zero = [0, 0, 0], q = (v, unit = "m") => sourced(v, unit, "de-leva-1996", "synthetic linked contact fixture; not anatomical data");
const speed = { unloadedSpeed: q(30, "rad/s"), curvature: q(.25, "1"), eccentricCeiling: q(1.4, "1"), eccentricSlopeRatio: q(2, "1") };
const spec = { model: "linked-contact", mass: q(2, "kg"), stature: q(.1),
  segments: [-.35, .35].map((x, i) => ({ name: i ? "right" : "left", proximal: q([x, .1, 0]), distal: q([x, 0, 0]),
    mass: q(1, "kg"), centreOfMass: q([x, .05, 0]), inertia: q([.02, .04, .04], "kg m2"),
    shape: { kind: "box", centre: q([x, .05, 0]), size: q([.6, .1, .4]) }, surface: { stiffness: q(1e5, "N/m") } })),
  joints: [{ name: "hinge", parent: "left", child: "right", centre: q([0, .05, 0]), dofs: [{ positive: "turn", negative: "return",
    axis: q([0, 0, 1], "1"), min: q(-1, "rad"), max: q(1, "rad"),
    muscle: { peakPositive: q(10, "N m"), peakNegative: q(10, "N m"), speedPositive: speed, speedNegative: speed } }] }] };
const centre = (body) => new Vector3(...body.massProperties.centre).applyRotationQuaternion(body.node.rotationQuaternion).add(body.node.position);

/** Two grounded bodies exchange a prescribed internal couple while a known centre load drives sliding. */
export async function linkedContacts({ hz = 120, sense = 1, torque = 0 } = {}) {
  if (![120, 1920].includes(hz) || ![-1, 1].includes(sense) || ![0, .4].includes(torque)) throw new Error("invalid linked contact experiment");
  const stand = await coreStand(spec, { hz, engine: "rapier-coordinate-coulomb" });
  try {
    stand.step(hz);
    const bodies = [...stand.built.segments.values()].map((segment) => segment.body), model = coupledDynamics(stand.built, stand.world.physics.gravity);
    const joint = stand.built.joints.get("hinge");
    const settings = { dt: 1 / hz, friction: CONTACT_FRICTION, iterations: 2048, impulseTolerance: 1e-10, velocityTolerance: 1e-7 };
    const saved = saveStand(stand.world, {});
    const branch = () => {
      const trace = createHash("sha256"), failures = [], samples = [];
      const phases = Object.fromEntries(["drive", "coast"].map((name) => [name, { steps: 0, rejected: 0, work: 0, linearError: 0, angularError: 0,
        acceptedNormalViolation: 0, acceptedImpulseResidual: 0, acceptedConeViolation: 0, projectionEnergy: 0, modes: { free: 0, sticking: 0, sliding: 0 } }]));
      for (let k = 0; k < 2 * hz; k++) {
        const time = k / hz, name = time < 1 ? "drive" : "coast", force = time < 1 ? [sense * 14, 0, 0] : zero;
        const effort = time < 1 ? sense * torque : 0, coms = bodies.map(centre);
        const contacts = bodies.flatMap((body) => planarSupportPoints({ kind: "box", centre: body.massProperties.centre, size: [.6, .1, .4] },
          body.node.position.asArray(), body.node.rotationQuaternion, [0, 1, 0], .001).filter((point) => point[1] < .005)
          .map((point) => ({ body, point, normal: [0, 1, 0], normalVelocity: -Math.max(point[1], 0) * hz })));
        const loads = [{ body: bodies[0], point: coms[0].asArray(), force, moment: zero }];
        model.update(); const before = saveStand(stand.world, {});
        const prediction = predictPointContacts(model, [effort], contacts, loads, settings);
        assert.deepEqual(saveStand(stand.world, {}), before, "the predictor changes no physical state");
        assert.ok(prediction.acceleration && prediction.status !== "nonfinite");
        const start = bodies.map((body, i) => model.pointVelocity(body, coms[i].asArray(), prediction.projection.velocity));
        const motion = bodies.map((body, i) => model.pointAcceleration(body, coms[i].asArray(), prediction.acceleration));
        bodies[0].applyForce(new Vector3(...force), coms[0]);
        const carry = joint.parent.node.rotationQuaternion.multiply(Quaternion.Inverse(joint.parent.rest));
        const couple = new Vector3(...joint.dofs[0].spec.axis.value).applyRotationQuaternion(carry).scale(effort);
        bodies[0].applyTorque(couple.negate()); bodies[1].applyTorque(couple);
        stand.step();
        const actual = bodies.map((body) => ({ position: body.node.position.asArray(), rotation: body.node.rotationQuaternion.asArray(),
          velocity: body.linearVelocityToRef(new Vector3()).asArray(), spin: body.angularVelocityToRef(new Vector3()).asArray(),
          contacts: stand.world.physics.contactsOf(body, (other) => other === null) }));
        const linearError = Math.max(...actual.flatMap((body, i) => body.velocity.map((v, k) => Math.abs(v - start[i].linear[k] - motion[i].linear[k] / hz))));
        const angularError = Math.max(...actual.flatMap((body, i) => body.spin.map((v, k) => Math.abs(v - start[i].angular[k] - motion[i].angular[k] / hz))));
        const phase = phases[name]; phase.steps++; phase.work = Math.max(phase.work, prediction.work);
        phase.linearError = Math.max(phase.linearError, linearError); phase.angularError = Math.max(phase.angularError, angularError);
        phase.projectionEnergy = Math.max(phase.projectionEnergy, prediction.projection.kineticBefore - prediction.projection.kineticAfter);
        if (prediction.status !== "converged") {
          phase.rejected++;
          failures.push({ time, status: prediction.status, work: prediction.work, normalViolation: prediction.normalViolation,
            impulseResidual: prediction.impulseResidual, coneViolation: prediction.coneViolation, linearError, angularError });
        } else {
          phase.acceptedNormalViolation = Math.max(phase.acceptedNormalViolation, prediction.normalViolation);
          phase.acceptedImpulseResidual = Math.max(phase.acceptedImpulseResidual, prediction.impulseResidual);
          phase.acceptedConeViolation = Math.max(phase.acceptedConeViolation, prediction.coneViolation);
          for (const contact of prediction.contacts) phase.modes[contact.mode]++;
        }
        phase.final = actual.map((body, i) => ({ height: centre(bodies[i]).y, velocity: body.velocity, spin: body.spin }));
        if (k % (hz / 120) === 0) samples.push({ time, phase: name, status: prediction.status, linearError, angularError, bodies: phase.final });
        trace.update(JSON.stringify({ bodies: actual, state: saveStand(stand.world, {}).state }));
      }
      return { phases, failures, samples, observationSha256: trace.digest("hex") };
    };
    const result = branch(); loadStand(stand.world, {}, saved); assert.deepEqual(branch(), result);
    return { harness: "Node core stand", engine: stand.world.physics.engine, revision: stand.world.physics.revision,
      hz, sense, torque, settings, replay: true, ...result };
  } finally { stand.dispose(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const hz of [120, 1920]) for (const sense of [-1, 1]) for (const torque of [0, .4]) console.log(JSON.stringify(await linkedContacts({ hz, sense, torque })));
}
