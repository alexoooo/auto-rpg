/**
 * Step one number toward another, at most `rate` per second.
 *
 * The rate limit, as a scalar, so that every commanded angle -- a hinge's, a torso's, a
 * head's, a gait's -- obeys the same rule from the same line of code. Frozen rule 4 says
 * targets are rate-limited; this is what that sentence is, and stating it once is what keeps
 * one chain's limiter from drifting away from another's.
 *
 * A hard clamp rather than an exponential filter, deliberately. `1 - exp(-k*dt)` is what
 * `arm.ts` uses for reach and wrist bend and it is the right shape for a *response*: it never
 * arrives and it moves fastest when the error is largest. A rate limit is the other thing --
 * a ceiling on speed that is the same whether the command moved a millimetre or a metre --
 * and it is the ceiling that makes a flicked cursor read as a sweep instead of a snap.
 *
 * It lived in `anchor-drive.ts` beside `AnchorDrive`, a keyframed anchor that dragged a body
 * about; nothing built one, and it was deleted in stage 0 of the core foundation.
 */
export function slewTowards(current: number, wanted: number, rate: number, dt: number): number {
  const step = rate * dt;
  if (wanted > current) return Math.min(wanted, current + step);
  return Math.max(wanted, current - step);
}
