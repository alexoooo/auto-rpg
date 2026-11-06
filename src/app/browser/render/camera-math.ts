import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { CameraMode } from "../../../game/appearance/view.ts";

/** Isometric's diagonal bearing. */
export const ISO_ALPHA = -3 * Math.PI / 4;
/** Isometric's polar angle, from straight down: the three axes foreshortened equally. */
export const ISO_BETA = Math.acos(1 / Math.sqrt(3));
/** Chase's polar angle, 21 degrees above level. */
export const CHASE_BETA = 1.2;
/** Camera follow and turn rates chosen for body inspection, set by eye. */
export const VIEW_CAMERA = Object.freeze({ turnSeconds: .3, lookHeight: 1, follow: .05 });

/** The angle `from` approaches `to` by over `dt`, turning the short way round. */
function easeAngle(from: number, to: number, dt: number, seconds: number): number {
  const d = to - from, short = d - 2 * Math.PI * Math.round(d / (2 * Math.PI));
  return from + short * (1 - Math.exp(-dt / seconds));
}

const AHEAD = new Vector3(0, 0, 1);
/**
 * Where a body faces on the ground: +z turned by the pelvis's rotation since `rest`, its rotation
 * facing +z. A pelvis turned onto its side keeps `last`.
 */
function facingOf(rotation: Quaternion, rest: Quaternion, last: { x: number; z: number }): { x: number; z: number } {
  const turn = rotation.multiply(Quaternion.Inverse(rest)), ahead = new Vector3();
  AHEAD.applyRotationQuaternionToRef(turn, ahead);
  return horizontalForward(ahead.x, ahead.z, last.x, last.z);
}

/**
 * `(x, z)` made a unit bearing on the ground; when it is too short to name one (a pelvis pointing
 * straight up or down), the fallback's bearing, and +z when that is too short as well.
 */
function horizontalForward(x: number, z: number, fallbackX: number, fallbackZ: number): { x: number; z: number } {
  const length = Math.hypot(x, z);
  if (length > 1e-6) return { x: x / length, z: z / length };
  const fallbackLength = Math.hypot(fallbackX, fallbackZ);
  if (fallbackLength > 1e-6) return { x: fallbackX / fallbackLength, z: fallbackZ / fallbackLength };
  return { x: 0, z: 1 };
}

export interface CameraFacing { readonly rotation: Quaternion; readonly rest: Quaternion }

/** The common camera modes turn toward the isometric diagonal or behind the body's facing. */
export function followCameraAngles(mode: CameraMode,
  state: { azimuth: number; pitch: number; facing: { x: number; z: number } }, subject: CameraFacing | null, dt: number): void {
  const approach = 1 - Math.exp(-dt / VIEW_CAMERA.turnSeconds);
  switch (mode) {
    case "free": break;
    case "isometric":
      state.azimuth = easeAngle(state.azimuth, -Math.PI / 2 - ISO_ALPHA, dt, VIEW_CAMERA.turnSeconds);
      state.pitch += (Math.PI / 2 - ISO_BETA - state.pitch) * approach;
      break;
    case "chase":
      if (subject) state.facing = facingOf(subject.rotation, subject.rest, state.facing);
      state.azimuth = easeAngle(state.azimuth, Math.atan2(state.facing.x, state.facing.z), dt, VIEW_CAMERA.turnSeconds);
      state.pitch += (Math.PI / 2 - CHASE_BETA - state.pitch) * approach;
      break;
    default: { const never: never = mode; throw new Error(`no camera ${never}`); }
  }
}

/**
 * The orthographic extents that frame what the perspective camera frames at the target, `radius`
 * away with vertical field of view `fov`: switching projection keeps the body its size.
 */
export function orthoExtents(radius: number, fov: number, aspect: number): { top: number; bottom: number; left: number; right: number } {
  const half = radius * Math.tan(fov / 2);
  return { top: half, bottom: -half, left: -half * aspect, right: half * aspect };
}
