/** A convex quadratic objective and two-sided linear constraints, in flat row-major arrays. */
export interface QuadraticProblem {
  /** Minimize 0.5 x' H x + g' x; H must be symmetric positive semidefinite. */
  readonly hessian: ArrayLike<number>;
  readonly gradient: ArrayLike<number>;
  readonly matrix: ArrayLike<number>;
  readonly lower: ArrayLike<number>;
  readonly upper: ArrayLike<number>;
  readonly rows: number;
}

/** Validate the shared finite quadratic objective and two-sided constraint contract. */
export function checkQuadraticProblem(problem: QuadraticProblem, size: number, capacity: number): void {
  const { hessian: H, gradient: g, matrix: A, lower: lo, upper: hi, rows } = problem;
  if (!Number.isSafeInteger(rows) || rows < 0 || rows > capacity || H.length !== size * size || g.length !== size
    || A.length < rows * size || lo.length < rows || hi.length < rows) throw new Error("invalid quadratic problem dimensions");
  for (let i = 0; i < H.length; i++) if (!Number.isFinite(H[i])) throw new Error("nonfinite quadratic objective");
  for (let i = 0; i < size; i++) {
    if (!Number.isFinite(g[i])) throw new Error("nonfinite quadratic gradient");
    for (let j = 0; j < i; j++) if (H[i * size + j] !== H[j * size + i]) throw new Error("quadratic Hessian must be symmetric");
  }
  for (let r = 0; r < rows; r++) {
    if (typeof lo[r] !== "number" || typeof hi[r] !== "number" || Number.isNaN(lo[r]) || Number.isNaN(hi[r])
      || lo[r] === Infinity || hi[r] === -Infinity || lo[r]! > hi[r]!) throw new Error("invalid quadratic bounds");
    for (let c = 0; c < size; c++) if (!Number.isFinite(A[r * size + c])) throw new Error("nonfinite quadratic constraint");
  }
}
