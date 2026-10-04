import test from "node:test";
import assert from "node:assert/strict";
import { quadraticSolver } from "../src/core/math/quadratic.ts";
import { saveState, loadState } from "../src/core/state.ts";

const settings = { rho: 1, sigma: 0.000001, absoluteTolerance: 1e-9, relativeTolerance: 1e-9, iterations: 2000 };
const close = (a, b, tolerance = 1e-7) => assert.ok(Math.abs(a - b) < tolerance, `${a} vs ${b}`);
const constrained = { hessian: [4, 1, 1, 2], gradient: [1, 1], matrix: [1, 1, 1, 0, 0, 1],
  lower: [1, 0, 0], upper: [1, 0.7, 0.7], rows: 3 };

test("quadratic tasks honor coupled equalities and inequalities, rather than independently clipping a free solution", () => {
  const solver = quadraticSolver(2, 3, settings), report = solver.solve(constrained);
  assert.equal(report.status, "converged");
  close(solver.state.x[0], 0.3); close(solver.state.x[1], 0.7);
  assert.ok(report.primal <= report.primalTolerance && report.dual <= report.dualTolerance);
  // Equality multiplier -2.9, inactive x bound, active y upper-bound multiplier +0.2.
  solver.state.dual.forEach((v, i) => close(v, [-2.9, 0, 0.2][i]));
  solver.reset();
  assert.equal(solver.solve({ hessian: [2, 0, 0, 4], gradient: [-2, 4], matrix: [], lower: [], upper: [], rows: 0 }).status, "converged");
  close(solver.state.x[0], 1); close(solver.state.x[1], -1);
});

test("a coupled three-variable optimum satisfies an independently constructed KKT certificate", () => {
  const H = [4, 1, -1, 1, 3, 0.5, -1, 0.5, 2], A = [1, 2, -1, 0, 1, 1, -2, 0.5, 1];
  const expected = [0.2, -0.4, 0.7], multipliers = [0.6, 0, -0.3];
  const multiply = (matrix, vector) => [0, 1, 2].map((i) => [0, 1, 2].reduce((sum, j) => sum + matrix[i * 3 + j] * vector[j], 0));
  const h = multiply(H, expected), at = multiply(A, expected);
  const gradient = h.map((v, i) => -v - multipliers.reduce((sum, y, j) => sum + A[j * 3 + i] * y, 0));
  const problem = { hessian: H, gradient, matrix: A, lower: [-Infinity, at[1] - 1, at[2]], upper: [at[0], at[1] + 1, Infinity], rows: 3 };
  const solver = quadraticSolver(3, 4, settings);
  assert.equal(solver.solve(problem).status, "converged");
  expected.forEach((v, i) => close(solver.state.x[i], v));
  multipliers.forEach((v, i) => close(solver.state.dual[i], v));
  // A redundant zero equality is harmless and needs no penalty compliance.
  solver.reset();
  assert.equal(solver.solve({ ...problem, matrix: [...A, 0, 0, 0], lower: [...problem.lower, 0], upper: [...problem.upper, 0], rows: 4 }).status, "converged");
  expected.forEach((v, i) => close(solver.state.x[i], v));
});

test("unilateral forces cannot pull, and a finite iteration budget does not certify infeasibility", () => {
  const solver = quadraticSolver(1, 2, { ...settings, iterations: 100 });
  assert.equal(solver.solve({ hessian: [2], gradient: [10], matrix: [1], lower: [0], upper: [Infinity], rows: 1 }).status, "converged");
  close(solver.state.x[0], 0);
  solver.reset();
  const impossible = solver.solve({ hessian: [1], gradient: [0], matrix: [1, 1], lower: [1, -Infinity], upper: [Infinity, 0], rows: 2 });
  assert.equal(impossible.status, "iteration-limit"); assert.equal(impossible.iterations, 100);
  assert.ok(impossible.primal > 0.49);
  solver.reset();
  const unbounded = solver.solve({ hessian: [0], gradient: [-1], matrix: [], lower: [], upper: [], rows: 0 });
  assert.equal(unbounded.status, "iteration-limit"); assert.ok(unbounded.dual > 0.99);
});

test("warm-start memory is explicit and replays after changed constraints and a reset", () => {
  const config = { ...settings, iterations: 7 }, solver = quadraticSolver(2, 3, config);
  config.iterations = 1000;
  assert.equal(solver.solve(constrained).iterations, 7, "settings are copied");
  const checkpoint = saveState(solver.state);
  const branch = () => {
    const a = solver.solve({ ...constrained, upper: [1, 0.4, 0.9] });
    const first = saveState(solver.state); solver.reset();
    const b = solver.solve(constrained);
    return { a, first, b, final: saveState(solver.state) };
  };
  const first = branch(); loadState(solver.state, checkpoint); assert.deepEqual(branch(), first);
  const fresh = quadraticSolver(2, 3, { ...settings, iterations: 7 });
  loadState(fresh.state, checkpoint);
  loadState(solver.state, checkpoint);
  assert.deepEqual(fresh.solve(constrained), solver.solve(constrained));
  assert.deepEqual(saveState(fresh.state), saveState(solver.state));
});

test("invalid optimization input is rejected before changing iteration state", () => {
  const solver = quadraticSolver(2, 3, settings); solver.solve(constrained);
  const before = saveState(solver.state);
  for (const problem of [
    { ...constrained, rows: 4 }, { ...constrained, gradient: [NaN, 0] },
    { ...constrained, hessian: [1, 2, 0, 1] }, { ...constrained, lower: [2, 0, 0] },
    { ...constrained, upper: [1, , 0.7] }, { ...constrained, matrix: [NaN, 1, 1, 0, 0, 1] },
  ]) { assert.throws(() => solver.solve(problem)); assert.deepEqual(saveState(solver.state), before); }
});
