import { activeQuadratic } from "../math/active-quadratic.ts";

/** A two-sided affine constraint on actual actuator torques, before effort normalization. */
export interface EffortBound {
  readonly coefficients: readonly number[];
  readonly lower: number;
  readonly upper: number;
}

/** Validate additional physical effort rows before a solver samples them. */
export function checkEffortBounds(bounds: readonly EffortBound[], channels: number, capacity: number): void {
  if (bounds.length > capacity || Array.from(bounds).some((b) => !b || !Array.isArray(b.coefficients) || b.coefficients.length !== channels
    || !Array.from(b.coefficients).every(Number.isFinite) || typeof b.lower !== "number" || typeof b.upper !== "number"
    || Number.isNaN(b.lower) || Number.isNaN(b.upper) || b.lower === Infinity || b.upper === -Infinity || b.lower > b.upper)) {
    throw new Error("invalid additional effort bounds");
  }
}

/** Bounded torque objectives with extra affine rows, independent of ground contacts or gravity. */
export function effortBounds(channels: number, capacity: number, settings: Parameters<typeof activeQuadratic>[2]) {
  if (!Number.isSafeInteger(capacity) || capacity < 0) throw new Error("invalid effort-bound capacity");
  const solver = activeQuadratic(channels, channels + capacity, settings), rowsCapacity = channels + capacity;
  const matrix = new Float64Array(rowsCapacity * channels), lower = new Float64Array(rowsCapacity), upper = new Float64Array(rowsCapacity);
  const H = new Float64Array(channels * channels), gradient = new Float64Array(channels), normalization = new Float64Array(channels);
  const state = { solver: solver.state, status: "unconstrained" as "unconstrained" | "accepted" | "rejected",
    solve: null as ReturnType<typeof solver.solve> | null };
  return { state,
    solve(hessian: Float64Array, rhs: Float64Array, scale: Float64Array, lo: Float64Array, hi: Float64Array,
      candidate: Float64Array, bounds: readonly EffortBound[]): void {
      checkEffortBounds(bounds, channels, capacity);
      state.status = "unconstrained"; state.solve = null;
      if (!bounds.length) return;
      matrix.fill(0);
      for (let i = 0; i < channels; i++) { matrix[i * channels + i] = 1; lower[i] = lo[i]!; upper[i] = hi[i]!; }
      let rows = channels;
      for (const bound of bounds) {
        for (let i = 0; i < channels; i++) matrix[rows * channels + i] = bound.coefficients[i]! * scale[i]!;
        lower[rows] = bound.lower; upper[rows] = bound.upper; rows++;
      }
      let valid = true;
      for (let r = 0; r < rows; r++) {
        let value = 0; for (let i = 0; i < channels; i++) value += matrix[r * channels + i]! * candidate[i]!;
        if (value < lower[r]! || value > upper[r]!) valid = false;
      }
      if (valid) { state.status = "accepted"; return; }
      for (let i = 0; i < channels; i++) normalization[i] = 1 / Math.sqrt(hessian[i * channels + i]!);
      for (let i = 0; i < channels; i++) {
        gradient[i] = -rhs[i]! * normalization[i]!;
        for (let j = 0; j <= i; j++) H[i * channels + j] = H[j * channels + i] = hessian[i * channels + j]! * normalization[i]! * normalization[j]!;
      }
      for (let r = 0; r < rows; r++) {
        let length = 0;
        for (let i = 0; i < channels; i++) { const k = r * channels + i; matrix[k]! *= normalization[i]!; length += matrix[k]! * matrix[k]!; }
        length = Math.sqrt(length);
        if (length > 0) {
          for (let i = 0; i < channels; i++) matrix[r * channels + i]! /= length;
          lower[r]! /= length; upper[r]! /= length;
        }
      }
      state.solve = solver.solve({ hessian: H, gradient, matrix, lower, upper, rows });
      state.status = state.solve.status === "converged" ? "accepted" : "rejected";
      for (let i = 0; i < channels; i++) candidate[i] = state.status === "accepted" ? solver.state.x[i]! * normalization[i]! : 0;
    },
  };
}
