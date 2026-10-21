# Geometric support toward a plane

`planarSupportPoints` (`src/core/build/planar-support.ts`) returns a collider's support points
toward a plane normal in its current world pose, and this records the sliding-sphere check of it
against the engine (`tests/core-planar-support.test.mjs@2a1b29ac`). It is a model primitive:
the reference controller still reads Rapier's measured contact points.

## The query

A sphere's support is its centre minus radius times normal; a capsule gives its lower endpoint or
both ends of a supporting line; boxes and hulls give their lowest vertices, duplicates removed. A
caller's linear tolerance selects nearly coplanar features; it does not claim they are loaded.
Rotation and normal are normalized locally, inputs are not mutated, outputs are detached, and no
contact, force or world state is created.

Geometry matters because Rapier's solver point is the midpoint of cached contact anchors carried to
the current body poses; on a moving curved shape those need not be the current geometric support,
and give another lever arm and material velocity. [Rolling contact](contact-curvature.md) shows the
same without slip.

## Mechanical sliding check

Harness: Node core stand, corrected-limit Rapier 0.21.0-auto-rpg.5 / adapter 6, 1920 Hz, ordinary
ground, no actuators or assistance. A 1 kg sphere of radius 0.1 m and inertia 0.004 kg m2 settles
for one second, takes a -1 or +1 N s horizontal impulse, and is sampled for 77 steps from the next
step; slip stays above 0.3117 m/s, so it never rolls. The predictor uses the coupled dynamics with
kinetic friction 0.5 against measured slip and a normal load solved from the shape's planar
curvature; these loads exist only in the prediction.

| Reading, maximum over sampled steps | Both directions |
|---|---:|
| Geometric model versus engine, linear acceleration error | 0.000239509 m/s2 |
| Geometric model versus engine, angular acceleration error | 0.0499845 rad/s2 |
| Geometric normal-load error relative to body weight | 0.0000007192 N |
| Cached-midpoint model's predicted normal acceleration magnitude | 0.469597 m/s2 |

Every predicted normal force is positive and friction dissipates slip; the world branch replays
exactly and prediction does not change physics. Ignoring the radius fails both the geometry and the
physical tests. The test's gates are synthetic inputs: 1e-6 m feature tolerance, 1e-5 N normal load
(quaternion normalization leaves sub-micronewton differences), 0.001 m/s2 linear and 0.1 rad/s2
angular. The analytic cases cover capsule endpoint and line transitions, tilted normals, moved
shapes, box faces and vertices, hull faces, duplicates, detached outputs and invalid inputs.

This is a fine-step model check, not 120 Hz anatomical control: 120 Hz readings show larger
normal-force transients, not compared across rates.
