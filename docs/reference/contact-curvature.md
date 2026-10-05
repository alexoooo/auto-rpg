# Rolling-contact acceleration

The coupled acceleration model accepts an optional acceleration target for each supplied
motion row. Targets describe material-point acceleration, before subtraction of the model's
velocity bias. Grip and fixed-body rows retain zero targets. The model samples finite targets
at `update`, rejects a wrong length or nonfinite value before changing its state, and applies
no force to the world. Omitting targets preserves the zero-target calculation.

For a sphere or capsule rolling without slip on a fixed plane, the radial support offset is
`r = -radius * normal` in world coordinates. The normal points into the rolling body.
The velocity constraint is `v + omega cross r = 0`; differentiating it with a fixed plane
normal gives `a + alpha cross r = 0`. Material-point acceleration also includes the centripetal
term, so its constraint target is `omega cross (omega cross r)`, not zero.
`planarContactAcceleration` supplies this term from collider geometry. Polyhedral support
vertices have zero smooth radius; transitions between vertices need a separate contact mode.
For a capsule, this expression applies while its supporting endpoint or axial contact mode
persists. It does not select that mode or describe its transitions.

## Mechanical measurement

Harness: Node core stand, Rapier `0.21.0-auto-rpg.4`, adapter 5, 1920 Hz, no actuators or
assists. `tests/core-contact-curvature.test.mjs` uses a 1 kg sphere or horizontal capsule of
radius 0.1 m on ordinary ground. The sphere's moments are 0.004 kg m2; the capsule's are
[0.04, 0.005, 0.04] kg m2 in its segment frame, with its spine along world z.
These are synthetic fixture inputs, not anatomical tuning. After 240 settling steps,
matched linear and angular impulses start rolling; prediction is sampled four steps later.
Measured acceleration is the change in centre-of-mass velocity over the following 120 steps.
The test records all three acceleration components and checks exact physical branch replay.
Replacing the curvature target with zero fails both the analytic and physical regression.

| Shape | Initial speed, m/s | Zero-target normal prediction, m/s2 | Curvature-target normal prediction, m/s2 | Measured normal acceleration, m/s2 |
|---|---:|---:|---:|---:|
| Sphere | 0 | 0 | 0 | 0 |
| Sphere | -1 | -10.0008 | 0.00114 | 0 |
| Sphere | 1 | -10.0008 | 0.00114 | 0 |
| Sphere | 3 | -90.0019 | 0.00116 | 0 |
| Capsule | 0 | approximately 0 | approximately 0 | 0 |
| Capsule | -1 | -9.99984 | 0.00209 | -0.00539 |
| Capsule | 1 | -9.99868 | 0.00329 | -0.00537 |
| Capsule | 3 | -90.0144 | 0.00254 | -0.00037 |

The zero-target model predicts the fall of a body pivoting about a fixed material point.
Rolling replaces the contacting material continuously. Correcting the acceleration target
removes that fictitious normal acceleration in these fixtures.

## Contact geometry and remaining scope

Rapier's `solver_contact_point` in `bindings/typescript/src/geometry/narrow_phase.rs` returns
the midpoint of the two cached body-local anchors transformed to their current poses.
That point need not be the shape's current geometric support point. With those midpoint rows,
the corrected model still predicts horizontal acceleration of 0.0216 m/s2 for the sphere at
1 m/s and -0.2925 m/s2 at 3 m/s; measured values are 0.00084 and 0.00101 m/s2 respectively.
For the capsule at 3 m/s, the horizontal prediction is -0.4822 m/s2 versus measured 0.00387 m/s2.

The test separately places the sphere row at its current centre minus radius times normal.
With the same curvature target, all predicted acceleration components are zero, matching the
measured components within 0.002 m/s2. This isolates the contact-point error from the
acceleration-target error. Capsule support geometry, line/end transitions, curved or moving
other surfaces, slip, lift-off, contact acquisition and joint stops still require modeling.

The reference motion tracker still uses zero-target measured midpoint rows. These isolated
checks establish a model capability and identify its integration requirements; they do not
establish improved anatomical recovery or change the frozen strike/defense measurements.
