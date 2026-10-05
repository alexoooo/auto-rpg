# Standing shared-bar tracking

The current captured-pose return and its two-profile comparison are recorded in
[shared-bar return posture](bar-posture.md). The screens below establish sticking support and
the measured-readiness rule under their archived controller configurations.

The Node/core-world bar fixture uses Rapier at 120 Hz, directional muscle bounds, gravity,
ordinary ground, and zero root or weapon assistance. The pelvis is free. Its anatomy, muscle
strength and item inertia are unchanged. The pinned variant remains a separate diagnostic.

`contactTracking` predicts sticking at measured points on fixed geometry. A policy's `free`
support request excludes that frame from the prediction without changing physical collisions.
No predicted reaction is applied to the world. The only commands are bounded muscle torques.
The active-set solve constrains normal loads to be nonnegative and tangential loads to an
inscribed friction pyramid. Final torques are checked again against the friction circle.
Failed solves produce zero torque and an explicit rejected report.

The reaction model chooses one distribution for redundant rows. Rejection is not proof that
all physical force distributions are infeasible. This fixture does not demonstrate stepping,
recovery, sliding contacts, joint-stop prediction, or combat against a moving opponent.

## Declared engineering settings

These fixture choices are reproducibility inputs, not anatomical measurements or tuned strength.
The capture, bar path, posture and item settings are those in [motion tracking](motion-tracking.md).

| Setting | Value | Purpose |
|---|---:|---|
| Maximum predicted points | 64 | Bounded solver capacity |
| Maximum measured gap | 0.005 m | Near-contact admission |
| Minimum upward normal component | 0.9 | Ground-like fixed surfaces |
| Final force tolerance | 0.00001 N | Reject inadmissible predicted reactions |
| Solver work budget | 2048 | Bounded active-set work |
| Absolute / relative solver tolerance | 1e-7 / 1e-6 | Independent KKT acceptance |
| Root feedback time | 0.2 s | Position and orientation feedback |
| Root objective weight | 1 | Shared solve objective |
| Floor centre / dimensions | (0, -0.1, 0) / (5, 0.2, 5) m | Ordinary ground geometry |

The root objective asks for the initial pelvis pose using muscle torques. It is not an external
root force. The obstacle is scored by collider identity; floor contacts cannot score a strike.

## Reproduction

```powershell
node research/control-foundation.mjs --suite bar --support standing --actuation directional --samples 2 --workers 1 --out research/runs/control-foundation/standing-bar
node --test tests/core-bar.test.mjs tests/core-motion.test.mjs tests/core-contact-tracking.test.mjs
```

The development screen uses all three bodies, both release sides and two seeded lateral
offsets. The held-out split remains separate. Timing covers the instrumented branch after the
two-second checkpoint; replay is checked separately. This allocating controller is experimental.

## Development screen

[The manifest and results](standing-bar.json) record 11/12 passing trials. Warrior and Rogue
pass both starts for either release; skeleton passes 2/2 left releases and 1/2 right releases.
The failed skeleton return is 0.0302848 m from its target, outside the unchanged 0.03 m gate.
All twelve remain upright, report zero rejected solves and replay exactly. This is a small
development screen, not a reliability estimate or a completed standing capability gate.

Maximum shared movement error is 0.0271087 m and attachment gap is 0.000101494 m. Maximum
predicted tensile load is 1.57e-11 N and friction-circle violation is 9.77e-11 N. Root and
weapon assistance remain zero. The zero-offset regression trials separately pass all six cells.

Run: `research/runs/control-foundation/standing-bar-v1`; source content SHA256
`8bca405dea06aea70356bb313b6332d27ab8a52362967d82982f9fe218e1468f`;
manifest SHA256 `d167cf6c795630534dc0e49a238ffebfc09e5be9fe457f454c2b17b7339ff483`.
The source archive is retained with the run. Node 24.19, Rapier 0.21.0-auto-rpg.4, adapter
revision 5, one worker, 120 Hz, no concurrent test runs: per-trial mean step cost is
3.358–5.591 ms, p95 4.145–6.903 ms and p99 4.731–10.097 ms. These include observation and
fixture hooks but exclude the runner's trace hashing. They are not a browser capacity claim
or a speedup over the pinned fixture, which solves a different problem. Held-out starts are unused.

## Measured return readiness

Protocol 3 waits for the same 3 cm position tolerance to hold for 0.25 s before ending, no earlier
than the existing 7.5 s after capture and still within the runner's 12 s deadline. The controller's
torques and trajectory are unchanged; it continues the position-only return instead of being
scored at a fixed ending time. This does not claim that the item's orientation or spin has settled.

[The source-frozen readiness screen](standing-bar-readiness.json) passes 12/12 development trials,
2/2 in each body/release cell, with exact replay, no falls, zero rejected solves and zero assists.
The largest ending position error is 0.028081 m and the latest ending is 8.792 s from initialization.
The earlier 11/12 result remains an honest fixed-time measurement of the same motion.

Run `research/runs/control-foundation/standing-bar-readiness-v1`, source content SHA256
`434cc1412c2918736a5b257ac4e5f8ac9537109b36fbc1240ff837b8787beb73`, manifest SHA256
`eb47abbf4959cac9ed0949fafa0b943556b491578bc99190fb629307d78bf5a9`.
Same Node/Rapier/rate/one-worker harness as above: mean step cost 3.515–5.738 ms,
p95 4.379–6.824 ms, p99 4.976–8.675 ms. The changed stopping rule changes the sampled interval;
this is not a performance comparison. Held-out starts remain unused.
