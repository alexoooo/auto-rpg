import test from "node:test";
import assert from "node:assert/strict";
import { activeQuadratic } from "../src/core/math/active-quadratic.ts";
import { quadraticSolver } from "../src/core/math/quadratic.ts";
import { saveState, loadState } from "../src/core/state.ts";

const settings = { iterations: 512, absoluteTolerance: 1e-9, relativeTolerance: 1e-9 };
const close = (a, b, tolerance = 1e-8) => assert.ok(Math.abs(a - b) < tolerance, `${a} vs ${b}`);
const problem = (hessian, gradient, matrix, lower, upper) => ({ hessian, gradient, matrix, lower, upper, rows: lower.length });

test("active quadratics solve coupled bounds, equalities and unconstrained tasks with independent KKT checks", () => {
  const solver = activeQuadratic(2, 3, settings);
  const bounded = problem([2, 1, 1, 2], [-4, -5], [1, 0, 0, 1, 1, 1], [0, 0, -Infinity], [Infinity, Infinity, 2]);
  const before = structuredClone(bounded), report = solver.solve(bounded);
  assert.equal(report.status, "converged");
  close(solver.state.x[0], 0.5); close(solver.state.x[1], 1.5); close(solver.state.dual[2], 1.5);
  assert.ok(report.primal < 1e-10 && report.dual < 1e-10 && report.complementarity < 1e-10);
  assert.deepEqual(bounded, before, "the kernel only overwrites its own work");
  const saved = saveState(solver.state);
  assert.equal(solver.solve(problem([1, 0, 0, 1], [0, 0], [1, -1], [2], [2])).status, "converged");
  close(solver.state.x[0], 1); close(solver.state.x[1], -1);
  assert.equal(solver.solve(problem([1, 0, 0, 1], [-3, 4], [], [], [])).status, "converged");
  assert.deepEqual([...solver.state.x], [3, -4]); assert.deepEqual([...solver.state.dual], [0, 0, 0]);
  loadState(solver.state, saved);
  assert.deepEqual(solver.solve(bounded), report);
  assert.deepEqual(saveState(solver.state), saved);
});

test("active quadratics distinguish inconsistent constraints, indefinite objectives and exhausted work", () => {
  const solver = activeQuadratic(1, 2, settings);
  assert.equal(solver.solve(problem([1], [0], [1, 1], [1, -Infinity], [Infinity, 0])).status, "inconsistent");
  assert.equal(solver.solve(problem([-1], [0], [], [], [])).status, "not-positive-definite");
  const limited = activeQuadratic(1, 1, { ...settings, iterations: 1 });
  const report = limited.solve(problem([1], [-2], [1], [-Infinity], [1]));
  assert.equal(report.status, "iteration-limit"); assert.equal(report.work, 1);
  assert.equal(solver.solve(problem([1], [-2], [1], [-Infinity], [1])).status, "converged", "failure leaves the next cold solve usable");
  close(solver.state.x[0], 1);
  assert.throws(() => solver.solve(problem([NaN], [0], [], [], [])), /nonfinite/);
  assert.throws(() => solver.solve(problem([1], [0], [1], [2], [1])), /bounds/);
  assert.throws(() => activeQuadratic(0, 1, settings), /dimensions/);
  assert.equal(solver.solve(problem([1e-308], [-1e308], [], [], [])).status, "nonfinite");
});

test("constructed mixed-sign KKT optima agree with the separate ADMM solver", () => {
  for (let seed = 1; seed <= 12; seed++) {
    const n = 4, rows = 7, x = Array.from({ length: n }, (_, i) => (i - 2) * seed / 13);
    const B = Array.from({ length: n * n }, (_, i) => ((i * 17 + seed * 3) % 11 - 5) / 7);
    const H = Array.from({ length: n * n }, (_, i) => {
      const r = Math.floor(i / n), c = i % n;
      let value = r === c ? 1 : 0; for (let k = 0; k < n; k++) value += B[k * n + r] * B[k * n + c];
      return value;
    });
    const A = Array.from({ length: rows * n }, (_, i) => ((i * 7 + seed) % 13 - 6) / 5);
    const dual = [0.7, -0.5, 0.2, 0, 0, 0, 0], lower = [], upper = [];
    for (let r = 0; r < rows; r++) {
      let at = 0; for (let i = 0; i < n; i++) at += A[r * n + i] * x[i];
      lower.push(dual[r] < 0 ? at : at - 1); upper.push(dual[r] > 0 ? at : at + 1);
    }
    const g = x.map((_, i) => {
      let value = 0; for (let j = 0; j < n; j++) value -= H[i * n + j] * x[j];
      for (let r = 0; r < rows; r++) value -= A[r * n + i] * dual[r]; return value;
    });
    const p = problem(H, g, A, lower, upper), solver = activeQuadratic(n, rows, settings);
    const reference = quadraticSolver(n, rows, { rho: 1, sigma: 1e-6, ...settings, iterations: 10000 });
    assert.equal(solver.solve(p).status, "converged", `active seed ${seed}`);
    assert.equal(reference.solve(p).status, "converged", `ADMM seed ${seed}`);
    x.forEach((v, i) => { close(solver.state.x[i], v); close(reference.state.x[i], v, 1e-6); });
  }
});
