/**
 * The workshop humans in the core's Node stand: the built body's inertia, and its joints and muscle
 * holding it against gravity.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { humanSpec } from "../src/core/human/spec.ts";
import { coreStand, holdReferencePose, relativeRotation, spinOnce } from "./harness/core-stand.mjs";

const MODELS = ["workshop-fighter", "workshop-rogue"];

/**
 * The plan's stage 1 test, "the built body's inertia is anatomical": each segment, built alone and
 * spun by its spec inertia times 1 rad/s about each frame axis, turns at 1 rad/s. No solver floor
 * is applied. Measured 0.37 % at worst (Node stand, 120 Hz, one step).
 */
test("each human's built segments turn under an impulse as their spec inertia says", async () => {
  for (const model of MODELS) {
    const spec = humanSpec(model);
    for (const segment of spec.segments) {
      for (const [i, axisName] of ["x", "y", "z"].entries()) {
        const { along, across } = await spinOnce({ ...spec, segments: [segment], joints: [] }, segment.name, axisName, segment.inertia.value[i]);
        assert.ok(Math.abs(along - 1) < 0.01 && across < 0.01, `${model} ${segment.name} about ${axisName}: ${along} rad/s, ${across} off its axis`);
      }
    }
  }
});

/** Each joint's rotation from the reference pose, in degrees, after `seconds` on the stand. */
async function heldOnAStand(model, seconds, ceiling) {
  const stand = await coreStand(humanSpec(model), { ground: false, position: [0, 0.5, 0], pinned: "lowerTrunk" });
  try {
    holdReferencePose(stand.built, ceiling);
    stand.step(stand.seconds(seconds));
    return Object.fromEntries([...stand.built.joints.values()].map((joint) =>
      [joint.spec.name, 2 * Math.acos(Math.min(1, Math.abs(relativeRotation(joint).w))) * 180 / Math.PI]));
  } finally { stand.dispose(); }
}

/**
 * The plan's stage 1 stand: each human, pinned at the pelvis as on a mannequin's stand, holds its
 * reference pose against gravity for 5 s with every freedom braked at its weaker isometric peak.
 * It read 0.5 degrees at worst for the Warrior and 1.0 for the Rogue, both elbows, settled in the
 * first second and still there at 10 s (Node stand, 120 Hz). The control: at 1 N m a freedom, both
 * slump -- a shoulder by 81-85 degrees.
 *
 * Pinned, because the feet are a separate problem: see the plan, stage 1, "Found while building".
 */
test("on a stand at the pelvis, each human holds its reference pose against gravity at its weaker peaks", async () => {
  for (const model of MODELS) {
    const held = await heldOnAStand(model, 5);
    for (const [joint, degrees] of Object.entries(held)) assert.ok(degrees < 2, `${model} ${joint} gave ${degrees.toFixed(2)} degrees`);
    const slumped = await heldOnAStand(model, 5, () => 1);
    assert.ok(Math.max(...Object.values(slumped)) > 30, `${model} at 1 N m a freedom: ${JSON.stringify(slumped)}`);
  }
});
