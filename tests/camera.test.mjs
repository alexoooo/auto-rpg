import test from "node:test";
import assert from "node:assert/strict";

import { dragCamera, horizontalForward, wrapCameraYaw } from "../src/camera.ts";

test("overhead_camera_projects_a_fallen_pelvis_forward_onto_the_floor", () => {
  const projected = horizontalForward(0.3, 0.4, 1, 0);
  assert.ok(Math.abs(projected.x - 0.6) < 1e-12);
  assert.ok(Math.abs(projected.z - 0.8) < 1e-12);
});

test("overhead_camera_keeps_its_last_bearing_when_a_fallen_pelvis_points_vertical", () => {
  assert.deepEqual(horizontalForward(0, 0, -0.8, 0.6), { x: -0.8, z: 0.6 });
  assert.deepEqual(horizontalForward(0, 0, 0, 0), { x: 0, z: 1 });
});

test("camera_yaw_wraps_and_pitch_pan_clamp_in_both_modes", () => {
  assert.ok(wrapCameraYaw(Math.PI * 9) >= -Math.PI && wrapCameraYaw(Math.PI * 9) < Math.PI);
  const orbit = dragCamera(
    { mode: "orbit", pointerId: 4, yaw: 3, pitch: 0.6, panX: 0, panZ: 0 },
    -2000, -2000, 0.01, 12.5,
  );
  assert.ok(orbit.yaw >= -Math.PI && orbit.yaw < Math.PI);
  assert.equal(orbit.pitch, 0.65);
  const pan = dragCamera(
    { mode: "pan", pointerId: 4, yaw: 0, pitch: 0, panX: 12, panZ: -12 },
    -2000, 2000, 0.01, 12.5,
  );
  assert.deepEqual([pan.panX, pan.panZ], [12.5, -12.5]);
});
