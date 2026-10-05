import test from "node:test";
import assert from "node:assert/strict";
import { rapierModule } from "../src/core/engine/rapier.ts";
import { loadEngine } from "../src/core/engine/engines.ts";
import { humanSpec } from "../src/core/human/spec.ts";
import { coreStand, saveStand, loadStand } from "./harness/core-stand.mjs";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";

test("friction and limit profiles share WASM but preserve independent snapshot settings", async () => {
  const profiles = [["rapier", false, false], ["rapier-coordinate", true, false],
    ["rapier-coulomb", false, true], ["rapier-coordinate-coulomb", true, true]];
  const engines = await Promise.all(profiles.map(([name]) => loadEngine(name))), R = await rapierModule();
  assert.equal(new Set(engines.map((engine) => engine.revision)).size, profiles.length);
  const defaults = new R.IntegrationParameters();
  try { assert.equal(defaults.pointContactFriction, false); } finally { defaults.free(); }
  const stands = await Promise.all(profiles.map(([engine]) => coreStand(humanSpec("workshop-rogue"), { engine })));
  try {
    const verify = (stand, i) => {
      assert.equal(stand.world.physics.engine, profiles[i][0]);
      assert.equal(stand.world.physics.revision, engines[i].revision);
      assert.equal(stand.world.physics.rapier, R);
      assert.equal(stand.world.physics.raw.integrationParameters.coordinateAngularLimits, profiles[i][1]);
      assert.equal(stand.world.physics.raw.integrationParameters.pointContactFriction, profiles[i][2]);
    };
    stands.forEach(verify); stands.forEach((stand) => stand.step(30));
    const snapshots = stands.map((stand) => saveStand(stand.world, {}));
    const trace = (stand) => Array.from({ length: 20 }, () => {
      stand.step();
      return { state: saveStand(stand.world, {}).state, bodies: [...stand.built.segments.values()].map(({ body }) => ({
        position: body.node.position.asArray(), rotation: body.node.rotationQuaternion.asArray(),
        velocity: body.linearVelocityToRef(new Vector3()).asArray(), spin: body.angularVelocityToRef(new Vector3()).asArray(),
        contacts: stand.world.physics.contactsOf(body, (other) => other === null),
      })) };
    });
    for (let i = 0; i < stands.length; i++) {
      const stand = stands[i], expected = trace(stand);
      loadStand(stand.world, {}, snapshots[i]); verify(stand, i);
      assert.deepEqual(trace(stand), expected);
      const after = saveStand(stand.world, {});
      for (let j = 0; j < stands.length; j++) if (i !== j) {
        assert.throws(() => loadStand(stand.world, {}, snapshots[j]), /physics configuration/);
        assert.deepEqual(saveStand(stand.world, {}), after, "rejected configuration leaves the destination unchanged"); verify(stand, i);
      }
    }
    stands[0].dispose(); stands.shift();
    stands.forEach((stand, i) => { stand.step(); verify(stand, i + 1); });
  } finally { stands.forEach((stand) => stand.dispose()); }
});
