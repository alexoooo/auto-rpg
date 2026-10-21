# Independent feedback on an installed posture

`tasks/posture-hold.ts` builds a body in an installed pose and holds it with the independent
joint-feedback policy (detached observations, bounded muscle actions, no root actuator, contact
planner or dynamics model). Its `SETTINGS` are read from [Fixture and
acceptance](#fixture-and-acceptance). It is a hold test: it neither enters the pose nor rises. The
same task takes external actuator actions; the [native-rollout
diagnostic](native-posture-control.md) holds half-kneel through that port.

## Fixture and acceptance

The three Warrior starts in `assets/research/posture-holds.json` (fours, half kneel with a light
knee, squat) are the seed-zero corrected development witnesses of
[posture-limit-models.json](posture-limit-models.json), clamped to anatomical ranges, raised 0.5 mm
for clearance; [the records](posture-hold.json) keep the generator that wrote their quaternions.
The builder makes coincident joint anchors in the requested pose before physics exists.

`SETTINGS` is the development gate, task choices rather than anatomy or recovery thresholds:

| Setting | Value |
|---|---:|
| `seconds`: watch | 10 s |
| `tolerance`: largest displacement of every segment origin at every step, startup and final step included | 0.02 m |
| `effortTolerance`: delivered effort beyond its directional bound | 0.0001 N m |
| `floor`: centre / size | (0, -0.5, 0) / (20, 1, 20) m |

Ground contact must stay positive and assistance zero. The policy asks angle error over the response
time, capped at 10 rad/s, at activation one.

## Development screen

Harness: Node core world, 120 Hz, Rapier 0.21.0-auto-rpg.7 / adapter 9, corrected angular limits,
directional bounds, 16 solver iterations, ordinary ground, empty hands, zero assistance, at
`83c3540c` (the workshop hands' measured hulls). The two profiles differ only in patch against
per-point friction. Maximum segment drift, m:

| Pose | Response (s) | Patch friction | Per-point friction |
|---|---:|---:|---:|
| All fours | 0.1 | 0.036987 | 0.032624 |
| All fours | 0.03 | 0.028695 | 0.023134 |
| All fours | 0.01 | 0.023510 | 0.024768 |
| Half kneel | 0.1 | 0.218934 | 0.100593 |
| Half kneel | 0.03 | 0.083573 | 0.098304 |
| Half kneel | 0.01 | 0.105985 | 0.127047 |
| Squat | 0.1 | 1.679996 | 1.683447 |
| Squat | 0.03 | 1.669865 | 1.675927 |
| Squat | 0.01 | 1.699437 | 1.676254 |

No cell passes. All fours comes nearest (2.31 to 3.70 cm) with ground contact on all 1,200 steps,
no effort excess and driven effort 47.4 to 53.7 N m. All eighteen cells replay exactly from the
two-second checkpoint; Rogue and skeleton cells are reported unsupported.

The hands decide it: at `8c59943b`, with capsule hands, patch friction holds all fours at 0.01 s
within 0.014867 m (other cells 0.023038 to 1.686939 m); the hulls move that cell to 0.023510 m.

```powershell
# CORE_ENGINE set to either profile
node research/control-foundation.mjs --suite posture-hold --split development --actuation directional --workers 2
```

Tests also reject limp control, slower feedback and missing fixtures, and check that construction
angles agree with signed joint readings without an initial constraint impulse. The recovery study
that read the contact predictor's mismatch is `docs/analysis/2026-10-05-recovery-support.md@7f3ebcdb`.
