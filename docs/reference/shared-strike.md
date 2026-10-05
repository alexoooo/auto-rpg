# Shared-item strikes

`createPointStrikeProbe` accepts `shared: {}` for one club held by both hands, or
`shared: { release: "left" | "right" }` to release that hand when the strike enters its
return. This option requires the club loadout and both hands. It creates one physical item,
initially attached to the right hand. The left hand must physically reach its registered grip
before the point-strike policy starts. Capture joins the measured frames without snapping the
body into the requested pose. The existing detached observation, motion command and equipment
grant interfaces carry the whole sequence; no policy obtains physics mutation authority.

The preparation controller holds the root pose and asks for the same item and second-hand
poses as the standing bar fixture. After capture, the optional centre-control objective takes
over and `pointStrike` prepares, strikes, follows through and returns the shared club's swell
point. Both arms and the rest of the body participate in the same bounded torque solve.
In centre-control trials, the arm posture measured at strike readiness, clamped to legal joint
ranges, supplies attached arms' shared return posture. A released arm instead uses its initial
reference posture and a hand-position withdrawal objective; see the current
[withdrawal measurements](shared-withdrawal.md). Independent-item strikes retain their midpoint return.
The frozen readiness posture and grip lifecycle measurements are plain replayable task state.

## Fixture inputs and scoring

Harness: Node core world or the built `/control-tasks.html` page, Rapier `.4`, adapter 5,
120 Hz, directional actuation, ordinary ground, zero root and weapon assistance. Anatomy,
muscle strengths, item mass/inertia, grip mechanics and the contact tracker are unchanged.
The skeleton still uses its placeholder anatomical data.

| Input | Value | Basis |
|---|---|---|
| Second grip along the shaft | 0.12 m | Standing bar preparation |
| Capture distance / quaternion error | 0.03 m / 0.02 | Standing bar preparation |
| Item origin during capture | (lateral offset, initial root height + 0.1, 0.4) m | Standing bar preparation |
| Capture orientation weight | 0.2 | Standing bar preparation |
| Shared guard point | (lateral offset, initial root height + 0.75, 0.4) m | Club strike height; guard depth matches capture approach |
| Strike destination / obstacle depth | 0.65 / 0.7 m | Existing point-strike fixture |
| Maximum actual attachment gap | 0.001 m | Engineering acceptance gate, distinct from desired capture-frame tolerance |
| Return tolerance | 0.02 m | Existing point-strike gate |
| Continued control after return | 10 s in the extended screen | Existing long-continuation protocol |

All remaining tracking, contact, impact braking and centre-control inputs are those in
[point strikes](point-strike.md), [moving strikes](moving-strike.md) and
[centre control](centre-control.md). Capture preserves its root-pose objective until both
grips attach; lowering the pelvis during capture changed the approach and prevented the
skeleton from acquiring its second grip in the initial development screen.

`sharedHits` counts qualifying intended-target contacts while both grips are attached.
The fixture reads actual captured attachment gaps, not distance to desired grip frames.
A desired-frame distance near 0.03 m after capture is therefore not evidence of joint stretch.
Optional release occurs after follow-through; pose, rotation and both velocities are checked
before the next physical integration. The remaining hand continues the return under the same
actuator bounds. Deliberate misses must score zero contacts. Finishing the policy and waiting
out its continuation does not imply that the trial passes: the runner separately checks the
final return error, falls, rejected solves, shared contact, release continuity and replay.

## Reproduction

```powershell
node research/control-foundation.mjs --suite point-strike --shared --centre-control --continue-seconds 10 --actuation directional --samples 2 --workers 3 --out research/runs/control-foundation/shared-strike-static-v1
node research/control-foundation.mjs --suite moving-strike --shared --centre-control --continue-seconds 10 --actuation directional --samples 2 --workers 3 --out research/runs/control-foundation/shared-strike-moving-v2
node --test tests/core-shared-strike.test.mjs tests/research-control-foundation.test.mjs
```

Each shared suite retains separate denominators for keeping both hands, releasing left and
releasing right, as well as hit/miss and tracked/fixed moving aim. The browser selects
`Held: One club in both hands` and `Shared grip after strike`; it runs the same task builder.
`held=shared&release=none|left|right` selects those controls in the page URL.

The direct regression checks physical acquisition, shared impact, either release, ten seconds
of return control, zero assistance and whole-trajectory/state replay in a fresh world.
These are reference-task experiments, not game integration or a general recovery demonstration.

## Extended static development screen

Node 24.19, core world, Rapier `.4`/adapter 5, 120 Hz, directional limits, no assists,
development seeds 0 and 1, centre control and ten seconds of continued control after return.
Three workers overlapped other validation; these runs do not support a step-cost comparison.

| Body | Keep both | Release left | Release right | Total |
|---|---:|---:|---:|---:|
| Warrior | 4/4 | 4/4 | 4/4 | 12/12 |
| Rogue | 4/4 | 4/4 | 4/4 | 12/12 |
| Skeleton | 0/4 | 0/4 | 4/4 | 4/12 |

Each cell includes two intended hits and two deliberate misses. All 36 acquire the second
grip, finish the sequence, remain upright, avoid rejected solves and replay exactly. All
intended strikes make qualifying contact with both grips attached; all deliberate misses
score none. All 24 releases preserve pose and velocities before integration. The maximum
actual attachment gap is 0.000786 m, below the 0.001 m gate.

The eight failed cells exceed the unchanged 0.02 m final return tolerance: skeleton keep-both
errors are 0.0303-0.0328 m and release-left errors are 0.0674-0.0780 m. Completion is therefore
28/36 by the full task gate, despite every policy reaching its completion phase. This is a
small development screen, not a reliability estimate. Sustained shared return on the skeleton
remains required; it cannot be counted as a passed capability because it hit once.

Run: `research/runs/control-foundation/shared-strike-static-v1`.
Source content SHA256: `c49b3313fbac6b20482ab1e90761ecf91d37ebce701f80f957d273a664d50965`.
Manifest SHA256: `d3ac2047306459a504ae4a370eabef0a0a2fc7cd9032caf654fc7ea3b98d4623`.

Removing the second-grip request fails the physical regression: the item remains attached
only to the primary hand, preparation never completes and no shared strike is scored.
Fresh-world replay compares every step's observations and the final controller/task state;
it does not require engine serialization's allocation counters to produce identical bytes.

## Moving-target development screen

The same rate, bodies, development seeds, centre control, assistance and long continuation
apply to freely swinging targets, sensed with a three-step delay. Each release mode includes
tracked aim, fixed aim and deliberate misses. The complete [90-trial record](shared-strike.json)
contains both valid runs, every job/outcome and their source manifests.

| Body | Keep both | Release left | Release right | Total |
|---|---:|---:|---:|---:|
| Warrior | 6/6 | 6/6 | 6/6 | 18/18 |
| Rogue | 6/6 | 6/6 | 6/6 | 18/18 |
| Skeleton | 0/6 | 0/6 | 4/6 | 4/18 |

The full gate passes 40/54. Tracked aim passes 13/18, fixed aim 13/18 and deliberate misses
14/18. This screen does not establish a tracking advantage: every intended strike in both
aim variants makes qualifying shared contact. All 54 trials acquire the grip, finish, remain
upright, avoid rejected solves and replay exactly. All 18 misses score no contact and all
36 releases preserve pose and velocities. Every failure is a skeleton return outside 0.02 m;
the largest is 0.2907 m for fixed aim, seed 0, release-right. Shared contact by itself is not
sufficient control after the strike.

Run: `research/runs/control-foundation/shared-strike-moving-v2`.
Source content SHA256: `66d380550158e7c15f281416690e95ade8dabcb4692d0562309205175627a63e`.
Manifest SHA256: `2b22b0afc25ae8eddaeea5a0dcb4c67a0b8fc57ac9cf03d9c6af9643ed0ad9f2`.
Its source archive differs from the static archive only in the `SHARED` constant's provenance
comment. Moving-v1 is excluded: changing that comment during its run invalidated its source
check, so the complete experiment was repeated with a frozen source.

## Browser and validation

[Seven visible-browser cases](shared-strike-browser.json) cover all three bodies, keeping
both grips, both release sides, static and moving targets, hits and misses. Every body
observation trace hash, step count and complete task outcome matches its Node trial exactly;
every browser case also replays its own branch. The skeleton's failed static keep-both return
and moving release-left miss are included, rather than checking only successful cells.
Initial and final poses were inspected and the browser warning/error log was empty.
Raw DOM JSON is parsed outside the browser tool's numeric object transport to preserve the
recorded binary64 values.

Validation: 789 tests, 787 passing and the two existing joint-limit/recovery TODOs; typecheck
and production build pass. The capture mutation fails as intended. Recovery, sustained
defense, shared-item defense, attack/guard coordination, game equipment/damage integration,
and the held-out integrated sequence remain open parts of the foundation plan.
