# Offline native-rollout posture control

`research/native-posture-control.mjs` chooses torque actions on the shared `tasks/posture-hold.ts`
fixture by short rollouts of the engine itself, with privileged whole-world snapshots. It is an
offline diagnostic, not a game controller or a recovery route: it asks whether a bounded controller
can hold a posture the direct joint feedback does not hold on the game's solver. Its search settings
are `NUMERICS` in that script; the record and action tape are
[native-posture-control.json](native-posture-control.json).

## Shared task and access

The posture task takes `controller: "actuator"` beside its default `direct`, under the common
environment contract: detached observations, immutable actuator descriptions, checked actions held
until replaced and saved with the controller. Physics, anatomy, start and scoring are the direct
hold's. The planner also owns the world and its snapshots, and says so: before each candidate it
restores physics, body, held action, clock, task metrics and optimizer state, runs the candidate
through the actuator port and `World.step`, and finally restores and runs the chosen action, so no
counterfactual step enters the episode.

## Search settings

Engineering choices, not muscle parameters. Physics: 120 Hz, Rapier `.7` / adapter 8, corrected
angular limits, per-point friction, the game's 16 solver iterations; the Warrior empty-handed on
ordinary ground, zero assistance, from the direct hold's installed pose.

| Setting | Value |
|---|---|
| Response toward the installed pose (critically damped) | 0.1 s (half kneel) |
| Residual weights: linear velocity / angular velocity (`angularWeight`) / lower trunk factor (`rootWeight`) | 1 / 0.1 m / 3 |
| Orientation error | twice the quaternion's signed vector part |
| Torque normalization | each channel's larger isometric peak (floor 1 N m, scaling only) |
| Gauss-Newton updates a step | 3 |
| Perturbation (`epsilon`) / trust region / regularization | 0.001 / 0.25 / 1e-6 |
| Line search (`lineSearch`) | 1, 0.5, 0.25, 0.125 |
| Horizon | one physics step |

A candidate replaces the current one only if its measured one-step cost is lower: a local search.
Positive and negative bounds keep their anatomical peaks and the muscle path still enforces the
speed-dependent envelope; no strength is raised. Drift and effort acceptance are the task's.

## Reproduction and replay

```powershell
node research/native-posture-control.mjs
node --test tests/core-posture-hold.test.mjs tests/research-native-posture.test.mjs
```

Every chosen next-step observation equals its predicted rollout. Replaying the action tape
reproduces every observation, task metric and body and controller state, and both states reproduce
a following sixteen-step zero-torque branch. Raw snapshot bytes are not the criterion: they can
differ after different save/load histories while the physical traces agree. The 1,200-action tape,
remeasured on adapter 9 with the coarse hand-pose capability, gives the same physical outcome.

The short regression replans twice from one start and requires identical actions and traces, and
refuses to call thirty steps a ten-second hold. Removing the held command from saved policy state
fails the physical continuation regression.

## Limits

| Metric | Half-kneel, ten seconds |
|---|---:|
| Maximum segment drift, including startup | 0.005587675 m |
| Final segment drift | 0.005581752 m |
| Maximum driven motor effort | 176.498852 N m |
| Maximum effort above applied bound | 0.000021935 N m |
| Steps with positive ground contact | 1200 / 1200 |
| Native candidate evaluations | 106085 |
| Shared hold gate | Pass |

Observation and task trace digest
`3366003045d25a421017757b7ac116c15b5491e5e3c864507dd3d85e4f3463c1`. The recorded controls replay
without the planner and pass the same gate: a bounded installed half-kneel hold exists at the game's
solver count, where the direct feedback fails. It says nothing of reaching the pose from a fall, of
disturbances, transfer or other bodies, and makes no real-time claim (many engine steps per action).
