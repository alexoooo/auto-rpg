import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { ARM_REST, ARM_LIMITS, armForward } from "../src/golem/humanoid/kinematics.ts";
import { solveTaskEndpoint } from "../src/golem/humanoid/task-kinematics.ts";

const tip = (angles, offset) => {
  const pose = armForward(angles);
  return pose.point.add(offset.rotateByQuaternionToRef(pose.rotation, new Vector3()));
};

test("endpoint fallback solves the carried point rather than the palm", () => {
  const offset = new Vector3(0, 0, .8);
  const requested = [...ARM_REST]; requested[0] += .4; requested[3] -= .3;
  const target = tip(requested, offset);
  const solved = solveTaskEndpoint(target, offset, ARM_REST, () => true, 120);
  assert.ok(Vector3.Distance(tip(solved, offset), target) < .001);
  assert.ok(Vector3.Distance(armForward(solved).point, target) > .7,
    "fixture must distinguish a palm target from a carried endpoint");
  assert.ok(Vector3.Distance(tip(ARM_REST, offset), target) > .1);
});

test("each fallback correction respects the palm envelope and improves the endpoint", () => {
  const offset = new Vector3(0, 0, .8), origin = armForward(ARM_REST).point;
  const requested = [...ARM_REST]; requested[0] += .7; requested[3] += .7;
  const target = tip(requested, offset);
  const accepts = point => Vector3.Distance(point, origin) <= .02;
  let angles = [...ARM_REST], error = Vector3.Distance(tip(angles, offset), target);
  const initialError = error;
  for (let i = 0; i < 50; i++) {
    angles = solveTaskEndpoint(target, offset, angles, accepts, 1);
    assert.ok(accepts(armForward(angles).point));
    const next = Vector3.Distance(tip(angles, offset), target);
    assert.ok(next <= error + 1e-12); error = next;
    assert.ok(angles.every((angle, j) => angle >= ARM_LIMITS[j][0] && angle <= ARM_LIMITS[j][1]));
  }
  assert.ok(error < initialError - .01, "no correction was admitted");
  const unbounded = solveTaskEndpoint(target, offset, ARM_REST, () => true, 120);
  assert.ok(!accepts(armForward(unbounded).point), "the control must cross the envelope boundary");
  const rejected = solveTaskEndpoint(target, offset, ARM_REST, () => false);
  assert.deepEqual(rejected, ARM_REST);
  const stops = ARM_LIMITS.map(([, max]) => max);
  const beyond = tip(stops.map(angle => angle + .2), offset);
  const bounded = solveTaskEndpoint(beyond, offset, stops, () => true, 1);
  assert.ok(bounded.every((angle, i) => angle >= ARM_LIMITS[i][0] && angle <= ARM_LIMITS[i][1]),
    "an improving endpoint step cannot cross an anatomical stop");
});
