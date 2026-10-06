import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";

/** Isometric's diagonal bearing (docs/reference/look.md#view-cameras). */
export const ISO_ALPHA = -3 * Math.PI / 4;
/** Isometric's polar angle, from straight down (docs/reference/look.md#view-cameras). */
export const ISO_BETA = Math.acos(1 / Math.sqrt(3));
/** Chase's polar angle, 21 degrees above level (docs/reference/look.md#view-cameras). */
export const CHASE_BETA = 1.2;
/** Camera follow and turn rates chosen for body inspection (docs/reference/look.md#view-cameras). */
export const VIEW_CAMERA = Object.freeze({ turnSeconds: .3, lookHeight: 1, follow: .05 });

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
