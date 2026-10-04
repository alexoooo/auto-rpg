# Active-set quadratic tasks

`math/active-quadratic.ts` supplies a cold-start dual active-set alternative to the ADMM
component. Both accept the same checked quadratic objective and two-sided linear bounds.
This solver requires a strictly positive-definite Hessian. It uses the
[quadprog Goldfarb–Idnani kernel](../../vendor/quadprog/README.md), adapted into the core's
audited arithmetic boundary with no runtime package dependency.

The kernel's machine-scale zero threshold starts at 1e-60 and doubles until both
`1 + 0.1 * threshold` and `1 + 0.2 * threshold` differ from 1. These are the pinned algorithm's
numerical settings, not anatomical or control gains. A caller supplies the work budget and
absolute/relative acceptance tolerances. Every state-machine loop consumes that budget.

The wrapper copies inputs into preallocated work arrays, represents a two-sided row as its
finite lower/upper inequalities, and reports primal, stationarity, dual-sign and complementarity
residuals independently of the kernel's success code. Inconsistency, non-positive-definite
objectives, exhausted work and failed residual checks remain distinct. A caller must not treat
a failed candidate as a feasible action. The kernel's inconsistency result is numerical, not
a formal infeasibility certificate.

`tests/core-active-quadratic.test.mjs` checks an analytic coupled optimum, equality and
unconstrained tasks, input immutability, reuse after changing row counts, saved-state replay,
inconsistent bounds, an indefinite objective and a one-unit exhausted budget. Twelve constructed
mixed-sign KKT optima agree with both the exact construction and the separate ADMM solver.
This establishes numerical machinery, not standing, friction-mode selection or recovery.

Removing the constraints from the kernel call fails the physical-inequality tests. The core's
import, exact-arithmetic, export, comment and numeric-provenance checks pass. Repository validation:
743 tests (741 pass, no failures, two existing TODOs), type checking and production build pass.
