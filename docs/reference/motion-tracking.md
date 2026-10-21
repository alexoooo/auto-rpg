# Motion objectives and pinned equipment tracking

The motion objectives (`control/tasks.ts`), the tracker that carries them, and the pinned
equipment fixtures that test them: two independent items, and the shared bar whose settings are
`SETTINGS` in `src/core/tasks/bar.ts`. The standing variant is [standing bar](standing-bar.md).

## Objectives and tracker

Joint, point and orientation trajectories carry position, velocity and acceleration on named
segment or item frames; a position asks no orientation, and inputs are validated and frozen before
any grip command. `mind/motion.ts` hosts a policy on detached observations and these objectives,
with no fighter, stance or skills; one `wholeBodyTracking` instance turns them into torques within
the live directional capacities, its coupled model including item mass and captured attachments.
It is a weighted acceleration tracker (task error plus a regularizer on normalized effort), not a
feasibility certificate: it predicts no ground or joint-stop reaction, and reports residual,
saturated channels and frame errors.

## Two independent items

Harness: Node core world, vendored Rapier `.3` / adapter 4, 120 Hz, directional actuation, gravity,
`lowerTrunk` pinned, no ground, no assists. Two wooden clubs in the anatomical grasp frames
(capture tolerances 0.002 m and 0.00001 quaternion error) move by (0, 0.08, 0.08) m and turn
outward 0.1 rad about world y. Frame feedback 0.15 s, position weight 1, orientation weight 0.2;
joint rest goals 0.2 s at weight 0.03; effort regularization 1e-6. `node --test
tests/core-motion.test.mjs` after 360 steps:

| Body | Left position error, m | Right position error, m |
|---|---:|---:|
| Warrior | 0.000606897 | 0.000607300 |
| Rogue | 0.000714938 | 0.000716569 |
| Skeleton | 0.000818338 | 0.000817076 |

The test requires each error under 0.005 m, grip error under 0.002 m, legal activation and zero
assist; a target 5 m away stays a reported miss with finite motion. Replay covers a limp interval
and resumption; invalid motion cannot release an item first. Without frame objectives the error is
0.113158 m, so posture holding alone does not pass.

## Shared bar

`SETTINGS`, declared fixture inputs:

| Setting | Value |
|---|---|
| Capture (`capture`) | 0.03 m and `1 - abs(quaternion dot) <= 0.02` (about 23 degrees) |
| Second grip (`secondary`) | 0.12 m along the right-hand club's shaft |
| Initial target (`pose`) | (offset, pelvis y + 0.1, 0.4) m, item turned -pi/2 about world y |
| Shared move (`travel`) | (0, 0.08, 0.08) m |
| Swing (`swing`) | 0.45 rad about world x |
| Obstacle (`obstacle`) | 0.2 x 0.2 x 0.05 m at (0, pelvis y + 0.8, 0.75) m |
| Timeline after capture (`seconds`) | move 1, swing 2, release 4, return 5, finish 7.5 s |
| Posture feedback / tracking feedback | 0.2 / 0.15 s |
| Posture weight: arms / others | 0.03 / 0.3 |
| Position / orientation weight, effort cost, objectives (`capacity`) | 1 / 0.2, 1e-6, 2 |
| Return gate (`returnTolerance`, `returnHoldSeconds`) | 0.03 m held 0.25 s |

The loose capture tolerances stand for the open-hand capsule's approximate closed grasp, not finger
closure; a 0.01 orientation tolerance missed the Rogue's capture. Capture keeps the actual pose and
frames. The left hand's own objective ends at capture. The return asks position alone; returning
to the original orientation after a right-hand release presses the Rogue's left wrist limit and
misses by about 0.061 m. The trial ends once the item origin has stayed within 0.03 m for 0.25 s,
no earlier than 7.5 s after capture (the runner's deadline is 12 s); completion is absorbing.

`node --test tests/core-bar.test.mjs`, offset zero, 1100 steps:

| Body | Capture step | Shared move error, m | Peak actual grip gap, m | Return error releasing left / right, m | Peak obstacle normal impulse, N s |
|---|---:|---:|---:|---:|---:|
| Warrior | 102 | 0.021058 | 0.0000304 | 0.001185 / 0.001950 | 0.276511 |
| Rogue | 95 | 0.017693 | 0.0000855 | 0.003096 / 0.015771 | 0.226985 |
| Skeleton | 101 | 0.027197 | 0.0000604 | 0.019620 / 0.006734 | 0.106025 |

The gate: capture within 2 s, shared move and return within 0.03 m, grip gap under 0.002 m,
positive obstacle impulse (the engine's stored normal impulse, not work or damage), continuous
release and exact replay. Release keeps item pose, linear velocity and spin exactly across the
grip action; impact and release replay in place and in a fresh world.

## Recorded development screen

```powershell
node research/control-foundation.mjs --suite bar --split development --actuation directional --workers 4
```

The `bar` suite moves the target's x by up to 0.005 m on its development seeds, keeps release
denominators apart, and checkpoints at 2 s, before impact. [The manifest and
results](motion-tracking.json): three bodies, either release, seeds 0 and 1 (x offsets
+0.001180340 and -0.002639320 m), fixed-time ending. 12/12 pass and replay exactly; the largest
shared movement error is 0.0277481 m, return error 0.0264573 m, grip gap 0.00009931 m.

Run `research/runs/control-foundation/pinned-bar-v2`, source content SHA256
`503c393fe2f44d3b0912f6815de6431851e8df4d455bcc5fa16fd9034e964a50`. One worker on a quiet machine
(Windows, Node 24.19), the loaded branch after the checkpoint, tracker observations and metrics
hooks in, hashing out: `World.step` mean 1.813 to 1.952 ms, p95 2.011 to 2.405 ms, p99 2.351 to
2.943 ms.

## Tried and not kept

- A 0.25 rad outward turn of the two items: the skeleton ends about 0.0086 m off, both shoulders at
  minimum abduction, outside the 5 mm gate.
- A taller, wider obstacle: it blocked the approach and no grip was captured.
