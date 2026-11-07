import type { Vec3 } from "../core/quantity.ts";

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

/**
 * **A point's quintic Hermite path at `time`**, into `out`: from `start`'s position and velocity to
 * `finish` over `seconds`, ending at `finishVelocity` (else at rest) with zero endpoint
 * accelerations, plus `curve` times a bump that is one at midpath. It allocates nothing, for a
 * reader that samples many paths a step; `work` is the caller's own and carries nothing between calls.
 */
export function pointPathTargetToRef(start: { position: Vec3; velocity: Vec3 }, finish: Vec3, time: number, seconds: number,
  out: [number, number, number], work: [number, number, number], finishVelocity?: Vec3, curve?: Vec3): void {
  if (time >= seconds) { out[0] = finish[0]; out[1] = finish[1]; out[2] = finish[2]; return; }
  const u = time / seconds, v = 1 - u, bump = 64 * u * u * u * v * v * v;
  for (let k = 0; k < 3; k++) {
    scalarPathToRef(start.position[k]!, start.velocity[k]!, finish[k]!, time, seconds, work, finishVelocity?.[k]);
    out[k] = curve ? work[0] + curve[k]! * bump : work[0];
  }
}
