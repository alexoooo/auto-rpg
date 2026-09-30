/**
 * The workshop humans in the core's Node stand: the built body's inertia, and its joints and muscle
 * holding it against gravity.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { humanSpec } from "../src/core/human/spec.ts";
import { servo } from "../src/core/control/servo.ts";
import { driveMuscles } from "../src/core/muscle/driver.ts";
import { coreStand, relativeRotation, spinOnce } from "./harness/core-stand.mjs";

const MODELS = ["workshop-fighter", "workshop-rogue"];

/**
 * The built body's inertia is anatomical: each segment, built alone and spun by its spec inertia
 * times 1 rad/s about each frame axis, turns at 1 rad/s. No solver floor is applied.
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

/**
 * `seconds` on the stand, each freedom servoed to the reference pose by its muscles, or with none:
 * each joint's rotation from the pose (degrees), and each freedom's torque as a share of its weaker
 * isometric peak.
 */
async function heldOnAStand(model, seconds, muscles = true) {
  const stand = await coreStand(humanSpec(model), { ground: false, position: [0, 0.5, 0], pinned: "lowerTrunk" });
  const driver = muscles ? driveMuscles(stand.built, stand.world, (d, dt) => servo(d, () => 0, 0.1, dt)) : null;
  try {
    stand.step(stand.seconds(seconds));
    const degrees = Object.fromEntries([...stand.built.joints.values()].map((joint) =>
      [joint.spec.name, 2 * Math.acos(Math.min(1, Math.abs(relativeRotation(joint).w))) * 180 / Math.PI]));
    const torques = driver ? driver.channels.map((c, i) => driver.ceiling[i]) : [];
    const shares = driver ? Object.fromEntries(driver.channels.map((c, i) => [c.name, torques[i] / Math.min(c.positive.peak, c.negative.peak)])) : {};
    return { degrees, shares, largest: Math.max(0, ...torques) };
  } finally { driver?.dispose(); stand.dispose(); }
}

/**
 * Each human, pinned at the pelvis as on a mannequin's stand, holds its reference pose against
 * gravity, its muscles servoing every freedom to it (time constant 0.1 s). The control: with no
 * muscles, both slump.
 *
 * The servo gives torque sources (saturated motors), which the engine delivers exactly. A velocity
 * motor asked for no motion under its ceiling holds only as far as the solver converges, and
 * creeps (`research/core-rapier-probe.mjs`, its brake), so it is no way to hold a pose.
 *
 * Pinned, so this reads the joints and muscles alone, not balance on the feet.
 */
test("on a stand at the pelvis, each human holds its reference pose against gravity within its weaker peaks", async () => {
  for (const model of MODELS) {
    const { degrees, shares, largest } = await heldOnAStand(model, 5);
    for (const [joint, d] of Object.entries(degrees)) assert.ok(d < 0.2, `${model} ${joint} gave ${d.toFixed(3)} degrees`);
    for (const [channel, share] of Object.entries(shares)) assert.ok(share < 0.5, `${model} ${channel} held at ${share.toFixed(2)} of its weaker peak`);
    assert.ok(largest > 1, `${model} bore its weight at ${largest} N m at most`);
    const slumped = (await heldOnAStand(model, 5, false)).degrees;
    assert.ok(Math.max(...Object.values(slumped)) > 30, `${model} with no muscles: ${JSON.stringify(slumped)}`);
  }
});
