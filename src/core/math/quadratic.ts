/** A convex quadratic objective and two-sided linear constraints, in flat row-major arrays. */
interface QuadraticProblem {
  /** Minimize 0.5 x' H x + g' x; H must be symmetric positive semidefinite. */
  readonly hessian: ArrayLike<number>;
  readonly gradient: ArrayLike<number>;
  readonly matrix: ArrayLike<number>;
  readonly lower: ArrayLike<number>;
  readonly upper: ArrayLike<number>;
  readonly rows: number;
}

interface QuadraticSettings {
  readonly rho: number;
  readonly sigma: number;
  readonly absoluteTolerance: number;
  readonly relativeTolerance: number;
  readonly iterations: number;
}

/**
 * Deterministic ADMM for convex quadratic tasks with equality and inequality constraints.
 * One Cholesky factor of H + sigma I + rho A' A serves every iteration. Settings are explicit
 * numerical inputs; the report distinguishes convergence from exhausted iterations. The
 * caller checks residuals before using a candidate and independently enforces actuator limits.
 *
 * All iteration memory is in `state`, suitable for the world's save/load tree. Work arrays are
 * allocated once. A changed row meaning can be cold-started with `reset`; no wall clock chooses
 * an iteration budget. Returned candidates alias state and must be copied at an action boundary.
 */
export function quadraticSolver(size: number, capacity: number, settings: QuadraticSettings) {
  if (!Number.isSafeInteger(size) || size < 1 || !Number.isSafeInteger(capacity) || capacity < 0
    || ![settings.rho, settings.sigma, settings.absoluteTolerance, settings.relativeTolerance].every((v) => Number.isFinite(v) && v > 0)
    || !Number.isSafeInteger(settings.iterations) || settings.iterations < 1) throw new Error("invalid quadratic solver dimensions or settings");
  const config = Object.freeze({ ...settings });
  const state = { x: new Float64Array(size), z: new Float64Array(capacity), dual: new Float64Array(capacity) };
  const lowerFactor = new Float64Array(size * size), rhs = new Float64Array(size), next = new Float64Array(size);
  const reset = () => { state.x.fill(0); state.z.fill(0); state.dual.fill(0); };
  return {
    state, reset,
    solve(problem: QuadraticProblem) {
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
      const { rho, sigma } = config;
      for (let r = 0; r < size; r++) for (let c = 0; c <= r; c++) {
        let value = H[r * size + c]! + (r === c ? sigma : 0);
        for (let k = 0; k < rows; k++) value += rho * A[k * size + r]! * A[k * size + c]!;
        for (let k = 0; k < c; k++) value -= lowerFactor[r * size + k]! * lowerFactor[c * size + k]!;
        if (r === c && !(value > 0 && Number.isFinite(value))) throw new Error("quadratic system is not positive definite");
        lowerFactor[r * size + c] = r === c ? Math.sqrt(value) : value / lowerFactor[c * size + c]!;
      }
      let primal = Infinity, dual = Infinity, primalTolerance = 0, dualTolerance = 0;
      for (let iteration = 0; iteration < config.iterations; iteration++) {
        for (let i = 0; i < size; i++) {
          let value = sigma * state.x[i]! - g[i]!;
          for (let r = 0; r < rows; r++) value += A[r * size + i]! * (rho * state.z[r]! - state.dual[r]!);
          for (let j = 0; j < i; j++) value -= lowerFactor[i * size + j]! * rhs[j]!;
          rhs[i] = value / lowerFactor[i * size + i]!;
        }
        for (let i = size - 1; i >= 0; i--) {
          let value = rhs[i]!; for (let j = i + 1; j < size; j++) value -= lowerFactor[j * size + i]! * next[j]!;
          next[i] = value / lowerFactor[i * size + i]!;
        }
        state.x.set(next);
        primal = 0; let axNorm = 0, zNorm = 0;
        for (let r = 0; r < rows; r++) {
          let value = 0; for (let i = 0; i < size; i++) value += A[r * size + i]! * state.x[i]!;
          state.z[r] = Math.max(lo[r]!, Math.min(hi[r]!, value + state.dual[r]! / rho));
          state.dual[r]! += rho * (value - state.z[r]!);
          primal = Math.max(primal, Math.abs(value - state.z[r]!));
          axNorm = Math.max(axNorm, Math.abs(value)); zNorm = Math.max(zNorm, Math.abs(state.z[r]!));
        }
        dual = 0; let hxNorm = 0, atyNorm = 0, gNorm = 0;
        for (let i = 0; i < size; i++) {
          let h = 0, a = 0;
          for (let j = 0; j < size; j++) h += H[i * size + j]! * state.x[j]!;
          for (let r = 0; r < rows; r++) a += A[r * size + i]! * state.dual[r]!;
          dual = Math.max(dual, Math.abs(h + a + g[i]!));
          hxNorm = Math.max(hxNorm, Math.abs(h)); atyNorm = Math.max(atyNorm, Math.abs(a)); gNorm = Math.max(gNorm, Math.abs(g[i]!));
        }
        primalTolerance = config.absoluteTolerance + config.relativeTolerance * Math.max(axNorm, zNorm);
        dualTolerance = config.absoluteTolerance + config.relativeTolerance * Math.max(hxNorm, atyNorm, gNorm);
        if (!Number.isFinite(primal + dual)) return { status: "nonfinite" as const, iterations: iteration + 1, primal, dual, primalTolerance, dualTolerance };
        if (primal <= primalTolerance && dual <= dualTolerance) return { status: "converged" as const, iterations: iteration + 1, primal, dual, primalTolerance, dualTolerance };
      }
      return { status: "iteration-limit" as const, iterations: config.iterations, primal, dual, primalTolerance, dualTolerance };
    },
  };
}
