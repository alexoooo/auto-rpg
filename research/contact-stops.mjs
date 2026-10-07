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
import { jointAngles } from "../src/core/build/joint-state.ts";
import { nearJointStops } from "../src/core/control/joint-stops.ts";

const zero = [0, 0, 0], dimensions = [[1.2, .2, .6], [.6, .1, .2]];
const q = (v, unit = "m") => sourced(v, unit, "de-leva-1996", "synthetic ground and angular-stop fixture; not anatomical data");
const speed = { unloadedSpeed: q(30, "rad/s"), curvature: q(.25, "1"), eccentricCeiling: q(1.4, "1"), eccentricSlopeRatio: q(2, "1") };
const fixtureSpec = (sense) => ({ model: "contact-stop", mass: q(11, "kg"), stature: q(.65),
  segments: [[0, .1, 10], [sense * .6, .6, 1]].map(([x, y, mass], i) => ({ name: i ? "arm" : "base", proximal: q([x, y + .05, 0]), distal: q([x, y - .05, 0]),
    mass: q(mass, "kg"), centreOfMass: q([x, y, 0]), inertia: q(i ? [.01, .04, .04] : [.4, 1.2, 1.2], "kg m2"),
    shape: { kind: "box", centre: q([x, y, 0]), size: q(dimensions[i]) }, surface: { stiffness: q(1e5, "N/m") } })),
  joints: [{ name: "hinge", parent: "base", child: "arm", centre: q([sense * .2, .6, 0]), dofs: [{ positive: "turn", negative: "return",
    axis: q([0, 0, 1], "1"), min: q(sense > 0 ? 0 : -.4, "rad"), max: q(sense > 0 ? .4 : 0, "rad"),
    muscle: { peakPositive: q(10, "N m"), peakNegative: q(10, "N m"), speedPositive: speed, speedNegative: speed } }] }] });
const centre = (body) => new Vector3(...body.massProperties.centre).applyRotationQuaternion(body.node.rotationQuaternion).add(body.node.position);

/** Established ground and angular support under known loads; lifting releases the angular stop. */
export async function contactStops({ hz = 120, sense = 1, lift = false, slide = false } = {}) {
  if (![120, 1920].includes(hz) || ![-1, 1].includes(sense) || typeof lift !== "boolean" || typeof slide !== "boolean") throw new Error("invalid contact-stop experiment");
  const stand = await coreStand(fixtureSpec(sense), { hz, engine: "rapier-coordinate-coulomb" });
  try {
    stand.step(hz);
    const bodies = [...stand.built.segments.values()].map((segment) => segment.body), joint = stand.built.joints.get("hinge");
    const model = coupledDynamics(stand.built, stand.world.physics.gravity);
    const settings = { dt: 1 / hz, friction: CONTACT_FRICTION, iterations: 2048, impulseTolerance: 1e-10, velocityTolerance: 1e-7 };
    const stopSettings = { margin: .01, impulseTolerance: 1e-10, velocityTolerance: 1e-7 };
    const saved = saveStand(stand.world, {});
    const branch = () => {
      const trace = createHash("sha256"), samples = [], failures = [];
      const report = { steps: 0, rejected: 0, work: 0, linearError: 0, angularError: 0, normalViolation: 0, impulseResidual: 0,
        coneViolation: 0, stopViolation: 0, holding: 0, released: 0, sticking: 0, sliding: 0, stopImpulse: 0 };
      for (let k = 0; k < hz / 30; k++) {
        const coms = bodies.map(centre), force = slide ? [sense * 80, 0, 0] : zero, effort = lift ? sense * 6 : 0;
        const contacts = bodies.flatMap((body, i) => planarSupportPoints({ kind: "box", centre: body.massProperties.centre, size: dimensions[i] },
          body.node.position.asArray(), body.node.rotationQuaternion, [0, 1, 0], .001).filter((point) => point[1] < .005)
          .map((point) => ({ body, point, normal: [0, 1, 0], normalVelocity: -Math.max(point[1], 0) * hz })));
        const stops = nearJointStops(stand.built, stopSettings.margin, 1 / hz).map((stop) => ({ row: stop.row,
          minimumVelocity: stop.rate + stop.target / hz, impulseTolerance: stopSettings.impulseTolerance, velocityTolerance: stopSettings.velocityTolerance }));
        model.update(); const before = saveStand(stand.world, {});
        const result = predictPointContacts(model, [effort], contacts, [{ body: bodies[0], point: coms[0].asArray(), force, moment: zero }], settings, stops);
        assert.deepEqual(saveStand(stand.world, {}), before);
        assert.ok(result.acceleration && result.status !== "nonfinite");
        const start = bodies.map((body, i) => model.pointVelocity(body, coms[i].asArray(), result.projection.velocity));
        const motion = bodies.map((body, i) => model.pointAcceleration(body, coms[i].asArray(), result.acceleration));
        const carry = joint.parent.node.rotationQuaternion.multiply(Quaternion.Inverse(joint.parent.rest));
        const couple = new Vector3(...joint.dofs[0].spec.axis.value).applyRotationQuaternion(carry).scale(effort);
        bodies[0].applyForce(new Vector3(...force), coms[0]); bodies[0].applyTorque(couple.negate()); bodies[1].applyTorque(couple);
        stand.step();
        const actual = bodies.map((body) => ({ position: body.node.position.asArray(), rotation: body.node.rotationQuaternion.asArray(),
          velocity: body.linearVelocityToRef(new Vector3()).asArray(), spin: body.angularVelocityToRef(new Vector3()).asArray(),
          contacts: stand.world.physics.contactsOf(body, (other) => other === null) }));
        const linearError = Math.max(...actual.flatMap((body, i) => body.velocity.map((v, k) => Math.abs(v - start[i].linear[k] - motion[i].linear[k] / hz))));
        const angularError = Math.max(...actual.flatMap((body, i) => body.spin.map((v, k) => Math.abs(v - start[i].angular[k] - motion[i].angular[k] / hz))));
        const stopViolation = Math.max(0, ...result.stops.map((stop) => stop.violation));
        report.steps++; report.work = Math.max(report.work, result.work);
        report.linearError = Math.max(report.linearError, linearError); report.angularError = Math.max(report.angularError, angularError);
        report.normalViolation = Math.max(report.normalViolation, result.normalViolation); report.impulseResidual = Math.max(report.impulseResidual, result.impulseResidual);
        report.coneViolation = Math.max(report.coneViolation, result.coneViolation); report.stopViolation = Math.max(report.stopViolation, stopViolation);
        if (result.status !== "converged") {
          report.rejected++;
          failures.push({ time: k / hz, status: result.status, normalViolation: result.normalViolation, impulseResidual: result.impulseResidual,
            coneViolation: result.coneViolation, stopViolation, linearError, angularError });
        }
        for (const stop of result.stops) { report[stop.mode === "holding" ? "holding" : "released"]++; report.stopImpulse = Math.max(report.stopImpulse, stop.impulse); }
        for (const contact of result.contacts) if (contact.mode !== "free") report[contact.mode]++;
        report.angle = jointAngles(joint)[0]; report.baseVelocity = actual[0].velocity;
        if (k % (hz / 120) === 0) samples.push({ time: k / hz, status: result.status, angle: report.angle, linearError, angularError,
          stops: result.stops, bodies: actual.map(({ position, velocity, spin }) => ({ position, velocity, spin })) });
        trace.update(JSON.stringify({ bodies: actual, state: saveStand(stand.world, {}).state }));
      }
      return { report, failures, samples, observationSha256: trace.digest("hex") };
    };
    const result = branch(); loadStand(stand.world, {}, saved); assert.deepEqual(branch(), result);
    return { harness: "Node core stand", engine: stand.world.physics.engine, revision: stand.world.physics.revision,
      hz, sense, lift, slide, settings, stopSettings, replay: true, ...result };
  } finally { stand.dispose(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const hz of [120, 1920]) for (const sense of [-1, 1]) for (const lift of [false, true]) for (const slide of [false, true]) {
    console.log(JSON.stringify(await contactStops({ hz, sense, lift, slide })));
  }
}
