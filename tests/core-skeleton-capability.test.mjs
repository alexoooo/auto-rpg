/**
 * **How well the crypt skeleton stands and walks** (`src/core/human/skeleton.ts`), measured on the
 * Node stand (Rapier, on a ground, 120 Hz), and not a gate (`tests/experimental.json`): 3 cm low
 * for 4 s, its centre over its soles within 1 cm, and its walk at half its envelope's pace or more.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createBody } from "../src/core/body.ts";
import { modelSpec } from "../src/core/models.ts";
import { SKELETON_MODEL } from "../src/core/human/skeleton.ts";
import { walk } from "../research/core-stance-trials.mjs";
import { coreStand } from "./harness/core-stand.mjs";

test("the skeleton stands 3 cm low for 4 s, its centre over its soles, and walks at its envelope's pace", async () => {
  const stand = await coreStand(modelSpec(SKELETON_MODEL), { ground: true, hz: 120 });
  const body = createBody(stand.built, stand.world, { servoSeconds: 0.1 });
  let goal = null;
  body.drive((view) => {
    const s = view.stance;
    if (!goal && view.time > 0) goal = { feet: ["left", "right"], centre: null, height: s.centre.y - s.support.y - 0.03, heading: 0 };
    return { posture: {}, pushes: [], stance: goal };
  });
  try {
    stand.step(stand.seconds(4));
    const s = body.view.stance;
    assert.ok(Math.hypot(s.centre.x - s.support.x, s.centre.z - s.support.z) < 0.01, `off by ${Math.hypot(s.centre.x - s.support.x, s.centre.z - s.support.z)}`);
    assert.ok(Math.abs(s.centre.y - s.support.y - goal.height) < 0.02, `height ${s.centre.y - s.support.y}, asked ${goal.height}`);
    assert.ok(s.velocity.length() < 0.01, `still moving at ${s.velocity.length()}`);
  } finally {
    body.dispose();
    stand.dispose();
  }
  const pace = body.envelope.walk.value;
  const walked = await walk({ model: SKELETON_MODEL, stance: {}, hz: 120, speed: pace, degrees: 0 });
  // `along` is the pace over the walk's last 3 s.
  assert.ok(!walked.fell && walked.along > pace / 2, JSON.stringify(walked));
});
