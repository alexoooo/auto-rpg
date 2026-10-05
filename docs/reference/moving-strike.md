# Moving point-space strikes

`createPointStrikeProbe` optionally replaces each fixed target with a freely swinging rigid
box. `pointStrike` can track a named local point on a sensed object, compensate the sample's
age, and extrapolate its point velocity to the remaining strike time. Its terminal velocity
matches that point velocity. This is a constant-velocity approximation, not a pendulum model
or a guarantee that the interception is reachable. The trajectory is recomputed each step.

`createObjectSenses` is a trusted observer of explicitly permitted rigid bodies. Policies get
detached position, orientation, centre of mass, linear/angular velocity, mass, named local
points, identity, owner and actual sample time. Delay buffers are plain saved state. Reading
after restore needs no live cache refresh. External object observations confer no actuator or
grip authority. The motion and direct-actuator hosts accept the same optional senses field.

If a required target disappears before commitment, the policy holds its measured guard. If
it disappears during a strike, the policy returns from its measured motion. Optional impact
braking is independent for each effector: a sufficient observed impulse starts a short path
from its measured position and velocity back to that position with zero terminal velocity.
The other effector continues. These remain bounded muscle objectives; no external force,
velocity assignment, damage flag or hit cancellation is applied.

## Observation layout

`FRAME_LENGTH` is 18 scalars: node position (3), quaternion (4), centre of mass (3), centre
velocity (3), angular velocity (3), mass (1) and sample time (1). This is a storage layout,
not a tuned physical constant. A delay of N steps needs N+1 saved frames and a ring index.

## Declared inputs and gates

The standing fixture inherits the [static strike](point-strike.md) inputs and eight-second
deadline. These additional values are engineering experiment choices, not anatomy or RPG stats.

| Input | Value |
|---|---:|
| Target mass | 2 kg |
| Pivot distance above rest centre | 1 m |
| Angular stop in either direction | 0.3 rad |
| Development initial angle | seeded within 0.12 rad |
| Tangential launch impulse divided by mass | 0.7 m/s |
| Fixed anchor radius / mass / principal moment | 0.02 m / 1 kg / 0.001 kg m² |
| Named target point relative to box centre | (0, 0, -0.05) m |
| Sensing delay | 25 ms (3 steps at 120 Hz) |
| Impact braking impulse threshold / duration | 0.005 N s / 0.15 s |
| Intentional miss displacement | 0.7 m forward |
| Required pre-contact lateral travel / speed | above 0.1 m / 0.5 m/s |

The launch is one initial impulse. Gravity, the revolute joint and physical contacts determine
subsequent motion. The fixed anchor's mass properties are bookkeeping, not an extra moving
mass. The box uses uniform-box moments. Targets have CCD enabled and are not included in the
actor's dynamics model. Misses retain the static requested path and move the physical target
forward to avoid cross-hand hits.

Scoring requires a positive impulse against the intended target body during strike or
follow-through and pre-step **relative** contact-point closing speed above 0.05 m/s. Both
bodies' angular velocities contribute. Motion metrics exclude all samples after the target's
first positive contact impulse, so a struck peak cannot establish initial target motion.
Success also requires measured return, another second of control, no fall, no rejected support
solve and exact checkpoint replay. Root and weapon assistance are zero.

The common runner separates tracked hits, fixed-aim hit ablations and deliberate misses into
different cells. It covers Warrior, Rogue and the placeholder-anatomy skeleton; either hand
and both independently; empty hands and separate clubs. Two development starts yield 108 rows.
These are isolated target tests, not defense, shared-item combat or injury effectiveness.
Held-out integrated trials remain separate.

```powershell
node research/control-foundation.mjs --suite moving-strike --actuation directional --samples 2 --workers 1 --out research/runs/control-foundation/moving-strike-v1
node --test tests/core-point-strike.test.mjs tests/core-object-senses.test.mjs
```

The shared `/control-tasks.html` viewer exposes stationary, tracked swinging and fixed-aim
swinging targets. Rendered targets follow their physical bodies; the viewer uses the same
fixture, state and replay path as Node.

## Development measurement

[The frozen run](moving-strike.json), Node 24.19 / core world / Rapier 0.21.0-auto-rpg.4 /
adapter 5 / 120 Hz / one worker, measures two development starts per body, hand and loadout.
No tests or browser trials ran concurrently. Every row replays exactly, uses zero assistance
and has zero rejected support solves. No fall is recorded within the declared watch.

| Body | Tracked hit and return | Fixed-aim hit and return | Intentional miss and return |
|---|---:|---:|---:|
| Warrior | 11/12 | 11/12 | 12/12 |
| Rogue | 12/12 | 10/12 | 12/12 |
| Skeleton (placeholder anatomy) | 12/12 | 12/12 | 12/12 |

The JSON retains each hand/loadout denominator and its Wilson interval. Two starts per cell
are a development screen, not an estimate of gameplay reliability. Tracked hits pass 35/36;
fixed aim passes 33/36. The latter misses the Warrior's left target in seed-1 bare-both-hands,
the Rogue's seed-1 bare-right-hand target, and both Rogue targets in seed-1 bare-both-hands.
All 36 deliberate misses avoid qualifying contact and return.

Tracking's failure is Warrior / bare right hand / seed 0. It makes qualifying contact and
reaches its guard, but ends the extra control second 0.197027 m from the guard. A diagnostic
replay shows the root error growing from 0.0464 m at policy completion (step 323) to 0.3049 m
at step 440 while the hand error grows. The policy's phase name is therefore insufficient:
the independent return gate correctly fails it. This controller's post-impact balance fails
the gate.
This record does not establish a passed moving-strike capability gate.

The optional [centre-controlled fixture](centre-control.md) measures a separate candidate with
combined-centre balance, a longer follow-through and a different return posture preference.
It passes these development starts with a ten-second continuation; the frozen results above
remain the pose-controlled comparison.

Completion takes 3.600–4.550 s, including the extra second. Instrumented mean step cost ranges
from 2.812 to 4.777 ms, p95 from 3.117 to 5.489 ms and p99 from 3.481 to 8.003 ms. These include
fixture observation/scoring hooks and exclude trace hashing; they are not a game capacity claim.
The peak target-speed gate uses only pre-contact motion, not the faster motion a strike causes.

Run `research/runs/control-foundation/moving-strike-v1` retains the source archive and manifest.
Source content SHA256 `5f14887953a20cf7dc77fd27fb75c0b69b38e300407333c2716fd6684c6e21ec`;
manifest SHA256 `9dd5688e6158e51c4a268e65c0792865709777f2533362be82ec856d53eb8fc0`.
Held-out starts remain unused.

[Twenty browser checks](moving-strike-browser.json) match Node's observation hashes and ending
steps: all 18 seed-0 tracked hit combinations, Warrior bare-left fixed aim, and skeleton
two-club intentional miss. Each browser checkpoint replay also matches saved policy/task state.
The failing Warrior cell matches too; browser completion is not a passed physical gate.
Targets and final poses were visually inspected, with no browser errors or warnings.

Regression tests cover delayed object observations, detached data, target loss, analytic
prediction, independent impact braking, all 18 zero-angle strike combinations and in-place /
fresh-world replay. Removing sample-age compensation or impact braking makes its targeted
test fail. The full suite passes 765 tests with the same two existing TODOs; type checking and
the production build pass.
