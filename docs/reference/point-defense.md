# Point interception and head defense

The declared inputs of the head-defense task (`SETTINGS` in `src/core/tasks/defense.ts`) and the
development screen of its interception policy. Predictive interception passes 32/36 starts (33/36
remeasured), the pose baseline 0/36; the capability gate is not met.

`intercept` is an optional motion policy over named segment or item points. From detached,
timestamped object measurements it estimates point acceleration from successive velocities and
predicts the earliest closing crossing of a world plane, compensating sample age. A candidate must
lie in a declared reach sphere and pass a remaining-distance-over-time filter: necessary checks, not
proof of joint or actuator feasibility; the muscle solve decides. A quintic path (`pointPath`)
carries the measured point position and velocity (`pointMotion`) to the candidate; a shorter later
prediction can shorten it. Contact with the named threat switches to holding the interception
point, optionally with its measured orientation; a stationary preparation contact does not latch,
since response needs an active interception or measured closing. Retreat or loss of the object
returns from measured motion; idle clears history. All of it lives in the policy's saved state.
Near a joint limit the posture preference gains weight, never changing anatomy or range.

## Physical fixture and declared inputs

`SETTINGS` in `src/core/tasks/defense.ts` holds these declared experiment inputs.

`createDefenseProbe` stands an anatomical body on ordinary ground, with either hand or both
equipped. Empty hands track their sourced knuckle points, clubs their sourced swell point. The
necessary reach radius sums shoulder-to-elbow, elbow-to-wrist and wrist-to-point, a held item's grip
and point geometry once. Each selected hand faces its own incoming wooden club (the sourced club
shape, mass and inertia) on a fixed hinge, held for 3 s of preparation (`releaseSeconds`), then
released; gravity, hinge and contact do the rest, and no collision cancels a hit. The watch is 10 s
in all (`watchSeconds`). It is a mechanical fixture, not an opponent or an injury test.

| Input | Value |
|---|---:|
| Initial angle from downward vertical (`angle`) | 0.8 rad plus declared offset, at most 0.1 rad |
| Hinge limits relative to the initial pose (`limits`) | -0.1 to 1.6 rad |
| Hinge pivot height | Initial head height plus the club's sourced swell distance |
| Anchor radius / bookkeeping mass / principal moment (`anchorRadius`, `anchorMass`, `anchorMoment`) | 0.01 m / 1 kg / 0.001 kg m² |
| Two simultaneous incoming clubs' lateral positions (`bothLateral`) | -0.08 and +0.08 m, plus declared offset |
| Initial guard lateral / height over head / forward distance (`guardLateral`, `guardHeight`, `planeForward`) | ±0.25 m / 0.05 m / 0.25 m |
| Interception plane | World z = 0.25 m, normal +z |
| Object sensing delay (`delaySeconds`) | 0.025 s |
| Point feedback time / weight (`seconds`, `weight`) | 0.08 s / 1 |
| Prediction horizon / planning travel speed (`horizon`, `travelSpeed`) | 0.5 s / 3 m/s |
| Contact response threshold / orientation weight (`contactImpulse`, `braceWeight`) | 0.005 N s / 0.2 |
| Return duration / retreat distance beyond plane (`returnSeconds`, `retreatDistance`) | 0.5 s / 0.1 m |
| Joint-margin fraction / added preference weight (`marginFraction`, `marginWeight`) | 0.1 of range / at most 1 |
| Base arm / other-joint preference weight (`armWeight`, `bodyWeight`) | 0.03 / 0.3 |
| Posture feedback time (`postureSeconds`) | 0.2 s |
| Root lowering / vertical weight / orientation weight (`lower`, `rootPositionWeight`, `rootRotationWeight`) | 0.04 m / 10 / 1 |
| Horizontal combined-centre weight / root feedback time (`centreWeight`, `rootSeconds`) | 10 / 0.15 s |
| Normalized effort regularization (`effortCost`) | 1e-6 |
| Guard readiness tolerance / point speed / hold time (`readyTolerance`, `readySpeed`, `readySeconds`) | 0.03 m / 0.1 m/s / 0.25 s |
| Required pre-step relative closing speed for a block (`closing`) | Above 0.05 m/s |

Contact settings and capture tolerances match the centre-controlled strike fixture; root and weapon
assistance are zero. Empty hands leave rotation free on contact; clubs brace their measured
rotation. The pose baseline has the same body, guard, posture, balance, sensing and limits but
ignores incoming objects. Sensed object IDs are the incoming bodies' node names, matching contact
identities; a host with other aliases passes an explicit, unambiguous contact identity.

## Independent scoring

The task records guard readiness at release, positive impulse on every segment and on the
protected head and upper trunk, qualifying contact between each effector and its own club, falls
and rejected support solves, never inferring them from the policy's phase. Relative closing
includes both bodies' pre-step linear and angular motion. Per-segment `samples` count positive
contact readings, not steps or blows. The gate: readiness, a qualifying block for every club, no
protected-region impulse, no fall, no rejected solve over the watch, and exact replay. Impulse sums
are contact diagnostics, not damage or work.

The `defense` suite separates body, hands, loadout and `predict`/`pose`; development starts vary
lateral offset within ±0.04 m and angle within ±0.1 rad, and checkpoint at 2.5 s, before release.
`/control-tasks.html?task=defense` uses the same builder and seeds; "Task complete" there means the
watch ended, not that the gate passed.

```powershell
node research/control-foundation.mjs --suite defense --actuation directional --samples 2 --workers 3
```

## Development measurement

[The complete record](point-defense.json): 72 starts, Node 24.19, core world, Rapier
0.21.0-auto-rpg.4 / adapter 5, 120 Hz, directional bounds, zero root and weapon assistance, seeds 0
and 1; source content `05c78e3c2739f371775a98426a4bc574f249d7f825dcb4da2e9292ec7992fb8d`, manifest
SHA256 `b90e069f474659f80452712591c303de11f996660cf1d666b60476681e060352`, archive
`research/runs/control-foundation/point-defense-v1/source.json.gz`.

| Body | Predictive gate | Pose gate |
|---|---:|---:|
| Warrior | 11/12 | 0/12 |
| Rogue | 10/12 | 0/12 |
| Skeleton (placeholder anatomy) | 11/12 | 0/12 |

All 72 were ready at release, stayed up, had no rejected solve, used no assist and replayed
exactly; every predictive effector made a qualifying block. The predictive failures are post-block
coverage, with protected-region impulse summed over the watch:

| Predictive failure | Seed | Protected-region impulse |
|---|---:|---:|
| Warrior, two clubs | 1 | 11.4734 N s |
| Rogue, two clubs | 0 | 13.3626 N s |
| Rogue, two clubs | 1 | 11.6571 N s |
| Skeleton, left bare hand | 0 | 11.7749 N s |

A nominal screen (offset 0.02 m, angle 0) passed 16/18, failing Rogue with two clubs and the
skeleton with both bare hands. The [corrected joint-angle acceleration map](joint-acceleration.md#capability-remeasurement)
remeasures the same starts at 33/36 predictive and 0/36 pose; Warrior two clubs seed 1 and Rogue
two clubs both seeds still fail after their first blocks. [Nine browser cases](point-defense-browser.json)
match the frozen Node observation hashes, step counts and protected impulse exactly.

## Tried and not kept

- Holding the first contact position: an early glancing touch can leave the guard outside the
  incoming path.
