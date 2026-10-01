import type { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera.js";
import { Camera } from "@babylonjs/core/Cameras/camera.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { LabCamera, LabProjection } from "./scenarios.ts";

/**
 * **How the lab's camera follows the body.** One orbit camera, in one of three ways:
 *
 * - **Free**: the pointer orbits, pans and zooms, and the target follows the pelvis softly.
 * - **Isometric**: the classic isometric angle -- a quarter turn off the axes, looking down at
 *   atan(1/sqrt 2), about 35.3 deg -- held, following the pelvis. Orthographic draws it flat, as
 *   isometric art is drawn; Perspective draws the same view in depth.
 * - **Chase**: behind the body's facing, a little above it, turning after it.
 *
 * In Isometric and Chase the pointer does not turn or pan the camera; the wheel zooms in all three.
 * The body is read from the pelvis node's position and rotation, never a world matrix, whose cache
 * the first reader in a frame freezes; and a replay, which poses the nodes, is followed like the
 * live body.
 */

/** Isometric's bearing: the camera stands behind the body's start and to its left. */
export const ISO_ALPHA = -3 * Math.PI / 4;
/** Isometric's polar angle, from straight down: the elevation is atan(1/sqrt 2), 35.3 deg. */
export const ISO_BETA = Math.acos(1 / Math.sqrt(3));
/** Chase's polar angle: 21 deg above the level. */
export const CHASE_BETA = 1.2;
/**
 * How fast a held camera turns to its bearing, s: the time constant of its approach. Long enough
 * that a strike's twist of the pelvis does not swing the chase, short enough to follow a turn.
 */
const TURN_SECONDS = 0.3;
/** The height the camera looks at, m: about the body's chest. */
const LOOK_HEIGHT = 1;
/** The share of the way the target moves to the pelvis each frame. */
const FOLLOW = 0.05;

/** The angle `from` approaches `to` by over `dt`, turning the short way round. */
export function easeAngle(from: number, to: number, dt: number, seconds: number): number {
  const d = to - from, short = d - 2 * Math.PI * Math.round(d / (2 * Math.PI));
  return from + short * (1 - Math.exp(-dt / seconds));
}

const AHEAD = new Vector3(0, 0, 1);
/**
 * Where a body faces on the ground: +z turned by the pelvis's rotation since `rest`, its rotation
 * facing +z. A pelvis turned onto its side keeps `last`.
 */
export function facingOf(rotation: Quaternion, rest: Quaternion, last: { x: number; z: number }): { x: number; z: number } {
  const turn = rotation.multiply(Quaternion.Inverse(rest)), ahead = new Vector3();
  AHEAD.applyRotationQuaternionToRef(turn, ahead);
  return horizontalForward(ahead.x, ahead.z, last.x, last.z);
}

/**
 * `(x, z)` made a unit bearing on the ground; when it is too short to name one (a pelvis pointing
 * straight up or down), the fallback's bearing, and +z when that is too short as well.
 */
export function horizontalForward(x: number, z: number, fallbackX: number, fallbackZ: number): { x: number; z: number } {
  const length = Math.hypot(x, z);
  if (length > 1e-6) return { x: x / length, z: z / length };
  const fallbackLength = Math.hypot(fallbackX, fallbackZ);
  if (fallbackLength > 1e-6) return { x: fallbackX / fallbackLength, z: fallbackZ / fallbackLength };
  return { x: 0, z: 1 };
}

/** The orbit camera's bearing (alpha) that stands it behind a body facing `facing`. */
export const behind = (facing: { x: number; z: number }): number => Math.atan2(-facing.z, -facing.x);

/**
 * The orthographic extents that frame what the perspective camera frames at the target, `radius`
 * away with vertical field of view `fov`: switching projection keeps the body its size.
 */
export function orthoExtents(radius: number, fov: number, aspect: number): { top: number; bottom: number; left: number; right: number } {
  const half = radius * Math.tan(fov / 2);
  return { top: half, bottom: -half, left: -half * aspect, right: half * aspect };
}

interface LabCameraRig {
  choose(camera: LabCamera, projection: LabProjection): void;
  /** Follow a pelvis at `position`, turned `rotation`; `rest` is its rotation facing +z. */
  follow(position: Vector3, rotation: Quaternion, rest: Quaternion, dt: number, aspect: number): void;
}

export function labCameraRig(camera: ArcRotateCamera): LabCameraRig {
  const free = { x: camera.angularSensibilityX, y: camera.angularSensibilityY, pan: camera.panningSensibility };
  let mode: LabCamera = "free", projection: LabProjection = "orthographic";
  let facing = { x: 0, z: 1 };
  const target = new Vector3();
  return {
    choose(to, drawn) {
      mode = to;
      projection = drawn;
      // Held, the pointer neither turns nor pans; the wheel still zooms.
      const held = mode !== "free";
      camera.angularSensibilityX = held ? Infinity : free.x;
      camera.angularSensibilityY = held ? Infinity : free.y;
      camera.panningSensibility = held ? 0 : free.pan;
    },
    follow(position, rotation, rest, dt, aspect) {
      target.set(position.x, LOOK_HEIGHT, position.z);
      camera.target = Vector3.Lerp(camera.target, target, FOLLOW);
      const approach = 1 - Math.exp(-dt / TURN_SECONDS);
      switch (mode) {
        case "free": break;
        case "isometric":
          camera.alpha = easeAngle(camera.alpha, ISO_ALPHA, dt, TURN_SECONDS);
          camera.beta += (ISO_BETA - camera.beta) * approach;
          break;
        case "chase":
          facing = facingOf(rotation, rest, facing);
          camera.alpha = easeAngle(camera.alpha, behind(facing), dt, TURN_SECONDS);
          camera.beta += (CHASE_BETA - camera.beta) * approach;
          break;
        default: { const never: never = mode; throw new Error(`no camera ${String(never)}`); }
      }
      const flat = mode === "isometric" && projection === "orthographic";
      camera.mode = flat ? Camera.ORTHOGRAPHIC_CAMERA : Camera.PERSPECTIVE_CAMERA;
      if (flat) {
        const e = orthoExtents(camera.radius, camera.fov, aspect);
        camera.orthoTop = e.top; camera.orthoBottom = e.bottom; camera.orthoLeft = e.left; camera.orthoRight = e.right;
      }
    },
  };
}
