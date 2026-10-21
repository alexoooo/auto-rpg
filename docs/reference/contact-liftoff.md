# Local contact lift-off prediction

What `ContactTrackingSettings.liftOff` does and what was measured of it. Off by default, it lets
the contact tracker release a contact whose predicted reaction would pull, instead of holding every
contact stuck. Only bounded muscle torques move the body; no predicted reaction is applied.

## The model

- A free-motion prediction comes first. A contact already permitting separation keeps a normal
  no-crossing bound instead of three sticking rows; a selected contact whose predicted reaction
  pulls is released and gets the same bound. Each retry removes rows: a bounded loop, not a global
  complementarity solver or proof of infeasibility.
- For gap `g`, normal material-point velocity `v`, curvature `c` and the world's step `dt`, a
  released contact asks `a_normal >= c_normal + (-g / dt - v) / dt`: a backward-Euler end-step
  estimate, not continuous collision. Active rows use the [planar curvature](contact-curvature.md)
  target; flat shapes have zero curvature. The point is still the engine's cached one.
- Released bounds share the contact QP with optional near-joint-stop bounds. A final check after
  torque clamping reads released normal and active material-point accelerations against the
  targets; an invalid candidate commands zero torque. `report().contact.motion` gives solve work,
  released point IDs (within this solve only) and the largest violation.

## Measurement

Node core stand, Rapier `0.21.0-auto-rpg.5`, adapter 6, 120 Hz, directional actuation, ordinary
ground, no assists; `node --test tests/core-contact-liftoff.test.mjs`. Fixture inputs: a pinned
parent and a 1 kg capsule child (radius 0.1 m) on a hinge, its distal end on the ground; a muscle
of 10 N m peak, feedback 0.15 s and effort regularization 1e-6 asks +0.3 rad, then -0.15 rad
(through the floor), for five two-second phases. Contact settings: gap 0.005 m, up-normal 0.9,
force tolerance 1e-5 N, 2,048 QP iterations, tolerances 1e-7/1e-6; lift-off tolerance 1e-4 m/s².

| Controller | Final lift angle | Ground contact steps in 240-step lift | Maximum solve passes |
|---|---:|---:|---:|
| Sticking reference | -0.000025826 rad | 240 | No mode selection |
| Local lift-off | 0.299988052 rad | 10 | 1 |
| Local lift-off, downward return | -0.000026979 rad | 204 | 2 |

- Both limit profiles, with stop prediction off or on, give the same rows; every cycle replays.
- Lifts reject no solve; each landing rejects one transient (a 0.310160 m/s² mismatch) and applies
  zero torque for that step. The loaded return keeps positive predicted ground force above the
  -0.002 rad penetration gate. The largest actuator reading over a lift is 8.175867 N m.
- Turning off only the free-motion seed fails the lift: the stuck model has a compressive gravity
  reaction and no lifting gradient, so dropping tensile contacts from it is not enough.
- Active-contact compatibility: a 1 kg 0.6 × 0.1 × 0.4 m slab hinged vertically to a pinned parent
  has a residual below 1.2e-48 m/s² at rest; after a 20 N m torque for one step its contacts cannot
  all stick, the residual is 5.212564 m/s², and the candidate is rejected. Removing that check
  fails the test.
- With lift-off off, the [withdrawal cases](shared-withdrawal-browser.json) keep their Node
  observation hashes and outcomes.
