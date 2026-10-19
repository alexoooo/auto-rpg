/**
 * **The reptile's righting** (`quadrupedMind`, `src/core/reptile/mind.ts`), on the Node core
 * stand, the coordinate engine, 120 Hz: a fall is righted on contact, never on an imagined floor,
 * unassisted and finite whatever its ending. How often and how fast it recovers and walks off is
 * `reptile-recovery-capability.test.mjs`'s.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { quadrupedMind } from "../src/core/reptile/mind.ts";
import { hostedMind } from "../src/core/mind/host.ts";
import { reptileSpec } from "../src/core/reptile/spec.ts";
import { coreStand } from "./harness/core-stand.mjs";

test("a reptile fallen on its back rights itself, finite and unassisted, whatever its ending", async () => {
  const stand = await coreStand(reptileSpec(), { engine: "rapier-coordinate", groundSize: 100, rotation: [0, 0, 1, 0], position: [0, .34, 0] });
  const mind = hostedMind(stand.built, stand.world, {}, (host, wiring) => quadrupedMind(host, wiring));
  try {
    stand.step(1);
    assert.equal(mind.body.has, "righting", "the fixture did not reach its case: the reptile on its back is not righting");
    for (let step = 0; step < 1200; step++) {
      stand.step();
      const centre = mind.body.observe().centre;
      assert.ok(centre.every(Number.isFinite), `step ${step}: ${centre}`);
    }
    assert.ok(Number.isInteger(mind.body.state.mind.subs[0].retries));
    assert.equal(mind.body.assist.meter.force, 0); assert.equal(mind.body.assist.meter.moment, 0);
  } finally { mind.body.dispose(); stand.dispose(); }
});

test("righting never substitutes an imagined floor for contact", async () => {
  const stand = await coreStand(reptileSpec(), { engine: "rapier-coordinate", rotation: [0, 0, 1, 0], gravity: false, ground: false });
  const mind = hostedMind(stand.built, stand.world, {}, (host, wiring) => quadrupedMind(host, wiring));
  try {
    stand.step(1200);
    const recovery = mind.body.state.mind.subs[0];
    assert.equal(mind.body.has, "righting"); assert.equal(recovery.phase, "roll");
    assert.deepEqual(recovery.loaded, [false, false, false, false]);
    assert.deepEqual(recovery.placed, [false, false, false, false]);
    assert.equal(mind.body.down, true);
    assert.equal(mind.body.assist.meter.force, 0); assert.equal(mind.body.assist.meter.moment, 0);
  } finally { mind.body.dispose(); stand.dispose(); }
});
