# Independent feedback on an installed posture

`tasks/posture-hold.ts` initializes a body through `buildBody` and runs the existing independent
joint-feedback policy through detached observations and bounded muscle actions. The policy has
no root actuator, contact planner, coupled dynamics model or mutable physics handles. This is
a hold test; it neither enters the pose nor demonstrates rising.

The same task also accepts external actuator actions through the common environment. Its
initial pose and scoring are identical. An [offline native-rollout diagnostic](native-posture-control.md)
now holds half-kneel at the default solver count; that result uses a different controller from
the direct-feedback measurements below.

Harness: Node core world, 120 Hz, Rapier 0.21.0-auto-rpg.7 / adapter 9, corrected angular
limits, directional muscle bounds, native 16 solver iterations, ordinary ground, empty hands,
zero root and weapon assistance; code at `83c3540c`, the workshop hands' measured hulls.
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
| All fours | 0.1 | 0.036987 | 0.032624 |
| All fours | 0.03 | 0.028695 | 0.023134 |
| All fours | 0.01 | 0.023510 | 0.024768 |
| Half kneel | 0.1 | 0.218934 | 0.100593 |
| Half kneel | 0.03 | 0.083573 | 0.098304 |
| Half kneel | 0.01 | 0.105985 | 0.127047 |
| Squat | 0.1 | 1.679996 | 1.683447 |
| Squat | 0.03 | 1.669865 | 1.675927 |
| Squat | 0.01 | 1.699437 | 1.676254 |

No cell passes. All fours comes nearest, 2.31 to 3.70 cm, with ground contact on all 1,200
steps and no effort excess beyond the tolerance. Maximum driven effort, including startup, is
47.4 to 53.7 N m on all fours; these are not struck peaks. All eighteen measured cells replay
exactly from the two-second checkpoint. Each engine run additionally reports eighteen
unsupported Rogue/skeleton cells; it does not silently count them as measured trials. This
fixed development screen is not a distributional success estimate. Held-out data is unused.

The hands decide it. The same patch-friction screen at `8c59943b`, the hands capsules, holds
all fours at 0.01 s within 0.014867 m, ground contact on all 1,200 steps and no effort excess;
its other cells drift 0.023038 to 1.686939 m. The hulls move that cell to 0.023510 m.

Reproduce with `CORE_ENGINE` set to either profile:

```powershell
node research/control-foundation.mjs --suite posture-hold --split development --actuation directional --workers 2
```

The records contain full manifests, source identities, configurations and outcomes. Parallel
worker timings are diagnostic, not a quiet-machine capacity measurement. Tests also reject
limp control, slower feedback and missing fixtures, and verify that requested construction
angles agree with signed joint readings without an initial constraint impulse.

With the hands' hulls the independent policy holds no grounded anatomical pose within the
gate. Entry, disturbances, loaded hands, balanced kneeling/squatting and transitions to useful
standing control remain separate gates. The contact predictor's anatomical mismatch remains
open; the recovery study that read it is `docs/analysis/2026-10-05-recovery-support.md@7f3ebcdb`.
