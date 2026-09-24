/**
 * How hard a standing body is to tip over, from the body (physical contact session 08).
 *
 * A standing body is a rigid body on the edge of its base: struck, it rocks about the edge on the far
 * side of its support, and it goes over when the blow hands it enough energy to lift its centre of
 * mass over that edge. Everything here is read off the live body -- where its mass is, how it is
 * spread, where its feet are -- and nothing is a per-family constant.
 *
 * **The rocking body** (the ledger's units are m/s: a horizontal impulse at the centre of mass's
 * height, over the body's mass, `J / M`). With the centre of mass `h` above the ground, the base's
 * edge `r` from under it along the push, `R = sqrt(h^2 + r^2)` and a radius of gyration `k` about a
 * horizontal axis through the centre of mass:
 *
 * - An impulse `J` at height `y` gives the body angular momentum `J y` about the edge, so
 *   `w = J y / I` with `I = M (k^2 + R^2)`. `lever` is `y / h`: a blow above the centre of mass
 *   counts for more than one below it, and one at the feet for nothing.
 * - **It tips when** `I w^2 / 2 >= M g (R - h)`, the rise of the centre of mass as it goes over the
 *   edge. In the ledger's units that is `tippingLineMps`: `sqrt(2 g (R - h) (k^2 + R^2)) / h`.
 * - **Gravity rights it** at `M g r / I` of angular deceleration while it leans a little, which in the
 *   ledger's units is `g r / h` whatever the inertia: `rockingDecayMps2`. The ledger's linear decay is
 *   that, and a body that has rocked to its peak and back is taken as upright -- the small-angle
 *   approximation, which forgets the lean a second blow would find at the peak.
 *
 * The rigid body against the solver is `tests/tipping.test.mjs`: a block of known mass, size and
 * inertia on the floor, struck at a known height, tips at the impulse this predicts.
 *
 * Node loads this file (the state machine and the harness), so it imports nothing.
 */

export const TIPPING = Object.freeze({
  GRAVITY_MPS2: 9.81,
  /**
   * **A recorded fallback, not physics.** The share of the fall line at which a body is staggered.
   * A rigid body on a rigid floor rocks from any blow at all, so no physical reading gives a stagger
   * a threshold of its own; this keeps the ratio the two frozen lines had (0.12 to 0.28 since session
   * 06, 0.006 to 0.014 before), so a stagger is where it was relative to a fall.
   */
  STAGGER_FRACTION: 0.12 / 0.28,
  /**
   * **A recorded fallback, not physics**: what a scored contact's impulse is multiplied by before the
   * ledger reads it (`Combat.transfer`). With the lines read off the body and a blow filed at its
   * own momentum, an x1 stone mirror all but never fell -- 0.25 knockdowns a body a bout at a gain
   * of 4 (`.review/tip-bouts.mjs`, Node bout runner, 8 bouts) -- which is the plan's second
   * failure condition, so the rule came back as a single factor on every blow, calibrated to put
   * the x1 stone mirror back in session 01's band of 4.93 [4.54, 5.32] knockdowns a body a bout.
   * `research/stat-sweep.mjs --stat stability --levels 1 --pairs 96`, Node harness, research
   * runner, supported locomotion, cap 150 s, seed 20260923, 96 blocks, 95 % bootstrap
   * (`research/control-band.mjs`), 2026-09-24:
   *
   * | Gain | Knockdowns / body / bout | Damage / body / bout | Seconds / bout |
   * | ---: | --- | --- | ---: |
   * | 6 | 3.70 [3.24, 4.16] | 8.16 | 24.6 |
   * | **7** | **4.83 [4.24, 5.43]** | **8.12** | **26.3** |
   * | 8 | 5.38 [4.84, 5.92] | 8.02 | 27.2 |
   * | 10 | 6.29 [5.77, 6.79] | 8.17 | 29.1 |
   * | 12 | 7.81 [7.25, 8.38] | 8.06 | 32.3 |
   *
   * Damage does not follow the gain: what it moves is how often a body is on the floor.
   */
  BLOW_GAIN: 7,
  /**
   * How far above a body's lowest point another of its points may be and still be on the floor, m:
   * what a lying or rising body's base is made of (`PhysicalSupportedLocomotionPort`). A recorded
   * choice, at the scale of the biped's own plant band (0.02 m) with a centimetre for a part at rest
   * on a slightly uneven body.
   */
  CONTACT_BAND_M: 0.03,
});

/** Where a body's mass is and how it is spread, in world axes, read off its live parts. */
export interface MassDistribution {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** About a horizontal axis through the centre of mass, the two horizontal axes averaged, m. */
  readonly gyrationM: number;
}

/** One boundary's reading of a standing body's tipping geometry. */
export interface TippingGeometry {
  /** The centre of mass above the ground, m. */
  readonly comHeightM: number;
  readonly gyrationM: number;
  /** The ground's height, world y: the lowest support corner. */
  readonly groundY: number;
  /** The support's convex hull, horizontal, relative to the centre of mass's ground point. */
  readonly hull: readonly (readonly [number, number])[];
}

/** A point mass: a part's own mass at its own centre. */
export interface PointMass {
  readonly massKg: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * The centre of mass and the radius of gyration of a set of point masses. A part's own inertia is
 * left out: the parts are small against the spans between them, and the body's reading is what the
 * spans make of it. Null for no mass.
 */
export function massDistributionOf(points: Iterable<PointMass>): MassDistribution | null {
  let m = 0, x = 0, y = 0, z = 0;
  const list: PointMass[] = [];
  for (const point of points) {
    if (!(point.massKg > 0)) continue;
    list.push(point);
    m += point.massKg; x += point.massKg * point.x; y += point.massKg * point.y; z += point.massKg * point.z;
  }
  if (!(m > 0)) return null;
  x /= m; y /= m; z /= m;
  let about = 0;
  for (const point of list) {
    const dy = point.y - y;
    // About the x axis: y and z spans; about the z axis: y and x. The mean of the two.
    about += point.massKg * (dy * dy + ((point.x - x) ** 2 + (point.z - z) ** 2) / 2);
  }
  return Object.freeze({ x, y, z, gyrationM: Math.sqrt(about / m) });
}

/** The convex hull of horizontal points, counter-clockwise (Andrew's monotone chain). */
export function convexHull(points: readonly (readonly [number, number])[]): [number, number][] {
  const sorted = [...points].map(([a, b]) => [a, b] as [number, number])
    .sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  if (sorted.length < 3) return sorted;
  const cross = (o: [number, number], a: [number, number], b: [number, number]): number =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: [number, number][] = [];
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/**
 * How far the base reaches from the centre of mass's ground point along a horizontal direction, m:
 * the distance to the hull's edge along that ray. Zero when the ground point is outside the hull,
 * which is a body already past its base.
 */
export function baseReachM(hull: readonly (readonly [number, number])[], dirX: number, dirZ: number): number {
  const length = Math.hypot(dirX, dirZ);
  if (hull.length < 3 || !(length > 0)) return 0;
  const ux = dirX / length, uz = dirZ / length;
  let reach = Infinity;
  for (let i = 0; i < hull.length; i += 1) {
    const [ax, az] = hull[i];
    const [bx, bz] = hull[(i + 1) % hull.length];
    // The edge's outward normal (the hull is counter-clockwise in x, z).
    const nx = bz - az, nz = -(bx - ax);
    const offset = nx * ax + nz * az;
    // The origin must be inside every edge's half-plane.
    if (offset < 0) return 0;
    const along = nx * ux + nz * uz;
    if (along > 0) reach = Math.min(reach, offset / along);
  }
  return Number.isFinite(reach) ? reach : 0;
}

/** Whether the centre of mass's ground point, the origin, is on or inside the hull. */
export function hullHoldsCentre(hull: readonly (readonly [number, number])[]): boolean {
  if (hull.length < 3) return false;
  for (let i = 0; i < hull.length; i += 1) {
    const [ax, az] = hull[i];
    const [bx, bz] = hull[(i + 1) % hull.length];
    if ((bz - az) * ax - (bx - ax) * az < 0) return false;
  }
  return true;
}

/**
 * The ledger's fall line, m/s of `J / M` at the centre of mass's height, for a body whose centre of
 * mass is `h` above the ground, `k` its radius of gyration and `r` the base's reach along the push.
 */
export function tippingLineMps(h: number, k: number, r: number): number {
  if (!(h > 0) || !(r > 0)) return 0;
  const R = Math.hypot(h, r);
  return Math.sqrt(2 * TIPPING.GRAVITY_MPS2 * (R - h) * (k * k + R * R)) / h;
}

/** How fast gravity takes a lean back off the ledger, m/s per second. */
export function rockingDecayMps2(h: number, r: number): number {
  return h > 0 && r > 0 ? TIPPING.GRAVITY_MPS2 * r / h : 0;
}

/**
 * The ledger's reading of an impulse landed at world height `atY`: its lever over the centre of
 * mass's, never below zero (a blow at the feet tips nothing, and one under them nothing either).
 * A blow that names no height lands at the centre of mass.
 */
export function leverAt(geometry: TippingGeometry, atY: number | undefined): number {
  if (atY === undefined || !Number.isFinite(atY) || !(geometry.comHeightM > 0)) return 1;
  return Math.max(0, atY - geometry.groundY) / geometry.comHeightM;
}

/**
 * A tipping geometry from a mass distribution and the support's corner points in world axes. Null
 * for a body with no support corners at all, and for one whose centre of mass is no higher than its
 * lowest corner -- a body lying on its back with its feet in the air has nothing to tip over.
 */
export function tippingGeometry(mass: MassDistribution,
  corners: readonly Readonly<{ x: number; y: number; z: number }>[]): TippingGeometry | null {
  if (corners.length === 0) return null;
  let groundY = Infinity;
  for (const corner of corners) groundY = Math.min(groundY, corner.y);
  if (!(mass.y > groundY)) return null;
  const hull = convexHull(corners.map((corner) => [corner.x - mass.x, corner.z - mass.z] as const));
  return Object.freeze({ comHeightM: mass.y - groundY, gyrationM: mass.gyrationM, groundY,
    hull: Object.freeze(hull.map((point) => Object.freeze(point))) });
}
