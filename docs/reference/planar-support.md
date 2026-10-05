# Geometric support toward a plane

`planarSupportPoints` reads a collider shape in its current world pose and returns its support
points toward a supplied plane normal. Sphere support is its centre minus radius times normal.
A capsule selects its lower endpoint or both endpoints of a supporting line. Boxes and hulls
select the lowest vertices. Duplicate vertices are removed. A caller-supplied linear tolerance
selects nearly coplanar features; it does not assert that all selected points are loaded.
Rotation and normal are normalized locally. Inputs are not mutated and returned points are
detached. No contact, force or world state is created by this query.

The helper is a model primitive, not a replacement collision detector. The reference controller
still reads Rapier's measured contact points. Integrating geometric support requires matching
the contacted surface, choosing contact modes and validating the resulting controller.

## Why geometry matters

Rapier's solver point is the midpoint of cached contact anchors transformed to current body
poses. The accessor is current; the feature anchors need not identify the shape's current
geometric support. For a moving curved shape, that midpoint can give a different lever arm and
material velocity. The [rolling-contact record](contact-curvature.md) isolates the same issue
without slip. This record checks it with a known sliding load.

## Mechanical sliding check

Harness: Node core stand, corrected-limit Rapier 0.21.0-auto-rpg.5 / adapter 6, 1920 Hz,
ordinary ground, no actuators or assistance. The synthetic sphere has mass 1 kg, radius 0.1 m
and isotropic inertia 0.004 kg m2. After one second of settling, a horizontal impulse of
either -1 or +1 N s starts it sliding. Sampling begins after one world step and continues for
77 steps. Slip remains above 0.3117 m/s throughout; the experiment does not cross into rolling.

The predictor uses the existing coupled dynamics with explicit body loads. Kinetic friction
acts against measured tangential slip with the engine's coefficient 0.5. The normal load is
solved from the normal acceleration condition using the shape's planar curvature. These loads
exist only in the prediction. Rapier receives the initial impulse and then simulates freely.

| Reading, maximum over sampled steps | Both directions |
|---|---:|
| Geometric model versus engine, linear acceleration error | 0.000239509 m/s2 |
| Geometric model versus engine, angular acceleration error | 0.0499845 rad/s2 |
| Geometric normal-load error relative to body weight | 0.0000007192 N |
| Cached-midpoint model's predicted normal acceleration magnitude | 0.469597 m/s2 |

The world branch replays exactly in both directions. Every predicted normal force is positive
and tangential friction dissipates slip. Save/load comparisons show that prediction does not
change physics. Ignoring the shape radius fails both geometry and physical regressions.

The physical test uses 1e-6 m feature selection tolerance, 1e-5 N normal-load tolerance,
0.001 m/s2 linear and 0.1 rad/s2 angular comparison gates. These are explicit synthetic
measurement inputs. Quaternion normalization introduces sub-micronewton differences from the
raw node transform used by the dynamics' centre reading; the force gate retains those errors.

Reproduce with `node --test tests/core-planar-support.test.mjs`. The analytic cases also cover
capsule endpoint/line transitions, tilted normals, translated/rotated shapes, box faces and
vertices, hull faces, duplicate vertices, detached outputs and invalid inputs.
The complete regression suite passes 809 tests, zero failures and two existing TODOs;
type checking and the production build pass.

This is a fine-step model check, not evidence of 120 Hz anatomical control. Exploratory 120 Hz
readings show larger normal-force transients. No between-rate physical conclusion is drawn
from those unequal sampling intervals. Moving/curved opposing surfaces, sliding-to-sticking
transitions, force distribution among several contacts and controller integration remain open.
