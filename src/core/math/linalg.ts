/**
 * Dense linear algebra for the small systems motor control solves: a few rows and columns, row
 * arrays. The servo's per-step Cholesky works in place on flat typed arrays, and stays beside the
 * servo (`src/core/control/servo.ts`).
 */

/** A matrix as its rows. */
type Rows = readonly (readonly number[])[];

/** Solve `A x = y` by elimination with partial pivoting; `A` and `y` are left as they were. */
export function solveLinear(A: Rows, y: readonly number[]): number[] {
  const n = y.length, M = A.map((row, i) => [...row, y[i]!]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[p]![c]!)) p = r;
    [M[c], M[p]] = [M[p]!, M[c]!];
    for (let r = c + 1; r < n; r++) {
      const f = M[r]![c]! / M[c]![c]!;
      if (f !== 0) for (let k = c; k <= n; k++) M[r]![k] = M[r]![k]! - f * M[c]![k]!;
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let sum = M[r]![n]!;
    for (let k = r + 1; k < n; k++) sum -= M[r]![k]! * x[k]!;
    x[r] = sum / M[r]![r]!;
  }
  return x;
}

/** Solve `A x = y`, `A` symmetric positive definite, by Cholesky. */
export function solveSymmetric(A: Rows, y: readonly number[]): number[] {
  const n = y.length, L = A.map(() => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
    let sum = A[i]![j]!;
    for (let k = 0; k < j; k++) sum -= L[i]![k]! * L[j]![k]!;
    L[i]![j] = i === j ? Math.sqrt(sum) : sum / L[j]![j]!;
  }
  const z = new Array<number>(n).fill(0), x = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) { let sum = y[i]!; for (let k = 0; k < i; k++) sum -= L[i]![k]! * z[k]!; z[i] = sum / L[i]![i]!; }
  for (let i = n - 1; i >= 0; i--) { let sum = z[i]!; for (let k = i + 1; k < n; k++) sum -= L[k]![i]! * x[k]!; x[i] = sum / L[i]![i]!; }
  return x;
}

/** Solve the 3 x 3 system `A x = b` by Cramer's rule. */
export function solve3(A: Rows, b: readonly number[]): number[] {
  const [a, bb, c] = A as [readonly number[], readonly number[], readonly number[]];
  const det = a[0]! * (bb[1]! * c[2]! - bb[2]! * c[1]!) - a[1]! * (bb[0]! * c[2]! - bb[2]! * c[0]!) + a[2]! * (bb[0]! * c[1]! - bb[1]! * c[0]!);
  const col = (i: number) => {
    const m = A.map((row, r) => row.map((v, k) => (k === i ? b[r]! : v)));
    return (m[0]![0]! * (m[1]![1]! * m[2]![2]! - m[1]![2]! * m[2]![1]!) - m[0]![1]! * (m[1]![0]! * m[2]![2]! - m[1]![2]! * m[2]![0]!)
      + m[0]![2]! * (m[1]![0]! * m[2]![1]! - m[1]![1]! * m[2]![0]!)) / det;
  };
  return [col(0), col(1), col(2)];
}

/**
 * The least-squares `x` of `J x = y`, damped by `damping`: J' (J J' + d^2 E)^-1 y. Near a singular
 * `J` an undamped solve asks for unbounded `x`.
 */
export function dampedSolve(J: Rows, y: readonly number[], damping: number): number[] {
  const rows = J.length, cols = J[0]!.length, d2 = damping * damping;
  const G = J.map((a, r) => J.map((b, s) => a.reduce((sum, v, k) => sum + v * b[k]!, 0) + (r === s ? d2 : 0)));
  const z = solveSymmetric(G, [...y]);
  return Array.from({ length: cols }, (_, k) => { let sum = 0; for (let r = 0; r < rows; r++) sum += J[r]![k]! * z[r]!; return sum; });
}

/**
 * `dampedSolve` of `J x = y` with the entries `fixed` names (a number, not NaN) held to it: the
 * others solve J_free x = y - J_fixed fixed. A held entry is a task above the rest, as in a
 * prioritized solve (Siciliano and Slotine 1991, "A general framework for managing multiple tasks
 * in highly redundant robotic systems", ICAR).
 */
export function fixedSolve(J: Rows, y: readonly number[], fixed: readonly number[], damping: number): number[] {
  if (fixed.every(Number.isNaN)) return dampedSolve(J, y, damping);
  const free = fixed.flatMap((v, k) => Number.isNaN(v) ? [k] : []);
  const rest = dampedSolve(J.map((row) => free.map((k) => row[k]!)),
    y.map((v, r) => v - fixed.reduce((sum, f, k) => Number.isNaN(f) ? sum : sum + J[r]![k]! * f, 0)), damping);
  const x = [...fixed];
  free.forEach((k, c) => { x[k] = rest[c]!; });
  return x;
}

/** The regularizer's weight against the problem's largest, a numeric setting. */
const REGULARIZER = 1e-6;

/**
 * The least of (x - y)' A (x - y) over lo <= x <= hi, A symmetric and positive semidefinite: a
 * primal active-set method on the bounds (Nocedal and Wright 2006, "Numerical Optimization", 16.5),
 * from y clipped. A direction A does not weigh stays at y's, clipped.
 */
export function boundedLeastSquares(A: Rows, y: readonly number[], lo: readonly number[], hi: readonly number[]): number[] {
  const n = y.length, x = y.map((v, i) => Math.min(hi[i]!, Math.max(lo[i]!, v)));
  const held = x.map((v, i) => v !== y[i]);
  const scale = Math.max(...A.map((row, i) => row[i]!)), e = REGULARIZER * scale;
  const gradient = () => x.map((_, i) => A[i]!.reduce((sum, v, j) => sum + v * (x[j]! - y[j]!), 0) + e * (x[i]! - y[i]!));
  for (let iteration = 0; iteration < 4 * n + 4; iteration++) {
    const g = gradient(), free = x.flatMap((_, i) => (held[i] ? [] : [i]));
    // The free ones' step to the least with the held ones where they are.
    const p = free.length ? solveLinear(free.map((i) => free.map((j) => A[i]![j]! + (i === j ? e : 0))), free.map((i) => -g[i]!)) : [];
    let step = 1, blocking = -1;
    free.forEach((i, c) => {
      const d = p[c]!, t = d > 0 ? (hi[i]! - x[i]!) / d : d < 0 ? (lo[i]! - x[i]!) / d : Infinity;
      if (t < step) { step = Math.max(0, t); blocking = i; }
    });
    free.forEach((i, c) => { x[i] = x[i]! + step * p[c]!; });
    if (blocking >= 0) {
      x[blocking] = p[free.indexOf(blocking)]! > 0 ? hi[blocking]! : lo[blocking]!;
      held[blocking] = true;
      continue;
    }
    // At the least with these held: release the one held against the way it would go.
    const after = gradient();
    let worst = -1, most = 1e-12 * (1 + scale);
    x.forEach((v, i) => {
      if (!held[i]) return;
      const against = v <= lo[i]! ? -after[i]! : after[i]!;
      if (against > most) { most = against; worst = i; }
    });
    if (worst < 0) return x;
    held[worst] = false;
  }
  return x;
}
