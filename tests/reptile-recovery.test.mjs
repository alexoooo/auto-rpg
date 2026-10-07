import test from "node:test";
import assert from "node:assert/strict";
import { recoveryTrial } from "../research/reptile-control.mjs";
import { createQuadrupedMind } from "../src/core/reptile/mind.ts";
import { reptileSpec } from "../src/core/reptile/spec.ts";
import { coreStand } from "./harness/core-stand.mjs";

test("four fallen poses recover with physical support and walk two trunk lengths, in two headings", async () => {
  for (const yaw of [0, Math.PI / 2]) for (const pose of ["back", "left", "right", "belly"]) {
    const result = await recoveryTrial(pose, yaw), message = JSON.stringify(result);
    assert.ok(result.handoff !== null && result.handoff < 100, message);
    assert.deepEqual(result.support, Array.from({ length: 4 }, () => ({ contact: true, flat: true })), message);
    assert.equal(result.falls, 0, message);
    assert.ok(result.distance >= .88 && result.steps >= 20, message);
    assert.equal(result.assist.force, 0); assert.equal(result.assist.moment, 0);
  }
});

test("righting never substitutes an imagined floor for contact", async () => {
  const stand = await coreStand(reptileSpec(), { engine: "rapier-coordinate", rotation: [0, 0, 1, 0], gravity: false, ground: false });
  const mind = createQuadrupedMind(stand.built, stand.world);
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
