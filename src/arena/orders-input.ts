import type { Heading, Orders } from "../core/mind/orders.ts";
import type { Vec3 } from "../core/spec/quantity.ts";
import type { Senses } from "../core/mind/senses.ts";
import { surfaceEntry } from "../core/mind/openings.ts";
import { directMovement } from "../core/mind/movement.ts";

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

/** The nearest sensed anatomical surface along a finite ray; decorative meshes have no authority. */
export function rayTarget(senses: Senses, origin: Vec3, direction: Vec3, length: number): { readonly foe: string; readonly region: string } | null {
  const to: Vec3 = [origin[0] + direction[0] * length, origin[1] + direction[1] * length, origin[2] + direction[2] * length];
  let distance = Infinity, target: { foe: string; region: string } | null = null;
  for (const foe of senses.others) {
    if (foe.out || foe.side === senses.side) continue;
    for (const part of foe.spec.segments) {
      const hit = surfaceEntry(foe, part.name, origin, to);
      if (!hit) continue;
      const squared = hit.at.reduce((sum, value, i) => sum + (value - origin[i]!) * (value - origin[i]!), 0);
      if (squared < distance) { distance = squared; target = { foe: foe.id, region: part.name }; }
    }
  }
  return target;
}

/** Keys give a movement, and whether it only walks; the pointer gives facing, and a pressed anatomical hit gives identity. */
export function personOrders(move: Heading | null, point: Vec3 | null, target: { readonly foe: string; readonly region: string } | null, at: { readonly x: number; readonly z: number },
  walk = false): Orders {
  return {
    move: move ? directMovement(move.x, move.z) : null,
    ...(walk && move ? { walk: true as const } : {}),
    face: point ? { x: point[0] - at.x, z: point[2] - at.z } : null,
    ...(target ?? {}),
  };
}
