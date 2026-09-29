/**
 * **What muscles can do at speed**, in joint terms: the torque they hold at a joint speed, as a
 * fraction of their isometric peak.
 *
 * Shortening, it is Hill's hyperbola (Hill 1938): (T + a)(w + b) = (T0 + a) b, which falls from
 * the peak at rest to nothing at the unloaded speed w0, and is written here with r = w / w0 and
 * k = a / T0 = b / w0 as
 *
 *     T / T0 = (1 - r) / (1 + r / k)
 *
 * Lengthening, the muscles resist more than their isometric peak, rising toward the eccentric
 * ceiling (see `eccentric`).
 */
export interface ForceVelocityCurve {
  /** The joint speed at which the muscles can no longer hold any torque, rad/s. */
  readonly unloadedSpeed: number;
  /** Hill's a / T0, which is also b / w0: small is a deep curve, large nearly a straight line. */
  readonly curvature: number;
  /** The torque at fast lengthening over the isometric peak. */
  readonly eccentricCeiling: number;
  /** The slope of the lengthening branch at rest, over the shortening branch's there. */
  readonly eccentricSlopeRatio: number;
}

/**
 * The torque the muscles can hold over their isometric peak, turning at `shortening` rad/s in the
 * direction they pull (negative while they are stretched).
 */
export function forceVelocityFactor(shortening: number, curve: ForceVelocityCurve): number {
  const r = shortening / curve.unloadedSpeed;
  if (r >= 1) return 0;
  if (r >= 0) return (1 - r) / (1 + r / curve.curvature);
  return eccentric(-r, curve);
}

/**
 * Lengthening at r = speed / w0: a hyperbola from 1 at rest toward `eccentricCeiling`, whose slope
 * at rest is `eccentricSlopeRatio` times the shortening branch's there, (1 + 1/k):
 *
 *     T / T0 = e - (e - 1) / (1 + s r),   s = ratio (1 + 1/k) / (e - 1)
 *
 * so the two branches meet at rest with no step, and the slope's jump there is the stated ratio.
 */
function eccentric(r: number, curve: ForceVelocityCurve): number {
  const e = curve.eccentricCeiling;
  const s = curve.eccentricSlopeRatio * (1 + 1 / curve.curvature) / (e - 1);
  return e - (e - 1) / (1 + s * r);
}

/**
 * Where the curve's tangent at `shortening` reaches zero, rad/s: the fastest the muscles could turn
 * the joint within a step if their torque fell along that tangent. The shortening branch is convex,
 * so its tangent lies under it and reaches zero short of the unloaded speed; from rest, at
 * w0 k / (1 + k). A joint turning against the muscles is braked through rest and then speeds up no
 * further than from rest: the lengthening branch is concave, its own tangent lies over it, and
 * reaches zero far past the unloaded speed.
 */
export function forceVelocityReach(shortening: number, curve: ForceVelocityCurve): number {
  const w0 = curve.unloadedSpeed, k = curve.curvature, r = Math.max(0, shortening / w0);
  if (r >= 1) return shortening;
  return r * w0 + w0 * (1 - r) * (1 + r / k) / (1 + 1 / k);
}
