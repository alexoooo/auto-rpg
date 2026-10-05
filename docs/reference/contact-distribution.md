# Contact force redistribution

`contactTracking` optionally accepts a positive `redistributionCost`. With it, the same bounded
torque solve can redistribute ground forces among points on each contacted rigid body. Every
redistribution preserves that body's total force and moment. These are predictions: the world
still receives muscle commands only. The option is off in the existing measured tasks.

For each contacted body, the controller constructs the six-row map from point forces to its
wrench. Two-pass orthogonal projection produces the map's null space. The relative rank
tolerance is 1e-10; projected unit vectors with norm at most 1e-10 are discarded before the
second rank calculation. That absolute test prevents floating-point residue in a full-rank map
from becoming a spurious force freedom.

Null-space coordinates are normalized by the registered bodies' total weight. Their squared
norm is penalized by the supplied cost. Muscle effort retains its existing objective and bounds;
every selected point retains unilateral and inscribed-friction inequalities. The chosen final
loads are checked against the friction circle. Failed solves command zero torque.

The independent test in `tests/core-contact-tracking.test.mjs` uses a physical box with four
measured floor contacts (Node, Rapier, 120 Hz). An explicitly supplied affine reaction model has
opposite corners in tension despite an admissible distribution with the same wrench. Without
redistribution it rejects; with cost 1e-6 it accepts zero muscle torque, changes point forces,
and preserves all six wrench components within 1e-10. No physics bytes change. The saved
controller result also repeats after removing desired support and restoring the saved state.
This is an isolated force-allocation test, not a demonstration of standing or recovery.

The restriction to each body's wrench omits redistributions that change individual body loads
while preserving the articulated system's acceleration. Joint stops, changing contact modes,
sliding, and contact acquisition remain unmodeled. A rejected solve is not an infeasibility
certificate. The implementation allocates while rebuilding contact geometry and is experimental.

```powershell
node --test tests/core-contact-tracking.test.mjs
```
