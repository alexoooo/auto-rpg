# Constrained quadratic tasks

`math/quadratic.ts` provides a deterministic internal solver for
`min 0.5 x' H x + g' x`, subject to `lower <= A x <= upper`. Equal bounds encode equalities;
infinite bounds encode one-sided constraints. This is an optional numerical component for the
reference controller. It is not the public policy action representation and applies no forces.

The ADMM update factors `H + sigma I + rho A' A` once per problem, then alternates a linear
solve and projection onto the bound intervals. It reports the infinity norms of `Ax - z` and
`Hx + g + A' dual`, compared with explicit absolute/relative tolerances. These equations and
residual definitions follow the [OSQP algorithm documentation](https://osqp.org/docs/solver/index.html).
This implementation uses dense Cholesky, fixed supplied parameters and an iteration count;
it has no wall-clock adaptation, dependency on OSQP, polishing or infeasibility certificate.

All iteration work arrays are allocated at construction. Warm-start vectors `x`, `z` and `dual`
are explicit saved state, including inactive capacity. A controller must reset when it changes
the meaning of constraint rows or intentionally requests a cold start. The caller supplies a
symmetric positive-semidefinite objective; factorization failure is rejected. Dimension,
symmetry, finite-coefficient and bound checks run before iteration state changes.

`iteration-limit` means the budget ended, not that the problem is proven infeasible. `nonfinite`
means the numerical iteration became invalid. A controller must check the report and still
enforce physical actuator limits at its action boundary; an unconverged candidate does not
authorize an impossible command or an external contact force.

## Verification

Harness: Node, numerical tests in `tests/core-quadratic.test.mjs`; no physical world or assists.
Fixture settings are rho=1, sigma=1e-6, absolute and relative tolerances 1e-9, maximum 2000
iterations. These are analytic verification inputs, not selected gameplay settings.

- A two-variable coupled equality/bound problem reaches `(0.3, 0.7)` with independently derived
  multipliers `(-2.9, 0, 0.2)`. Independent clipping of its free solution cannot give the optimum.
- A three-variable problem is constructed from a known feasible point and KKT certificate.
  Both the point and multipliers agree within 1e-7, including with a redundant zero equality.
- A unilateral force stays at zero when the unconstrained objective asks it to pull. Contradictory
  constraints and an unbounded linear objective exhaust 100 iterations without a false convergence
  claim. An unconstrained strictly convex objective also solves correctly.
- A seven-iteration warm-start branch replays exactly across changed bounds, reset, save/load
  and reconstruction in a fresh solver. Mutating the supplied settings afterward changes nothing.
- Invalid input leaves saved iteration state unchanged. Removing the interval projection makes
  the physical-bound and coupled-optimum tests fail.

```powershell
node --test tests/core-quadratic.test.mjs
```

The named consumer is the reference whole-body controller's combined effort, joint-limit and
contact problem. Conditioning, iteration budgets, physical tracking and step cost must still be
measured there. Passing these numerical tests does not establish a successful block or recovery.
