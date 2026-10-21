# Measured support transitions

The upright support task `tasks/support.ts` (its `SETTINGS`): from standing, lower the pelvis, move
the centre of mass over one foot, lift the other, place it and return to two-foot support, then stay
under control a second. It is the same task in research and the browser. Its optional
`control/support-transition.ts` policy turns detached observations into motion objectives; the
shared tracker owns the muscle commands. It is neither recovery nor locomotion.

## Readiness

Each phase change needs its readiness held continuously for `holdSeconds` 0.25 s:

- **Transfer**: positive ground load, under `unloadFraction` 5 % on the moving foot, centre error
  under `centreTolerance` 1 cm, root speed under `speedTolerance` 0.03 m/s, and at least
  `minimumTransfer` 1 s elapsed.
- **Lift**: foot position error under `liftTolerance` 8 mm, zero ground impulse on that foot, speed
  under 0.03 m/s.
- **Place**: positive contact impulse, position error under `placementTolerance` 4 mm, quaternion
  error `1 - |dot|` under `rotationTolerance` 1e-5, speed under 0.03 m/s.
- **Recenter**: positive load on both feet, centre error under 1 cm, root speed under 0.03 m/s.

Support requests are free during lift and placement and never disable collision. Placement aims
`placementMargin` 2 mm below the initial foot origin to load the foot rather than hover; actual
contact decides when predicted support resumes. The task checks flight, return error, falls,
rejected solves and continued control on its own.

## Declared engineering inputs

`SETTINGS` holds a modest reference task and controller, the same for all three bodies; not
anatomy or strength.

| Input | Value |
|---|---:|
| Pelvis lowering / foot lift (`lower` / `lift`) | 0.04 / 0.04 m |
| Development lift variation | +/-0.002 m, seeded |
| Placement margin | 0.002 m |
| Horizontal centre correction fraction (`centreGain`) | 0.7 |
| Frame feedback time (`seconds`) | 0.25 s |
| Root / moving point / moving orientation weights | 1 / 3 / 1 |
| Knee posture target | 0.6 rad, clamped to the body's range |
| Other posture targets | 0 rad, clamped to range |
| Joint feedback time | 0.3 s |
| Leg / other joint weights | 0.02 / 0.1 |
| Normalized effort regularization | 1e-6 |
| Maximum simultaneous frame objectives (`capacity`) | 2 |
| Floor centre / dimensions | (0, -0.5, 0) / (20, 1, 20) m |
| Post-completion observation (`continueSeconds`) | 1 s |
| Trial deadline / return gate | 12 s / 0.01 m |

Contact and QP settings (`contact`) are [the standing bar's](standing-bar.md). Predicted forces are
never applied to the world.

## Development screen

Harness: Node core world, Rapier 0.21.0-auto-rpg.4 / adapter 5, 120 Hz, directional muscles,
ordinary ground, empty hands, no pins, no assists.

```powershell
node --test tests/core-support-transition.test.mjs   # @2a1b29ac
node research/control-foundation.mjs --suite support --actuation directional --samples 2 --workers 1 --out research/runs/control-foundation/support-transition
```

[The manifest and rows](support-transition.json) record 12/12: two development starts in each body
and side cell, all exact replays, no falls, no rejected solves, zero assistance. The policy
completes in 6.433 to 7.517 s, then a second upright. Peak foot lifts are 0.035410 to 0.038760 m
(the policy places once within its 8 mm lift tolerance); the largest final return error is
0.006028 m. The zero-offset regression checks all six cells, contact before reloading, the
continuation, and in-place and fresh-world replay from single-foot support.

Run `research/runs/control-foundation/support-transition-v1`, source content SHA256
`434cc1412c2918736a5b257ac4e5f8ac9537109b36fbc1240ff837b8787beb73`, manifest SHA256
`2ceb221db85c4d3a46ce62a5fda65cda1877a0fded243c42422e07af9b74af4c`. One worker, nothing else
running, Node 24.19 instrumented `World.step` after the two-second checkpoint (observation hook in,
trace hashing out): mean 2.337 to 3.250 ms, p95 3.233 to 4.319 ms, p99 3.966 to 5.572 ms.

## Tried and not kept

- A deeper trial (8 cm lowering, 6 cm lift) ran into the skeleton's ankle stops; more objective
  weight did not restore the motion.
