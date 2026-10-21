# Rolling-contact acceleration

The acceleration target a rolling contact row needs, which `planarContactAcceleration` supplies to
the coupled acceleration model, and the error of the engine's cached contact point. Optional
[local lift-off](contact-liftoff.md) uses these targets; the default motion tracker uses zero
targets on the measured midpoint rows.

## The target

Each supplied motion row may carry a material-point acceleration target, before the model's
velocity bias is subtracted. Grip and fixed-body rows keep zero. Targets are read at `update`; a
wrong length or nonfinite value is refused before the state changes.

For a sphere or capsule rolling without slip on a fixed plane, with support offset
`r = -radius * normal` (normal into the rolling body), the velocity constraint `v + omega × r = 0`
differentiates to `a + alpha × r = 0`. The material point's acceleration adds the centripetal term,
so the target is `omega × (omega × r)`, not zero. Polyhedral vertices have zero smooth radius. For
a capsule this holds while one end or axial mode persists; the model neither picks the mode nor
handles its transitions.

## Measurement

Node core stand, Rapier `0.21.0-auto-rpg.4`, adapter 5, 1920 Hz, no actuators or assists;
`tests/core-contact-curvature.test.mjs@2a1b29ac`. A 1 kg sphere (moments 0.004 kg m²) or horizontal capsule
(moments [0.04, 0.005, 0.04] kg m², spine along world z), radius 0.1 m, settles 240 steps, is set
rolling by matched impulses, predicted four steps later and measured over the next 120 steps.

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

The zero target predicts the fall of a body pivoting about a fixed material point; rolling replaces
the contacting material continuously.

## The cached contact point

Rapier's `solver_contact_point` (`bindings/typescript/src/geometry/narrow_phase.rs`) is the midpoint
of two cached body-local anchors carried to the current poses, not the shape's current support
point. On those rows the corrected model still predicts horizontal acceleration of 0.0216 m/s² (the
sphere at 1 m/s) and -0.2925 (at 3 m/s) against 0.00084 and 0.00101 measured; the capsule at 3 m/s,
-0.4822 against 0.00387. With the sphere's row placed at its centre minus radius times normal,
every predicted component is zero, matching measurement within 0.002 m/s².
[Geometric support](planar-support.md) checks current shape features.
