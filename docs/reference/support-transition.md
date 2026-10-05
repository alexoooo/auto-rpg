# Measured support transitions

Harness: Node/core world, Rapier 0.21.0-auto-rpg.4, adapter revision 5, 120 Hz,
directional muscles, ordinary horizontal ground, empty hands, no pins and no assists.
`tasks/support.ts` builds the same physical task for research and a browser. Its optional
`control/support-transition.ts` policy receives detached observations and produces motion
objectives. The shared tracker owns the muscle commands. Direct policies are unaffected.

The task begins standing. It is not a recovery route or a demonstration of locomotion.
The policy lowers the pelvis, moves the centre of mass over the remaining foot, lifts the
other foot, places it, and returns to two-foot support. It then stays under control for one
second. Each phase change requires measured readiness continuously for 0.25 s:

- Transfer: positive ground load, less than 5% on the moving foot, centre error below 1 cm,
  root speed below 0.03 m/s, and at least one second elapsed.
- Lift: foot position error below 8 mm, zero measured ground impulse on that foot, and speed
  below 0.03 m/s.
- Place: actual positive contact impulse, position error below 4 mm, quaternion error
  `1 - |dot|` below 1e-5, and speed below 0.03 m/s.
- Recenter: both feet carry positive measured load, centre error below 1 cm and root speed
  below 0.03 m/s.

Support requests are free during lift and placement; they never disable collision. Placement
aims 2 mm below the initial foot origin to establish a small positive load rather than hover
above the floor. Actual contact decides when the policy may resume predicted support.
The task separately checks flight, return error, falls, rejected solves and continued control.

## Declared engineering inputs

These values specify a modest reference task and controller, not anatomy or muscle strength.
The skeleton retains its placeholder anatomy. All three bodies use the same settings.

| Input | Value |
|---|---:|
| Pelvis lowering / foot lift | 0.04 / 0.04 m |
| Development lift variation | +/-0.002 m, seeded |
| Placement margin | 0.002 m |
| Horizontal centre correction fraction | 0.7 |
| Frame feedback time | 0.25 s |
| Root / moving point / moving orientation weights | 1 / 3 / 1 |
| Knee posture target | 0.6 rad, clamped to the body's range |
| Other posture targets | 0 rad, clamped to range |
| Joint feedback time | 0.3 s |
| Leg / other joint weights | 0.02 / 0.1 |
| Normalized effort regularization | 1e-6 |
| Maximum simultaneous frame objectives | 2 |
| Floor centre / dimensions | (0, -0.5, 0) / (20, 1, 20) m |
| Post-completion observation | 1 s |
| Trial deadline / return gate | 12 s / 0.01 m |

Contact and QP settings are those in [standing bar](standing-bar.md): 64 points, 5 mm admission
gap, upward-normal threshold 0.9, force tolerance 1e-5 N, work budget 2048, absolute/relative
KKT tolerances 1e-7/1e-6. Predicted forces are never applied as external assistance.

A deeper trial (8 cm lowering, 6 cm lift) exposed the skeleton's ankle stops. More objective
weight did not restore the requested motion. The shallow task avoids that particular limit;
it does not supply general joint-stop prediction or solve arbitrary support transitions.

## Reproduction

```powershell
node --test tests/core-support-transition.test.mjs
node research/control-foundation.mjs --suite support --actuation directional --samples 2 --workers 1 --out research/runs/control-foundation/support-transition
```

The zero-offset regression checks all six body/side cells, including positive contact before
reloading and a one-second continuation. It also checks in-place and fresh-world replay from
single-foot support. Source-frozen development results are recorded separately from these tests;
held-out starts remain unused. This is still an allocating experimental controller.

## Development screen

[The durable manifest and rows](support-transition.json) record 12/12 successes: 2/2 development
starts in each body/side cell, all exact replays, no falls, no rejected solves and zero assistance.
The policy completes in 6.433–7.517 s; each task then observes another second upright. Peak foot
lifts are 0.035410–0.038760 m and the largest final return error is 0.006028 m. The lift goals
vary around 0.04 m; the policy may place once it meets its declared 8 mm lift tolerance.
These twelve cases establish the tested sequence, not general recovery or a reliability rate.

Run `research/runs/control-foundation/support-transition-v1`, source content SHA256
`434cc1412c2918736a5b257ac4e5f8ac9537109b36fbc1240ff837b8787beb73`, manifest SHA256
`2ceb221db85c4d3a46ce62a5fda65cda1877a0fded243c42422e07af9b74af4c`.
The run archives the exact source. With one worker and no concurrent tests, per-trial mean
step cost is 2.337–3.250 ms, p95 3.233–4.319 ms and p99 3.966–5.572 ms. These are Node
24.19 instrumented `World.step` readings after the two-second checkpoint, including the task's
observation hook and excluding trace hashing. They do not establish browser capacity.
