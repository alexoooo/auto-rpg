import assert from "node:assert/strict";
import test from "node:test";

import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";

import { supportedRootTargetToRef } from "../src/supported-root-drive.ts";

const rotationDistance = (left, right) =>
  2 * Math.acos(Math.min(1, Math.abs(Quaternion.Dot(left, right))));

test("supported_root_righting_advances_velocity_and_never_exceeds_its_angular_speed", () => {
  const dt = 1 / 240;
  const maximumAngularSpeed = 1.2;
  const position = new Vector3(2, 0.9, -3);
  let rotation = Quaternion.RotationAxis(Vector3.Forward(), 0.28);
  const targetPosition = new Vector3();
  const desiredRotation = Quaternion.Identity();
  const targetRotation = Quaternion.Identity();
  let priorUp = Vector3.Up().rotateByQuaternionToRef(rotation, new Vector3()).y;

  for (let step = 0; step < 240; step += 1) {
    supportedRootTargetToRef(position, rotation, { x: 0.6, z: -0.3 }, 0, dt,
      maximumAngularSpeed, targetPosition, desiredRotation, targetRotation);
    assert.ok(rotationDistance(rotation, targetRotation) <= maximumAngularSpeed * dt + 1e-12,
      "one fixed step cannot become an exact upright snap");
    const nextUp = Vector3.Up().rotateByQuaternionToRef(targetRotation, new Vector3()).y;
    assert.ok(nextUp >= priorUp - 1e-12, "the bounded target must converge rather than add tilt");
    priorUp = nextUp;
    rotation = targetRotation.clone();
  }

  assert.ok(priorUp >= 0.999999, `the bounded drive did not finish upright: ${priorUp}`);
  assert.deepEqual(targetPosition.asArray(), [2 + 0.6 * dt, 0.9, -3 - 0.3 * dt]);
});
