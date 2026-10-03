import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { normIn } from "../math/real.ts";

/**
 * A flat sole on level ground (y up), bearing: where its middle is, which way it lies, and how far
 * its centre of pressure may go from its middle each way.
 */
export interface BearingSole {
  readonly kind: "sole";
  /** The sole's middle, world. */
  readonly middle: Vector3;
  /** Unit, level: along the sole's length. */
  readonly along: Vector3;
  /** How far the centre of pressure may go along the sole from its middle, m. */
  readonly length: number;
  /** How far across, m. */
  readonly width: number;
}

/** A point on level ground (y up), bearing: it gives a force at itself and no moment. */
export interface BearingPoint {
  readonly kind: "point";
  readonly at: Vector3;
}

/** What a body bears on the ground through. */
export type Patch = BearingSole | BearingPoint;

/** `patch`'s corners, world: a point's one, a sole's four, as far from its middle as its centre of pressure may go. */
export function patchCorners(patch: Patch): Vector3[] {
  switch (patch.kind) {
    case "point": return [patch.at];
    case "sole": {
      const { middle, along, length, width } = patch;
      // Across the sole: up x along.
      return [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([a, b]) =>
        new Vector3(middle.x + a! * length * along.x + b! * width * along.z, middle.y, middle.z + a! * length * along.z - b! * width * along.x));
    }
    default: return unknownKind(patch);
  }
}

/** A patch's share of the ground's wrench: a force at its place (a sole's middle, a point) and a moment, a point's none. */
interface PatchWrench {
  readonly force: Vector3;
  readonly moment: Vector3;
}

/**
 * **What a share of the ground's wrench works in** (`shareGroundWrench`), for up to the patches it
 * is made for, as flat arrays read with the call's own count of unknowns as their stride. A call
 * writes every entry it reads, so a work carries nothing from one call to the next; the body
 * whose control makes it is its only user.
 */
export interface GroundWrenchWork {
  /** The most unknowns, limits and patches it holds. */
  readonly unknowns: number;
  readonly limits: number;
  readonly patches: number;
  /** Each patch's first column. */
  readonly first: Int32Array;
  /** The wrench the unknowns make about the centre (6 rows), and what it is asked (`b`). */
  readonly A: Float64Array;
  readonly b: Float64Array;
  /** The rows' weights: a moment's miss against a force's. */
  readonly Q: Float64Array;
  /** The regularizer's weight on each unknown. */
  readonly D: Float64Array;
  /** The problem's Hessian and gradient. */
  readonly H: Float64Array;
  readonly g: Float64Array;
  /** The limits, C x >= 0, a row a limit. */
  readonly C: Float64Array;
  /** The share, as the active set moves it, and its step. */
  readonly x: Float64Array;
  readonly p: Float64Array;
  /** A step's system and its right-hand side, a row of (unknowns + working limits + 1), the rows' order as elimination swaps them, and its solution. */
  readonly K: Float64Array;
  readonly order: Int32Array;
  readonly solution: Float64Array;
  /** The working limits, by their rows, and an orthonormal basis of their span. */
  readonly working: Int32Array;
  readonly basis: Float64Array;
  /** A limit less its part in the basis. */
  readonly rest: Float64Array;
  /** The wrench's miss. */
  readonly miss: Float64Array;
}

/** A work for up to `soles` soles and `points` points bearing at once; a sole's room holds a point. */
export function groundWrenchWork(soles: number, points: number): GroundWrenchWork {
  const unknowns = unknownsOf("sole") * soles + unknownsOf("point") * points, limits = limitsOf("sole") * soles + limitsOf("point") * points;
  const system = unknowns + limits;
  return {
    unknowns, limits, patches: soles + points,
    first: new Int32Array(soles + points),
    A: new Float64Array(6 * unknowns), b: new Float64Array(6), Q: new Float64Array(6), D: new Float64Array(unknowns),
    H: new Float64Array(unknowns * unknowns), g: new Float64Array(unknowns), C: new Float64Array(limits * unknowns),
    x: new Float64Array(unknowns), p: new Float64Array(unknowns),
    K: new Float64Array(system * (system + 1)), order: new Int32Array(system), solution: new Float64Array(system),
    working: new Int32Array(limits), basis: new Float64Array(limits * unknowns), rest: new Float64Array(unknowns),
    miss: new Float64Array(6),
  };
}

/**
 * **The ground's wrench shared among bearing patches** (`patches`): each patch's force at its place
 * and moment, such that together they give the force `force` and the moment `moment` about
 * `centre`, as nearly as the patches can. A sole gives a force at its middle and a moment, and
 * - does not pull on the ground (its normal force is not negative),
 * - does not press outside itself (its centre of pressure, the point the moment's level part puts
 *   its normal force at, is within `length` along it and `width` across it of its middle),
 * - does not slide (its level force is within a pyramid inscribed in the cone of `friction`, along
 *   and across it), or twist on the ground (see below).
 *
 * A point gives a force at itself and no moment: it does not pull, and it does not slide, its
 * level force within the same pyramid along the world's x and z.
 *
 * It is the least-squares problem
 *
 *     minimize |A x - b|^2_Q + e |x|^2_D   subject to the patches' limits, linear in x,
 *
 * x being the patches' forces and the soles' moments, and A x the wrench they make about `centre`.
 * Q weighs a moment's miss against a force's at `lever` (a moment of `lever` N m counts as a
 * newton), and `e` D, each sole's force weighed against its moment at the sole's own length, is a
 * small regularizer that picks, among the shares that give the wrench, the least: the patches share
 * the weight as their levers do. The limits are homogeneous (x = 0 meets them all), so a share
 * always exists, and one close to zero load meets them strictly; the problem is solved from there
 * by a primal active-set method (Nocedal and Wright 2006, "Numerical optimization", algorithm
 * 16.3). Where the patches can give the wrench, the miss is zero to the regularizer's order; where
 * they cannot, the miss is the least they leave. Returns the miss, force and moment, into `miss`.
 *
 * A sole's limits are those of a rigid rectangular sole on rigid ground with a friction pyramid at
 * its corners, its contact wrench cone in closed form (Caron, Pham and Nakamura 2015, "Stability of
 * surface contacts for humanoid robots: closed-form formulae of the contact wrench cone", ICRA):
 * besides the three above, the sole's twist about the vertical is bounded by what friction at its
 * corners can give, so a sole that bears nothing twists nothing.
 *
 * `parts`, where given, is each patch's part of the load against the others': the regularizer
 * weighs a patch's wrench by its inverse, so among the shares that give the wrench the patches'
 * forces are as their parts, as nearly as the wrench lets them be. Without it they bear alike.
 *
 * It works in `work` (`groundWrenchWork`), made for at least as many patches.
 */
export function shareGroundWrench(work: GroundWrenchWork, patches: readonly Patch[], centre: Vector3, force: Vector3, moment: Vector3,
  friction: number, lever: number, out: PatchWrench[], miss?: { force: Vector3; moment: Vector3 }, parts?: readonly number[]): void {
  const { first, A, b, Q, D, H, g, C, x } = work;
  // Each patch's first column: the widths before it; and the count of limits.
  let n = 0, limits = 0;
  for (let s = 0; s < patches.length; s++) {
    const { kind } = patches[s]!;
    first[s] = n;
    n += unknownsOf(kind);
    limits += limitsOf(kind);
  }
  if (patches.length > work.patches || n > work.unknowns || limits > work.limits) throw new Error(`a share of ${patches.length} patches in a work made for ${work.patches}`);
  // A: rows force (3), moment about the centre (3); columns each patch's force (3) and, a sole's, moment (3).
  A.fill(0, 0, 6 * n);
  D.fill(1, 0, n);
  for (let s = 0; s < patches.length; s++) {
    const patch = patches[s]!, o = first[s]!, at = placeOf(patch);
    const d0 = at.x - centre.x, d1 = at.y - centre.y, d2 = at.z - centre.z;
    const part = parts ? parts[s]! : 1;
    for (let a = 0; a < 3; a++) {
      A[a * n + o + a] = 1;
      D[o + a] = 1 / part;
      // d x e_a
      const e0 = a === 0 ? 1 : 0, e1 = a === 1 ? 1 : 0, e2 = a === 2 ? 1 : 0;
      A[3 * n + o + a] = d1 * e2 - d2 * e1;
      A[4 * n + o + a] = d2 * e0 - d0 * e2;
      A[5 * n + o + a] = d0 * e1 - d1 * e0;
      switch (patch.kind) {
        case "sole":
          A[(3 + a) * n + o + 3 + a] = 1;
          D[o + 3 + a] = 1 / (patch.length * patch.length * part);
          break;
        case "point": break;
        default: unknownKind(patch);
      }
    }
  }
  b[0] = force.x; b[1] = force.y; b[2] = force.z; b[3] = moment.x; b[4] = moment.y; b[5] = moment.z;
  const turn = 1 / (lever * lever);
  Q[0] = 1; Q[1] = 1; Q[2] = 1; Q[3] = turn; Q[4] = turn; Q[5] = turn;
  // H = A' Q A + e D, g = -A' Q b; e small against the problem's own scale.
  let scale = -Infinity;
  for (let r = 0; r < 6; r++) {
    let sum = 0;
    for (let j = 0; j < n; j++) sum = sum + A[r * n + j]! * A[r * n + j]!;
    scale = Math.max(scale, Q[r]! * sum);
  }
  const e = REGULARIZER * scale;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let sum = 0;
      for (let r = 0; r < 6; r++) sum = sum + Q[r]! * A[r * n + i]! * A[r * n + j]!;
      H[i * n + j] = sum + (i === j ? e * D[i]! : 0);
    }
    let sum = 0;
    for (let r = 0; r < 6; r++) sum = sum + Q[r]! * A[r * n + i]! * b[r]!;
    g[i] = -sum;
  }
  // The limits, C x >= 0, a row each, in the order written. A limit is a sum of a patch's
  // components, each a combination of the world ones it is written in, each column's terms
  // summed from 0 in the order they come.
  C.fill(0, 0, limits * n);
  const mu = friction / Math.SQRT2;
  let row = 0;
  for (let s = 0; s < patches.length; s++) {
    const patch = patches[s]!, o = first[s]!;
    switch (patch.kind) {
      case "sole": {
        // In the sole's frame: 1 along it, 2 across (up x along), 3 up; as world columns, f1 is
        // (0: u.x, 2: u.z), f2 (0: u.z, 2: -u.x), f3 (1: 1), and t1, t2, t3 the same on 3, 5 and 4.
        const ux = patch.along.x, uz = patch.along.z, across = -patch.along.x, X = patch.length, Y = patch.width;
        let at = row++ * n + o;
        C[at + 1] += 1 * 1;
        for (let k = 0; k < 2; k++) {
          const a = k === 0 ? 1 : -1;
          // Friction: |f1|, |f2| <= mu f3.
          at = row++ * n + o; C[at + 1] += mu * 1; C[at] += -a * ux; C[at + 2] += -a * uz;
          at = row++ * n + o; C[at + 1] += mu * 1; C[at] += -a * uz; C[at + 2] += -a * across;
          // Centre of pressure: |t1| <= Y f3 across, |t2| <= X f3 along.
          at = row++ * n + o; C[at + 1] += Y * 1; C[at + 3] += -a * ux; C[at + 5] += -a * uz;
          at = row++ * n + o; C[at + 1] += X * 1; C[at + 3] += -a * uz; C[at + 5] += -a * across;
          // Twist, Caron et al. 2015 eq. 8: t_min <= t3 <= t_max, each absolute value in them opened
          // both ways, t_min = -mu (X + Y) f3 + |Y f1 - mu t1| + |X f2 - mu t2| and
          // t_max = mu (X + Y) f3 - |Y f1 + mu t1| - |X f2 + mu t2|: the terms t3, f3, f1, t1, f2, t2.
          for (let l = 0; l < 2; l++) {
            const bb = l === 0 ? 1 : -1;
            for (let side = 0; side < 2; side++) {
              const k3 = side === 0 ? 1 : -1, k1 = -a * Y, kt1 = side === 0 ? a * mu : -a * mu, k2 = -bb * X, kt2 = side === 0 ? bb * mu : -bb * mu;
              at = row++ * n + o;
              C[at + 4] += k3 * 1;
              C[at + 1] += mu * (X + Y) * 1;
              C[at] += k1 * ux; C[at + 2] += k1 * uz;
              C[at + 3] += kt1 * ux; C[at + 5] += kt1 * uz;
              C[at] += k2 * uz; C[at + 2] += k2 * across;
              C[at + 3] += kt2 * uz; C[at + 5] += kt2 * across;
            }
          }
        }
        break;
      }
      case "point": {
        // In the world's frame: no pull, and friction along x and along z, |f.x|, |f.z| <= mu f.y.
        let at = row++ * n + o;
        C[at + 1] += 1 * 1;
        for (let k = 0; k < 2; k++) {
          const a = k === 0 ? 1 : -1;
          at = row++ * n + o; C[at + 1] += mu * 1; C[at] += -a * 1;
          at = row++ * n + o; C[at + 1] += mu * 1; C[at + 2] += -a * 1;
        }
        break;
      }
      default: unknownKind(patch);
    }
  }
  x.fill(0, 0, n);
  // Strictly inside every limit: a light press at each patch's place.
  for (let s = 0; s < patches.length; s++) x[first[s]! + 1] = START;
  activeSet(work, n, limits);
  for (let s = 0; s < patches.length; s++) {
    const patch = patches[s]!, o = first[s]!;
    out[s]!.force.set(x[o]!, x[o + 1]!, x[o + 2]!);
    switch (patch.kind) {
      case "sole": out[s]!.moment.set(x[o + 3]!, x[o + 4]!, x[o + 5]!); break;
      case "point": out[s]!.moment.setAll(0); break;
      default: unknownKind(patch);
    }
  }
  if (miss) {
    const r = work.miss;
    for (let i = 0; i < 6; i++) {
      let sum = 0;
      for (let j = 0; j < n; j++) sum = sum + A[i * n + j]! * x[j]!;
      r[i] = sum - b[i]!;
    }
    miss.force.set(r[0]!, r[1]!, r[2]!);
    miss.moment.set(r[3]!, r[4]!, r[5]!);
  }
}

/** How many unknowns a patch of `kind` has: a sole's force and moment, a point's force. */
function unknownsOf(kind: Patch["kind"]): number {
  switch (kind) {
    case "sole": return 6;
    case "point": return 3;
    default: return unknownKind(kind);
  }
}

/** How many limits a patch of `kind` has: the rows `shareGroundWrench` writes for it. */
function limitsOf(kind: Patch["kind"]): number {
  switch (kind) {
    case "sole": return 17;
    case "point": return 5;
    default: return unknownKind(kind);
  }
}

/** Where `patch`'s force is given: a sole's middle, a point itself. */
function placeOf(patch: Patch): Vector3 {
  switch (patch.kind) {
    case "sole": return patch.middle;
    case "point": return patch.at;
    default: return unknownKind(patch);
  }
}

function unknownKind(patch: never): never {
  throw new Error(`a patch of no known kind: ${JSON.stringify(patch)}`);
}

/** The regularizer's weight against the problem's largest, a numeric setting: small enough not to move a share the soles can give by a measurable amount. */
const REGULARIZER = 1e-6;
/** The part of a limit's normal outside the working limits' span, relative to the normal, below which the limit is taken to depend on them: rounding, a numeric setting. */
const DEPENDENT = 1e-9;
/** The press each patch starts from, N: strictly inside every limit, and far below any share. A numeric setting. */
const START = 1e-3;

/**
 * Minimize 1/2 x' H x + g' x subject to C x >= 0, from `x`, feasible, into `x`, with `n` unknowns
 * and `limits` limits: a primal active-set method, the working set added to at a blocking limit
 * and dropped from at the most negative multiplier.
 */
function activeSet(work: GroundWrenchWork, n: number, limits: number): void {
  const { H, g, C, x, K, order, solution, p, working } = work;
  let m = 0;
  // After a full step x is the least in the working set's subspace, and the next solve's step is
  // rounding: its multipliers decide.
  let settled = false;
  for (let iteration = 0; iteration < 8 * (n + limits); iteration++) {
    // The step to the least in the working set's subspace: [H -C_W'; C_W 0] [p; l] = [-(H x + g); 0],
    // a row of K the system's and its right-hand side's.
    const size = n + m, width = size + 1;
    K.fill(0, 0, size * width);
    for (let i = 0; i < n; i++) {
      let q = g[i]!;
      for (let j = 0; j < n; j++) { K[i * width + j] = H[i * n + j]!; q += H[i * n + j]! * x[j]!; }
      K[i * width + size] = -q;
      for (let r = 0; r < m; r++) { const c = working[r]!; K[i * width + n + r] = -C[c * n + i]!; K[(n + r) * width + i] = C[c * n + i]!; }
    }
    eliminate(K, order, solution, size);
    for (let j = 0; j < n; j++) p[j] = solution[j]!;
    if (settled || normIn(p, 0, n) <= 1e-12 * (1 + normIn(x, 0, n))) {
      settled = false;
      let worst = -1, least = -1e-12;
      for (let r = 0; r < m; r++) { const l = solution[n + r]!; if (l < least) { least = l; worst = r; } }
      if (worst < 0) return;
      for (let r = worst; r < m - 1; r++) working[r] = working[r + 1]!;
      m--;
      continue;
    }
    // As far along p as the limits outside the working set allow. p lies in the working limits'
    // null space, so in exact arithmetic a limit it moves toward is independent of them. A step of
    // rounding's size has rounding's direction, and can seem to move toward a limit that is a
    // combination of the working ones; taken into the working set, it makes the next solve
    // singular. So a limit blocks only if it is independent of the working limits, which is
    // decided from the limits alone, whatever the step's size.
    let step = 1, blocking = -1, based = -1;
    for (let c = 0; c < limits; c++) {
      if (holds(working, m, c)) continue;
      let along = 0, at = 0;
      for (let j = 0; j < n; j++) { along += C[c * n + j]! * p[j]!; at += C[c * n + j]! * x[j]!; }
      if (along >= 0) continue;
      const t = Math.max(0, -at / along);
      if (t >= step) continue;
      if (based < 0) based = orthonormal(work, n, m);
      if (!independent(work, n, based, c)) continue;
      step = t; blocking = c;
    }
    for (let j = 0; j < n; j++) x[j] = x[j]! + step * p[j]!;
    if (blocking >= 0) working[m++] = blocking;
    else settled = true;
  }
}

/** Whether limit `c` is among the first `m` of `working`. */
function holds(working: Int32Array, m: number, c: number): boolean {
  for (let r = 0; r < m; r++) if (working[r] === c) return true;
  return false;
}

/**
 * Solve the system of `size` rows in `K`, each row its `size` columns and its right-hand side, by
 * elimination with partial pivoting, into `solution`: `solveLinear`'s operations, a row swap a swap
 * in `order`. `K` is left eliminated.
 */
function eliminate(K: Float64Array, order: Int32Array, solution: Float64Array, size: number): void {
  const width = size + 1;
  for (let i = 0; i < size; i++) order[i] = i;
  for (let c = 0; c < size; c++) {
    let pivot = c;
    for (let r = c + 1; r < size; r++) if (Math.abs(K[order[r]! * width + c]!) > Math.abs(K[order[pivot]! * width + c]!)) pivot = r;
    const swapped = order[c]!; order[c] = order[pivot]!; order[pivot] = swapped;
    const top = order[c]! * width;
    for (let r = c + 1; r < size; r++) {
      const at = order[r]! * width, f = K[at + c]! / K[top + c]!;
      if (f !== 0) for (let k = c; k <= size; k++) K[at + k] = K[at + k]! - f * K[top + k]!;
    }
  }
  for (let r = size - 1; r >= 0; r--) {
    const at = order[r]! * width;
    let sum = K[at + size]!;
    for (let k = r + 1; k < size; k++) sum -= K[at + k]! * solution[k]!;
    solution[r] = sum / K[at + r]!;
  }
}

/**
 * An orthonormal basis of the span of the first `m` working limits, into `work.basis`, a row a
 * vector of `n` (modified Gram-Schmidt; a limit dependent on those before adds nothing): returns
 * how many it has.
 */
function orthonormal(work: GroundWrenchWork, n: number, m: number): number {
  const { C, working, basis, rest } = work;
  let count = 0;
  for (let r = 0; r < m; r++) {
    const c = working[r]!;
    remainder(work, n, count, c);
    const size = normIn(rest, 0, n);
    if (size > DEPENDENT * normIn(C, c * n, n)) {
      for (let j = 0; j < n; j++) basis[count * n + j] = rest[j]! / size;
      count++;
    }
  }
  return count;
}

/** Limit `c` less its projection on the first `count` vectors of the orthonormal basis, into `work.rest`. */
function remainder(work: GroundWrenchWork, n: number, count: number, c: number): void {
  const { C, basis, rest } = work;
  for (let j = 0; j < n; j++) rest[j] = C[c * n + j]!;
  for (let e = 0; e < count; e++) {
    let dot = 0;
    for (let j = 0; j < n; j++) dot += basis[e * n + j]! * rest[j]!;
    for (let j = 0; j < n; j++) rest[j] = rest[j]! - dot * basis[e * n + j]!;
  }
}

/** Whether limit `c` has a part outside the span of the basis's first `count` vectors, beyond rounding. */
function independent(work: GroundWrenchWork, n: number, count: number, c: number): boolean {
  remainder(work, n, count, c);
  return normIn(work.rest, 0, n) > DEPENDENT * normIn(work.C, c * n, n);
}
