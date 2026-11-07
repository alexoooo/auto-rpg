/**
 * Dense linear algebra for the small systems motor control solves: a few rows and columns, row
 * arrays. A step's dear loops solve on flat arrays in a work made once (`flat.ts`), each solve
 * there the twin of one here, with its answers to the bit. The
 * servo's per-step Cholesky works in place on flat typed arrays, and stays beside the servo
 * (`src/control/servo.ts`).
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

/** The regularizer's weight against the problem's largest, a numeric setting. */
export const REGULARIZER = 1e-6;
