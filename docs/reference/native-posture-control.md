# Offline native-rollout posture control

`research/native-posture-control.mjs` uses short rollouts of the actual engine to choose torque
actions on the shared `tasks/posture-hold.ts` fixture. It is an offline diagnostic with privileged
whole-world snapshot access. It is not a real-time game controller, a learned policy or a recovery
route. It tests whether a bounded controller can hold a posture that the approximate contact
model and simpler joint feedback have not held at the same solver setting.

## Shared task and access

The posture task accepts `controller: "actuator"` as well as its default `direct` controller.
Its `check`, `act`, `observe`, `evaluate`, state and disposal methods implement the common
environment contract. The external policy gets detached observations and immutable actuator
descriptions. Checked actions are copied, held until replaced, and included in controller state.
Physics, anatomy, initialization, assistance and the ten-second scoring rule are shared.
The actuator task's environment identity includes its anatomy data as well as the solver revision.
The direct controller's measured physical traces are unchanged.

The offline planner additionally owns the task's world and snapshots, as explicitly reported in
its result. Before each candidate it restores physics, body, held action, clock, task metrics and
optimizer state. It executes candidates only through the ordinary actuator action port and
`World.step`. It then restores once more and executes the selected action. Counterfactual steps
do not advance the episode or enter its measurements. This privileged access is not part of the
normal policy observation contract.

## Search settings

These are engineering choices for this diagnostic, not muscle or anatomical parameters.
Physics runs at 120 Hz on Rapier `.7` / adapter 8, corrected angular limits, native per-point
friction and the unchanged 16 native solver iterations. The Warrior has empty hands, ordinary
ground and zero assistance. The legal installed-pose asset is shared with the direct hold.

Each step targets a critically damped position/orientation response toward the installed pose.
The half-kneel trial uses a 0.1 s response. Linear velocity residuals have unit weight, angular
velocity residuals have weight 0.1 m, and the lower trunk's residuals have an additional factor
of 3. Quaternion error uses twice the signed vector part. These are local control objectives,
not an energy or feasibility certificate.

Torque is normalized by each channel's larger isometric peak (with a numerical floor of 1 N m
for scaling only). Requested positive/negative bounds retain their separate anatomical peaks;
the real muscle path still enforces the speed-dependent envelope. No strength is increased.
The observed `positive`/`negative` fields are the last applied motor bounds, not a replacement
for the actuator description's capacities.

Three bounded Gauss–Newton updates use a normalized perturbation of 0.001, trust region 0.25,
regularization 1e-6, and line-search lengths 1, 0.5, 0.25 and 0.125. Only a candidate with lower
measured one-step cost replaces the current candidate. The horizon is one physics step. A finite
budget makes this a local search, not a globally optimal controller. All segment drift and effort
acceptance come from the shared task, not the optimization objective.

## Reproduction and replay

```powershell
node research/native-posture-control.mjs
node --test tests/core-posture-hold.test.mjs tests/research-native-posture.test.mjs
```

Every selected next-step observation must exactly equal its predicted rollout. Replaying the
complete selected action tape must reproduce every observation, task metric and body/controller
state. Both resulting states must also reproduce a subsequent sixteen-step zero-torque branch.
Raw snapshot byte equality is not the replay criterion: the observed serialized blobs can differ
after different save/load histories even when those physical traces agree. Their byte differences
have not been assigned a physical cause here.

The short regression replans twice from the same physical start and requires identical chosen
actions and traces. It also refuses to label thirty steps as a completed ten-second hold. The
shared task tests compare external joint feedback with the built-in direct controller at every
step, reject malformed actions without changing state, and restore a held command after another
command has replaced it. The common environment test crosses a policy boundary and reset.
Removing the held command from saved policy state makes the physical continuation regression
fail; restoring it makes the test pass.

## Limits

The [full record and selected action tape](native-posture-control.json) reports:

| Metric | Half-kneel, ten seconds |
|---|---:|
| Maximum segment drift, including startup | 0.005587675 m |
| Final segment drift | 0.005581752 m |
| Maximum driven motor effort | 176.498852 N m |
| Maximum effort above applied bound | 0.000021935 N m |
| Steps with positive ground contact | 1200 / 1200 |
| Native candidate evaluations | 106085 |
| Shared hold gate | Pass |

The observation/task trace digest is
`3366003045d25a421017757b7ac116c15b5491e5e3c864507dd3d85e4f3463c1`.
The recorded controls replay without the planner and pass the same physical gate. This establishes
a bounded installed half-kneel hold at the default solver count. It does not establish that a
controller can reach it from a fall. The direct feedback baseline at this solver count still
fails; increasing native iterations is unnecessary for this diagnostic's successful case.

A passing installed hold does not establish entry, support transfer, disturbance rejection,
standing handover, other bodies or equipped recovery. The diagnostic performs many engine
steps per executed action and has no real-time performance claim. Runtime samples are recorded
as diagnostics only. Browser parity and replanning after disturbances remain separate gates.
No held-out starts are used.
