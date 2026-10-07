import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { coreStand, saveStand, loadStand } from "../tests/harness/core-stand.mjs";
import { sourced } from "../src/core/spec/quantity.ts";
import { CONTACT_FRICTION } from "../src/core/engine/engine.ts";
import { isEngineName } from "../src/core/engine/engines.ts";
import { planarSupportPoints } from "../src/core/build/planar-support.ts";
import { coupledDynamics } from "../src/core/build/coupled-dynamics.ts";
import { activeQuadratic } from "../src/core/math/active-quadratic.ts";

const zero = [0, 0, 0], up = [0, 1, 0];
const q = (v, unit = "m") => sourced(v, unit, "de-leva-1996", "synthetic free sliding slab");
const spec = { model: "sliding-slab", mass: q(1, "kg"), stature: q(.1), joints: [], segments: [{
  name: "slab", proximal: q([0, .1, 0]), distal: q(zero), mass: q(1, "kg"), centreOfMass: q([0, .05, 0]),
  inertia: q([.02, .04, .04], "kg m2"), shape: { kind: "box", centre: q([0, .05, 0]), size: q([.6, .1, .4]) },
  surface: { stiffness: q(1e5, "N/m") },
}] };

/** Free, continuously sliding four-corner patch; not a general contact-mode selector. */
export async function slidingSlab({ hz = 120, spin = 3, sense = 1, engine = "rapier-coordinate" } = {}) {
  if (![120, 1920].includes(hz) || ![-3, 0, 3].includes(spin) || ![-1, 1].includes(sense)) throw new Error("invalid sliding slab experiment");
  const stand = await coreStand(spec, { hz, engine, actuation: "directional" });
  try {
    stand.step(hz); const body = stand.built.segments.get("slab").body;
    const centre = () => new Vector3(...body.massProperties.centre).applyRotationQuaternion(body.node.rotationQuaternion).add(body.node.position);
    body.applyImpulse(new Vector3(sense, 0, 0), centre()); body.applyTorqueImpulse(new Vector3(0, spin * .04, 0)); stand.step();
    const model = coupledDynamics(stand.built, stand.world.physics.gravity);
    const solver = activeQuadratic(4, 7, { iterations: 2048, absoluteTolerance: 1e-7, relativeTolerance: 1e-6 });
    const snapshot = saveStand(stand.world, {});
    const branch = () => {
      const errors = () => ({ linear: 0, angular: 0, normalResidual: 0, minLoad: Infinity, minSlip: Infinity });
      const result = { patch: errors(), point: errors(), projectedPoint: errors(), samples: [] };
      for (let k = 0; k < hz / 30; k++) {
        const velocity = body.linearVelocityToRef(new Vector3()), angular = body.angularVelocityToRef(new Vector3()), com = centre();
        const manifolds = stand.world.physics.contactManifoldsOf(body, (other) => other === null);
        assert.equal(manifolds.length, 1); assert.equal(manifolds[0].points.length, 4); assert.ok(manifolds[0].impulse > 0);
        const points = planarSupportPoints({ kind: "box", centre: body.massProperties.centre, size: [.6, .1, .4] },
          body.node.position.asArray(), body.node.rotationQuaternion, up, .001);
        assert.equal(points.length, 4, "the fixture retains a flat support patch");
        const patchCentre = points.reduce((sum, p) => sum.add(new Vector3(...p).scale(.25)), Vector3.Zero());
        model.update(); const free = model.solve([]);
        const read = (a) => { const p = model.pointAcceleration(body, com.asArray(), a); return [p.linear[1], p.angular[0], p.angular[2]]; };
        const base = read(free), predictions = {};
        const before = saveStand(stand.world, {});
        for (const mode of ["point", "patch", "projectedPoint"]) {
          const stats = result[mode];
          const columns = points.map((point) => {
            const at = mode === "patch" ? patchCentre : new Vector3(...point);
            const local = Vector3.Cross(angular, at.subtract(com)).add(velocity), speed = Math.hypot(local.x, local.z);
            assert.ok(speed > .1, "kinetic friction requires continuing tangential slip"); stats.minSlip = Math.min(stats.minSlip, speed);
            let x = local.x, z = local.z;
            if (mode === "projectedPoint") {
              const unloaded = model.pointAcceleration(body, point, free).linear;
              const response = (force) => model.pointAcceleration(body, point, model.solve([], [{ body, point, force, moment: zero }])).linear.map((v, i) => v - unloaded[i]);
              const rx = response([1, 0, 0]), rz = response([0, 0, 1]), determinant = rx[0] * rz[2] - rz[0] * rx[2];
              assert.ok(determinant > 0);
              x = (rz[2] * local.x - rz[0] * local.z) / determinant;
              z = (rx[0] * local.z - rx[2] * local.x) / determinant;
            }
            const directionLength = Math.hypot(x, z);
            const tangent = [-CONTACT_FRICTION * x / directionLength, 0, -CONTACT_FRICTION * z / directionLength];
            const loads = [{ body, point, force: up, moment: zero }, { body, point: at.asArray(), force: tangent, moment: zero }];
            if (mode === "patch" && spin !== 0) {
              assert.ok(Math.abs(angular.y) > .1, "the measured window excludes twist stopping");
              const radius = new Vector3(...point).subtract(patchCentre).length();
              loads.push({ body, point: patchCentre.asArray(), force: zero,
                moment: [0, -Math.sign(angular.y) * CONTACT_FRICTION * radius, 0] });
            }
            return { loads, response: read(model.solve([], loads)).map((v, i) => v - base[i]) };
          });
          const matrix = [], lower = [], upper = [];
          // Explicit acceleration bands avoid duplicate exactly opposing active constraints.
          for (let r = 0; r < 3; r++) {
            matrix.push(...columns.map((c) => c.response[r])); lower.push(-base[r] - 1e-8); upper.push(-base[r] + 1e-8);
          }
          for (let r = 0; r < 4; r++) {
            matrix.push(...points.map((_, c) => Number(c === r))); lower.push(0); upper.push(Infinity);
          }
          const report = solver.solve({ hessian: Array.from({ length: 16 }, (_, i) => Number(i % 5 === 0)), gradient: [0, 0, 0, 0], matrix, lower, upper, rows: 7 });
          assert.equal(report.status, "converged", JSON.stringify(report));
          const forces = Array.from(solver.state.x); stats.minLoad = Math.min(stats.minLoad, ...forces);
          const acceleration = model.solve([], columns.flatMap((column, i) => column.loads.map((load) => ({ ...load,
            force: load.force.map((v) => v * forces[i]), moment: load.moment.map((v) => v * forces[i]),
          }))));
          stats.normalResidual = Math.max(stats.normalResidual, ...read(acceleration).map(Math.abs));
          predictions[mode] = { forces, ...model.pointAcceleration(body, com.asArray(), acceleration) };
        }
        assert.deepEqual(saveStand(stand.world, {}), before, "predictions apply no force to the physical world");
        stand.step();
        const measured = { linear: body.linearVelocityToRef(new Vector3()).subtract(velocity).scale(hz).asArray(),
          angular: body.angularVelocityToRef(new Vector3()).subtract(angular).scale(hz).asArray() };
        for (const mode of ["point", "patch", "projectedPoint"]) for (const field of ["linear", "angular"]) {
          result[mode][field] = Math.max(result[mode][field], ...measured[field].map((v, i) => Math.abs(v - predictions[mode][field][i])));
        }
        // Both rates retain records at the game rate's spacing, starting before each step.
        if (k % (hz / 120) === 0) result.samples.push({ time: k / hz, predictions, measured });
      }
      return { ...result, finalVelocity: body.linearVelocityToRef(new Vector3()).asArray(), finalSpin: body.angularVelocityToRef(new Vector3()).asArray() };
    };
    const result = branch(); loadStand(stand.world, {}, snapshot); assert.deepEqual(branch(), result, "complete branch replay");
    return { engine, revision: stand.world.physics.revision, hz, spin, sense, seconds: 1 / 30, replay: true, ...result };
  } finally { stand.dispose(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values } = parseArgs({ options: { engine: { type: "string", default: "rapier-coordinate" } } });
  if (!isEngineName(values.engine)) throw new Error("unknown sliding slab engine");
  for (const hz of [120, 1920]) for (const spin of [-3, 0, 3]) for (const sense of [-1, 1]) console.log(JSON.stringify(await slidingSlab({ hz, spin, sense, engine: values.engine })));
}
