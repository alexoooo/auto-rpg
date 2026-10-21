# Optional joint-stop prediction

What the experimental whole-body tracker's joint-stop prediction does, its numeric inputs
(`SETTINGS`, `src/core/tasks/stop-settings.ts`), and what it gives on the common runner. It is a
controller model, off by default: it installs no constraint, changes no range and applies no
assist; commands still go through the bounded muscles. The bar, point-strike and defense probes
take `jointStops: true`, the common runner `--joint-stops`, and the task viewer has a selector.

## Joint-coordinate rows

`src/core/build/joint-coordinate.ts` gives a scalar motion row for one measured joint angle, from
the actual rotations and angular velocities (residual locked-axis motion included). For the
relative unit quaternion in the joint frame, angle i is `2 atan2(q_i, w)`; with cyclic i, j, k and
`D = w*w + q_i*q_i`, its gradient against parent-frame relative angular velocity is:

- `g_i = 1`
- `g_j = (q_i*q_j + w*q_k) / D`
- `g_k = (q_i*q_k - w*q_j) / D`

The freedom's sign and the parent's rotation carry it to the world; the row applies it to the
child's angular velocity and its negative to the parent's. With world row `J`, the measured angle
acceleration is `J a + Jdot v`, so the target `-Jdot v` holds the coordinate. `D = 0` returns null;
an invalid axis is refused. A lower stop uses the inward row and an upper stop its negative; the
row is unilateral, and choosing the active set is the controller's.

`node --test tests/core-joint-coordinate.test.mjs`: independently rotating parent and child, tilted
axes, non-identity rests, both signs, one to three freedoms, central differences at 1e-5 s:

| Reading | Maximum |
|---|---:|
| Angle-rate difference | 1.410053851458315e-9 rad/s |
| Curvature difference | 1.216210954169128e-8 rad/s2 |
| Nonzero curvature in the fixture | 11.909379397773527 rad/s2 |
| Rate difference from the plain motor-axis reading | 2.8435757144156995 rad/s |

On a pinned two-rod hinge pressing its ±0.3 rad stops with 2 N m (Node core stand, Rapier `.5`
corrected limits, 1920 Hz, no gravity, ground or assist; 16 steps after a second's settling), the
model with the stop predicts 1.5327432954949128e-29 rad/s² against a measured 0 (33.33333254419606
without it); released, -33.33333254419606 against -33.33386988976514 measured. Replacing the
curvature target with zero fails the test.

## Model and selection

`nearJointStops` samples each nearby stop's angle, gradient, rate and curvature from those rows.
For inward gap `g` and rate `v`, the backward-Euler condition is `g + dt*v + dt*dt*a >= 0`; an
active row asks equality. Only bounds within the margin are considered: distant impacts,
restitution and exact finite-step rotation are outside the model.

- The first bounded solve has no stop reactions; rows whose free prediction crosses become active.
  Later solves release any active row needing a pulling reaction, and a released row keeps an
  affine no-crossing bound in the actual actuator torques (in the contact-force solve, or an
  effort-bound solve without a contact model). So a joint is not frozen at a limit when its goal
  moves inward, and a row is not removed and re-added endlessly.
- At most a free pass and N+1 passes for N nearby rows. It is a mode heuristic: a rejection proves
  no infeasibility, commands zero torque and counts as a task failure.
- Reports give near, active and released rows, work, and pulling-force and acceleration
  violations; they replay and are detached.

## Numerical inputs

`SETTINGS` holds declared experimental solver inputs, not anatomy or strength. The margin admits a
nearby stop; the tolerances accept numerical residuals and are not task tolerances.

| Input | Value | Meaning |
|---|---:|---|
| margin | 0.001 rad | Near-stop admission |
| forceTolerance | 1e-5 N m | Permitted pulling reaction roundoff |
| accelerationTolerance | 1e-4 rad/s2 | Active equality or released inward-slack residual |
| iterations | 2048 | Cold active-set solve work ceiling |
| absoluteTolerance | 1e-7 | Normalized quadratic solve tolerance |
| relativeTolerance | 1e-6 | Relative quadratic solve tolerance |

## Measurement

**Mechanical.** Node stand, corrected-limit Rapier `.5`, adapter 6, directional actuation, 120 Hz,
pinned parent, gravity, no ground or assist: a 2 N m hinge preloaded on either ±0.3 rad limit with
an outward rate request stays at the stop all 60 steps with zero effort and at most two passes;
asked zero, it leaves on the first step and reaches ±0.00021584632452372208 rad after 180 steps.
Removing the free prediction fails the inward release.

**Common runner.** Node 24.19.0, core world, corrected-limit Rapier `.5`, adapter 6, 120 Hz,
directional actuation, ordinary ground, no assists; the Warrior, the Rogue and the skeleton,
development seeds 0 and 1; gates unchanged ([348 rows and eight manifests](joint-stop-tracking.json),
source content `dfab8d862432baf3df4bb527dd860f73b63ef8a26fad946ddd33cf44855bf024`):

| Task | Stops off | Stops on |
|---|---:|---:|
| Standing shared bar | 12/12 | 11/12 |
| Static shared strike | 26/36 | 34/36 |
| Moving shared strike | 39/54 | 51/54 |
| Predictive defense | 33/36 | 32/36 |
| Pose-only defense | 0/36 | 0/36 |

- Every row replays. With stops on, the bar failure (skeleton, seed 1, left released) returns
  within 0.765 mm but never touches the obstacle.
- All five strike failures with stops on release the skeleton's right hand at seed 1; the moving
  tracked hit has four rejected steps, a 9.523 mm grip gap and a 0.7516 m final return error.
- Defense: the Warrior's two-club starts fail preparation (seed 1 also takes protected contact);
  the Rogue's two clubs take protected contact at seed 1 and fall at seed 0 with 556 rejected steps.
- The most selection work is five passes; the largest acceleration violation, 24.4865 rad/s², is
  in the rejected Rogue defense.
- With the option off, all twelve bar outcomes match the [bar-posture run](bar-posture.md).

The built task viewer matches Node's whole observation trace and outcome for three branches
([browser records](joint-stop-tracking-browser.json)): the skeleton's static shared strike, its
tracked moving strike releasing the right hand (failed late, also on the page) and the Rogue's
right-club defense.

```powershell
$env:CORE_ENGINE = 'rapier-coordinate'
node research/control-foundation.mjs --suite bar --samples 2 --workers 3 --actuation directional --support standing --joint-stops
node research/control-foundation.mjs --suite point-strike --samples 2 --workers 3 --actuation directional --shared --centre-control --continue-seconds 10 --joint-stops
node research/control-foundation.mjs --suite moving-strike --samples 2 --workers 3 --actuation directional --shared --centre-control --continue-seconds 10 --joint-stops
node research/control-foundation.mjs --suite defense --samples 2 --workers 3 --actuation directional --joint-stops
```

Omit `--joint-stops` for the off member, each to its own output directory.
