# Point interception and head defense

`intercept` is an optional motion policy over named segment/item points. It reads detached,
timestamped object measurements, estimates point acceleration from successive point velocities,
and predicts the earliest closing crossing of a world-space plane. Prediction compensates the
sample age. A candidate must lie inside a declared reach sphere and pass a remaining-distance
over-time filter. These are necessary checks, not a proof of joint or actuator feasibility.
The physical muscle solve remains authoritative.

A quintic path carries the measured point position and velocity to the candidate. A shorter
updated prediction can shorten the remaining path. Contact with the named threat switches to
holding the interception point; an effector may also request its measured orientation on contact.
A stationary preparation contact does not latch the guard: contact response requires an active
interception or measured closing motion. Holding the first contact position was screened and
rejected because an early glancing touch can leave the guard outside the incoming path.
Retreat or loss of the sensed object returns from measured motion. Idle clears measurement
history and prepares a measured return. Every changing value lives in the policy's saved state.

The posture preference can gain weight near a joint limit. It changes the supplied goal's
weight, never anatomy, strength or the legal range. The reference fixture supplies mid-range
arm goals. Direct actuator policies need not use any of this machinery.

`pointMotion` reads a local point's world position and velocity, including angular velocity
about the centre of mass. `pointPath` supplies the shared quintic path and its analytic
derivatives. Point strikes use these same helpers.

## Physical fixture and declared inputs

`SETTINGS` in `src/core/tasks/defense.ts` holds the following declared experiment inputs.

`createDefenseProbe` builds a standing anatomical body on ordinary ground and equips either
hand or both independently. Empty hands track their sourced knuckle points; clubs track their
sourced swell point. A necessary reach radius sums the shoulder-to-elbow, elbow-to-wrist and
wrist-to-point distances, including a held item's grip and point geometry once.

Each selected hand faces a separate incoming wooden club on one fixed hinge. The incoming
club uses the ordinary sourced club shape, mass and inertia. It is held fixed during three
seconds of preparation, then released. Gravity, the hinge and contact determine subsequent
motion; no collision cancels a hit or removes the incoming club. The task watches ten seconds
in total, including seven seconds after release. This is a mechanical head-defense fixture,
not an opponent controller or a test of injury reduction.

| Input | Value |
|---|---:|
| Initial angle from downward vertical | 0.8 rad plus declared offset, at most 0.1 rad |
| Hinge limits relative to the initial pose | -0.1 to 1.6 rad |
| Hinge pivot height | Initial head height plus the club's sourced swell distance |
| Anchor radius / bookkeeping mass / principal moment | 0.01 m / 1 kg / 0.001 kg m² |
| Two simultaneous incoming clubs' lateral positions | -0.08 and +0.08 m, plus declared offset |
| Initial guard lateral / height over head / forward distance | ±0.25 m / 0.05 m / 0.25 m |
| Interception plane | World z = 0.25 m, normal +z |
| Object sensing delay | 0.025 s |
| Point feedback time / weight | 0.08 s / 1 |
| Prediction horizon / planning travel speed | 0.5 s / 3 m/s |
| Contact response threshold / orientation weight | 0.005 N s / 0.2 |
| Return duration / retreat distance beyond plane | 0.5 s / 0.1 m |
| Joint-margin fraction / added preference weight | 0.1 of range / at most 1 |
| Base arm / other-joint preference weight | 0.03 / 0.3 |
| Posture feedback time | 0.2 s |
| Root lowering / vertical weight / orientation weight | 0.04 m / 10 / 1 |
| Horizontal combined-centre weight / root feedback time | 10 / 0.15 s |
| Normalized effort regularization | 1e-6 |
| Guard readiness tolerance / point speed / hold time | 0.03 m / 0.1 m/s / 0.25 s |
| Required pre-step relative closing speed for a block | Above 0.05 m/s |

These are explicit engineering experiment inputs. Contact settings and equipment capture
tolerances match the centre-controlled strike fixture. Root and weapon assistance are zero.
The empty-hand profile leaves rotation free on contact; the club profile braces its measured
rotation. The pose baseline uses the same body, guard, posture and balance objectives while
ignoring incoming-object observations. It has the same available sensing and actuator limits.

Sensed object IDs in this fixture are the incoming bodies' unique node names, matching contact
identities. The policy also accepts an explicit contact identity when a sensing host uses a
different alias. A host must keep those identities unambiguous.

## Independent scoring

The task records physical guard readiness at release, positive impulse on every anatomical
segment, positive impulse on the protected head and upper trunk, qualifying contact between
each selected effector and its own incoming club, falls and rejected support solves. Relative
closing velocity includes both bodies' pre-step linear and angular motion at the contact point.
Readiness and protected-body contact are not inferred from the policy's phase or contact flag.
Per-segment `samples` count positive contact readings, which may include multiple incoming
clubs in one step. They are not a count of unique time steps or blows.

The proposed task gate is measured readiness, a qualifying block for every incoming club,
no positive protected-region impulse, no fall and no rejected support solve during the watch,
plus exact replay. Other body contacts remain in the result even if the head is protected.
Impulse sums are contact diagnostics, not damage, injury energy or mechanical work. The fixture
does not establish that bare-hand blocking is harmless, or that a successful head defense
protects every other body part. Shared-item defense and attack/guard coordination remain separate
capabilities.

The common runner's `defense` suite separates body, hand choice, loadout and `predict`/`pose`
denominators. Development starts vary the common lateral offset within ±0.04 m and initial
angle within ±0.1 rad using the established seed mapping. The paired summary subtracts predicted
defense's protected impulse from pose's; it does not call this damage saved. It checkpoints at
2.5 s, before release, and replays all delayed sensing, policy, task and physical state.
`/control-tasks.html?task=defense` uses this same builder and seed mapping, and renders every
incoming and held item as its own physical body. “Task complete” means the watch ended, not that
the protection gate passed; protected-region impulse and the full contact record remain visible.

```powershell
node research/control-foundation.mjs --suite defense --actuation directional --samples 2 --workers 3
```

## Development measurement

The [corrected joint-angle acceleration map](joint-acceleration.md#capability-remeasurement)
remeasures the identical starts at 33/36 predictive and 0/36 pose successes. Warrior with two
clubs at seed 1 and Rogue with two clubs at both seeds still fail after initial blocks. All
remain upright and replay. The record below preserves the original 32/36 comparison and its
frozen source; use the corrected record for the present tracker.

[The complete record](point-defense.json) contains all 72 starts and outcomes, cell denominators,
paired comparisons and the frozen manifest. Harness: Node 24.19, core world, vendored Rapier
0.21.0-auto-rpg.4 / adapter 5, 120 Hz, directional bounds, zero root/weapon assistance, seeds 0
and 1. Source content `05c78e3c2739f371775a98426a4bc574f249d7f825dcb4da2e9292ec7992fb8d`;
manifest SHA256 `b90e069f474659f80452712591c303de11f996660cf1d666b60476681e060352`.
The archive is `research/runs/control-foundation/point-defense-v1/source.json.gz`.
Three research workers overlapped tests and browser checks; their timings are not a cost claim.

| Body | Predictive gate | Pose gate |
|---|---:|---:|
| Warrior | 11/12 | 0/12 |
| Rogue | 10/12 | 0/12 |
| Skeleton (placeholder anatomy) | 11/12 | 0/12 |

Each denominator covers left/right/both hands, empty hands/clubs and two starts. All 72 trials
were physically ready at release, remained upright, had no rejected support solve, used zero
assist, and replayed exactly. Every predictive effector made a qualifying physical block.
That did not guarantee sustained protection:

| Predictive failure | Seed | Protected-region impulse over the watch |
|---|---:|---:|
| Warrior, two independent clubs | 1 | 11.4734 N s |
| Rogue, two independent clubs | 0 | 13.3626 N s |
| Rogue, two independent clubs | 1 | 11.6571 N s |
| Skeleton, left bare hand | 0 | 11.7749 N s |

These are post-block coverage failures, not solver rejection or falling. The summed impulses
include sustained loading and must not be read as impact severity. A separate nominal screen
at lateral offset 0.02 m and zero angle offset passed 16/18; its two failures were Rogue with
two clubs and skeleton with both bare hands. The different failures under development starts
show why one nominal success is insufficient. The capability gate remains open.

Unit tests cover acceleration estimation, repeated delayed samples, reach/time rejection,
matched contact, return/idle, both joint margins and detached settings. Removing the closing
check makes the stationary-preparation regression fail (`hold` instead of `guard`). Physical
tests exercise single-hand protection, independently scored pose-baseline contact, and
same-world/fresh-world replay before release and during bracing. Shared point-helper extraction
also preserved full observation and saved-state hashes for two long-watch moving-strike cases.

[Nine visible-browser cases](point-defense-browser.json), using the built viewer at 120 Hz,
match the frozen Node observation SHA256, final step count and protected impulse exactly. They
cover every body, empty hands and clubs, either hand and simultaneous hands, both starts, the
pose baseline, and three distinct predictive failures. Every browser branch replays its task
and controller state; initial and completed poses were inspected, with no browser warnings or
errors. The owned preview was stopped after inspection.
