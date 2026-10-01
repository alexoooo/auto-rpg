import type { Heading, Orders } from "../core/mind/orders.ts";
import type { Vec3 } from "../core/spec/quantity.ts";

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

/**
 * Where a ray from `origin` along `direction` crosses the level plane at `height`, or null if it
 * never comes down to it. The plane is at the ordered body's centre of mass, not the ground: a
 * pointer over a body's chest, read on the ground, lands metres behind it.
 */
export function aimPoint(origin: Vec3, direction: Vec3, height: number): Vec3 | null {
  const t = (height - origin[1]) / direction[1];
  return direction[1] < 0 && t > 0 ? [origin[0] + t * direction[0], height, origin[2] + t * direction[2]] : null;
}

/** A person's orders for a body whose centre of mass is over `at`: walk the keys' way, face the point, and attack it while the button is down. */
export function personOrders(move: Heading | null, point: Vec3 | null, attacking: boolean, at: { readonly x: number; readonly z: number }): Orders {
  return {
    move,
    face: point ? { x: point[0] - at.x, z: point[2] - at.z } : null,
    attack: attacking && point ? point : null,
  };
}
