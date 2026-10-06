/**
 * **The lab's camera** (`src/lab/camera.ts`): the isometric angle, the chase's bearing behind a
 * body, the facing of a pelvis on its side, the short way round, and orthographic extents that frame
 * what the perspective frames.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Quaternion } from "@babylonjs/core/Maths/math.vector.js";
import {
  behind, CHASE_BETA, easeAngle, facingOf, horizontalForward, ISO_ALPHA, ISO_BETA, orthoExtents,
} from "../src/render/camera-math.ts";

const close = (actual, expected, message, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} against ${expected}`);
/** Where an orbit camera at `alpha`, `beta` stands from its target, per metre of radius. */
const offset = (alpha, beta) => ({ x: Math.cos(alpha) * Math.sin(beta), y: Math.cos(beta), z: Math.sin(alpha) * Math.sin(beta) });

test("isometric_looks_down_at_the_isometric_angle_a_quarter_turn_off_the_axes", () => {
  const o = offset(ISO_ALPHA, ISO_BETA);
  close(Math.atan2(o.y, Math.hypot(o.x, o.z)), Math.atan(1 / Math.SQRT2), "the elevation");
  // Isometric: the three axes foreshorten alike, so the sight line makes one angle with each.
  close(Math.abs(o.x), Math.abs(o.y), "x against y");
  close(Math.abs(o.z), Math.abs(o.y), "z against y");
  assert.ok(o.x < 0 && o.z < 0, "it stands behind the body's start (-z) and to its left (-x)");
  assert.ok(CHASE_BETA > ISO_BETA && CHASE_BETA < Math.PI / 2, "the chase is above the level and lower than isometric");
});

test("the_chase_stands_behind_the_facing_whichever_way_the_body_turned", () => {
  const rest = Quaternion.RotationYawPitchRoll(0.4, 0.1, -0.2);
  for (const yaw of [0, 0.5, Math.PI / 2, 3, -3, -Math.PI / 2]) {
    // The pelvis turned by `yaw` about the vertical from its rest, which already faces +z.
    const rotation = Quaternion.RotationYawPitchRoll(yaw, 0, 0).multiply(rest);
    const facing = facingOf(rotation, rest, { x: 0, z: 1 });
    close(facing.x, Math.sin(yaw), `facing x at yaw ${yaw}`);
    close(facing.z, Math.cos(yaw), `facing z at yaw ${yaw}`);
    const o = offset(behind(facing), Math.PI / 2);
    close(o.x, -facing.x, `behind, x, at yaw ${yaw}`);
    close(o.z, -facing.z, `behind, z, at yaw ${yaw}`);
  }
  // A pelvis on its side names no facing: the last one is kept.
  const onItsSide = Quaternion.RotationYawPitchRoll(0, -Math.PI / 2, 0);
  assert.deepEqual(facingOf(onItsSide, Quaternion.Identity(), { x: 1, z: 0 }), { x: 1, z: 0 });
});

test("a_held_camera_turns_the_short_way_round_and_arrives", () => {
  // From just below +pi to just above -pi is a small step forward, not most of a turn back.
  const from = Math.PI - 0.1, to = -Math.PI + 0.1;
  const next = easeAngle(from, to, 0.01, 0.3);
  assert.ok(next > from && next - from < 0.2, `it turned from ${from} to ${next}`);
  // And the other way: from just above -pi back to just below +pi.
  const back = easeAngle(to, from, 0.01, 0.3);
  assert.ok(back < to && to - back < 0.2, `it turned from ${to} to ${back}`);
  let angle = 2.5;
  for (let i = 0; i < 600; i++) angle = easeAngle(angle, -2.5, 1 / 60, 0.3);
  close(Math.cos(angle), Math.cos(-2.5), "arrived, cos", 1e-6);
  close(Math.sin(angle), Math.sin(-2.5), "arrived, sin", 1e-6);
  close(easeAngle(1, 2, 0.3, 0.3), 1 + (1 - Math.exp(-1)), "one time constant covers 1 - 1/e");
});

test("orthographic_extents_frame_what_the_perspective_frames_at_the_target", () => {
  const radius = 4.8, fov = 0.8, aspect = 16 / 9;
  const e = orthoExtents(radius, fov, aspect);
  // The perspective camera's half-height at the target, radius away.
  close(e.top, radius * Math.tan(fov / 2), "top");
  close(e.bottom, -e.top, "bottom");
  close(e.right / e.top, aspect, "the width follows the aspect");
  close(e.left, -e.right, "left");
  close(orthoExtents(2 * radius, fov, aspect).top, 2 * e.top, "zooming out widens it in step");
});

test("a_facing_is_its_projection_on_the_floor_and_the_last_one_when_it_has_none", () => {
  const projected = horizontalForward(0.3, 0.4, 1, 0);
  assert.ok(Math.abs(projected.x - 0.6) < 1e-12);
  assert.ok(Math.abs(projected.z - 0.8) < 1e-12);
  assert.deepEqual(horizontalForward(0, 0, -0.8, 0.6), { x: -0.8, z: 0.6 });
  assert.deepEqual(horizontalForward(0, 0, 0, 0), { x: 0, z: 1 });
});
