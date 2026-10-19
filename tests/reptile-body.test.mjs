/**
 * **The reptile's body** (`src/core/reptile/spec.ts`): its anatomy, sourced; built in its pose; and
 * down by its own rule under any mind (Node core stand, Rapier, 120 Hz).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createPolicyBody } from "../src/core/mind/direct.ts";
import { directPolicy } from "../src/core/entrants/direct/mind.ts";
import { reptileSpec } from "../src/core/reptile/spec.ts";
import { specProvenanceFaults } from "./fixtures/spec.mjs";
import { coreStand } from "./harness/core-stand.mjs";

test("the reptile has its own complete sourced anatomy", () => {
  const spec = reptileSpec();
  assert.deepEqual(specProvenanceFaults(spec), []);
  assert.equal(spec.mass.value, 8);
  assert.equal(spec.wounds.hp.value, 1);
  assert.equal(spec.attributes.balance.value, 0);
  assert.ok(Math.abs(spec.segments.reduce((n, s) => n + s.mass.value, 0) - 8) < 1e-12);
  assert.equal(spec.segments.filter(s => s.name.startsWith("paw.")).length, 4);
  assert.ok(spec.segments.every(s => s.mass.value > 0 && s.inertia.value.every(n => n > 0)));
  assert.equal(spec.joints.length, spec.segments.length - 1);
  assert.ok(spec.joints.every(j => j.dofs.every(d => d.min.value <= 0 && d.max.value >= 0)));
});

test("the reptile constructs in its declared joint pose without a corrective impulse", async () => {
  const stand = await coreStand(reptileSpec(), { gravity: false, ground: false });
  try {
    stand.step(8);
    for (const s of stand.built.segments.values()) {
      const v = s.body.linearVelocityToRef(s.node.position.clone());
      assert.ok(v.length() < 1e-5, `${s.spec.name}: ${v.length()}`);
    }
  } finally { stand.dispose(); }
});

test("a reptile is down by its own rule under any mind", async () => {
  // A mind that knows nothing of reptiles reads the spec's rule: on its back it is down, built on its paws it is not.
  const read = async (rotation, position) => {
    const s = await coreStand(reptileSpec(), { engine: "rapier-coordinate", rotation, position });
    const body = createPolicyBody(s.built, s.world, directPolicy({ kind: "direct", targets: {}, seconds: 0.05, speed: 1, activation: 0 }));
    try { s.step(); return [body.down, body.observe().down]; } finally { body.dispose(); s.dispose(); }
  };
  assert.deepEqual(await read(undefined, [0, 0, 0]), [false, false]);
  assert.deepEqual(await read([0, 0, 1, 0], [0, 0.5, 0]), [true, true]);
});
