import test from "node:test";
import assert from "node:assert/strict";
import { createBody } from "../src/core/body.ts";
import { humanSpec } from "../src/core/human/spec.ts";
import { GUARD } from "../src/core/skills/guard.ts";
import { wholeBodyExecutor } from "../src/core/skills/whole-body-strike.ts";
import { coreStand } from "./harness/core-stand.mjs";

const around = { heading: 0, placed: true, support: null, walk: null, lower: .05 };
test("whole-body admission initializes preparation and pure commands never rerun its solve", async () => {
  const stand = await coreStand(humanSpec("workshop-fighter"), { posture: GUARD, pinned: "lowerTrunk" });
  const body = createBody(stand.built, stand.world, { servoSeconds: .1 });
  const executor = wholeBodyExecutor(body, stand.world, ["whole"], "timed");
  const request = { id: 1, action: "whole", effector: "hand.right", target: { kind: "point", at: [0, body.view.head.y, .6] } };
  try {
    executor.start(body.view, request, around);
    assert.equal(executor.state.live.phase, "prepare");
    assert.equal(executor.state.live.stage, "admitting");
    assert.equal(executor.state.live.elapsed, 0);
    const before = structuredClone(executor.state), claim = executor.command(body.view, 1, around);
    assert.deepEqual(executor.command(body.view, 1, around), claim);
    assert.deepEqual(executor.state, before);
    assert.equal(claim.pushes.length, body.muscles.channels.length);
    assert.deepEqual(executor.needs("whole", "hand.right"), ["hand.left", "hand.right", "trunk", "legs"]);
    assert.equal(executor.update(body.view, [request], around, 1 / 120)[0].phase, "commit");
    assert.equal(executor.update(body.view, [], around, 1 / 120)[0].phase, "commit");
    executor.resume(body.view);
    executor.start(body.view, { ...request, id: 2 }, around);
    assert.equal(executor.update(body.view, [], around, 1 / 120)[0].phase, "release");
    assert.deepEqual(executor.state.live.ending, { kind: "cancelled" });
  } finally { body.dispose(); stand.dispose(); }
});
