/**
 * **`linalg.ts`'s solves on flat arrays**, for a step's dear loops: a matrix is its rows laid end
 * to end, and a solve works in arrays its caller made once (its work). Each does its `linalg.ts`
 * twin's operations in the same order on the same numbers, so its answers are the same to the bit
 * (`tests/core-flat.test.mjs`). A work carries nothing from one call to the next: a solve writes
 * every entry it reads.
 */
import { REGULARIZER } from "./linalg.ts";

/**
 * Solve the `size` rows of `K`, each its `size` columns and then its right-hand side (a row of
 * `size + 1`), into `x`: `solveLinear`'s elimination with partial pivoting, a swap of two rows a
 * swap in `order`. `K` is left eliminated; `order` and `x` hold at least `size`.
 */
function solveAugmentedTo(K: Float64Array, size: number, order: Int32Array, x: Float64Array): Float64Array {
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
    for (let k = r + 1; k < size; k++) sum -= K[at + k]! * x[k]!;
    x[r] = sum / K[at + r]!;
  }
  return x;
}

/** What `solveLinearTo` works in, for systems of up to `size` rows. */
export interface LinearWork {
  readonly size: number;
  readonly augmented: Float64Array;
  readonly order: Int32Array;
}

export function linearWork(size: number): LinearWork {
  return { size, augmented: new Float64Array(size * (size + 1)), order: new Int32Array(size) };
}

/** `solveLinear` of `A` (`n` by `n`, its rows end to end) and `y`, into `x`; `A` and `y` are left as they were. */
export function solveLinearTo(work: LinearWork, A: ArrayLike<number>, y: ArrayLike<number>, n: number, x: Float64Array): Float64Array {
  if (n > work.size) throw new Error(`a system of ${n} rows in a work made for ${work.size}`);
  const K = work.augmented, width = n + 1;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) K[r * width + c] = A[r * n + c]!;
    K[r * width + n] = y[r]!;
  }
  return solveAugmentedTo(K, n, work.order, x);
}

/** `solve3` of `A` (3 by 3, its rows end to end) and `b`, into `x`: Cramer's rule, each determinant by its first row. */
export function solve3To(A: ArrayLike<number>, b: ArrayLike<number>, x: Float64Array): Float64Array {
  const det = det3(A[0]!, A[1]!, A[2]!, A[3]!, A[4]!, A[5]!, A[6]!, A[7]!, A[8]!);
  x[0] = det3(b[0]!, A[1]!, A[2]!, b[1]!, A[4]!, A[5]!, b[2]!, A[7]!, A[8]!) / det;
  x[1] = det3(A[0]!, b[0]!, A[2]!, A[3]!, b[1]!, A[5]!, A[6]!, b[2]!, A[8]!) / det;
  x[2] = det3(A[0]!, A[1]!, b[0]!, A[3]!, A[4]!, b[1]!, A[6]!, A[7]!, b[2]!) / det;
  return x;
}

/** The determinant of the rows (a0 a1 a2), (b0 b1 b2), (c0 c1 c2), by the first row. */
function det3(a0: number, a1: number, a2: number, b0: number, b1: number, b2: number, c0: number, c1: number, c2: number): number {
  return a0 * (b1 * c2 - b2 * c1) - a1 * (b0 * c2 - b2 * c0) + a2 * (b0 * c1 - b1 * c0);
}

/** What `fixedSolveTo` works in, for up to `rows` rows and `columns` columns. */
export interface FixedWork {
  readonly rows: number;
  readonly columns: number;
  /** The free columns' indices, `J`'s rows on them, and their answer. */
  readonly free: Int32Array;
  readonly kept: Float64Array;
  readonly rest: Float64Array;
  /** The right-hand side less the held entries' part. */
  readonly left: Float64Array;
  /** J J' + d^2 E, its Cholesky factor, and the two triangular solves' answers. */
  readonly G: Float64Array;
  readonly L: Float64Array;
  readonly z: Float64Array;
  readonly w: Float64Array;
}

export function fixedWork(rows: number, columns: number): FixedWork {
  return {
    rows, columns, free: new Int32Array(columns), kept: new Float64Array(rows * columns), rest: new Float64Array(columns),
    left: new Float64Array(rows), G: new Float64Array(rows * rows), L: new Float64Array(rows * rows), z: new Float64Array(rows), w: new Float64Array(rows),
  };
}

/**
 * `dampedSolve` of `J` (`rows` by `columns`, its rows end to end) and `y`, into `x`:
 * J' (J J' + d^2 E)^-1 y, by `solveSymmetric`'s Cholesky.
 */
function dampedSolveTo(work: FixedWork, J: ArrayLike<number>, y: ArrayLike<number>, rows: number, columns: number, damping: number, x: Float64Array): void {
  const { G, L, z, w } = work, d2 = damping * damping;
  for (let r = 0; r < rows; r++) for (let s = 0; s < rows; s++) {
    let sum = 0;
    for (let k = 0; k < columns; k++) sum = sum + J[r * columns + k]! * J[s * columns + k]!;
    G[r * rows + s] = sum + (r === s ? d2 : 0);
  }
  for (let i = 0; i < rows; i++) for (let j = 0; j <= i; j++) {
    let sum = G[i * rows + j]!;
    for (let k = 0; k < j; k++) sum -= L[i * rows + k]! * L[j * rows + k]!;
    L[i * rows + j] = i === j ? Math.sqrt(sum) : sum / L[j * rows + j]!;
  }
  for (let i = 0; i < rows; i++) { let sum = y[i]!; for (let k = 0; k < i; k++) sum -= L[i * rows + k]! * z[k]!; z[i] = sum / L[i * rows + i]!; }
  for (let i = rows - 1; i >= 0; i--) { let sum = z[i]!; for (let k = i + 1; k < rows; k++) sum -= L[k * rows + i]! * w[k]!; w[i] = sum / L[i * rows + i]!; }
  for (let k = 0; k < columns; k++) { let sum = 0; for (let r = 0; r < rows; r++) sum += J[r * columns + k]! * w[r]!; x[k] = sum; }
}

/**
 * `fixedSolve` of `J` (`rows` by `columns`, its rows end to end), `y` and `fixed` (`columns` long),
 * damped by `damping`, into `x`: the entries `fixed` names (a number, not NaN) held to it, the
 * others the damped least-squares answer for what they leave.
 */
export function fixedSolveTo(work: FixedWork, J: ArrayLike<number>, y: ArrayLike<number>, rows: number, columns: number,
  fixed: ArrayLike<number>, damping: number, x: Float64Array): Float64Array {
  if (rows > work.rows || columns > work.columns) throw new Error(`a ${rows} by ${columns} solve in a work made for ${work.rows} by ${work.columns}`);
  const { free, kept, rest, left } = work;
  let count = 0;
  for (let k = 0; k < columns; k++) if (Number.isNaN(fixed[k]!)) free[count++] = k;
  if (count === columns) { dampedSolveTo(work, J, y, rows, columns, damping, x); return x; }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < count; c++) kept[r * count + c] = J[r * columns + free[c]!]!;
    let sum = 0;
    for (let k = 0; k < columns; k++) { const f = fixed[k]!; if (!Number.isNaN(f)) sum = sum + J[r * columns + k]! * f; }
    left[r] = y[r]! - sum;
  }
  dampedSolveTo(work, kept, left, rows, count, damping, rest);
  for (let k = 0; k < columns; k++) x[k] = fixed[k]!;
  for (let c = 0; c < count; c++) x[free[c]!] = rest[c]!;
  return x;
}

/** What `boundedLeastSquaresTo` works in, for up to `size` unknowns. */
export interface BoundedWork {
  readonly size: number;
  readonly held: Uint8Array;
  readonly g: Float64Array;
  readonly free: Int32Array;
  readonly p: Float64Array;
  readonly linear: LinearWork;
}

export function boundedWork(size: number): BoundedWork {
  return { size, held: new Uint8Array(size), g: new Float64Array(size), free: new Int32Array(size), p: new Float64Array(size), linear: linearWork(size) };
}

/** (A (x - y))_i + e (x_i - y_i), each `i` below `n`, into `g`. */
function gradientTo(A: ArrayLike<number>, x: Float64Array, y: ArrayLike<number>, n: number, e: number, g: Float64Array): void {
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = 0; j < n; j++) sum = sum + A[i * n + j]! * (x[j]! - y[j]!);
    g[i] = sum + e * (x[i]! - y[i]!);
  }
}

/**
 * `boundedLeastSquares` of `A` (`n` by `n`, its rows end to end), `y`, `lo` and `hi`, into `x`: the
 * least of (x - y)' A (x - y) over lo <= x <= hi.
 */
export function boundedLeastSquaresTo(work: BoundedWork, A: ArrayLike<number>, y: ArrayLike<number>, lo: ArrayLike<number>, hi: ArrayLike<number>,
  n: number, x: Float64Array): Float64Array {
  if (n > work.size) throw new Error(`${n} unknowns in a work made for ${work.size}`);
  const { held, g, free, p } = work, K = work.linear.augmented;
  let scale = -Infinity;
  for (let i = 0; i < n; i++) {
    x[i] = Math.min(hi[i]!, Math.max(lo[i]!, y[i]!));
    held[i] = x[i] !== y[i] ? 1 : 0;
    scale = Math.max(scale, A[i * n + i]!);
  }
  const e = REGULARIZER * scale;
  for (let iteration = 0; iteration < 4 * n + 4; iteration++) {
    gradientTo(A, x, y, n, e, g);
    let m = 0;
    for (let i = 0; i < n; i++) if (!held[i]) free[m++] = i;
    // The free ones' step to the least with the held ones where they are.
    if (m) {
      const width = m + 1;
      for (let r = 0; r < m; r++) {
        const i = free[r]!;
        for (let c = 0; c < m; c++) { const j = free[c]!; K[r * width + c] = A[i * n + j]! + (i === j ? e : 0); }
        K[r * width + m] = -g[i]!;
      }
      solveAugmentedTo(K, m, work.linear.order, p);
    }
    let step = 1, blocking = -1, blockingColumn = -1;
    for (let c = 0; c < m; c++) {
      const i = free[c]!, d = p[c]!, t = d > 0 ? (hi[i]! - x[i]!) / d : d < 0 ? (lo[i]! - x[i]!) / d : Infinity;
      if (t < step) { step = Math.max(0, t); blocking = i; blockingColumn = c; }
    }
    for (let c = 0; c < m; c++) { const i = free[c]!; x[i] = x[i]! + step * p[c]!; }
    if (blocking >= 0) {
      x[blocking] = p[blockingColumn]! > 0 ? hi[blocking]! : lo[blocking]!;
      held[blocking] = 1;
      continue;
    }
    // At the least with these held: release the one held against the way it would go.
    gradientTo(A, x, y, n, e, g);
    let worst = -1, most = 1e-12 * (1 + scale);
    for (let i = 0; i < n; i++) {
      if (!held[i]) continue;
      const against = x[i]! <= lo[i]! ? -g[i]! : g[i]!;
      if (against > most) { most = against; worst = i; }
    }
    if (worst < 0) return x;
    held[worst] = 0;
  }
  return x;
}
