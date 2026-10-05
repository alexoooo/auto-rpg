# Motion objectives and pinned equipment tracking

`control/tasks.ts` defines optional joint, point and orientation trajectories, including velocity
and acceleration. Frames name a segment or item. Multiple objectives can address different
points of one frame; position does not implicitly demand an orientation. Inputs are copied,
validated and frozen before any grip command is applied. Gains and weights are explicit inputs.

`mind/motion.ts` hosts a policy through detached observations and those objectives. It constructs
no fighter, stance or skills. One `wholeBodyTracking` instance produces the final torque action,
bounded by the same live directional muscle capacities as direct policies. Its coupled model
includes separate item mass and actual captured attachments. Fixed bodies are declared fixture
constraints. No model-predicted force is applied externally. Policy memory and tracking reports
belong to the body's saved state.

This is a weighted acceleration tracker, not a feasibility certificate. It minimizes task error
with a regularizer on normalized actuator effort. The bounded solve reports weighted residual,
saturated channels and observed frame errors; it does not predict ground/contact or joint-stop
reactions. Frame feedback uses the measured pose directly, without differencing unconverged IK.
The dynamics still uses its allocating diagnostic path. Standing support, contact-force selection,
joint-limit anticipation and optimization of that path remain prerequisites for game adoption.
The public objective contract does not require this solver, or any model-based controller.

## Two independent items

Harness: Node core world, vendored Rapier `.3`, adapter 4, 120 Hz, directional actuation,
gravity, pelvis (`lowerTrunk`) pinned, no ground, no assists. Two sourced wooden clubs use the
anatomical grasp frames, with capture tolerances 0.002 m and 0.00001 quaternion error. The task
moves both item origins by (0, 0.08, 0.08) m and turns them outward about world y by 0.1 rad.
Frame feedback takes 0.15 s, with position weight 1 and orientation weight 0.2. Joint rest goals
use 0.2 s and weight 0.03; regularization is 1e-6 on normalized effort. These are engineering
experiment inputs, not changes to anatomical strength.

`node --test tests/core-motion.test.mjs` reads after 360 steps:

| Body | Left position error, m | Right position error, m |
|---|---:|---:|
| Warrior | 0.000606897 | 0.000607300 |
| Rogue | 0.000714938 | 0.000716569 |
| Skeleton | 0.000818338 | 0.000817076 |

The physical test requires each error below 0.005 m, grip error below 0.002 m, legal activation,
and zero assist. An additional target 5 m away stays a reported miss with finite motion and bounded
effort. Replay covers a limp interval and resumption; invalid motion cannot first release an item.
Removing frame objectives from the tracker makes the physical test fail at 0.113158 m error;
the test does not pass from posture holding alone.

A 0.25 rad outward orientation request instead leaves skeleton at about 0.0086 m position error,
with both shoulders at their minimum abduction. That is not a success at the same 5 mm gate.
Current skeleton anatomy is a placeholder; successful smaller motions do not establish a general
orientation workspace. Rogue's straight, unturned two-club approach can bring its clubs together.

## Shared bar

`tasks/bar.ts` is the shared Node/browser builder. `SETTINGS` contains its engineering numeric
settings. The same harness and zero assistance apply. A right-hand club registers a second grip
0.12 m along its shaft. Capture permits 0.03 m and `1 - abs(quaternion dot) <= 0.02`; the latter
allows about 23 degrees of relative orientation. These deliberately loose acquisition tolerances
model the current open-hand capsule's approximate closed grasp. They are declared fixture inputs,
not evidence of finger closure or precision grasp planning. Capturing preserves the actual pose
and uses those actual frames thereafter. Tighter 0.01 orientation tolerance missed Rogue's capture.

The initial target is (offset, pelvis y + 0.1, 0.4) m, with the item turned -pi/2 about world y.
The left hand approaches its registered frame; its independent objective ends once capture is
observed. One second later the item target moves (0, 0.08, 0.08) m. At two seconds it turns
0.45 rad about world x into a fixed 0.2 x 0.2 x 0.05 m obstacle centred at
(0, pelvis y + 0.8, 0.75) m. Either grip is released at four seconds; at five seconds the target
returns to the initial position without an orientation demand. The sequence completes at 7.5 s
after capture. Posture weight is 0.03 for arms and 0.3 for other joints; other tracking settings
match the independent-item fixture. Returning to the full original orientation after right-hand
release can press Rogue's left wrist limit and miss position by about 0.061 m.

The fixed obstacle is outside the approach path. A taller/wider obstacle obstructed the initial
approach and prevented acquisition; that trial did not pass. A controller must eventually plan
around such obstructions rather than assuming this fixture's clear approach.

`node --test tests/core-bar.test.mjs`, offset zero, 1100 steps:

| Body | Capture step | Shared move error, m | Peak actual grip gap, m | Return error releasing left / right, m | Peak obstacle normal impulse, N s |
|---|---:|---:|---:|---:|---:|
| Warrior | 102 | 0.021058 | 0.0000304 | 0.001185 / 0.001950 | 0.276511 |
| Rogue | 95 | 0.017693 | 0.0000855 | 0.003096 / 0.015771 | 0.226985 |
| Skeleton | 101 | 0.027197 | 0.0000604 | 0.019620 / 0.006734 | 0.106025 |

Both release cases preserve item pose, linear velocity and spin exactly between the grip action
and physics step. Impact and release replay in place and in a fresh equivalent world. The gate
is capture within 2 s, shared movement and position-only return within 0.03 m, actual grip gap
below 0.002 m, positive obstacle contact impulse, continuous release and exact replay. Contact
impulse here is the engine's stored normal impulse; it is not delivered work or damage.

The fixture ends only after the returning item origin stays within the same 0.03 m position
gate for 0.25 s, and no earlier than the declared 7.5 s after capture. The common runner retains
its 12 s deadline. This is position-only readiness, not an orientation or centre-of-mass speed
gate. Completion is absorbing. The archived development screen below uses the earlier fixed
ending time; its configuration preserves that protocol.

The common runner's `bar` suite perturbs the target's x coordinate by up to 0.005 m on its
declared development seeds and keeps left/right release denominators separate:

```powershell
node research/control-foundation.mjs --suite bar --split development --actuation directional --workers 4
```

It saves engine/configuration identity, all fixture settings, the sampled body/equipment digest,
outcomes, replay and separate timings. Its checkpoint is at 2 s, before impact and release. These
measurements establish pinned anatomical load paths. They do not establish standing, free-body
recovery, gameplay damage attribution, or a fast enough whole-body contact controller.

## Recorded development screen

[The durable manifest and results](motion-tracking.json) contain 12 trials: three bodies, either
release, development seeds 0 and 1. Both starts pass in every release cell (2/2 each); all 12
branches replay exactly. This is a small screening set, not a reliability estimate. Its two x
offsets are +0.001180340 and -0.002639320 m. The largest recorded shared movement error is
0.0277481 m, return error 0.0264573 m and actual grip gap 0.00009931 m. Assists remain zero.

Run: `research/runs/control-foundation/pinned-bar-v2`, source content SHA256
`503c393fe2f44d3b0912f6815de6431851e8df4d455bcc5fa16fd9034e964a50`.
The run archives its exact source as `source.json.gz`. It used one worker on a quiet machine;
the per-trial mean `World.step` costs ranged from 1.813 to 1.952 ms, p95 from 2.011 to 2.405 ms,
and p99 from 2.351 to 2.943 ms. Timing excludes the runner's observation hashing and covers the
loaded branch after the 2 s checkpoint, including the tracker's observations and the fixture's
metrics hooks. This is the new path's cost, not a before/after speedup or a browser capacity claim.
The machine is the existing Windows/Node 24.19 stand; the remaining allocations are not hidden
by these timings. Held-out seeds have not been used.
