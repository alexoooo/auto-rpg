# Contact force redistribution

What `contactTracking` (`src/core/control/contact-tracking.ts`) does with an optional positive
`redistributionCost`: the same bounded torque solve may move ground force among the points on each
contacted rigid body, keeping that body's total force and moment. The option is off in the measured
tasks. Its rank and residual thresholds are numeric settings recorded here.

## Thresholds and the solve

- For each contacted body, the six-row map from point forces to its wrench; two-pass orthogonal
  projection gives the map's null space.
- **Relative wrench rank tolerance**: 1e-10. **Absolute unit-vector residual**: projected unit
  vectors of norm 1e-10 or less are dropped before the second rank count, so roundoff in a
  full-rank map does not become a spurious force freedom.
- Null-space coordinates are normalized by the registered bodies' total weight and their squared
  norm costs `redistributionCost`. Muscle effort keeps its objective and bounds; every point keeps
  unilateral and inscribed-friction inequalities, and the final loads are checked against the
  friction circle. A failed solve commands zero torque.
- `pointSeparation` merges measured points nearer than the given distance on one body before the
  prediction rows are built; zero, the default, keeps every point. Dynamic rise uses 1 mm:
  overlapping colliders otherwise give near-coincident rows that pin rotation through an artificial
  lever. It changes the prediction's geometry, never the physical contacts.

Only redistributions within each body's wrench are offered; those that change individual body
loads while keeping the articulated system's acceleration are not. The implementation allocates.

## Measurement

`tests/core-contact-tracking.test.mjs@2a1b29ac` (Node, Rapier, 120 Hz): a box with four measured
floor contacts and a supplied affine reaction model that puts opposite corners in tension. Without
redistribution the solve rejects; at cost 1e-6 it accepts zero muscle torque, changes the point
forces and keeps all six wrench components within 1e-10, with no physics bytes changed and exact
controller replay. The compound-box case keeps all four support corners while merging each
collider's duplicate corner, and leaves the snapshot and manifolds unchanged.
