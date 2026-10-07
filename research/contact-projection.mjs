import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import fixture from "../assets/research/contact-projection.json" with { type: "json" };
import { coreStand, saveStand, loadStand } from "../tests/harness/core-stand.mjs";
import { sourced } from "../src/core/spec/quantity.ts";
import { createEquipment } from "../src/core/equipment.ts";
import { coupledDynamics } from "../src/core/build/coupled-dynamics.ts";
import { predictPointContacts } from "../src/core/build/contact-step.ts";
import { CONTACT_FRICTION } from "../src/core/engine/engine.ts";

const q = (path, unit = "m") => sourced(path.split("/").reduce((v, key) => v[key], fixture), unit, "contact-projection-fixture", "/" + path);
const zero = [0, 0, 0], identity = [0, 0, 0, 1];
const spec = { model: "contact-projection", mass: q("root/mass", "kg"), stature: q("root/stature"), joints: [], segments: [{
  name: "root", proximal: q("root/proximal"), distal: q("root/distal"), mass: q("root/mass", "kg"), centreOfMass: q("root/centre"),
  inertia: q("root/inertia", "kg m2"), shape: { kind: "sphere", centre: q("root/centre"), radius: q("root/radius") },
  surface: { stiffness: q("root/surfaceStiffness", "N/m") },
}] };
const item = { name: "offset load", mass: q("load/mass", "kg"), centreOfMass: q("load/centre"), inertia: q("load/inertia", "kg m2"),
  shapes: [{ kind: "sphere", centre: q("load/centre"), radius: q("load/radius") }], points: {} };
const centre = (body) => new Vector3(...body.massProperties.centre).applyRotationQuaternion(body.node.rotationQuaternion).add(body.node.position);
const tangent = (impulse) => { const length = Math.hypot(impulse[0], impulse[2]); assert.ok(length > 0); return [impulse[0] / length, impulse[2] / length]; };

/** Equal-duration sliding trials distinguish contact-body and articulated friction projection. */
export async function contactProjection({ hz = 120, sense = 1 } = {}) {
  if (!fixture.rates.includes(hz) || ![-1, 1].includes(sense)) throw new Error("invalid contact projection trial");
  const stand = await coreStand(spec, { hz, engine: "rapier-coordinate-coulomb" }), root = stand.built.segments.get("root");
  const load = createEquipment(stand.world, { id: "load", item, pose: { position: fixture.load.position, rotation: identity }, capture: fixture.capture,
    grips: [{ name: "fixed", body: root.body, bodyFrame: { position: zero, rotation: identity },
      itemFrame: { position: root.node.position.asArray().map((v, i) => v - fixture.load.position[i]), rotation: root.node.rotationQuaternion.asArray() } }] });
  try {
    assert.equal(load.tryGrip("fixed"), true);
    const bodies = [root.body, load.body];
    for (const body of bodies) body.applyImpulse(new Vector3(...fixture.velocity).scaleInPlace(sense * body.massProperties.mass), centre(body));
    const model = coupledDynamics(stand.built, stand.world.physics.gravity, [load]);
    const settings = { ...fixture.solve, dt: 1 / hz, friction: CONTACT_FRICTION }, saved = saveStand(stand.world, {});
    const branch = () => {
      const metrics = Object.fromEntries(["coupled", "rigid-body"].map((name) => [name, { impulse: [0, 0, 0], rejected: 0, work: 0, linearError: 0, angularError: 0 }]));
      const actualImpulse = [0, 0, 0], trace = createHash("sha256");
      for (let step = 0; step < hz * fixture.referenceSteps / fixture.referenceHz; step++) {
        model.update();
        const at = centre(root.body), point = [at.x, at.y - fixture.root.radius, at.z];
        const contacts = [{ body: root.body, point, normal: [0, 1, 0], normalVelocity: -Math.max(point[1], 0) * hz }];
        const positions = bodies.map((b) => centre(b).asArray()), before = bodies.map((b) => b.linearVelocityToRef(new Vector3()).asArray());
        const unchanged = saveStand(stand.world, {});
        const predictions = Object.keys(metrics).map((frictionMetric) => {
          const prediction = predictPointContacts(model, [], contacts, [], { ...settings, frictionMetric }), metric = metrics[frictionMetric];
          assert.ok(prediction.acceleration);
          if (prediction.status !== "converged") metric.rejected++;
          metric.work = Math.max(metric.work, prediction.work);
          prediction.contacts[0].impulse.forEach((v, k) => { metric.impulse[k] += v; });
          return { metric, velocities: bodies.map((body, i) => {
            const v = model.pointVelocity(body, positions[i], prediction.projection.velocity), a = model.pointAcceleration(body, positions[i], prediction.acceleration);
            return { linear: v.linear.map((x, k) => x + a.linear[k] / hz), angular: v.angular.map((x, k) => x + a.angular[k] / hz) };
          }) };
        });
        assert.deepEqual(saveStand(stand.world, {}), unchanged, "projection queries cannot change the world");
        stand.step();
        const actual = bodies.map((body) => ({ position: body.node.position.asArray(), rotation: body.node.rotationQuaternion.asArray(),
          velocity: body.linearVelocityToRef(new Vector3()).asArray(), spin: body.angularVelocityToRef(new Vector3()).asArray() }));
        for (let i = 0; i < bodies.length; i++) {
          for (let k = 0; k < 3; k++) actualImpulse[k] += bodies[i].massProperties.mass * (actual[i].velocity[k] - before[i][k] - stand.world.physics.gravity[k] / hz);
          for (const { metric, velocities } of predictions) {
            metric.linearError = Math.max(metric.linearError, ...actual[i].velocity.map((v, k) => Math.abs(v - velocities[i].linear[k])));
            metric.angularError = Math.max(metric.angularError, ...actual[i].spin.map((v, k) => Math.abs(v - velocities[i].angular[k])));
          }
        }
        trace.update(JSON.stringify({ actual, equipment: load.observe(), state: saveStand(stand.world, {}).state }));
      }
      const direction = tangent(actualImpulse);
      for (const metric of Object.values(metrics)) {
        metric.direction = tangent(metric.impulse);
        metric.directionError = Math.hypot(...metric.direction.map((v, i) => v - direction[i]));
      }
      return { actualImpulse, direction, metrics, physicalDigest: trace.digest("hex") };
    };
    const result = branch(); loadStand(stand.world, {}, saved); assert.deepEqual(branch(), result);
    return { harness: "Node core stand", hz, sense, seconds: fixture.referenceSteps / fixture.referenceHz,
      engine: stand.world.physics.engine, revision: stand.world.physics.revision, fixture, settings, replay: true, ...result };
  } finally { load.dispose(); stand.dispose(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const hz of fixture.rates) for (const sense of [-1, 1]) console.log(JSON.stringify(await contactProjection({ hz, sense })));
}
