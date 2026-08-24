/**
 * Project a body's forward axis onto the arena floor.
 *
 * A living pelvis is upright, but the same camera keeps following it after a
 * verdict and a released pelvis can lie on its side. Feeding its vertical axis
 * to the chase camera collapses distance and look-ahead into height. Keep the
 * last horizontal bearing when the projection is too small to name one.
 */
export function horizontalForward(
  x: number,
  z: number,
  fallbackX: number,
  fallbackZ: number,
): { x: number; z: number } {
  const length = Math.hypot(x, z);
  if (length > 1e-6) return { x: x / length, z: z / length };
  const fallbackLength = Math.hypot(fallbackX, fallbackZ);
  if (fallbackLength > 1e-6) {
    return { x: fallbackX / fallbackLength, z: fallbackZ / fallbackLength };
  }
  return { x: 0, z: 1 };
}
