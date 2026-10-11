import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { coreStand } from "./harness/core-stand.mjs";
import { modelSpec } from "../src/core/models.ts";
import { guardPosture } from "../src/core/skills/guard.ts";

// An actual two-shove Lab fall, followed by bounded muscle motion into a supported kneel.
// The torso clears the thigh while a discarded geometric point retains its cached impulse.
const saved = new Uint8Array(readFileSync(new URL("./fixtures/inactive-contact-world.bin", import.meta.url)));

test("discarded geometric contacts contribute no load to current solver contacts", async () => {
  const spec = modelSpec("workshop-fighter");
  const f = await coreStand(spec, { engine: "rapier-coordinate", posture: guardPosture(spec), groundSize: 40 });
  try {
    f.world.physics.load(saved);
    const trunk = f.built.segments.get("middleTrunk").body;
    const thigh = f.built.segments.get("thigh.right").body;
    const raw = f.world.physics.raw;
    const geometric = [], solver = [];
    raw.narrowPhase.contactPair(trunk.rigid.collider(0).handle, thigh.rigid.collider(0).handle, raw.bodies, manifold => {
      for (let i = 0; i < manifold.numContacts(); i++) geometric.push(manifold.contactImpulse(i));
      for (let i = 0; i < manifold.numSolverContacts(); i++) {
        const point = manifold.solverContactPoint(i);
        solver.push({ point: [point.x, point.y, point.z], distance: manifold.solverContactSeparation(i) });
      }
    });
    assert.deepEqual(geometric, [0, 0, 0, 0, 0.97710120677948]);
    assert.equal(solver.length, 4);
    assert.ok(solver.every(({ distance }) => distance > 0.006 && distance < 0.007));

    const contacts = f.world.physics.contactsOf(trunk, other => other === thigh);
    assert.equal(contacts.length, 1, "predictive contacts remain observable");
    assert.deepEqual(contacts.map(({ impulse, pairs }) => ({ impulse, pairs })), [{ impulse: 0, pairs: [] }]);
    const manifolds = f.world.physics.contactManifoldsOf(trunk, other => other === thigh);
    assert.deepEqual(manifolds.map(({ impulse, points }) => ({ impulse, points })),
      [{ impulse: 0, points: solver }]);
    assert.equal(manifolds[0].points.length, 4);
  } finally { f.dispose(); }
});
