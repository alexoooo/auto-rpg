import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { solveLinear } from "../math/linalg.ts";
import { norm } from "../math/real.ts";

/**
 * A flat sole on level ground (y up), bearing: where its middle is, which way it lies, and how far
 * its centre of pressure may go from its middle each way.
 */
export interface BearingSole {
  /** The sole's middle, world. */
  readonly middle: Vector3;
  /** Unit, level: along the sole's length. */
  readonly along: Vector3;
  /** How far the centre of pressure may go along the sole from its middle, m. */
  readonly length: number;
  /** How far across, m. */
  readonly width: number;
}

/** A sole's share of the ground's wrench: a force at its middle and a moment. */
interface SoleWrench {
  readonly force: Vector3;
  readonly moment: Vector3;
}

/**
 * **The ground's wrench shared among bearing soles** (`soles`): each sole's force at its middle and
 * moment, such that together they give the force `force` and the moment `moment` about `centre`,
 * as nearly as the soles can, and no sole
 * - pulls on the ground (its normal force is not negative),
 * - presses outside its sole (its centre of pressure, the point the moment's level part puts its
 *   normal force at, is within `length` along it and `width` across it of its middle),
 * - slides (its level force is within a pyramid inscribed in the cone of `friction`, along and
 *   across it), or twists on the ground (see below).
 *
 * It is the least-squares problem
 *
 *     minimize |A x - b|^2_Q + e |x|^2_D   subject to the soles' limits, linear in x,
 *
 * x being the soles' forces and moments and A x the wrench they make about `centre`. Q weighs a
 * moment's miss against a force's at `lever` (a moment of `lever` N m counts as a newton), and
 * `e` D, each sole's force weighed against its moment at the sole's own length, is a small
 * regularizer that picks, among the shares that give the wrench, the least: the soles share the
 * weight as their levers do. The limits are homogeneous (x = 0 meets them all), so a share always
 * exists, and one close to zero load meets them strictly; the problem is solved from there by a
 * primal active-set method (Nocedal and Wright 2006, "Numerical optimization", algorithm 16.3).
 * Where the soles can give the wrench, the miss is zero to the regularizer's order; where they
 * cannot, the miss is the least they leave. Returns the miss, force and moment, into `miss`.
 *
 * The limits are those of a rigid rectangular sole on rigid ground with a friction pyramid at its
 * corners, its contact wrench cone in closed form (Caron, Pham and Nakamura 2015, "Stability of
 * surface contacts for humanoid robots: closed-form formulae of the contact wrench cone", ICRA):
 * besides the three above, the sole's twist about the vertical is bounded by what friction at its
 * corners can give, so a sole that bears nothing twists nothing.
 */
export function shareGroundWrench(soles: readonly BearingSole[], centre: Vector3, force: Vector3, moment: Vector3,
  friction: number, lever: number, out: SoleWrench[], miss?: { force: Vector3; moment: Vector3 }): void {
  const k = soles.length, n = 6 * k;
  // A: rows force (3), moment about the centre (3); columns each sole's force (3), moment (3).
  const A = [0, 1, 2, 3, 4, 5].map(() => new Array<number>(n).fill(0));
  const D = new Array<number>(n).fill(1);
  soles.forEach((sole, s) => {
    const d = [sole.middle.x - centre.x, sole.middle.y - centre.y, sole.middle.z - centre.z];
    for (let a = 0; a < 3; a++) {
      A[a]![6 * s + a] = 1;
      // d x e_a
      const e = [0, 0, 0]; e[a] = 1;
      A[3]![6 * s + a] = d[1]! * e[2]! - d[2]! * e[1]!;
      A[4]![6 * s + a] = d[2]! * e[0]! - d[0]! * e[2]!;
      A[5]![6 * s + a] = d[0]! * e[1]! - d[1]! * e[0]!;
      A[3 + a]![6 * s + 3 + a] = 1;
      D[6 * s + 3 + a] = 1 / (sole.length * sole.length);
    }
  });
  const b = [force.x, force.y, force.z, moment.x, moment.y, moment.z];
  const Q = [1, 1, 1, 1 / (lever * lever), 1 / (lever * lever), 1 / (lever * lever)];
  // H = A' Q A + e D, g = -A' Q b; e small against the problem's own scale.
  const scale = Math.max(...Q.map((q, r) => q * A[r]!.reduce((sum, v) => sum + v * v, 0)));
  const e = REGULARIZER * scale;
  const H = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) =>
    A.reduce((sum, row, r) => sum + Q[r]! * row[i]! * row[j]!, 0) + (i === j ? e * D[i]! : 0)));
  const g = Array.from({ length: n }, (_, i) => -A.reduce((sum, row, r) => sum + Q[r]! * row[i]! * b[r]!, 0));
  // The limits, C x >= 0, in each sole's frame: 1 along it, 2 across (up x along), 3 up. A limit
  // is a sum of local components, each a combination of the world ones it is written in.
  const C: number[][] = [];
  const mu = friction / Math.SQRT2;
  soles.forEach((sole, s) => {
    const o = 6 * s, u = sole.along, X = sole.length, Y = sole.width;
    // Local components as world columns: [column, weight] pairs.
    const f1: Term = [[0, u.x], [2, u.z]], f2: Term = [[0, u.z], [2, -u.x]], f3: Term = [[1, 1]];
    const t1: Term = [[3, u.x], [5, u.z]], t2: Term = [[3, u.z], [5, -u.x]], t3: Term = [[4, 1]];
    const limit = (...parts: [number, Term][]) => {
      const r = new Array<number>(n).fill(0);
      for (const [k, term] of parts) for (const [i, v] of term) r[o + i] += k * v;
      C.push(r);
    };
    limit([1, f3]);
    for (const a of [1, -1]) {
      // Friction: |f1|, |f2| <= mu f3.
      limit([mu, f3], [-a, f1]);
      limit([mu, f3], [-a, f2]);
      // Centre of pressure: |t1| <= Y f3 across, |t2| <= X f3 along.
      limit([Y, f3], [-a, t1]);
      limit([X, f3], [-a, t2]);
      // Twist, Caron et al. 2015 eq. 8: t_min <= t3 <= t_max, each absolute value in them opened
      // both ways, t_min = -mu (X + Y) f3 + |Y f1 - mu t1| + |X f2 - mu t2| and
      // t_max = mu (X + Y) f3 - |Y f1 + mu t1| - |X f2 + mu t2|.
      for (const b of [1, -1]) {
        limit([1, t3], [mu * (X + Y), f3], [-a * Y, f1], [a * mu, t1], [-b * X, f2], [b * mu, t2]);
        limit([-1, t3], [mu * (X + Y), f3], [-a * Y, f1], [-a * mu, t1], [-b * X, f2], [-b * mu, t2]);
      }
    }
  });
  const x = new Array<number>(n).fill(0);
  // Strictly inside every limit: a light press at each sole's middle.
  for (let s = 0; s < k; s++) x[6 * s + 1] = START;
  activeSet(H, g, C, x);
  soles.forEach((_, s) => {
    out[s]!.force.set(x[6 * s]!, x[6 * s + 1]!, x[6 * s + 2]!);
    out[s]!.moment.set(x[6 * s + 3]!, x[6 * s + 4]!, x[6 * s + 5]!);
  });
  if (miss) {
    const r = A.map((row, i) => row.reduce((sum, v, j) => sum + v * x[j]!, 0) - b[i]!);
    miss.force.set(r[0]!, r[1]!, r[2]!);
    miss.moment.set(r[3]!, r[4]!, r[5]!);
  }
}

/** The regularizer's weight against the problem's largest, a numeric setting: small enough not to move a share the soles can give by a measurable amount. */
const REGULARIZER = 1e-6;
/** A component of a sole's wrench in its own frame, as weights on its world columns. */
type Term = readonly (readonly [number, number])[];
/** The part of a limit's normal outside the working limits' span, relative to the normal, below which the limit is taken to depend on them: rounding, a numeric setting. */
const DEPENDENT = 1e-9;
/** The press each sole starts from, N: strictly inside every limit, and far below any share. A numeric setting. */
const START = 1e-3;

/**
 * Minimize 1/2 x' H x + g' x subject to C x >= 0, from `x`, feasible, into `x`: a primal
 * active-set method, the working set added to at a blocking limit and dropped from at the most
 * negative multiplier.
 */
function activeSet(H: readonly number[][], g: readonly number[], C: readonly number[][], x: number[]): void {
  const n = x.length, working: number[] = [];
  // After a full step x is the least in the working set's subspace, and the next solve's step is
  // rounding: its multipliers decide.
  let settled = false;
  for (let iteration = 0; iteration < 8 * (n + C.length); iteration++) {
    // The step to the least in the working set's subspace: [H -C_W'; C_W 0] [p; l] = [-(H x + g); 0].
    const m = working.length, K = Array.from({ length: n + m }, () => new Array<number>(n + m).fill(0));
    const rhs = new Array<number>(n + m).fill(0);
    for (let i = 0; i < n; i++) {
      let q = g[i]!;
      for (let j = 0; j < n; j++) { K[i]![j] = H[i]![j]!; q += H[i]![j]! * x[j]!; }
      rhs[i] = -q;
      working.forEach((c, r) => { K[i]![n + r] = -C[c]![i]!; K[n + r]![i] = C[c]![i]!; });
    }
    const solution = solveLinear(K, rhs), p = solution.slice(0, n), multipliers = solution.slice(n);
    if (settled || norm(p) <= 1e-12 * (1 + norm(x))) {
      settled = false;
      let worst = -1, least = -1e-12;
      multipliers.forEach((l, r) => { if (l < least) { least = l; worst = r; } });
      if (worst < 0) return;
      working.splice(worst, 1);
      continue;
    }
    // As far along p as the limits outside the working set allow. p lies in the working limits'
    // null space, so in exact arithmetic a limit it moves toward is independent of them. A step of
    // rounding's size has rounding's direction, and can seem to move toward a limit that is a
    // combination of the working ones; taken into the working set, it makes the next solve
    // singular. So a limit blocks only if it is independent of the working limits, which is
    // decided from the limits alone, whatever the step's size.
    let step = 1, blocking = -1, basis: number[][] | undefined;
    C.forEach((row, c) => {
      if (working.includes(c)) return;
      let along = 0, at = 0;
      for (let j = 0; j < n; j++) { along += row[j]! * p[j]!; at += row[j]! * x[j]!; }
      if (along >= 0) return;
      const t = Math.max(0, -at / along);
      if (t >= step) return;
      basis ??= orthonormal(working.map((w) => C[w]!));
      if (!independent(basis, row)) return;
      step = t; blocking = c;
    });
    for (let j = 0; j < n; j++) x[j] = x[j]! + step * p[j]!;
    if (blocking >= 0) working.push(blocking);
    else settled = true;
  }
}

/** An orthonormal basis of the span of `rows` (modified Gram-Schmidt; a row dependent on those before adds nothing). */
function orthonormal(rows: readonly (readonly number[])[]): number[][] {
  const basis: number[][] = [];
  for (const row of rows) {
    const rest = remainder(basis, row), size = norm(rest);
    if (size > DEPENDENT * norm(row)) basis.push(rest.map((v) => v / size));
  }
  return basis;
}

/** `row` less its projection on the orthonormal `basis`. */
function remainder(basis: readonly (readonly number[])[], row: readonly number[]): number[] {
  const rest = [...row];
  for (const e of basis) {
    let dot = 0;
    for (let j = 0; j < rest.length; j++) dot += e[j]! * rest[j]!;
    for (let j = 0; j < rest.length; j++) rest[j] = rest[j]! - dot * e[j]!;
  }
  return rest;
}

/** Whether `row` has a part outside the span of the orthonormal `basis`, beyond rounding. */
function independent(basis: readonly (readonly number[])[], row: readonly number[]): boolean {
  return norm(remainder(basis, row)) > DEPENDENT * norm(row);
}
