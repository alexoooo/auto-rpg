import test from "node:test";
import assert from "node:assert/strict";

import { horizontalForward } from "../src/camera.ts";

test("overhead_camera_projects_a_fallen_pelvis_forward_onto_the_floor", () => {
  const projected = horizontalForward(0.3, 0.4, 1, 0);
  assert.ok(Math.abs(projected.x - 0.6) < 1e-12);
  assert.ok(Math.abs(projected.z - 0.8) < 1e-12);
});

test("overhead_camera_keeps_its_last_bearing_when_a_fallen_pelvis_points_vertical", () => {
  assert.deepEqual(horizontalForward(0, 0, -0.8, 0.6), { x: -0.8, z: 0.6 });
  assert.deepEqual(horizontalForward(0, 0, 0, 0), { x: 0, z: 1 });
});
