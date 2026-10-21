# Moving point-space strikes

The moving-target variant of the [static strike](point-strike.md): its declared inputs (`SWING` in
`src/core/tasks/point-strike.ts`), the object senses' saved layout (`FRAME_LENGTH`,
`src/core/mind/object-senses.ts`) and the development screen. Verdict: tracked hits pass 35/36,
fixed aim 33/36; the moving-strike capability gate is not met.

`createPointStrikeProbe` can replace each fixed target with a freely swinging rigid box.
`pointStrike` then tracks a named local point on a sensed object, compensates the sample's age and
extrapolates the point's velocity to the remaining strike time, matching it at the end: a
constant-velocity approximation recomputed each step, not a pendulum model or a reachability proof.
If the target disappears before commitment the policy holds its guard; during a strike it returns
from its measured motion. Optional impact braking is per effector: a sufficient observed impulse
starts a short path from the measured position and velocity back to that position at rest, while
the other effector continues. No external force, velocity assignment or hit cancellation is applied.

`createObjectSenses` is a trusted observer of explicitly permitted rigid bodies. Policies get
detached position, orientation, centre of mass, linear and angular velocity, mass, named local
points, identity, owner and actual sample time; delay buffers are plain saved state, readable after
restore without a live cache. Observing an object grants no actuator or grip authority.

## Observation layout

`FRAME_LENGTH` is 18 scalars: node position (3), quaternion (4), centre of mass (3), centre
velocity (3), angular velocity (3), mass (1) and sample time (1). It is a storage layout, not a
tuned constant. A delay of N steps needs N+1 saved frames and a ring index.

## Declared inputs and gates

Engineering experiment choices on top of the static strike's inputs and 8 s deadline:

| Input | Value |
|---|---:|
| Target mass (`mass`) | 2 kg |
| Pivot distance above rest centre (`length`) | 1 m |
| Angular stop in either direction (`limit`) | 0.3 rad |
| Development initial angle | seeded within 0.12 rad |
| Tangential launch impulse divided by mass | 0.7 m/s |
| Fixed anchor radius / mass / principal moment (`anchorRadius`, `anchorMass`, `anchorMoment`) | 0.02 m / 1 kg / 0.001 kg m² |
| Named target point relative to box centre (`aim`) | (0, 0, -0.05) m |
| Sensing delay | 25 ms (3 steps at 120 Hz) |
| Impact braking impulse threshold / duration (`impact`) | 0.005 N s / 0.15 s |
| Intentional miss displacement | 0.7 m forward |
| Required pre-contact lateral travel / speed | above 0.1 m / 0.5 m/s |

The launch is one impulse; gravity, the revolute joint and contact do the rest. The anchor's mass
properties are bookkeeping, not a moving mass; the box has uniform-box moments, CCD on, and is not
in the actor's dynamics model. Misses keep the static path and move the target forward, clear of
the other hand.

A hit is a positive impulse on the intended target during strike or follow-through with pre-step
**relative** contact-point closing speed over 0.05 m/s, both bodies' spin included. Motion metrics
stop at the target's first positive contact impulse, so a struck peak never counts as target
motion. Success also needs measured return, another second of control, no fall, no rejected support
solve and exact checkpoint replay, with zero root and weapon assistance.

## Development measurement

[The frozen run](moving-strike.json): Node 24.19, core world, Rapier 0.21.0-auto-rpg.4, adapter 5,
120 Hz, one worker, nothing concurrent; Warrior, Rogue and the placeholder-anatomy skeleton, either
hand and both, empty hands and separate clubs, two development starts: 108 rows. Every row replays
exactly, uses zero assistance and has no rejected solve or fall.

| Body | Tracked hit and return | Fixed-aim hit and return | Intentional miss and return |
|---|---:|---:|---:|
| Warrior | 11/12 | 11/12 | 12/12 |
| Rogue | 12/12 | 10/12 | 12/12 |
| Skeleton (placeholder anatomy) | 12/12 | 12/12 | 12/12 |

- Fixed aim misses the Warrior's left target (seed 1, bare both hands), the Rogue's (seed 1, bare
  right) and both Rogue targets (seed 1, bare both hands).
- Tracking's failure, Warrior bare right seed 0, hits and reaches its guard but ends the extra
  second 0.197027 m from it: root error grows from 0.0464 m at policy completion (step 323) to
  0.3049 m at step 440. The controller's post-impact balance fails the independent return gate.
- The [centre-controlled fixture](centre-control.md) passes these starts with a ten-second
  continuation.
- Completion takes 3.600–4.550 s; instrumented mean step cost 2.812–4.777 ms (hooks included, not
  a capacity claim).
- Run `research/runs/control-foundation/moving-strike-v1`: source SHA256
  `5f14887953a20cf7dc77fd27fb75c0b69b38e300407333c2716fd6684c6e21ec`, manifest SHA256
  `9dd5688e6158e51c4a268e65c0792865709777f2533362be82ec856d53eb8fc0`.
- [Twenty browser checks](moving-strike-browser.json) (all 18 seed-0 tracked hits, Warrior
  bare-left fixed aim, skeleton two-club miss) match Node's observation hashes, ending steps and
  saved state, the failing Warrior cell included.

```powershell
node research/control-foundation.mjs --suite moving-strike --actuation directional --samples 2 --workers 1 --out research/runs/control-foundation/moving-strike-v1
node --test tests/core-point-strike.test.mjs tests/core-object-senses.test.mjs   # both @2a1b29ac
```
