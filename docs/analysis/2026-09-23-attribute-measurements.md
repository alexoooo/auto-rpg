# Attribute measurements

What each golem stat does, measured. One section per stat, in the order the plan set
(`docs/plans/2026-09-23-attributes-00-overview.md`) lands them, each with its bench table and its
bout sweep. The same tables sit in the stat's row doc comment in `src/golem/attributes.ts`.

**Every figure names its harness.** Unless a table says otherwise, a sweep is
`research/stat-sweep.mjs` on the Node harness, research runner, supported locomotion, with the
research `PROTOCOL` cap of 150 s, the `default` build on both corners, and the four probe minds
`golem-champion`, `golem-miser`, `golem-brawler` and `golem-duelist` in every ordered pairing.
A bench reading names its own harness beside it.

## How to read a sweep

- **A block** is one mind pair on one seed pair, played twice: the modified corner on the left,
  then on the right, each corner keeping its own mind seed. Arena side cancels inside a block.
- **Win %** is the modified corner's, with a draw as half, and a 95 % bootstrap interval over
  blocks. `Left / right` splits it by the side the modified corner was on; a real effect moves
  both, and a side-only move is a seeding bug (memory `probe-minds-need-side-correct-seeds`).
- **Margin** is the modified corner's final bar (`Golem.vitality`) minus the other's, averaged
  over a block. `d` is its mean over its standard deviation across blocks -- the criterion in
  memory `paired-effect-size-criterion`.
- **vs control** is the same margin minus the control level's on the same block. Every level
  plays the same blocks, so this subtracts the variance that comes from which minds and seeds a
  block drew -- **when the level's blocks track the control's**, which is what a small multiplier
  should do. When the change swamps the matchup it does not: `ram-capped` below loses almost every
  block whoever the minds are, its own margin has little spread, and subtracting the control adds
  the control's spread back, so its paired d (-1.61) is *smaller* than its own (-2.48). Read both;
  the two d's measure different things and are not to be compared with each other.
- **Dealt** and **taken** are damage per bout by and to the modified corner, from the combat log.
- **Only a comparison inside one sweep means anything.** Seed bases differ by more than the
  effects measured here (memory `mind-sweeps-need-big-n`).

## The instrument (session 02)

### Null control

Level x1 only, the modified corner carrying `attributes: { movement: 1 }` explicitly, 192
blocks, seed 20260923. `research/runs/stat-null`.

| Level | Bouts | Win % [95 %] | Left / right % | Margin [95 %] | d | Draws | Seconds | Dealt | Taken |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| x1.00 | 384 | 48.8 [43.6, 54.3] | 51.0 / 46.6 | -0.008 [-0.057, 0.043] | -0.02 | 1 | 28.1 | 7.60 | 7.68 |

Every bout ended `exhausted`. **This is the noise floor**: at 192 blocks on this seed base the
win rate's interval is about +-5.4 points and the margin's about +-0.05 of a bar. The control
level of both edge runs below played the same 384 bouts and reproduced this row exactly.

The mind pairs spread from 25.0 % to 83.3 % *inside the null row*, where both bodies are
identical: `golem-duelist` against `golem-miser` is 83.3 %, and `golem-miser` against
`golem-champion` is 25.0 %. That is the minds' own non-transitivity, not a stat, and it is why
a per-pair column can only be read against the same pair's control.

### Known edges

The modified corner is a whole named build from `NAMED_BUILDS` against `default`, beside a control
level where both are `default`. Same blocks, same seed.

| Modified build | Bouts | Win % [95 %] | Left / right % | Margin [95 %] | d | vs control [95 %] | d | Seconds | Dealt | Taken |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `ram-capped` | 384 | 5.1 [3.1, 7.3] | 6.0 / 4.2 | -0.661 [-0.700, -0.623] | -2.48 | -0.653 [-0.710, -0.596] | -1.61 | 45.6 | 1.47 | 7.36 |
| `ram-blade` | 384 | 54.0 [48.7, 59.8] | 55.2 / 52.9 | 0.035 [-0.010, 0.086] | 0.10 | 0.044 [-0.014, 0.101] | 0.11 | 29.2 | 7.89 | 7.68 |

`ram-capped` -- a ram head and no arms -- is the known edge the plan asked for, and it reads as
one on both sides, in the win rate, the margin and the damage columns alike: it deals a fifth of
what it takes. That proves the columns are wired to the modified corner.

`ram-blade` was tried first because the published league (`research/results/baseline.json`)
scores it 0.737 over its cells, the highest of any build. Against `default` head to head it is
+5 points and d 0.11, inside the noise. The league's figure is an average over cross-build
cells, not a head-to-head edge, and the two are not the same question.

## Movement (session 03)

Scales the carrier's walk, back-off, strafe and acceleration together (`withMovement` in
`src/golem/attributes.ts`). On a biped, `bipedAtMovement` in `src/golem/locomotion/biped.ts` also
re-times the gait. **Live at x0.75 to x1.5.** At x1.00 the body fingerprint reads 55 of 55 `same`.

### Bench

Node harness, `runGolemLocomotion`. The course is 1 s standing, 1.75 s at full forward command and
1 s stopped. It is shorter than the stock walk, which at x1.5 would read the stand's wall.

Top speed reached tracks the multiplier exactly on all four bodies: for example, 1.600, 2.400,
3.200 and 4.800 m/s for the biped at x0.5, 0.75, 1 and 1.5. The carrier is keyframed, so nothing
else binds.

The legs are the question. This is mean planted-sole slip in mm/s, against each module's
`meanFootSlipBudgetMps`:

| movement | 0.50 | 0.60 | 0.75 | 0.90 | 1.00 | 1.10 | 1.25 | 1.50 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| biped, carrier scaled alone (300) | 612 | 730 | 1010 | 231 | 186 | 762 | 693 | 659 |
| biped, re-timed (300) | 208 | 243 | 199 | 162 | 186 | 193 | 204 | 219 |
| skeleton, re-timed (300) | 453 | 440 | 275 | 181 | 180 | 200 | 203 | 286 |
| multileg, carrier only (700) | -- | -- | 237 | -- | 334 | -- | 496 | 627 |
| wheel | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

The biped needed two repairs, one at each end of the range:

- **The slow end is the legs' step frequency.** `strideCadence` is per metre, so a slower carrier
  steps more slowly. Below about the 2.0 cycles a second that x1 steps at, the stance sole is
  dragged along with the pelvis: at x0.75 it moved at 1958 mm/s under a pelvis at 2400.
  - Holding x1's frequency (cadence per metre divided by the multiplier) and keeping the full
    swing cures it.
  - Shrinking the swing to the shorter step is exactly wrong: 849 mm/s at x0.75.
- **The fast end is the joint slew.** At x1.1, peak joint lag jumped from 0.40 rad to 1.0 until
  `targetRate` was scaled by the multiplier.

The multileg reads worse under both repairs (400 at x0.75, 786 at x1.5), so it takes only the
carrier scale.

**The floor comes from the skeleton and the ceiling from the multileg.** The skeleton reads 275 at
x0.75 and over 440 below it. The multileg reads 627 of its 700 at x1.5.

**Stability.** No body left the supported state or leaned at any level on that course, or on one
that backs off, strafes, spins and walks diagonally. On that mixed course the biped's slip is
already 764 mm/s at x1 and scales with speed: 567 at x0.75, 1072 at x1.5. That is the sideways
gait's known gap, recorded rather than budgeted at `meanFootSlipBudgetMps`.

**Walls.** The wall-corpus test in `tests/golem-locomotion.test.mjs` now runs at x1 and at the
ceiling. The carrier's world sweep is a fraction of its step, so a faster carrier still stops at its
own footprint. It was also probed in the real dungeon (`DungeonRun`, seed 42, a force order to a
room 16 m away):

| movement | reached (s) | top speed (m/s) | frames off the floor | frames inside a wall (0.9 r) |
| --- | ---: | ---: | ---: | ---: |
| x1 | 5.43 | 3.62 | 0 | 0 |
| x1.5 | 3.66 | 4.80 | 0 | 0 |

The x1.5 hero ended the 12 s run at 0.444 of its bar against 0.971, because it reached enemies
sooner.

### Sweep

`research/runs/stat-movement`, 192 blocks per level.

| Level | Bouts | Win % [95 %] | Left / right % | Margin [95 %] | d | vs control [95 %] | d | Draws | Seconds | Dealt | Taken |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| x0.75 | 384 | 48.7 [43.8, 53.6] | 44.8 / 52.6 | 0.004 [-0.040, 0.051] | 0.01 | 0.013 [-0.042, 0.070] | 0.03 | 2 | 27.4 | 7.42 | 7.54 |
| x0.90 | 384 | 51.3 [46.4, 56.4] | 49.7 / 52.9 | -0.003 [-0.053, 0.048] | -0.01 | 0.005 [-0.053, 0.064] | 0.01 | 4 | 27.3 | 7.73 | 7.63 |
| x1.00 (control) | 384 | 48.8 [43.6, 54.3] | 51.0 / 46.6 | -0.008 [-0.057, 0.043] | -0.02 | -- | -- | 1 | 28.1 | 7.60 | 7.68 |
| x1.10 | 384 | 46.7 [41.3, 52.5] | 42.4 / 51.0 | -0.026 [-0.075, 0.026] | -0.07 | -0.017 [-0.075, 0.039] | -0.04 | 1 | 25.4 | 7.56 | 7.90 |
| x1.25 | 384 | 50.1 [44.7, 55.5] | 49.7 / 50.5 | 0.014 [-0.039, 0.065] | 0.04 | 0.022 [-0.041, 0.085] | 0.05 | 1 | 28.8 | 7.67 | 7.57 |
| x1.50 | 384 | 49.2 [44.0, 54.4] | 49.0 / 49.5 | -0.010 [-0.056, 0.037] | -0.03 | -0.002 [-0.060, 0.056] | -0.00 | 0 | 30.3 | 7.77 | 7.90 |

**Movement does nothing measurable in these minds' duel, at either end.** Every level is inside
the null row's noise: the interval on the margin is about +-0.06 of a bar, and no d is above 0.07.
Bout length does not move either.

The x1.00 row reproduces the session 02 null exactly, and the per-mind-pair split shows no
closer-versus-keeper pattern at 24 bouts a cell. The stat is not dead on the body: in the same
harness a x1.5 brawler's opening charge reaches 4.80 m/s against 3.20.

The fight is simply not conducted at top speed. Harness bouts at x1, three per mind, left corner:

| Mind | mean \|command\| | time at full command | time at >= 0.9 of top speed | mean speed (m/s) |
| --- | ---: | ---: | ---: | ---: |
| golem-champion | 0.75 | 31.4 % | 8.4 % | 1.54 |
| golem-miser | 0.31 | 20.9 % | 5.4 % | 0.74 |
| golem-brawler | 0.88 | 76.5 % | 24.8 % | 1.60 |
| golem-duelist | 0.73 | 24.5 % | 1.5 % | 1.38 |

The brawler asks for full speed three quarters of the time and has it a quarter of the time,
because the bodies meet within a second and their footprints then block each other. Top speed
binds only on the opening approach and on a clean disengage, and none of these minds fights by
disengaging.

**So the stat's value today is outside the duel:**

- a person steering a body;
- the dungeon, where the x1.5 hero crossed the same 16 m in two thirds of the time;
- a future mind that kites.

A spacing mind is where this sweep should be repeated.

## Turning (session 05)

Scales the carrier's yaw rate and yaw acceleration together (`withTurning` in
`src/golem/attributes.ts`), through the per-build table movement already hands to the port, the gait
and the envelope; the two stats compose, each touching only its own fields. The trunk's twist
(`TORSO_WAIST.twistRate`) is the torso's and is not scaled. **Live at x0.5 to x1.5.** At x1.00 the
body fingerprint reads 55 of 55 `same`.

### Who reads yaw

`maxYawSpeedRadS` and `maxYawAccelerationRadS2` are read by the supported carrier, by each module's
envelope and world sweep, and on the biped by the stepping itself: `bipedFootSpeed` and `bipedPose`
turn a yaw into a fore-aft differential between the feet. All of those read the per-build table, so
the legs step the pivot the carrier is asked for. `DEFAULT_SUPPORTED_CARRIER` in
`src/supported-locomotion-production.ts` is only a fallback that every module overrides.

### Bench

Node harness, `runGolemLocomotion`. In place: 1 s standing, 2 s at full turn command, 1 s stopped.
Peak yaw rate is the carrier's own, and tracks the multiplier exactly on all four bodies (biped
1.50 to 6.00 rad/s from x0.5 to x2). No body left the supported state or leaned at any level.

| turning | 0.50 | 0.75 | 1.00 | 1.25 | 1.50 | 1.75 | 2.00 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| time to 90 deg, biped and skeleton (s) | 1.32 | 0.97 | 0.78 | 0.68 | 0.62 | 0.55 | 0.52 |
| time to 90 deg, multileg (s) | -- | 1.98 | 1.55 | 1.28 | 1.12 | 0.98 | 0.88 |
| time to 90 deg, wheel (s) | 0.90 | 0.68 | 0.58 | 0.52 | 0.47 | 0.43 | 0.40 |
| biped slip (mm/s) | 122 | 183 | 231 | 300 | 344 | 381 | 440 |
| skeleton slip (mm/s) | 64 | 90 | 114 | 142 | 174 | 210 | 243 |
| multileg slip (mm/s) | 120 | 181 | 241 | 301 | 362 | 422 | 482 |
| angle coasted after release, biped (rad) | 0.36 | 0.54 | 0.72 | 0.89 | 1.07 | 1.25 | 1.43 |

**The slip is proportional to the spin, and that is why it sets no range.** About 77 mm/s per rad/s
on the biped and 38 on the skeleton at every level, with joint lag under 0.02 rad throughout, so the
slew is not binding. A sole has no yaw joint and twists on the floor as the body turns over it.
Measured against the walk's absolute 300 mm/s the biped would stop at x1.25; measured against the
pivot budget `a_sole_holds_its_ground_sideways_and_in_a_spin_too_and_not_only_in_a_walk` already
holds a spin to -- 0.99 of the travel the pivot asks of each foot -- it is the same share at every
level. The test for this stat holds both ends to that budget.

**Walking while turning is the existing gap, and the stat does not widen it.** At full forward and
full turn together, the biped's slip is 1057 mm/s at x1 and *falls* as turning rises (780 at
x1.25, 670 at x1.5); the skeleton reads 1481 at x1 and 773 at x1.5. That is the same sideways-gait
gap as movement's mixed course.

**The coast grows with the stat.** Both limits scale by one factor, so the stopping angle
`v^2 / 2a` scales by that factor too. Scaling the acceleration by the square would hold it; it was
not done, because nothing in the bench or the sweep asks for it.

### How much minds turn

Node harness, `createBout`, the left corner's own mind against the others on three seeds each, read
from the carrier's yaw velocity and its request:

| Mind | Mean yaw command | Full-turn command | At >= 0.9 of the cap | Facing > 0.5 rad off the opponent |
| --- | ---: | ---: | ---: | ---: |
| golem-champion | 0.52 | 32.8 % | 11.9 % | 22.6 % |
| golem-miser | 0.23 | 3.5 % | 2.0 % | 7.2 % |
| golem-brawler | 0.63 | 47.8 % | 26.4 % | 37.8 % |
| golem-duelist | 0.57 | 29.6 % | 12.1 % | 14.8 % |

The command reverses often enough that the acceleration limit keeps the carrier below its cap.

### Sweep

`research/runs/stat-turning`, 192 blocks per level.

| Level | Bouts | Win % [95 %] | Left / right % | Margin [95 %] | d | vs control [95 %] | d | Draws | Seconds | Dealt | Taken |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| x0.50 | 384 | 36.2 [31.3, 41.1] | 40.1 / 32.3 | -0.140 [-0.190, -0.088] | -0.39 | -0.132 [-0.184, -0.079] | -0.36 | 0 | 33.6 | 6.58 | 8.21 |
| x0.75 | 384 | 38.4 [33.1, 43.8] | 43.2 / 33.6 | -0.096 [-0.144, -0.045] | -0.27 | -0.088 [-0.140, -0.035] | -0.24 | 1 | 27.1 | 7.18 | 8.28 |
| x0.90 | 384 | 50.4 [45.1, 55.7] | 49.0 / 51.8 | -0.004 [-0.056, 0.048] | -0.01 | 0.004 [-0.052, 0.062] | 0.01 | 1 | 26.7 | 7.68 | 7.59 |
| x1.00 (control) | 384 | 48.8 [43.6, 54.3] | 51.0 / 46.6 | -0.008 [-0.057, 0.043] | -0.02 | -- | -- | 1 | 28.1 | 7.60 | 7.68 |
| x1.10 | 384 | 55.1 [49.5, 60.5] | 62.2 / 47.9 | 0.002 [-0.049, 0.055] | 0.01 | 0.011 [-0.046, 0.069] | 0.03 | 1 | 25.7 | 7.83 | 7.70 |
| x1.25 | 384 | 53.0 [47.9, 58.6] | 52.3 / 53.6 | 0.029 [-0.019, 0.080] | 0.08 | 0.037 [-0.019, 0.096] | 0.09 | 1 | 25.3 | 7.87 | 7.50 |
| x1.50 | 384 | 54.0 [48.6, 59.4] | 51.8 / 56.3 | 0.030 [-0.018, 0.080] | 0.09 | 0.038 [-0.016, 0.091] | 0.10 | 1 | 25.9 | 7.82 | 7.41 |

**Turning is live in the duel, and lopsided.** A slow turn loses clearly: x0.5 and x0.75 win 36 % and
38 %, with paired d -0.36 and -0.24 and intervals well clear of zero. A fast turn gains a little and
not reliably: x1.25 and x1.5 win 53 % and 54 %, d 0.09 and 0.10, with intervals that touch zero.
x0.9 to x1.1 sit inside the null. The x1.00 row reproduces movement's control exactly.

That is the shape the probe above predicts: halving the cap binds on every full-turn command, while
raising it helps only the fraction of a bout a mind spends at the cap. In the per-pair split, at 24
bouts a cell, the miser's rows fall furthest at the slow end (against the duelist 37.5 % at x1,
8.3 % at x0.5; against the champion 25.0 % to 0.0 %), which is worth a look before anyone reads a
mind's style off it.

## Stability (session 06)

The stat is a factor on the stagger and fall thresholds of a body's stability ledger, and on the rule
that interrupts a rise (`stabilityCapacity` in `src/supported-locomotion-state.ts`). It does not go
through the brace multiplier: brace is refused below 1 and is exactly 1 on the wheel, so a stat
below x1 has to be its own factor. It moves the impulse ledger only. A body that tips over its own
feet, rather than being shoved past a threshold, is not steadier for it.

### Bench

Node harness, `runGolemLocomotion` (`.review/shove-bench.mjs`): stand 1 s, one shove, watch 2 s,
with the bench's `shoveImpulseNs` bisected to the first impulse that staggers and the first that
fells. The prediction is the diagnostic's `staggerAtMps` or `fallAtMps` times its
`supportedMassKg`.

| Body | Supported mass | Level | Stagger, predicted / measured N.s | Fall, predicted / measured N.s |
| --- | ---: | ---: | ---: | ---: |
| biped | 90.7 kg | x0.50 | 0.41 / 0.43 | 0.95 / 0.95 |
| | | x1.00 | 0.82 / 0.84 | 1.91 / 1.91 |
| | | x2.00 | 1.63 / 1.66 | 3.81 / 3.81 |
| skeleton | 65.8 kg | x0.50 | 0.39 / 0.41 | 0.92 / 0.92 |
| | | x1.00 | 0.79 / 0.81 | 1.84 / 1.84 |
| | | x2.00 | 1.58 / 1.60 | 3.69 / 3.69 |
| multileg | 102.4 kg | x0.50 | 0.80 / 0.83 | 1.86 / 1.86 |
| | | x1.00 | 1.60 / 1.63 | 3.73 / 3.73 |
| | | x2.00 | 3.20 / 3.23 | 7.46 / 7.46 |
| wheel | 117.5 kg | x0.50 | 0.25 / 0.28 | 0.58 / 0.58 |
| | | x1.00 | 0.49 / 0.52 | 1.15 / 1.15 |
| | | x2.00 | 0.99 / 1.02 | 2.30 / 2.30 |

The measured fall is the prediction to the hundredth. The measured stagger is 0.02-0.03 N.s over,
the same at every level, which is the ledger's frozen decay acting during the frame of the shove.
An earlier run at x0.75, x1.25 and x1.5 on the biped read 1.43, 2.38 and 2.86 N.s, on the same
line. The wheel and the multileg divide by their own mass alone, since they carry no upper body
on the bench. That was already true before this stat.

Walking was checked at every level from x0.5 to x2: each body's own walk, plus a course that backs
off, strafes, spins and walks diagonally. No frame leaves the supported state on any body. So the
floor is not set by a body felling itself.

### Sweep

`research/runs/stat-stability`, 192 blocks per level, stone default, the four probe minds.

| Level | Bouts | Win % [95 %] | Left / right % | Margin [95 %] | d | vs control [95 %] | d | Draws | Seconds | Dealt | Taken |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| x0.50 | 384 | 33.5 [29.2, 38.3] | 26.8 / 40.1 | -0.173 [-0.217, -0.125] | -0.53 | -0.164 [-0.216, -0.112] | -0.45 | 1 | 27.7 | 6.59 | 8.72 |
| x0.75 | 384 | 40.9 [35.8, 46.0] | 43.8 / 38.0 | -0.081 [-0.129, -0.031] | -0.24 | -0.073 [-0.117, -0.029] | -0.24 | 2 | 28.5 | 7.08 | 8.18 |
| x0.90 | 384 | 48.4 [42.8, 54.2] | 47.7 / 49.2 | -0.022 [-0.076, 0.031] | -0.06 | -0.014 [-0.053, 0.025] | -0.05 | 2 | 29.1 | 7.68 | 7.80 |
| x1.00 (control) | 384 | 48.8 [43.6, 54.3] | 51.0 / 46.6 | -0.008 [-0.057, 0.043] | -0.02 | -- | -- | 1 | 28.1 | 7.60 | 7.68 |
| x1.10 | 384 | 51.4 [45.8, 57.2] | 55.7 / 47.1 | 0.012 [-0.039, 0.063] | 0.03 | 0.020 [-0.015, 0.057] | 0.08 | 1 | 27.8 | 7.82 | 7.62 |
| x1.25 | 384 | 44.5 [39.3, 49.9] | 47.4 / 41.7 | -0.017 [-0.066, 0.032] | -0.05 | -0.008 [-0.045, 0.029] | -0.03 | 2 | 27.0 | 7.49 | 7.78 |
| x1.50 | 384 | 50.0 [44.7, 55.5] | 51.6 / 48.4 | 0.008 [-0.044, 0.063] | 0.02 | 0.017 [-0.025, 0.058] | 0.06 | 2 | 27.4 | 7.61 | 7.61 |
| x2.00 | 384 | 51.8 [46.4, 57.3] | 54.7 / 49.0 | 0.038 [-0.013, 0.090] | 0.10 | 0.046 [0.003, 0.090] | 0.15 | 0 | 28.4 | 7.82 | 7.46 |

`research/worker.mjs` now counts each corner's knockdowns (edges into `fallen`) and the time it
spends fallen or rising, read from the locomotion port every frame. `research/stat-sweep.mjs`
reports them when every row carries them:

| Level | Knockdowns | Other's knockdowns | Time down % | Other's time down % |
| --- | ---: | ---: | ---: | ---: |
| x0.50 | 13.66 | 4.40 | 38.1 | 13.8 |
| x0.75 | 7.67 | 4.68 | 23.5 | 15.1 |
| x0.90 | 5.77 | 5.14 | 17.6 | 15.5 |
| x1.00 | 4.89 | 4.96 | 15.1 | 14.5 |
| x1.10 | 4.40 | 4.96 | 13.3 | 14.6 |
| x1.25 | 3.44 | 4.97 | 10.6 | 15.1 |
| x1.50 | 2.58 | 4.98 | 8.5 | 14.8 |
| x2.00 | 1.63 | 5.26 | 4.8 | 15.2 |

`research/runs/stat-stability-skeleton`, 192 blocks per level, `skeleton-warrior` with the
skeleton duelist on both sides:

| Level | Bouts | Win % [95 %] | Left / right % | Margin [95 %] | d | vs control [95 %] | d | Draws | Seconds | Dealt | Taken |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| x0.50 | 384 | 42.4 [37.8, 47.1] | 44.8 / 40.1 | -0.067 [-0.117, -0.016] | -0.19 | -0.084 [-0.148, -0.021] | -0.19 | 0 | 57.7 | 1.79 | 2.01 |
| x0.75 | 384 | 47.4 [42.7, 52.6] | 52.6 / 42.2 | -0.026 [-0.078, 0.028] | -0.07 | -0.043 [-0.101, 0.017] | -0.10 | 0 | 59.6 | 1.84 | 1.95 |
| x1.00 (control) | 384 | 50.3 [45.1, 55.2] | 54.7 / 45.8 | 0.017 [-0.039, 0.071] | 0.04 | -- | -- | 0 | 59.5 | 1.89 | 1.89 |
| x1.25 | 384 | 51.8 [46.9, 57.0] | 53.1 / 50.5 | 0.034 [-0.023, 0.090] | 0.08 | 0.018 [-0.036, 0.071] | 0.05 | 0 | 57.6 | 1.95 | 1.79 |
| x1.50 | 384 | 55.2 [50.3, 60.2] | 58.3 / 52.1 | 0.060 [0.001, 0.118] | 0.14 | 0.043 [-0.012, 0.098] | 0.11 | 0 | 57.7 | 1.93 | 1.78 |
| x2.00 | 384 | 54.6 [49.7, 59.2] | 53.4 / 55.7 | 0.067 [0.006, 0.126] | 0.16 | 0.050 [-0.012, 0.112] | 0.11 | 1 | 56.3 | 2.00 | 1.75 |

| Level | Knockdowns | Other's knockdowns | Time down % | Other's time down % |
| --- | ---: | ---: | ---: | ---: |
| x0.50 | 7.25 | 4.84 | 36.7 | 23.8 |
| x0.75 | 6.26 | 5.01 | 31.2 | 24.8 |
| x1.00 | 4.90 | 4.79 | 23.9 | 23.5 |
| x1.25 | 3.57 | 4.50 | 17.8 | 23.2 |
| x1.50 | 3.08 | 4.47 | 15.5 | 22.9 |
| x2.00 | 2.24 | 4.41 | 12.1 | 22.9 |

**Stability is live in the duel, and lopsided the same way turning is.** On stone, x0.5 loses
clearly: it falls 13.7 times a bout to the control's 4.9, spends 38 % of the bout down, and wins
33.5 %, with paired d -0.45. x0.75 wins 40.9 % (d -0.24). Above x1, the knockdown count keeps
falling steadily: 4.4, 3.4, 2.6 and 1.6 at x1.1, x1.25, x1.5 and x2. The win rate does not follow
it. x2 wins 51.8 %, d 0.15, with an interval that just clears zero, and x1.25 is inside the null.
The skeleton mirror is a gentler slope: 42.4 % at x0.5 (d -0.19), and about 55 % at x1.5 and x2
(d 0.11, intervals touching zero). Its time down halves, from 23.9 % to 12.1 %.

Two consequences:

- **Staying on your feet a third as often is worth only a couple of points.** A reading of what a
  knockdown costs has to start there, and it is session 07's business, since recovery is the stat
  that prices a knockdown.
- **The stone default goes down about five times a bout at x1**, although stone's locomotion has
  no knockdown table of its own. So recovery has something to act on in the stone duel, which is
  the check the recovery plan asks for first.

The x1.00 rows reproduce the earlier controls: 48.8 % on stone, identical to movement's and
turning's, and 50.3 % on the skeleton.

## Recovery (session 07)

**First, is there anything to recover from?** Yes, in both builds. Session 06's columns show the
stone default going down 4.9 times a bout at x1 and spending 15.1 % of it down, and the skeleton
4.9 times and 23.9 %. Stone's biped has `knockdown: null`, so it goes down through the shared path
alone: the frozen 0.35 s dwell, then the frozen 0.45 s rise.

**The knob.** Two halves, one per owner.

- **The port's half, for every body.** `recoveryScale` rides on the stability authority beside
  session 06's `stabilityScale`. The state machine reads the dwell through `fallenDwellS` and the
  rise floor through `risingFloorS`, each the frozen value over the stat. The port hands the body's
  own x1 rise length to `recoveredRiseS`, which divides it. The skeleton's `risePeakMps` is
  therefore scaled here, as a shorter rise over the same lift.
- **The body's half, which only the body can see.** `withRecovery` divides a knockdown's
  `restSeconds` and `maxLyingSeconds`.

**The rise is never divided past what the rising actuator can accelerate.** A smoothstep lift over
`d` metres in `T` seconds peaks at `6 d / T^2`, and the port refuses a rise over 48 m/s^2 as
obstructed. At x2 the frozen 0.45 s becomes 0.225 s, which lifts at most 0.41 m. Divided blindly,
a body lying lower than that would be refused a rise on every boundary, for ever, and the house
rule on recovery forbids exactly that. So above x1 a rise stops shortening at the limit. Nothing in
the measurements below reached it: every rise lasted its x1 length over the stat, stone's 0.45 s
and the skeleton's table lift alike, down to the 0.225 s floor at x2.

**The lying cap is divided and never removed.** `attributesRefusal` keeps the stat inside its row,
so the cap stays finite.

### Bench

Node harness, whole golems in a supported pair (`.review/recovery-bench.mjs`, which copies
`knockdown` in `tests/golem-knockdown.test.mjs`). The body asks to rise and fight the whole time,
and is shoved to twice its fall line three times a level, 7 s apart for the skeleton and 3 s for
stone. Each figure is the mean over the three. Peak limb speed is the fastest any non-leg part
moves relative to the pelvis during a rise, so the lift itself is not counted.

| Body | Level | Lie, s | Pelvis at rise start, m | Rise, s | Fall to standing, s | Peak limb speed, m/s |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| stone | x0.50 | 0.704 | 0.88 | 0.904 | 1.608 | 1.67 |
| | x0.75 | 0.471 | 0.89 | 0.604 | 1.075 | 1.17 |
| | x1.00 | 0.350 | 0.90 | 0.454 | 0.804 | 0.82 |
| | x1.25 | 0.283 | 0.90 | 0.362 | 0.646 | 0.84 |
| | x1.50 | 0.233 | 0.90 | 0.300 | 0.533 | 1.00 |
| | x2.00 | 0.175 | 0.90 | 0.225 | 0.400 | 1.09 |
| skeleton | x0.50 | 2.61 | 0.20 | 2.21 | 4.81 | 5.52 |
| | x0.75 | 2.50 | 0.19 | 1.50 | 4.00 | 5.64 |
| | x1.00 | 2.38 | 0.20 | 1.11 | 3.49 | 5.80 |
| | x1.25 | 2.01 | 0.27 | 0.80 | 2.81 | 5.71 |
| | x1.50 | 1.68 | 0.34 | 0.58 | 2.25 | 9.31 |
| | x2.00 | 1.26 | 0.68 | 0.23 | 1.48 | 16.27 |

Every shove at every level ended standing: no rise was refused and none was interrupted.

Stone is the frozen dwell and rise over the stat, to the substep, all the way to x2.

The skeleton's lie ends on rest below x1.25 and on the cap from x1.25 up (2.5 s over the stat). A
cap that short ends a fall that has not finished. At x1.5 the rise starts with the pelvis at
0.34 m, and at x2 at 0.68 m, against 0.19-0.20 at x1. The knockdown table's note records every rise
it watched starting at or under 0.26 m. The skeleton's tone climbs back across the rise, so a
shorter rise is a faster climb against a commanded pose. From x1.5 up the limbs whip: a wrist at
9.3 m/s, a plate at 16.3. **The bench's ceiling is x1.25**: the rise starts from a finished fall
(0.26-0.28 m) and no limb is faster than at x1.

Held off its rest rule (`restSeconds` four times the cap), the skeleton lies 5.004 s at x0.5,
2.504 at x1 and 2.008 at x1.25, which is the cap over the stat. The same probe's x0.5 run had a
7 s window, shorter than a 5.0 s lie plus a 2.0 s rise, so its standing is not in that run.
`the_recovery_stat_divides_every_lie_and_rise_and_the_cap_still_ends_a_lie_at_both_ends_of_its_range`
in `tests/golem-knockdown.test.mjs` asserts it at both ends of the row: the lie is the cap over the
stat, and the body stands afterwards.

### Sweep

`research/runs/stat-recovery`, 192 blocks per level, stone default, the four probe minds.

| Level | Bouts | Win % [95 %] | Left / right % | Margin [95 %] | d | vs control [95 %] | d | Draws | Seconds | Dealt | Taken |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| x0.50 | 384 | 38.8 [33.9, 43.8] | 43.2 / 34.4 | -0.131 [-0.179, -0.083] | -0.39 | -0.123 [-0.169, -0.078] | -0.38 | 0 | 29.5 | 6.94 | 8.55 |
| x0.75 | 384 | 47.1 [41.7, 52.6] | 51.0 / 43.2 | -0.027 [-0.077, 0.024] | -0.08 | -0.019 [-0.064, 0.028] | -0.06 | 0 | 28.8 | 7.58 | 7.72 |
| x0.90 | 384 | 44.9 [39.6, 50.3] | 49.2 / 40.6 | -0.050 [-0.103, 0.005] | -0.13 | -0.041 [-0.088, 0.002] | -0.13 | 1 | 27.3 | 7.45 | 8.26 |
| x1.00 (control) | 384 | 48.8 [43.6, 54.3] | 51.0 / 46.6 | -0.008 [-0.057, 0.043] | -0.02 | -- | -- | 1 | 28.1 | 7.60 | 7.68 |
| x1.10 | 384 | 51.2 [45.8, 56.5] | 53.4 / 49.0 | -0.003 [-0.051, 0.048] | -0.01 | 0.006 [-0.042, 0.055] | 0.02 | 1 | 27.2 | 7.68 | 7.79 |
| x1.25 | 384 | 50.1 [44.4, 55.9] | 51.6 / 48.7 | 0.013 [-0.037, 0.065] | 0.04 | 0.021 [-0.021, 0.064] | 0.07 | 1 | 27.7 | 7.75 | 7.66 |
| x1.50 | 384 | 52.9 [47.4, 58.3] | 55.2 / 50.5 | 0.037 [-0.013, 0.092] | 0.10 | 0.046 [0.006, 0.087] | 0.16 | 0 | 27.2 | 8.05 | 7.69 |
| x2.00 | 384 | 54.0 [48.6, 59.4] | 53.6 / 54.4 | 0.039 [-0.016, 0.092] | 0.11 | 0.048 [0.001, 0.092] | 0.15 | 1 | 28.2 | 7.91 | 7.43 |

| Level | Knockdowns | Other's knockdowns | Time down % | Other's time down % |
| --- | ---: | ---: | ---: | ---: |
| x0.50 | 5.33 | 4.26 | 27.8 | 14.3 |
| x0.75 | 5.01 | 4.81 | 20.0 | 14.9 |
| x0.90 | 5.01 | 4.90 | 17.0 | 14.9 |
| x1.00 | 4.89 | 4.96 | 15.1 | 14.5 |
| x1.10 | 4.99 | 4.99 | 14.1 | 14.9 |
| x1.25 | 5.07 | 5.26 | 12.8 | 14.7 |
| x1.50 | 4.96 | 5.18 | 10.6 | 15.8 |
| x2.00 | 4.99 | 5.17 | 8.6 | 15.7 |

`research/runs/stat-recovery-skeleton`, 192 blocks per level, `skeleton-warrior` with the skeleton
duelist on both sides:

| Level | Bouts | Win % [95 %] | Left / right % | Margin [95 %] | d | vs control [95 %] | d | Draws | Seconds | Dealt | Taken |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| x0.50 | 384 | 46.9 [42.4, 51.6] | 45.3 / 48.4 | -0.021 [-0.071, 0.030] | -0.06 | -0.037 [-0.096, 0.023] | -0.09 | 0 | 59.4 | 1.83 | 1.93 |
| x0.75 | 384 | 45.1 [40.1, 50.3] | 45.8 / 44.3 | -0.024 [-0.084, 0.033] | -0.06 | -0.041 [-0.107, 0.024] | -0.09 | 0 | 58.9 | 1.81 | 1.93 |
| x1.00 (control) | 384 | 50.3 [45.1, 55.2] | 54.7 / 45.8 | 0.017 [-0.039, 0.071] | 0.04 | -- | -- | 0 | 59.5 | 1.89 | 1.89 |
| x1.25 | 384 | 50.8 [45.8, 55.7] | 51.0 / 50.5 | 0.042 [-0.013, 0.096] | 0.11 | 0.026 [-0.035, 0.083] | 0.06 | 0 | 59.1 | 1.96 | 1.82 |
| x1.50 | 384 | 60.2 [55.2, 65.1] | 60.9 / 59.4 | 0.134 [0.081, 0.187] | 0.36 | 0.118 [0.056, 0.178] | 0.27 | 0 | 57.9 | 2.11 | 1.72 |

| Level | Knockdowns | Other's knockdowns | Time down % | Other's time down % |
| --- | ---: | ---: | ---: | ---: |
| x0.50 | 4.03 | 4.30 | 31.4 | 21.1 |
| x0.75 | 4.54 | 4.40 | 26.7 | 21.7 |
| x1.00 | 4.90 | 4.79 | 23.9 | 23.5 |
| x1.25 | 4.73 | 4.75 | 19.7 | 23.7 |
| x1.50 | 5.04 | 4.93 | 18.7 | 24.8 |

**On stone, recovery has the shape of turning and stability.** A slow body loses clearly: x0.5
spends 27.8 % of a bout down against 15.1 %, and wins 38.8 % (paired d -0.38). x0.75 to x1.25 are
inside the null. x1.5 and x2 win 52.9 % and 54.0 %, with d 0.16 and 0.15 against the control, and
intervals that just clear zero. The knockdown count does not move (4.9 to 5.3 a bout), as it should
not: this stat prices a knockdown and does not prevent one.

**On the skeleton, it is flat up to x1.25, and x1.5 wins 60.2 % (d 0.27).** x1.5 is exactly where
the bench shows the rise starting mid-fall with the limbs whipping. Damage dealt rises there, 2.11
against 1.89, with the time down only a point under x1.25's. The whip and the gain coincide.
Nothing here shows that one causes the other. It is left unshipped: the row's top is x1.25, the
bench's ceiling. If the skeleton ever wants a faster recovery than that, the cap has to stop ending
a fall that is still moving, and that is a change to the knockdown rule, not a number.

The x1.00 rows reproduce the earlier controls: 48.8 % on stone and 50.3 % on the skeleton.

## Armour (session 08)

**The knob.** `armourAt` in `src/golem/attributes.ts`: a part's own armour fraction times the stat,
capped at `ARMOUR_CAP`, 0.9. Its one reader is `Golem.armourOf`, which answers a per-kind table
(`ArmourByHit`) for the blow's kind first, so a number and a table scale alike. At x1 it returns
the fraction untouched. A part with no armour gets none at any setting, which is the owner's rule:
armour scales the armour fraction. The cap exists because `armouredDamage` in `src/scoring.ts`
refuses a fraction of 1 or more; at 0.9 a blow still lands a tenth of itself.

The stat changes no physics. A bout at another armour level is the same fight, blow for blow, until
a part's health decides something: a ruined limb, a severing, a mind reading the bar, or the end of
the bout. That is why the control-paired columns below have such small spreads. On stone, x2 moves
the bar margin by only 0.012, yet its d is 0.43.

### Bench

Node harness, `.review/armour-bench.mjs`: one 10-point blow through `Golem.applyDamage` on a
standing golem of each playable build, one per level. The figure is the damage the part takes.

| Part (fraction at x1) | x0.50 | x0.75 | x1.00 | x1.25 | x1.50 | x2.00 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| stone core (0.10) | 9.50 | 9.25 | 9.00 | 8.75 | 8.50 | 8.00 |
| stone head (0.05) | 9.75 | 9.63 | 9.50 | 9.38 | 9.25 | 9.00 |
| stone pelvis, upper arm (0) | 10.00 | 10.00 | 10.00 | 10.00 | 10.00 | 10.00 |
| plated core (0.34) | 8.30 | 7.45 | 6.60 | 5.75 | 4.90 | 3.20 |
| plated head (0.05) | 9.75 | 9.63 | 9.50 | 9.38 | 9.25 | 9.00 |
| skeleton, any part, cut (0.50) | 7.50 | 6.25 | 5.00 | 3.75 | 2.50 | 1.00 |
| skeleton, any part, thrust (0.60) | 7.00 | 5.50 | 4.00 | 2.50 | 1.00 | 1.00 |
| skeleton, any part, crush or slap (0) | 10.00 | 10.00 | 10.00 | 10.00 | 10.00 | 10.00 |
| human core, head (0.50) | 7.50 | 6.25 | 5.00 | 3.75 | 2.50 | 1.00 |
| human pelvis, upper arm (0.35) | 8.25 | 7.38 | 6.50 | 5.63 | 4.75 | 3.00 |

The cap binds on a skeleton's cut at x2, its thrust from x1.5, and a human core or head at x2. It
binds nowhere at x1.

### Sweep

`research/runs/stat-armour`, 192 blocks per level, stone default, the four probe minds.

| Level | Bouts | Win % [95 %] | Left / right % | Margin [95 %] | d | vs control [95 %] | d | Draws | Seconds | Dealt | Taken |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| x0.50 | 384 | 47.8 [42.6, 53.3] | 51.0 / 44.5 | -0.019 [-0.068, 0.033] | -0.05 | -0.010 [-0.016, -0.006] | -0.31 | 1 | 28.0 | 7.49 | 7.70 |
| x0.75 | 384 | 48.0 [42.8, 53.5] | 51.0 / 45.1 | -0.014 [-0.064, 0.037] | -0.04 | -0.006 [-0.010, -0.003] | -0.23 | 1 | 28.0 | 7.52 | 7.69 |
| x0.90 | 384 | 48.6 [43.4, 54.2] | 51.0 / 46.1 | -0.010 [-0.060, 0.041] | -0.03 | -0.002 [-0.005, -0.001] | -0.14 | 1 | 28.0 | 7.57 | 7.68 |
| x1.00 (control) | 384 | 48.8 [43.6, 54.3] | 51.0 / 46.6 | -0.008 [-0.057, 0.043] | -0.02 | -- | -- | 1 | 28.1 | 7.60 | 7.68 |
| x1.10 | 384 | 49.1 [43.9, 54.4] | 51.0 / 47.1 | -0.008 [-0.057, 0.044] | -0.02 | 0.001 [0.000, 0.001] | 0.46 | 1 | 28.1 | 7.60 | 7.67 |
| x1.25 | 384 | 49.3 [44.3, 54.7] | 51.6 / 47.1 | -0.006 [-0.055, 0.046] | -0.02 | 0.003 [0.002, 0.004] | 0.29 | 1 | 28.3 | 7.62 | 7.67 |
| x1.50 | 384 | 49.3 [44.3, 54.7] | 51.6 / 47.1 | -0.003 [-0.052, 0.048] | -0.01 | 0.005 [0.003, 0.007] | 0.43 | 1 | 28.3 | 7.62 | 7.68 |
| x2.00 | 384 | 50.0 [44.9, 55.3] | 52.9 / 47.1 | 0.003 [-0.046, 0.054] | 0.01 | 0.012 [0.008, 0.016] | 0.43 | 2 | 28.7 | 7.66 | 7.64 |

| Level | Knockdowns | Other's knockdowns | Time down % | Other's time down % |
| --- | ---: | ---: | ---: | ---: |
| x0.50 | 4.87 | 4.90 | 15.2 | 14.5 |
| x0.75 | 4.89 | 4.94 | 15.1 | 14.5 |
| x0.90 | 4.87 | 4.94 | 15.0 | 14.5 |
| x1.00 | 4.89 | 4.96 | 15.1 | 14.5 |
| x1.10 | 4.89 | 4.96 | 15.1 | 14.5 |
| x1.25 | 4.89 | 4.98 | 15.1 | 14.7 |
| x1.50 | 4.91 | 4.99 | 15.1 | 14.7 |
| x2.00 | 4.93 | 5.02 | 15.2 | 14.7 |

`research/runs/stat-armour-plated`, 192 blocks per level, `plated`, the four probe minds.

| Level | Bouts | Win % [95 %] | Left / right % | Margin [95 %] | d | vs control [95 %] | d | Draws | Seconds | Dealt | Taken |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| x0.50 | 384 | 47.8 [42.4, 53.3] | 47.1 / 48.4 | -0.021 [-0.067, 0.029] | -0.06 | -0.015 [-0.019, -0.011] | -0.49 | 1 | 26.1 | 7.25 | 7.49 |
| x0.75 | 384 | 48.6 [43.5, 54.0] | 48.2 / 49.0 | -0.012 [-0.058, 0.037] | -0.03 | -0.006 [-0.008, -0.003] | -0.32 | 1 | 26.1 | 7.29 | 7.41 |
| x1.00 (control) | 384 | 48.6 [43.4, 53.9] | 48.2 / 49.0 | -0.006 [-0.052, 0.043] | -0.02 | -- | -- | 1 | 26.2 | 7.30 | 7.36 |
| x1.25 | 384 | 48.8 [43.6, 54.3] | 48.7 / 49.0 | 0.001 [-0.046, 0.050] | 0.00 | 0.007 [0.005, 0.009] | 0.41 | 1 | 26.2 | 7.32 | 7.28 |
| x1.50 | 384 | 50.7 [45.4, 56.1] | 50.3 / 51.0 | 0.012 [-0.035, 0.061] | 0.03 | 0.018 [0.013, 0.024] | 0.48 | 1 | 26.3 | 7.36 | 7.13 |
| x2.00 | 384 | 52.0 [46.7, 57.4] | 51.8 / 52.1 | 0.027 [-0.019, 0.076] | 0.08 | 0.033 [0.027, 0.041] | 0.65 | 1 | 26.7 | 7.42 | 6.99 |

`research/runs/stat-armour-skeleton`, 192 blocks per level, `skeleton-warrior` with the skeleton duelist on both sides.

| Level | Bouts | Win % [95 %] | Left / right % | Margin [95 %] | d | vs control [95 %] | d | Draws | Seconds | Dealt | Taken |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| x0.50 | 384 | 32.3 [27.9, 37.2] | 33.9 / 30.7 | -0.195 [-0.251, -0.141] | -0.49 | -0.212 [-0.246, -0.181] | -0.94 | 0 | 50.1 | 1.49 | 2.23 |
| x0.75 | 384 | 39.1 [34.4, 44.0] | 41.1 / 37.0 | -0.110 [-0.167, -0.055] | -0.28 | -0.126 [-0.149, -0.104] | -0.79 | 0 | 54.1 | 1.65 | 2.08 |
| x1.00 (control) | 384 | 50.3 [45.1, 55.2] | 54.7 / 45.8 | 0.017 [-0.039, 0.071] | 0.04 | -- | -- | 0 | 59.5 | 1.89 | 1.89 |
| x1.25 | 384 | 64.8 [59.9, 69.5] | 66.1 / 63.5 | 0.191 [0.141, 0.239] | 0.56 | 0.174 [0.150, 0.199] | 0.99 | 0 | 63.8 | 2.12 | 1.52 |
| x1.50 | 384 | 84.9 [81.3, 88.3] | 83.9 / 85.9 | 0.378 [0.339, 0.415] | 1.41 | 0.361 [0.327, 0.396] | 1.48 | 0 | 65.6 | 2.32 | 1.10 |
| x2.00 | 384 | 97.1 [95.3, 98.7] | 95.3 / 99.0 | 0.581 [0.554, 0.608] | 3.12 | 0.564 [0.521, 0.607] | 1.90 | 0 | 66.3 | 2.44 | 0.62 |

| Level | Knockdowns | Other's knockdowns | Time down % | Other's time down % |
| --- | ---: | ---: | ---: | ---: |
| x0.50 | 3.95 | 3.86 | 22.6 | 22.0 |
| x0.75 | 4.34 | 4.28 | 23.2 | 22.8 |
| x1.00 | 4.90 | 4.79 | 23.9 | 23.5 |
| x1.25 | 5.17 | 5.39 | 23.6 | 24.6 |
| x1.50 | 5.34 | 5.72 | 23.8 | 25.6 |
| x2.00 | 5.42 | 5.91 | 23.9 | 25.9 |

**On stone the stat is flat**, from 47.8 % at x0.5 to 50.0 % at x2, inside the null at every
level. The damage it takes falls by only 0.5 % at x2 (7.68 to 7.64), although a blow on its core
falls by 11 %. So almost none of what stone takes lands on its core or head. The pelvis, legs and
arms carry no armour, and no setting gives them any.

**On `plated` it moves, but only a little**: 47.8 % to 52.0 %, with damage taken falling by 5 % at
x2 (7.36 to 6.99). A blow on its core falls by half at that level. `plated` differs from stone
only in its torso.

**On the skeleton it decides the fight.** 32.3 % at x0.5, 39.1 % at x0.75, 64.8 % at x1.25,
84.9 % at x1.5 and 97.1 % at x2, with a paired d of 1.90 against the control at x2. This is the
largest effect of any stat so far, and it is a body whose every part carries 0.5 against a cut and
0.6 against a thrust (`SKELETON_ARMOUR`, stamped on every part), facing a blade. The fights also
run longer as the modified side gets harder to hurt (59.5 s to 66.3 s), and both sides are knocked
down more often, from 4.9 and 4.8 a bout at x1 to 5.4 and 5.9 at x2. That is more fight, not a different one: the share of the bout spent down does not move.

**The range is the swept one, x0.5 to x2.** No level is unsafe: nothing physical moves, and the
cap keeps every blow landing. How much of the skeleton's slope a fair fight wants is a balance call
and is left to the owner.

**Would scaling the share that passes through do better?** Plan 08 names one alternative: armour
at stat r is 1 - (1 - a)^r. It does not rescue stone. Its core's 0.10 becomes 0.19 at x2 rather
than 0.20, and its bare parts stay bare, because 1 - 1^r is 0. What it would change is thick
armour above x1. It grows more slowly there and never reaches 1, so it needs no cap:

| Fraction at x1 | Rule | x0.50 | x0.75 | x1.25 | x1.50 | x2.00 |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 0.10 (stone core) | times r, capped | 0.050 | 0.075 | 0.125 | 0.150 | 0.200 |
| | pass-through | 0.051 | 0.076 | 0.123 | 0.146 | 0.190 |
| 0.50 (skeleton cut) | times r, capped | 0.250 | 0.375 | 0.625 | 0.750 | 0.900 |
| | pass-through | 0.293 | 0.405 | 0.580 | 0.646 | 0.750 |
| 0.60 (skeleton thrust) | times r, capped | 0.300 | 0.450 | 0.750 | 0.900 | 0.900 |
| | pass-through | 0.368 | 0.497 | 0.682 | 0.747 | 0.840 |

At x2 a skeleton's cut would land a quarter of each blow rather than a tenth. The skeleton's slope
should be gentler under that rule, and stone's the same, but neither has been swept.

What makes stone flat is the owner's rule that a part with no armour gets none. Making armour
count on stone means giving bare parts some, for example a floor the stat adds to every part. That
changes the rule, so it is the owner's decision.

The x1.00 rows reproduce the earlier controls: 48.8 % on stone, 48.6 % on `plated` and 50.3 % on
the skeleton.

## Toughness (session 09)

**The knob.** `Golem.register` in `src/golem/golem.ts` multiplies every body part's `health` and
`maxHealth` by the stat. That is the one place a golem's parts get their health. A piece that
parries is left alone: the test is the one that files it in `shields`, `part.shield` or
`combatRole === "equipment"`, which covers the blade, mace, maul, whip and plate. `limbFor` never
answers for such a piece, so it is never wounded, and its health belongs to the item rather than
the body.

**What follows by itself.** Everything measured against full health scales with it:

- the breaking point, `severMargin` of full health beyond zero, in `severs` in `src/scoring.ts`;
- ruin, at zero;
- wear's share, since `worn` multiplies the scaled health;
- the overtime drain, since `drain` in `src/bout.ts` takes a fraction of `maxHealth`.

The bar's weights are not touched. Where a blow lands matters exactly as much as it did.

### Bench

Node harness, `.review/toughness-bench.mjs`. Standard 0.5-point cuts go through
`Golem.applyDamage` on a standing golem. Each cell gives two counts: blows to ruin (zero health),
then blows to break off on the margin (`-severMargin x maxHealth`). A 10-point blow is larger than
every part's health here, which is why the blow is 0.5.

| Part | x0.50 | x0.75 | x1.00 | x1.25 | x1.50 | x2.00 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| stone core | 7 / 11 | 11 / 16 | 14 / 21 | 18 / 26 | 21 / 32 | 28 / 42 |
| stone head | 4 / 6 | 6 / 8 | 8 / 11 | 9 / 14 | 11 / 16 | 15 / 22 |
| stone pelvis | 7 / 10 | 10 / 15 | 13 / 19 | 16 / 24 | 19 / 29 | 25 / 38 |
| stone upper arm | 3 / 5 | 5 / 7 | 6 / 9 | 8 / 11 | 9 / 13 | 12 / 18 |
| skeleton core | 6 / 8 | 8 / 12 | 11 / 16 | 14 / 20 | 16 / 24 | 22 / 32 |
| skeleton head | 2 / 3 | 3 / 5 | 4 / 6 | 5 / 8 | 6 / 9 | 8 / 12 |
| skeleton pelvis | 5 / 7 | 7 / 10 | 9 / 13 | 11 / 17 | 13 / 20 | 18 / 26 |
| human core | 13 / 19 | 19 / 29 | 25 / 38 | 32 / 47 | 38 / 57 | 50 / 75 |
| human head | 7 / 11 | 11 / 16 | 14 / 21 | 17 / 26 | 21 / 31 | 27 / 41 |
| held blade, any build | 3 / 5 | 3 / 5 | 3 / 5 | 3 / 5 | 3 / 5 | 3 / 5 |

Both counts scale with the stat to within one blow. The blade is shown only to confirm it is left
alone: in a bout it is never wounded.

`toughness multiplies every body part's health, keeps wear's share and the bar's shape, and leaves
a held piece alone` in `tests/attributes.test.mjs` asserts this on stone and on the skeleton, each
with a worn torso. It checks every part's full health and worn share at both ends of the row, and
that the two parrying pieces are unchanged. It also runs the whole-body case. Each part loses the
share of its own x1 health that makes the weights sum to one. Those wounds empty the bar exactly at
x1, leave it at 1 - 1/level at x1.5 and x2, and empty it at x0.5.

### Sweep

`research/runs/stat-toughness`, 192 blocks per level, stone default, the four probe minds.

| Level | Bouts | Win % [95 %] | Left / right % | Margin [95 %] | d | vs control [95 %] | d | Draws | Seconds | Dealt | Taken |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| x0.50 | 384 | 16.8 [13.3, 20.8] | 19.8 / 13.8 | -0.368 [-0.412, -0.323] | -1.18 | -0.360 [-0.393, -0.329] | -1.59 | 1 | 17.5 | 4.47 | 4.78 |
| x0.75 | 384 | 32.2 [27.3, 37.2] | 34.9 / 29.4 | -0.186 [-0.234, -0.134] | -0.52 | -0.177 [-0.203, -0.154] | -1.01 | 3 | 24.3 | 6.29 | 6.52 |
| x0.90 | 384 | 42.6 [37.5, 47.8] | 44.8 / 40.4 | -0.074 [-0.123, -0.021] | -0.21 | -0.066 [-0.080, -0.051] | -0.64 | 1 | 26.9 | 7.20 | 7.32 |
| x1.00 (control) | 384 | 48.8 [43.6, 54.3] | 51.0 / 46.6 | -0.008 [-0.057, 0.043] | -0.02 | -- | -- | 1 | 28.1 | 7.60 | 7.68 |
| x1.10 | 384 | 54.0 [49.0, 59.4] | 56.3 / 51.8 | 0.043 [-0.005, 0.093] | 0.13 | 0.052 [0.043, 0.062] | 0.77 | 1 | 29.4 | 7.94 | 8.13 |
| x1.25 | 384 | 60.4 [55.5, 65.6] | 63.5 / 57.3 | 0.123 [0.077, 0.171] | 0.37 | 0.132 [0.112, 0.153] | 0.91 | 0 | 30.7 | 8.38 | 8.50 |
| x1.50 | 384 | 72.4 [68.0, 77.1] | 76.6 / 68.2 | 0.231 [0.188, 0.275] | 0.74 | 0.239 [0.214, 0.266] | 1.35 | 0 | 32.5 | 9.02 | 9.11 |
| x2.00 | 384 | 84.6 [80.7, 88.5] | 89.1 / 80.2 | 0.391 [0.355, 0.427] | 1.49 | 0.399 [0.367, 0.433] | 1.78 | 0 | 34.4 | 9.63 | 9.73 |

| Level | Knockdowns | Other's knockdowns | Time down % | Other's time down % |
| --- | ---: | ---: | ---: | ---: |
| x0.50 | 2.99 | 3.13 | 14.2 | 14.1 |
| x0.75 | 4.19 | 4.24 | 14.9 | 14.4 |
| x0.90 | 4.66 | 4.68 | 14.9 | 14.5 |
| x1.00 | 4.89 | 4.96 | 15.1 | 14.5 |
| x1.10 | 5.15 | 5.13 | 15.6 | 14.4 |
| x1.25 | 5.45 | 5.36 | 15.7 | 14.4 |
| x1.50 | 5.81 | 5.72 | 15.9 | 14.7 |
| x2.00 | 6.23 | 6.09 | 16.3 | 14.7 |

| Level | Severed | Other's severed |
| --- | ---: | ---: |
| x0.50 | 0.98 | 0.19 |
| x0.75 | 0.77 | 0.35 |
| x0.90 | 0.65 | 0.46 |
| x1.00 | 0.51 | 0.53 |
| x1.10 | 0.45 | 0.58 |
| x1.25 | 0.39 | 0.65 |
| x1.50 | 0.26 | 0.74 |
| x2.00 | 0.13 | 0.85 |

`research/runs/stat-toughness-skeleton`, 192 blocks per level, `skeleton-warrior` with the skeleton duelist on both sides.

| Level | Bouts | Win % [95 %] | Left / right % | Margin [95 %] | d | vs control [95 %] | d | Draws | Seconds | Dealt | Taken |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| x0.50 | 384 | 22.1 [18.2, 26.0] | 25.5 / 18.8 | -0.362 [-0.416, -0.309] | -0.94 | -0.379 [-0.425, -0.337] | -1.25 | 0 | 41.0 | 1.19 | 1.29 |
| x0.75 | 384 | 35.9 [31.5, 40.6] | 38.5 / 33.3 | -0.151 [-0.206, -0.097] | -0.38 | -0.167 [-0.194, -0.141] | -0.90 | 0 | 52.9 | 1.59 | 1.62 |
| x1.00 (control) | 384 | 50.3 [45.1, 55.2] | 54.7 / 45.8 | 0.017 [-0.039, 0.071] | 0.04 | -- | -- | 0 | 59.5 | 1.89 | 1.89 |
| x1.25 | 384 | 63.5 [58.6, 68.5] | 65.6 / 61.5 | 0.172 [0.121, 0.219] | 0.49 | 0.155 [0.135, 0.177] | 1.02 | 0 | 63.3 | 2.10 | 1.95 |
| x1.50 | 384 | 75.0 [70.8, 79.2] | 72.9 / 77.1 | 0.291 [0.246, 0.334] | 0.93 | 0.274 [0.245, 0.304] | 1.32 | 0 | 65.0 | 2.23 | 1.97 |
| x2.00 | 384 | 87.8 [84.4, 90.9] | 87.0 / 88.5 | 0.430 [0.393, 0.467] | 1.66 | 0.414 [0.378, 0.448] | 1.70 | 0 | 65.9 | 2.35 | 1.95 |

| Level | Knockdowns | Other's knockdowns | Time down % | Other's time down % |
| --- | ---: | ---: | ---: | ---: |
| x0.50 | 3.19 | 3.09 | 21.7 | 20.8 |
| x0.75 | 4.17 | 4.13 | 23.0 | 22.6 |
| x1.00 | 4.90 | 4.79 | 23.9 | 23.5 |
| x1.25 | 5.17 | 5.29 | 23.8 | 24.5 |
| x1.50 | 5.28 | 5.55 | 23.8 | 25.1 |
| x2.00 | 5.35 | 5.77 | 23.9 | 25.7 |

| Level | Severed | Other's severed |
| --- | ---: | ---: |
| x0.50 | 1.10 | 0.33 |
| x0.75 | 0.80 | 0.46 |
| x1.00 | 0.59 | 0.57 |
| x1.25 | 0.37 | 0.70 |
| x1.50 | 0.24 | 0.77 |
| x2.00 | 0.11 | 0.85 |

**The largest effect of any stat on stone, and the first whose gain there matches its cost.**
Stone runs from 16.8 % at x0.5 to 84.6 % at x2, roughly 32 points down and 36 up; the skeleton
from 22.1 % to 87.8 %. The slope is monotone at every level in both builds, and it holds in every
mind pair: every row of stone's mind table is higher at x2 than at x0.5.

**Bouts get longer at both ends, as the plan expected.** On stone, 17.5 s at x0.5 and 34.4 s at
x2, against 28.1 s. More of a longer fight is spent exchanging, so both corners go down more often
(4.9 to 6.2 a bout). The share of the bout spent down barely moves (15.1 % to 16.3 %).

**Modules lost move in opposite directions for the two corners.** At x0.5 the modified corner
loses 0.98 modules a bout and its opponent 0.19; at x2, 0.13 and 0.85. The breaking point scales
with full health, so a tough limb comes off late or not at all. The worker counts this from each
body's own `moduleReport`, and `the worker counts the modules each corner lost and the real blows
it landed, each from that corner's own record` in `tests/research-physical.test.mjs` pins it
against a control bout.

**No level reaches the cap.** Every bout at every level in both builds ended `exhausted`, with no
draws. The longest were 114.8 s (stone) and 111.7 s (skeleton), under the 150 s harness cap and the
ramp's 120 s. Toughness keeps more fights running into overtime: 9 of 384 stone bouts at x0.5 and
56 at x2 passed 60 s, and 75 and 274 of the skeleton's. There the drain takes the same share of
each body's full health, so overtime ends a tough body as surely as any other.

**The range is the swept one, x0.5 to x2.** Nothing physical moves, and every fight still ends.

The x1.00 rows reproduce the earlier controls: 48.8 % on stone and 50.3 % on the skeleton.

## Arm speed (session 10)

**The knob.** `withArmSpeed` in `src/golem/attributes.ts` hands each arm chain a per-build copy of
its table with the named rate limits multiplied by the stat. At x1 it returns the table it was
handed. The rates are:

- the reach anchor's `anchorRate`, in `buildArmCore`, which every point chain -- reach, wrist and
  skeletal -- is built on;
- the wrist's `rollRate` and `bendRate`, in `wristChainFrom`, both where the envelope publishes them
  and where `slewTowards` spends them;
- the pitch hinge's `targetRate`. The plan had `pitchChain` refactored to take its table as an
  argument first, but `build` already binds `P` inside itself, so the per-build copy went there and
  no refactor was needed;
- each coordinate of the anatomical arm's `RATES`, in `src/golem/humanoid/arm.ts`. Its +-8 clamp on
  a drive target is a bound on the command, not a rate, and is left alone.

Force ceilings are not scaled. On these chains the rate shapes a commanded move and the force
ceiling does not (AGENTS.md, "On a low-axis chain the anchor's *rate limit* shapes a commanded
move"). The torso's twist and lean and the neck are the torso's and the head's, not the arm's.

**What does not follow.** No mind reads a published rate. Every stroke is still timed by
`GOLEM_TACTICS` at the arm the tactics were tuned on, so a faster arm runs the same stroke clock,
and the gain saturates once the command moves slower than the arm could.

`arm speed multiplies every arm chain's published rates and the rate its command travels at` in
`tests/attributes.test.mjs` builds each of the five arm chains at x1 and x2, and checks that every
published rate doubles. It also checks that the commanded travel over six substeps doubles on every
axis: exactly on an angle, and to within a few per cent on a point chain's swing, lift and reach,
which are read off an anchor moving in a straight line. The wrist and the anatomical arm each hold
the rate in two places, and the test mutates red on either one alone.

### Bench

Node harness, `runStrokeBench` in `tests/harness/golem-bench.mjs` with the shipped cut, one run a
cell (`.review/armspeed-bench.mjs`). The columns are:

- the peak driven tip speed, m/s;
- the speed at the mark, m/s;
- the peak anchor stray in the stroke window, mm -- the reading the 50 mm bar in
  `tests/golem-bench.test.mjs` uses;
- the lag, the stroke readout's peak tip error, mm.

| Chain | Level | Tip peak | At mark | Stray | Lag |
| --- | ---: | ---: | ---: | ---: | ---: |
| wrist blade | x0.75 | 14.7 | 12.7 | 32.1 | 416.6 |
| | x1.00 | 18.1 | 15.5 | 37.9 | 314.9 |
| | x1.25 | 21.1 | 14.2 | 38.5 | 396.5 |
| | x1.50 | 23.6 | 14.3 | 38.1 | 371.7 |
| | x2.00 | 23.9 | 14.3 | 38.0 | 417.1 |
| | x2.50 | 23.9 | 14.4 | 37.9 | 435.6 |
| wrist mace | x0.75 | 28.8 | 27.8 | 284.4 | 1433.2 |
| | x1.00 | 31.9 | 29.5 | 297.5 | 1345.3 |
| | x1.50 | 32.8 | 30.0 | 289.2 | 1313.3 |
| | x2.50 | 32.8 | 29.8 | 301.6 | 1359.3 |
| wrist maul | x0.75 | 17.5 | 10.7 | 190.6 | 1305.4 |
| | x1.00 | 17.3 | 12.1 | 209.9 | 1294.6 |
| | x1.50 | 18.1 | 10.8 | 179.3 | 1300.1 |
| | x2.50 | 17.8 | 12.2 | 198.1 | 1357.1 |
| wrist plate | any | 6.1 | 2.5 | 7.7 | 192 to 217 |
| skeletal blade | x0.75 | 17.0 | 12.2 | 45.7 | 225.6 |
| | x1.00 | 17.6 | 11.8 | 46.5 | 200.7 |
| | x1.50 | 17.5 | 11.9 | 46.4 | 222.9 |
| | x2.50 | 17.5 | 11.9 | 46.6 | 268.9 |
| anatomical blade | x0.75 | 9.2 | 6.4 | 61.9 | 665.0 |
| | x1.00 | 11.1 | 8.8 | 77.3 | 1169.0 |
| | x1.25 | 12.1 | 12.1 | 107.8 | 1415.6 |
| | x1.50 | 13.6 | 13.4 | 149.3 | 1719.8 |
| | x2.00 | 13.4 | 13.3 | 170.8 | 1595.9 |
| | x2.50 | 12.0 | 12.0 | 227.7 | 1416.7 |
| pitch blade | x0.75 | 12.4 | 9.4 | -- | 161.5 |
| | x1.00 | 15.5 | 11.7 | -- | 287.8 |
| | x1.25 | 18.4 | 18.4 | -- | 437.2 |
| | x1.50 | 19.7 | 19.7 | -- | 643.5 |
| | x2.00 | 15.5 | 8.7 | -- | 742.6 |
| | x2.50 | 12.4 | 3.7 | -- | 860.3 |
| reach blade | x0.75 | 11.4 | 10.4 | 10.6 | 233.6 |
| | x1.00 and up | 14.7 | 12.8 | 13.7 | 255.9 to 507.7 |

The committed sword shape (`COMMITTED_SHAPE_CANDIDATES.sword`) is the one the test actually holds
under 50 mm. Its stray is flat at every level from x1 to x2.5: 32.6 to 31.7 mm on the wrist and
16.2 to 16.7 on the skeletal arm. Its wrist tip peak goes from 16.7 to 17.9 m/s and stops there.

**Why x1.5.** The plan's rule was the highest level at which every combination stays under 50 mm of
stray, and it cannot be applied as written. The mace, the maul and the anatomical arm are over it
already at x1, and flat, while the shape the bar actually guards stays under it everywhere. What the
bar was written to catch is an arm that stops following its command, and two readings show that:

- **The pitch hinge.** It arrives at its mark at 19.7 m/s at x1.5, then at 8.7 at x2 and 3.7 at
  x2.5, while its lag keeps growing.
- **The wrist blade.** Its peak is spent by x1.5: 23.6, then 23.9 at every level above.

So x1.5 is the last level at which every chain still gains. The anatomical arm is the known cost
inside that range. Its stray grows at every step above x1 (77 to 108 to 149 mm), although its tip
speed still rises (11.1 to 13.6 m/s).

### Sweep

`research/runs/stat-armSpeed`, 192 blocks per level, stone default, the four probe minds.

| Level | Bouts | Win % [95 %] | Left / right % | Margin [95 %] | d | vs control [95 %] | d | Draws | Seconds | Dealt | Taken |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| x0.50 | 384 | 15.5 [11.5, 19.9] | 13.5 / 17.4 | -0.466 [-0.512, -0.416] | -1.39 | -0.458 [-0.519, -0.396] | -1.03 | 1 | 36.7 | 3.95 | 9.17 |
| x0.75 | 384 | 29.2 [24.2, 34.4] | 32.8 / 25.5 | -0.221 [-0.267, -0.172] | -0.65 | -0.213 [-0.270, -0.158] | -0.53 | 0 | 33.8 | 5.92 | 8.78 |
| x0.90 | 384 | 37.8 [32.8, 43.0] | 38.5 / 37.0 | -0.095 [-0.142, -0.045] | -0.28 | -0.086 [-0.141, -0.030] | -0.22 | 0 | 29.4 | 7.09 | 8.27 |
| x1.00 (control) | 384 | 48.8 [43.6, 54.3] | 51.0 / 46.6 | -0.008 [-0.057, 0.043] | -0.02 | -- | -- | 1 | 28.1 | 7.60 | 7.68 |
| x1.10 | 384 | 51.8 [46.9, 56.9] | 52.3 / 51.3 | 0.059 [0.011, 0.110] | 0.17 | 0.068 [0.005, 0.129] | 0.16 | 2 | 25.3 | 7.79 | 7.19 |
| x1.25 | 384 | 62.4 [57.0, 67.4] | 65.1 / 59.6 | 0.126 [0.076, 0.176] | 0.36 | 0.134 [0.072, 0.195] | 0.31 | 1 | 25.6 | 8.26 | 6.61 |
| x1.50 | 384 | 65.0 [60.0, 70.4] | 60.9 / 69.0 | 0.150 [0.098, 0.206] | 0.39 | 0.158 [0.094, 0.222] | 0.35 | 1 | 25.8 | 8.35 | 6.40 |
| x2.00 | 384 | 66.4 [61.5, 71.4] | 67.7 / 65.1 | 0.187 [0.136, 0.238] | 0.52 | 0.195 [0.130, 0.259] | 0.42 | 0 | 28.8 | 8.90 | 6.01 |
| x2.50 | 384 | 70.3 [65.1, 75.5] | 68.8 / 71.9 | 0.260 [0.201, 0.319] | 0.61 | 0.268 [0.197, 0.338] | 0.53 | 0 | 27.6 | 8.94 | 5.53 |

Win % of the modified corner by mind pair, modified mind first:

| Minds | x0.50 | x0.75 | x0.90 | x1.00 | x1.10 | x1.25 | x1.50 | x2.00 | x2.50 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| golem-brawler vs golem-brawler | 54.2 | 41.7 | 41.7 | 45.8 | 54.2 | 66.7 | 62.5 | 58.3 | 29.2 |
| golem-brawler vs golem-champion | 29.2 | 29.2 | 25.0 | 25.0 | 41.7 | 41.7 | 50.0 | 50.0 | 50.0 |
| golem-brawler vs golem-duelist | 29.2 | 33.3 | 50.0 | 41.7 | 45.8 | 75.0 | 33.3 | 70.8 | 79.2 |
| golem-brawler vs golem-miser | 14.6 | 58.3 | 54.2 | 79.2 | 52.1 | 29.2 | 70.8 | 54.2 | 62.5 |
| golem-champion vs golem-brawler | 29.2 | 45.8 | 50.0 | 62.5 | 62.5 | 75.0 | 54.2 | 79.2 | 95.8 |
| golem-champion vs golem-champion | 0.0 | 12.5 | 29.2 | 52.1 | 45.8 | 70.8 | 58.3 | 70.8 | 54.2 |
| golem-champion vs golem-duelist | 0.0 | 20.8 | 20.8 | 41.7 | 66.7 | 58.3 | 45.8 | 45.8 | 41.7 |
| golem-champion vs golem-miser | 12.5 | 58.3 | 75.0 | 79.2 | 75.0 | 91.7 | 95.8 | 87.5 | 95.8 |
| golem-duelist vs golem-brawler | 33.3 | 16.7 | 33.3 | 41.7 | 56.3 | 58.3 | 81.3 | 66.7 | 75.0 |
| golem-duelist vs golem-champion | 0.0 | 16.7 | 12.5 | 41.7 | 66.7 | 58.3 | 58.3 | 83.3 | 70.8 |
| golem-duelist vs golem-duelist | 0.0 | 20.8 | 41.7 | 45.8 | 45.8 | 54.2 | 54.2 | 41.7 | 58.3 |
| golem-duelist vs golem-miser | 4.2 | 58.3 | 66.7 | 83.3 | 66.7 | 83.3 | 100.0 | 75.0 | 83.3 |
| golem-miser vs golem-brawler | 37.5 | 16.7 | 29.2 | 41.7 | 45.8 | 43.8 | 66.7 | 54.2 | 79.2 |
| golem-miser vs golem-champion | 0.0 | 0.0 | 20.8 | 25.0 | 33.3 | 54.2 | 58.3 | 58.3 | 75.0 |
| golem-miser vs golem-duelist | 0.0 | 0.0 | 8.3 | 37.5 | 29.2 | 70.8 | 54.2 | 83.3 | 75.0 |
| golem-miser vs golem-miser | 4.2 | 37.5 | 45.8 | 37.5 | 41.7 | 66.7 | 95.8 | 83.3 | 100.0 |

| Level | Knockdowns | Other's knockdowns | Time down % | Other's time down % |
| --- | ---: | ---: | ---: | ---: |
| x0.50 | 5.68 | 3.09 | 13.9 | 9.2 |
| x0.75 | 5.39 | 4.53 | 15.0 | 13.7 |
| x0.90 | 5.24 | 4.77 | 16.1 | 14.7 |
| x1.00 | 4.89 | 4.96 | 15.1 | 14.5 |
| x1.10 | 4.54 | 4.72 | 15.2 | 15.7 |
| x1.25 | 4.49 | 4.75 | 15.5 | 16.2 |
| x1.50 | 4.22 | 4.93 | 15.6 | 18.3 |
| x2.00 | 4.18 | 4.96 | 14.4 | 18.0 |
| x2.50 | 3.72 | 4.76 | 13.5 | 17.3 |

| Level | Severed | Other's severed |
| --- | ---: | ---: |
| x0.50 | 0.86 | 0.16 |
| x0.75 | 0.74 | 0.25 |
| x0.90 | 0.64 | 0.38 |
| x1.00 | 0.51 | 0.53 |
| x1.10 | 0.54 | 0.52 |
| x1.25 | 0.41 | 0.62 |
| x1.50 | 0.39 | 0.70 |
| x2.00 | 0.35 | 0.87 |
| x2.50 | 0.38 | 0.84 |

Contacts a bout, and the share of them above the weapon's energy floor (the runner's `weak` rule):

| Level | Contacts | Other's contacts | Real blows % | Other's real blows % |
| --- | ---: | ---: | ---: | ---: |
| x0.50 | 197.1 | 221.5 | 45.5 | 42.4 |
| x0.75 | 199.2 | 199.9 | 46.0 | 43.2 |
| x0.90 | 184.5 | 184.2 | 45.8 | 42.4 |
| x1.00 | 179.3 | 181.8 | 45.8 | 45.9 |
| x1.10 | 156.1 | 164.0 | 46.4 | 46.1 |
| x1.25 | 153.1 | 157.1 | 43.3 | 45.8 |
| x1.50 | 151.1 | 150.3 | 41.9 | 44.5 |
| x2.00 | 148.7 | 151.9 | 41.4 | 43.2 |
| x2.50 | 154.3 | 141.4 | 41.8 | 43.1 |

`research/runs/stat-armSpeed-skeleton`, 192 blocks per level, `skeleton-warrior` with the skeleton
duelist on both sides.

| Level | Bouts | Win % [95 %] | Left / right % | Margin [95 %] | d | vs control [95 %] | d | Draws | Seconds | Dealt | Taken |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| x0.50 | 384 | 3.4 [1.6, 5.2] | 3.1 / 3.6 | -0.617 [-0.648, -0.583] | -2.73 | -0.633 [-0.697, -0.568] | -1.39 | 0 | 62.7 | 0.61 | 2.51 |
| x0.75 | 384 | 17.4 [14.1, 21.1] | 19.8 / 15.1 | -0.369 [-0.409, -0.329] | -1.28 | -0.386 [-0.452, -0.320] | -0.81 | 0 | 63.5 | 1.20 | 2.33 |
| x1.00 (control) | 384 | 50.3 [45.1, 55.2] | 54.7 / 45.8 | 0.017 [-0.039, 0.071] | 0.04 | -- | -- | 0 | 59.5 | 1.89 | 1.89 |
| x1.25 | 384 | 71.4 [66.7, 76.0] | 74.0 / 68.8 | 0.244 [0.191, 0.295] | 0.66 | 0.227 [0.150, 0.304] | 0.42 | 0 | 56.2 | 2.21 | 1.44 |
| x1.50 | 384 | 77.9 [73.7, 82.0] | 78.6 / 77.1 | 0.379 [0.327, 0.430] | 1.04 | 0.362 [0.286, 0.438] | 0.67 | 0 | 52.9 | 2.43 | 1.20 |
| x2.00 | 384 | 78.4 [74.0, 82.6] | 81.8 / 75.0 | 0.377 [0.319, 0.431] | 0.95 | 0.360 [0.286, 0.434] | 0.69 | 0 | 54.5 | 2.39 | 1.17 |
| x2.50 | 384 | 80.2 [76.0, 84.1] | 79.2 / 81.3 | 0.418 [0.366, 0.466] | 1.15 | 0.401 [0.325, 0.475] | 0.76 | 0 | 53.3 | 2.45 | 1.09 |

| Level | Knockdowns | Other's knockdowns | Time down % | Other's time down % |
| --- | ---: | ---: | ---: | ---: |
| x0.50 | 5.32 | 3.57 | 24.6 | 16.3 |
| x0.75 | 5.28 | 4.51 | 24.0 | 20.6 |
| x1.00 | 4.90 | 4.79 | 23.9 | 23.5 |
| x1.25 | 4.46 | 5.32 | 22.7 | 27.1 |
| x1.50 | 3.84 | 4.92 | 20.8 | 27.3 |
| x2.00 | 3.80 | 4.66 | 20.3 | 25.3 |
| x2.50 | 3.66 | 4.72 | 19.8 | 25.8 |

| Level | Severed | Other's severed |
| --- | ---: | ---: |
| x0.50 | 0.97 | 0.04 |
| x0.75 | 0.79 | 0.15 |
| x1.00 | 0.59 | 0.57 |
| x1.25 | 0.35 | 0.84 |
| x1.50 | 0.29 | 1.03 |
| x2.00 | 0.27 | 1.05 |
| x2.50 | 0.25 | 1.08 |

| Level | Contacts | Other's contacts | Real blows % | Other's real blows % |
| --- | ---: | ---: | ---: | ---: |
| x0.50 | 192.7 | 231.2 | 9.6 | 11.5 |
| x0.75 | 208.6 | 228.2 | 11.0 | 11.6 |
| x1.00 | 191.8 | 189.9 | 12.9 | 13.0 |
| x1.25 | 180.7 | 159.6 | 14.2 | 14.5 |
| x1.50 | 170.4 | 135.9 | 14.4 | 15.3 |
| x2.00 | 170.5 | 133.3 | 14.3 | 15.7 |
| x2.50 | 169.5 | 132.6 | 14.5 | 15.8 |

**Steep below x1 and flat above x1.5 in both builds.** The x0.5 stone body wins 15.5 % and deals
3.95 a bout against 9.17 taken. The x0.5 skeleton wins 3.4 %. Upward, stone reaches 62.4 % at x1.25,
then 65.0 %, 66.4 % and 70.3 %; the skeleton reaches 71.4 % at x1.25, then 77.9 %, 78.4 % and
80.2 %. The fixed stroke clock is the likely reason for the flattening: once a stroke's command
moves slower than the arm could, a faster arm has nothing left to buy.

**The contact columns do not flatter a faster arm here.** A faster arm lands fewer contacts on stone
(179.3 a bout at x1, 151.1 at x1.5), and fewer of them are real blows (45.8 % to 41.9 %). On the
skeleton the share rises a little (12.9 % to 14.4 %) and stops at x1.5. Neither body shows the flung
blade's signature of more, faster, weaker contacts.

**The per-mind split is uneven.** On stone the duelist's own mirror gains least, 45.8 % at x1 to
54.2 % at x1.5, and the miser's the most, 37.5 % to 95.8 %. Whether that follows how each mind
times its strokes has not been measured.

The x1.00 rows reproduce the earlier controls: 48.8 % on stone and 50.3 % on the skeleton.
