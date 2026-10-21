# Quadratic task solvers

The core's two solvers of `min 0.5 x' H x + g' x` subject to `lower <= A x <= upper` (equal bounds
are equalities, infinite bounds one-sided): the ADMM solver `math/quadratic.ts` and the dual
active-set solver `math/active-quadratic.ts`. `math/active-kernel.ts` cites the kernel's zero
threshold. Neither applies forces or is a policy's action; a caller checks the report and still
enforces actuator limits, since an unconverged candidate authorizes no command.

## ADMM

`math/quadratic.ts` factors `H + sigma I + rho A' A` once per problem, then alternates a linear
solve and a projection onto the bound intervals. It reports the infinity norms of `Ax - z` and
`Hx + g + A' dual` against absolute and relative tolerances, as the
[OSQP algorithm documentation](https://osqp.org/docs/solver/index.html) defines them. It uses
dense Cholesky, fixed supplied parameters and an iteration count: no wall-clock adaptation,
polishing, OSQP dependency or infeasibility certificate.

- `H` is symmetric positive semidefinite; a failed factorization is rejected. Dimension,
  symmetry, finite-coefficient and bound checks run before any state changes.
- Work arrays are made at construction. The warm start (`x`, `z`, `dual`) is saved state; a
  caller resets it when the rows change meaning.
- `iteration-limit` means the budget ended, not that the problem is infeasible; `nonfinite` means
  the iteration became invalid.

## Active set

`math/active-quadratic.ts` is the
[quadprog Goldfarb–Idnani kernel](../../vendor/quadprog/README.md), ported into the core's exact
arithmetic with no runtime package. It needs a strictly positive-definite Hessian.

- **Zero threshold**: starts at 1e-60 and doubles until both `1 + 0.1 * threshold` and
  `1 + 0.2 * threshold` differ from 1. This is the pinned algorithm's numeric setting.
- The caller supplies the work budget and absolute/relative tolerances; every loop of the state
  machine spends the budget.
- The wrapper copies inputs into preallocated arrays, writes a two-sided row as its two finite
  inequalities, and reports primal, stationarity, dual-sign and complementarity residuals apart
  from the kernel's success code. Inconsistency, a non-positive-definite objective, exhausted
  work and failed residuals are distinct outcomes. Inconsistency is numerical, not a certificate.

## Measurement

Node, numerical tests only, no world.

- `tests/core-quadratic.test.mjs@2a1b29ac` (rho 1, sigma 1e-6, tolerances 1e-9, 2000 iterations): a
  coupled equality/bound problem reaches `(0.3, 0.7)` with multipliers `(-2.9, 0, 0.2)`; a
  problem built from a known KKT point agrees within 1e-7, with a redundant zero equality too; a
  unilateral force stays at zero when the objective asks it to pull; contradictory constraints
  and an unbounded objective exhaust 100 iterations without claiming convergence; a warm start
  replays across changed bounds, reset, save/load and a fresh solver.
- `tests/core-active-quadratic.test.mjs@2a1b29ac`: analytic, equality and unconstrained optima, input
  immutability, reuse after a change of row count, saved-state replay, inconsistent bounds, an
  indefinite objective and a one-unit budget. Twelve constructed mixed-sign KKT optima agree
  with their construction and with the ADMM solver.
