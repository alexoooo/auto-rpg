import type { Vec3 } from "../spec/quantity.ts";

/** Quintic Hermite interpolation: measured initial velocity, supplied terminal velocity and zero endpoint accelerations. */
export function pointPath(start: { position: Vec3; velocity: Vec3 }, finish: Vec3, time: number, seconds: number, finishVelocity?: Vec3) {
  if (time >= seconds) return { target: finish, velocity: finishVelocity ?? [0, 0, 0] as Vec3, acceleration: [0, 0, 0] as Vec3 };
  const u = time / seconds, target: number[] = [], velocity: number[] = [], acceleration: number[] = [];
  for (let k = 0; k < 3; k++) {
    const p = start.position[k]!, v = start.velocity[k]! * seconds, d = finish[k]! - p;
    let a = 10 * d - 6 * v, b = -15 * d + 8 * v, c = 6 * d - 3 * v;
    if (finishVelocity) { const end = finishVelocity[k]! * seconds; a -= 4 * end; b += 7 * end; c -= 3 * end; }
    target.push(p + u * (v + u * u * (a + u * (b + u * c))));
    velocity.push((v + u * u * (3 * a + u * (4 * b + u * 5 * c))) / seconds);
    acceleration.push(u * (6 * a + u * (12 * b + u * 20 * c)) / (seconds * seconds));
  }
  return { target: target as unknown as Vec3, velocity: velocity as unknown as Vec3, acceleration: acceleration as unknown as Vec3 };
}
