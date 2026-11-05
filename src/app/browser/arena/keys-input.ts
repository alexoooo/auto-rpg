import type { Heading } from "../../../skills/intent/orders.ts";

/** Which of the four walking keys are down. */
interface MoveKeys { readonly up: boolean; readonly down: boolean; readonly left: boolean; readonly right: boolean }

/**
 * The world direction the keys ask for under a camera looking along bearing `azimuth` (`orbit.ts`):
 * up the screen is the camera's bearing, (sin, cos), and right is (cos, -sin). Null when no key is
 * down or opposed keys cancel.
 */
export function keysToMove(keys: MoveKeys, azimuth: number): Heading | null {
  const up = Number(keys.up) - Number(keys.down), right = Number(keys.right) - Number(keys.left);
  if (up === 0 && right === 0) return null;
  const n = Math.hypot(up, right), s = Math.sin(azimuth), c = Math.cos(azimuth);
  return { x: (up * s + right * c) / n, z: (up * c - right * s) / n };
}
