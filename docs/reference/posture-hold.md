# Independent feedback holds an installed posture

`tasks/posture-hold.ts` initializes a body through `buildBody` and runs the existing independent
joint-feedback policy through detached observations and bounded muscle actions. The policy has
no root actuator, contact planner, coupled dynamics model or mutable physics handles. This is
a hold test; it neither enters the pose nor demonstrates rising.

Harness: Node core world and visible `/control-tasks.html`, 120 Hz, Rapier
0.21.0-auto-rpg.6 / adapter 7, corrected angular limits, directional muscle bounds, native
16 solver iterations, ordinary ground, empty hands, zero root and weapon assistance.
The two profiles differ only in patch versus per-point friction. Anatomical strength is unchanged.

## Fixture and acceptance

The three Warrior starts in `assets/research/posture-holds.json` come from seed-zero corrected
development witnesses in [posture-limit-models.json](posture-limit-models.json): fours,
half kneel with a light knee, and squat. Angles are clamped to anatomical ranges; body-frame
height includes a 0.5 mm initial clearance. The archived generator in
[the records](posture-hold.json) writes their quaternions once. The shared builder constructs
coincident joint anchors in the requested pose before physics exists, retaining anatomical
zero frames. These measurements supersede teleport-initialized prototypes for this task.

`SETTINGS` defines the development gate: maximum displacement of **every segment origin at every step** no
greater than 2 cm over ten seconds, positive ground contact, zero assistance and delivered
effort within its directional bounds to 0.0001 N m. Drift includes startup and the final step.
The 20 by 1 by 20 m floor is centred at `(0, -0.5, 0)` m. These are experimental task choices,
not anatomy or game recovery thresholds. Motor speed is capped at 10 rad/s, activation is one,
and requested speed is angle error divided by the specified response time, then capped.

## Development screen

Maximum segment drift in metres, Node core world / 120 Hz:

| Pose | Response (s) | Patch friction | Per-point friction |
|---|---:|---:|---:|
| All fours | 0.1 | 0.055644 | 0.056765 |
| All fours | 0.03 | 0.023038 | 0.022654 |
| All fours | 0.01 | **0.014867** | **0.015455** |
| Half kneel | 0.1 | 0.213588 | 0.100578 |
| Half kneel | 0.03 | 0.083608 | 0.098305 |
| Half kneel | 0.01 | 0.105976 | 0.127072 |
| Squat | 0.1 | 1.679972 | 1.681500 |
| Squat | 0.03 | 1.673627 | 1.673628 |
| Squat | 0.01 | 1.686939 | 1.679042 |

Only all fours at 0.01 s passes. Both passing cells have ground contact on all 1,200 steps
and no measured effort excess. Maximum driven effort, including startup, is 52.974758 N m
(patch) and 51.222328 N m (per-point); these are not struck peaks. All eighteen measured
cells replay exactly from the two-second checkpoint. Each engine run additionally reports
eighteen unsupported Rogue/skeleton cells; it does not silently count them as measured trials.
This fixed development screen is not a distributional success estimate. Held-out data is unused.

Visible browser runs of both passing cells reproduce the complete outcome and observation
trace from steps 241 through 1,200, and match their restored branch:

| Profile | Observation SHA256 |
|---|---|
| `rapier-coordinate` | `6f7df4c5ec8cfd01347d7d7012c62085705cf7bad07666dfbd203555c5311049` |
| `rapier-coordinate-coulomb` | `b8942a1226c8851f89692635775b20f3462f213bc05cc489c44e283dd084eff6` |

Reproduce with `CORE_ENGINE` set to either profile:

```powershell
node research/control-foundation.mjs --suite posture-hold --split development --actuation directional --workers 2
```

The records contain full manifests, source identities, configurations and outcomes. Parallel
worker timings are diagnostic, not a quiet-machine capacity measurement. Tests also reject
limp control, slower feedback and missing fixtures, and verify that requested construction
angles agree with signed joint readings without an initial constraint impulse.

The useful result is a general independent policy holding one grounded anatomical pose.
Entry, disturbances, loaded hands, balanced kneeling/squatting and transitions to useful
standing control remain separate gates. The contact predictor's anatomical mismatch remains
an open [recovery study](../analysis/2026-10-05-recovery-support.md).
