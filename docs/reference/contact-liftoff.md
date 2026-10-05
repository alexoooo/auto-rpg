# Local contact lift-off prediction

`ContactTrackingSettings.liftOff` optionally enables a free-motion prediction before choosing
sticking support rows. A contact that already permits separation keeps a normal no-crossing
effort bound instead of three sticking rows. A selected contact whose predicted reaction pulls
the body into the ground is released and receives the same normal bound. Each retry removes
rows; the bounded loop is not a global complementarity solver or a proof of infeasibility.

The host supplies the world's step duration. For a measured gap `g`, normal material-point
velocity `v`, radius-derived curvature `c`, and step `dt`, released contact asks for
`a_normal >= c_normal + (-g / dt - v) / dt`. This is a local backward-Euler end-step estimate,
not continuous collision detection. Active rows use the existing
[planar curvature](contact-curvature.md) rather than zero material acceleration. Flat shapes
use zero smooth curvature. The selected manifold point is still the engine's cached point.
No proposed reaction force is applied to the engine: only bounded muscle torques move the body.

The contact QP shares released-contact bounds with optional near-joint-stop bounds. A final
check reads released normal acceleration after torque clamping; an invalid candidate produces
zero torque. `report().contact.motion` reports solve work, released point IDs and the peak
normal acceleration violation. IDs identify the measured frame and point enumeration within
the solve, not persistent physical features across steps. Diagnostics are detached plain data.
The option is disabled by default and does not require joint-stop prediction.

## Mechanical measurement

Harness: Node core stand, Rapier 0.21.0-auto-rpg.5 / adapter 6, 120 Hz, directional actuation,
ordinary ground, zero assistance. `tests/core-contact-liftoff.test.mjs` builds a pinned parent
and a one-kilogram capsule child on a gravity-loaded hinge. The capsule's distal surface rests
on the ground. A bounded muscle asks for +0.3 rad, then -0.15 rad (through the floor), alternating
for five two-second phases. These synthetic dimensions and muscle parameters are fixture
inputs, not anatomical estimates. The capsule radius is 0.1 m, muscle peak 10 N m, feedback
time 0.15 s and effort regularization 1e-6. Contact numerical inputs are the existing mechanical
tracker settings: gap 0.005 m, up-normal threshold 0.9, force tolerance 1e-5 N, 2,048 QP
iterations and absolute/relative tolerances 1e-7/1e-6. Lift-off tolerance is an explicit fixture
input of 1e-4 m/s2, not a universal body/controller setting.

| Controller | Final lift angle | Ground contact steps in 240-step lift | Maximum solve passes |
|---|---:|---:|---:|
| Sticking reference | -0.000025826 rad | 240 | No mode selection |
| Local lift-off | 0.299988052 rad | 10 | 1 |
| Local lift-off, downward return | -0.000026979 rad | 204 | 2 |

Corrected limits with stop prediction off/on and reference limits with stop prediction off
produce the same measured cycle rows. All cycles have zero rejected solves, zero assistance
and exact save/load replay. The largest actuator reading over a lift phase is 8.175867 N m,
including its initial loaded ground contact; this is a force-cap check, not a free-swing peak.
Each subsequent lift releases measured contact again. The loaded return retains
positive predicted ground force and stays above the -0.002 rad penetration gate.
Turning off only free-motion seeding makes the physical lift assertion fail. Thus simply
removing contacts with tensile reactions from an already stuck prediction is insufficient:
the stuck model can have a compressive gravity reaction and no available lifting gradient.

Reproduce with `node --test tests/core-contact-liftoff.test.mjs`. Its diagnostics retain the
whole measured records, including contact counts, effort, mode work and both engine profiles.
The complete regression suite passes 803 tests with zero failures and two existing TODOs;
the additional normal-bound rejection fixture also passes. Type checking and production build
pass. With lift-off disabled, the three previously browser-verified
[withdrawal cases](shared-withdrawal-browser.json) retain identical Node observation hashes and
task outcomes. The new diagnostic state is not an old-state-hash compatibility claim.

## Limits

This establishes a mechanical lift/recontact primitive. It does not establish anatomical
recovery, arbitrary contact acquisition, rolling accuracy on curved obstacles, sliding
friction, or optimal selection among many supports. A frame explicitly requested free is
still excluded from desired support. Unmeasured future contacts are not predicted.
The staged anatomical recovery prototype remains unsuccessful; enabling this local model is
not evidence that a character can get up. Its more general support choices still need work.
