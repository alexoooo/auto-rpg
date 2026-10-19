/**
 * **How the reptile recovers** (`recoveryTrial`, `research/reptile-control.mjs`), measured on the Node
 * core stand, the coordinate engine, 120 Hz, and not a gate (`tests/experimental.json`): from four
 * fallen poses in two headings it hands off to its crawl within 100 s on four flat contacts, then
 * walks two trunk lengths without falling, unassisted. What righting holds is
 * `reptile-recovery.test.mjs`'s.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { recoveryTrial } from "../research/reptile-control.mjs";

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
