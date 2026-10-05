import { runActiveKernel } from "./active-kernel.ts";
import { checkQuadraticProblem, type QuadraticProblem } from "./quadratic.ts";

interface Settings {
  readonly iterations: number;
  readonly absoluteTolerance: number;
  readonly relativeTolerance: number;
}

/**
 * Cold-start dual active-set solve for a strictly convex quadratic task. The same two-sided
 * contract as the ADMM component leaves solver choice outside a policy's action interface.
 * Work arrays are made once. The kernel has a deterministic work budget; reports distinguish
 * its failure modes and independently check primal, dual and complementarity residuals.
 * Returned candidates alias explicit state. A failed report is not an admissible action.
 */
export function activeQuadratic(size: number, capacity: number, settings: Settings) {
  if (!Number.isSafeInteger(size) || size < 1 || !Number.isSafeInteger(capacity) || capacity < 0
    || !Number.isSafeInteger(settings.iterations) || settings.iterations < 1
    || ![settings.absoluteTolerance, settings.relativeTolerance].every((v) => Number.isFinite(v) && v > 0)) throw new Error("invalid active quadratic dimensions or settings");
  const config = Object.freeze({ ...settings }), constraints = 2 * capacity, rank = Math.min(size, constraints);
  const vector = (n: number) => new Array<number>(n + 1).fill(0);
  const D = Array.from({ length: size + 1 }, () => vector(size)), A = Array.from({ length: size + 1 }, () => vector(constraints));
  const columns = Array.from({ length: constraints + 1 }, () => vector(size));
  const d = vector(size), b = vector(constraints), solution = vector(size), multipliers = vector(constraints);
  const value = vector(1), active = vector(constraints), iterations = vector(2), error = vector(1), budget = vector(0);
  const work = vector(2 * size + rank * (rank + 5) / 2 + 2 * constraints + 1);
  const original = vector(constraints), sense = vector(constraints);
  const state = { x: new Float64Array(size), dual: new Float64Array(capacity) };
  return {
    state,
    solve(problem: QuadraticProblem) {
      checkQuadraticProblem(problem, size, capacity);
      const { hessian: H, gradient: g, matrix, lower, upper, rows } = problem;
      let count = 0;
      for (let i = 0; i < size; i++) {
        d[i + 1] = -g[i]!;
        for (let j = 0; j < size; j++) D[i + 1]![j + 1] = H[i * size + j]!;
      }
      for (let r = 0; r < rows; r++) for (let side = 0; side < 2; side++) {
        const sign = side === 0 ? 1 : -1;
        const bound = sign === 1 ? lower[r]! : upper[r]!;
        if (!Number.isFinite(bound)) continue;
        count++; b[count] = sign * bound; original[count] = r; sense[count] = sign;
        for (let i = 0; i < size; i++) A[i + 1]![count] = sign * matrix[r * size + i]!;
      }
      state.x.fill(0); state.dual.fill(0); solution.fill(0); multipliers.fill(0); error.fill(0); iterations.fill(0);
      budget[0] = config.iterations;
      runActiveKernel(D, d, size, size, solution, multipliers, value, A, b, size, count, 0, active, 0, iterations, work, error, columns, budget);
      for (let i = 0; i < size; i++) state.x[i] = solution[i + 1]!;
      for (let r = 1; r <= count; r++) state.dual[original[r]!]! -= sense[r]! * multipliers[r]!;
      let primal = 0, dual = 0, complementarity = 0, dualSign = 0, axNorm = 0, boundNorm = 0, hxNorm = 0, atyNorm = 0, gNorm = 0;
      for (let r = 0; r < rows; r++) {
        let at = 0; for (let i = 0; i < size; i++) at += matrix[r * size + i]! * state.x[i]!;
        primal = Math.max(primal, lower[r]! - at, at - upper[r]!); axNorm = Math.max(axNorm, Math.abs(at));
        if (Number.isFinite(lower[r])) boundNorm = Math.max(boundNorm, Math.abs(lower[r]!));
        if (Number.isFinite(upper[r])) boundNorm = Math.max(boundNorm, Math.abs(upper[r]!));
      }
      for (let r = 1; r <= count; r++) {
        let at = -b[r]!; for (let i = 0; i < size; i++) at += A[i + 1]![r]! * state.x[i]!;
        complementarity = Math.max(complementarity, Math.abs(at * multipliers[r]!));
        dualSign = Math.max(dualSign, -multipliers[r]!);
      }
      for (let i = 0; i < size; i++) {
        let h = 0, a = 0;
        for (let j = 0; j < size; j++) h += H[i * size + j]! * state.x[j]!;
        for (let r = 0; r < rows; r++) a += matrix[r * size + i]! * state.dual[r]!;
        dual = Math.max(dual, Math.abs(h + a + g[i]!));
        hxNorm = Math.max(hxNorm, Math.abs(h)); atyNorm = Math.max(atyNorm, Math.abs(a)); gNorm = Math.max(gNorm, Math.abs(g[i]!));
      }
      const primalTolerance = config.absoluteTolerance + config.relativeTolerance * Math.max(axNorm, boundNorm);
      const dualTolerance = config.absoluteTolerance + config.relativeTolerance * Math.max(hxNorm, atyNorm, gNorm);
      const complementarityTolerance = config.absoluteTolerance + config.relativeTolerance * Math.max(1, axNorm, boundNorm) * Math.max(1, atyNorm);
      let status: "converged" | "inconsistent" | "not-positive-definite" | "iteration-limit" | "residual" | "nonfinite";
      switch (error[1]) {
        case 0: status = primal <= primalTolerance && dual <= dualTolerance && dualSign <= dualTolerance
          && complementarity <= complementarityTolerance ? "converged" : "residual"; break;
        case 1: status = "inconsistent"; break;
        case 2: status = "not-positive-definite"; break;
        case 3: status = "iteration-limit"; break;
        default: throw new Error("unknown active quadratic kernel result");
      }
      if (!Number.isFinite(primal + dual + complementarity + dualSign)) status = "nonfinite";
      for (let i = 0; i < size; i++) if (!Number.isFinite(state.x[i])) status = "nonfinite";
      for (let r = 0; r < capacity; r++) if (!Number.isFinite(state.dual[r])) status = "nonfinite";
      return { status, work: config.iterations - budget[0]!, searches: iterations[1]!, removals: iterations[2]!,
        primal, dual, complementarity, dualSign, primalTolerance, dualTolerance, complementarityTolerance };
    },
  };
}
