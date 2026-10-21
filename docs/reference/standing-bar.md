# Standing shared-bar tracking

The shared-bar fixture on ordinary ground with a free pelvis (`--support standing`), and its
sticking-support settings `STANDING` (`src/core/tasks/bar.ts`). The capture, bar path, posture and
item settings are the pinned fixture's ([motion tracking](motion-tracking.md)); the captured-pose
return and its two-profile comparison are [shared-bar return posture](bar-posture.md). Harness for
all figures: Node core world, Rapier, 120 Hz, directional bounds, gravity, zero root and weapon
assistance, anatomy, strength and item inertia unchanged.

## Contact tracking

`contactTracking` predicts sticking at measured points on fixed geometry; a policy's `free` support
request drops that frame from the prediction without touching collisions. No predicted reaction is
applied; the only commands are bounded muscle torques. The active-set solve keeps normal loads
nonnegative and tangential loads within an inscribed friction pyramid, then checks the final
torques against the friction circle. A failed solve gives zero torque and an explicit rejected
report. The model picks one distribution for redundant rows, so a rejection does not prove every
distribution infeasible.

## Declared engineering settings

`STANDING`, reproducibility inputs rather than anatomy or tuned strength:

| Setting | Value | Purpose |
|---|---:|---|
| Maximum predicted points (`maxPoints`) | 64 | Bounded solver capacity |
| Maximum measured gap (`gap`) | 0.005 m | Near-contact admission |
| Minimum upward normal component (`minUpNormal`) | 0.9 | Ground-like fixed surfaces |
| Final force tolerance (`forceTolerance`) | 0.00001 N | Reject inadmissible predicted reactions |
| Solver work budget (`iterations`) | 2048 | Bounded active-set work |
| Absolute / relative solver tolerance | 1e-7 / 1e-6 | Independent KKT acceptance |
| Root feedback time (`rootSeconds`) | 0.2 s | Position and orientation feedback |
| Root objective weight (`rootWeight`) | 1 | Shared solve objective |
| Floor centre / dimensions (`floor`) | (0, -0.1, 0) / (5, 0.2, 5) m | Ordinary ground geometry |

The root objective asks for the initial pelvis pose through muscle torques, not an external force.
The obstacle is scored by collider identity, so floor contact cannot score a strike.

## Development screen

```powershell
node research/control-foundation.mjs --suite bar --support standing --actuation directional --samples 2 --workers 1 --out research/runs/control-foundation/standing-bar
node --test tests/core-bar.test.mjs tests/core-motion.test.mjs tests/core-contact-tracking.test.mjs
```

All three bodies, both release sides, two seeded lateral offsets; Rapier 0.21.0-auto-rpg.4 /
adapter 5, Node 24.19, one worker, nothing else running. Step costs cover the instrumented branch
after the two-second checkpoint, fixture hooks in, trace hashing out.

| Run | Ending rule | Passed | Largest error | Step cost mean / p95 / p99, ms |
|---|---|---:|---|---|
| [standing-bar-v1](standing-bar.json) | fixed time, 7.5 s after capture | 11/12 | skeleton right release returns 0.0302848 m (gate 0.03) | 3.358-5.591 / 4.145-6.903 / 4.731-10.097 |
| [standing-bar-readiness-v1](standing-bar-readiness.json) | measured readiness (protocol 3) | 12/12 | ending position 0.028081 m; latest end 8.792 s | 3.515-5.738 / 4.379-6.824 / 4.976-8.675 |

Every trial stays upright, rejects no solve and replays exactly. In v1 the largest shared movement
error is 0.0271087 m, attachment gap 0.000101494 m, predicted tensile load 1.57e-11 N and
friction-circle violation 9.77e-11 N. Source and manifest SHA256:

- v1: `8bca405dea06aea70356bb313b6332d27ab8a52362967d82982f9fe218e1468f`,
  `d167cf6c795630534dc0e49a238ffebfc09e5be9fe457f454c2b17b7339ff483`
- readiness-v1: `434cc1412c2918736a5b257ac4e5f8ac9537109b36fbc1240ff837b8787beb73`,
  `eb47abbf4959cac9ed0949fafa0b943556b491578bc99190fb629307d78bf5a9`

## Measured return readiness

Protocol 3 ends a trial once the 3 cm position tolerance has held for 0.25 s, no earlier than
7.5 s after capture and within the runner's 12 s deadline. Torques and trajectory are those of the
fixed-time run; only the scoring moment changes, which also changes the sampled interval of the
step costs above. It does not claim the item's orientation or spin has settled.
