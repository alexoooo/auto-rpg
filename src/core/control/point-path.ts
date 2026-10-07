import type { Vec3 } from "../spec/quantity.ts";

/** A quintic Hermite coordinate and its two derivatives, in the coordinate's own units. */
export function scalarPathToRef(start: number, rate: number, finish: number, time: number, seconds: number,
  out: [number, number, number], finishRate?: number): void {
  if (time >= seconds) { out[0] = finish; out[1] = finishRate ?? 0; out[2] = 0; return; }
  const u = time / seconds, v = rate * seconds, d = finish - start;
  let a = 10 * d - 6 * v, b = -15 * d + 8 * v, c = 6 * d - 3 * v;
  if (finishRate !== undefined) { const end = finishRate * seconds; a -= 4 * end; b += 7 * end; c -= 3 * end; }
  out[0] = start + u * (v + u * u * (a + u * (b + u * c)));
  out[1] = (v + u * u * (3 * a + u * (4 * b + u * 5 * c))) / seconds;
  out[2] = u * (6 * a + u * (12 * b + u * 20 * c)) / (seconds * seconds);
}

/** Quintic Hermite interpolation: measured initial velocity, supplied terminal velocity and zero endpoint accelerations. */
export function pointPath(start: { position: Vec3; velocity: Vec3 }, finish: Vec3, time: number, seconds: number, finishVelocity?: Vec3, curve?: Vec3) {
  if (time >= seconds) return { target: finish, velocity: finishVelocity ?? [0, 0, 0] as Vec3, acceleration: [0, 0, 0] as Vec3 };
  const u = time / seconds, target: number[] = [], velocity: number[] = [], acceleration: number[] = [];
  const sample: [number, number, number] = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    scalarPathToRef(start.position[k]!, start.velocity[k]!, finish[k]!, time, seconds, sample, finishVelocity?.[k]);
    target.push(sample[0]); velocity.push(sample[1]); acceleration.push(sample[2]);
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
