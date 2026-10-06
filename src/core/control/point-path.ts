import type { Vec3 } from "../spec/quantity.ts";

/** Quintic Hermite interpolation: measured initial velocity, supplied terminal velocity and zero endpoint accelerations. */
export function pointPath(start: { position: Vec3; velocity: Vec3 }, finish: Vec3, time: number, seconds: number, finishVelocity?: Vec3, curve?: Vec3) {
  if (time >= seconds) return { target: finish, velocity: finishVelocity ?? [0, 0, 0] as Vec3, acceleration: [0, 0, 0] as Vec3 };
  const u = time / seconds, target: number[] = [], velocity: number[] = [], acceleration: number[] = [];
  for (let k = 0; k < 3; k++) {
    const p = start.position[k]!, v = start.velocity[k]! * seconds, d = finish[k]! - p;
    let a = 10 * d - 6 * v, b = -15 * d + 8 * v, c = 6 * d - 3 * v;
    if (finishVelocity) { const end = finishVelocity[k]! * seconds; a -= 4 * end; b += 7 * end; c -= 3 * end; }
    target.push(p + u * (v + u * u * (a + u * (b + u * c))));
    velocity.push((v + u * u * (3 * a + u * (4 * b + u * 5 * c))) / seconds);
    acceleration.push(u * (6 * a + u * (12 * b + u * 20 * c)) / (seconds * seconds));
    if (curve) {
      // The normalized degree-six bump is one at midpath and has zero value, rate and acceleration at both ends.
      const v = 1 - u, bump = 64 * u * u * u * v * v * v;
      target[k]! += curve[k]! * bump;
      velocity[k]! += curve[k]! * 192 * u * u * v * v * (1 - 2 * u) / seconds;
      acceleration[k]! += curve[k]! * 384 * u * v * (1 - 5 * u + 5 * u * u) / (seconds * seconds);
    }
  }
  return { target: target as unknown as Vec3, velocity: velocity as unknown as Vec3, acceleration: acceleration as unknown as Vec3 };
}
