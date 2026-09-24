# Attribute measurements

What each golem stat does, measured. One section per stat, in the order the plan set
(`docs/plans/2026-09-23-attributes-00-overview.md`, deleted once it landed; in git at fd4285a) lands
them, each with its bench table and its bout sweep. The same tables sit in the stat's row doc
comment in `src/golem/attributes.ts`.

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

#### The pitch hinge and the human arm

Two arms the bench flagged, swept the same way from a snapshot of the tree at session 10, 192 blocks
a level. The `pitch-blade` build is played by the four probe minds, and the `human-warrior` mirror by
`humanoid-duelist`. Raw reports are in `research/runs/stat-armSpeed-pitch.log` and
`research/runs/stat-armSpeed-human.log`.

| Level | Pitch win % [95 %] | Pitch d vs control | Pitch dealt / taken | Human win % [95 %] | Human draws | Human dealt / taken |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| x0.50 | 25.7 [20.8, 30.6] | -0.66 | 3.48 / 5.41 | 24.9 [22.5, 27.2] | 191 | 0.00 / 0.07 |
| x0.75 | 36.2 [31.0, 41.4] | -0.31 | 4.04 / 5.09 | 36.5 [34.1, 38.8] | 256 | 0.02 / 0.08 |
| x1.00 (control) | 49.3 [44.0, 54.8] | -- | 4.95 / 4.98 | 49.7 [45.8, 53.8] | 122 | 0.10 / 0.10 |
| x1.25 | 51.2 [46.2, 56.1] | 0.06 | 5.02 / 4.85 | 51.0 [46.4, 55.5] | 66 | 0.20 / 0.13 |
| x1.50 | 52.6 [46.7, 58.1] | 0.05 | 5.23 / 4.99 | 48.7 [44.1, 53.4] | 74 | 0.21 / 0.18 |
| x2.00 | 20.3 [16.4, 24.5] | -0.86 | 2.85 / 5.44 | 43.6 [39.3, 48.3] | 63 | 0.17 / 0.19 |
| x2.50 | 15.4 [11.6, 19.0] | -0.90 | 2.28 / 5.44 | 39.7 [35.3, 44.3] | 67 | 0.09 / 0.15 |

**The pitch hinge is flat from x1 to x1.5 and falls off a cliff at x2**, which is where the bench
found it stops following its command (19.7 m/s at its mark at x1.5, 8.7 at x2). A faster pitch arm
buys nothing inside the row. At x2 it deals 2.85 a bout against 4.95 at x1, and severs 0.19 of the
other body's modules against 0.46. So the x1.5 ceiling is the right one for this arm, and nothing
above it is safe.

**The human mirror barely fights, so it is a weak instrument.** Each of its 2688 bouts ends at
about 120 s, and blows decide none of them. The overtime drain (`drain` in `src/bout.ts`) empties
both bars until one reaches zero, and a tenth of a point of damage a bout is all that separates
them at x1. Its win rate therefore comes from the bar's last few thousandths, and its control is
lopsided by side, 60.7 % on the left against 38.8 % on the right. What it can show is the
direction:

- Below x1 the slow arm loses, 24.9 % at x0.5, in line with stone and the skeleton.
- Above x1 it gains nothing: 51.0 % at x1.25 and 48.7 % at x1.5.
- Its paired margin is a little worse at x1.5, d -0.32, but on margins under 0.002 of the bar.

The human's stroke stray from the bench (149 mm at x1.5) does not show up as a lost fight, because
this pairing hardly lands one. Neither sweep argues for a lower ceiling than x1.5. Both say nothing
above x1.25 pays.

## Weight (session 11)

**The knob.** `withWeight` in `src/golem/attributes.ts` hands a builder a per-build copy of its table
with the named masses multiplied by the stat: density at fixed geometry. At x1 it returns the table
it was handed. It goes where each builder reads its own masses:

- the biped's and the skeleton's pelvis, thighs, shins and feet; the multileg's chassis, femurs,
  shins and feet; the wheel's yoke and wheel;
- the torso's waist ball and core, and the head's neck and head;
- the reach core's collar, upper arm and forearm; the pitch hinge's link; the capped socket's cap;
- the anatomical arm's `MASSES`;
- the wrist's roll ring and wrist link, on their floors only. A cast link weighs
  `max(floor, carryRatio x load)`, and the load is an item's.

Every figure a builder derives from those fields follows by construction: the biped's `ownMassKg`,
the supported mass of the multileg and the wheel, and the capped socket's `impactMassKg`.

**What is not scaled.** Every terminal -- blade, fist, mace, maul, plate, whip -- the ram's plate
and the human shield are items, and items will carry their own stats. The solver's inertia floors
are not scaled either (`CHAIN_REACH.jointInertiaFloor`, `HUMAN_ARM_DRIVE.inertiaFloor`), and every
arm link of all three families sits on its floor at x1 and at x2 (`.review/weight-inertia.mjs`):
the stone upper arm goes from 2.41 kg to 4.83 at 0.300 kg m2 on each axis at both levels, and the
human upper arm from 2.80 to 5.60 at 0.015. **So weight moves an arm's linear mass and never its
rotational inertia**, which is most of why a stroke hardly notices it (below).

**Four readers of a module's mass that feed a fight** had to tell a body's mass from an item's:

- `ModuleDefinition.itemMassKg` (new, in `src/golem/module.ts`) is the item share of `massKg`: the
  terminal's mass on an effector, the ram's plate on a head, and zero elsewhere. `massKg` stays the
  x1 figure.
- `golemUpperMassKg` in `src/golem/build.ts` -- what the biped's `carry` holds up -- counts each
  module as `(massKg - itemMassKg) x weight + itemMassKg`. Its first draft read `itemMassKg` off
  the plan's bench option, which does not carry it, and so scaled the blade and the plate with the
  body. The test below caught it.
- `swingInertia` in `effectorModule`, the figure `GOLEM_TACTICS_V4` times a stroke against,
  multiplies the chain's share and not the terminal's.
- The ram's `impactMassKg` is 74 kg: its 21 kg plate with the neck and a hinge-mass of trunk behind
  it (`HEAD_RAM.impactMassKg`). The head scales everything but the plate.

`weight multiplies every body part's solver mass and no item's, and the carrier's load agrees` in
`tests/attributes.test.mjs` builds all twenty playable builds at x1 and at the row's ceiling, and
reads every part's solver mass back from Havok. An item keeps its mass exactly; a cast link reads
`max(floor x L, what it was)`; everything else is exactly x L. It also checks every striker's impact
mass, both hands' swing inertia, and that the carrier's `supportedMassKg` is its legs' solver mass
plus `golemUpperMassKg` wherever the module carries. A control asserts that items, a cast on its
floor, a cast on its load and three body blows were all seen. Every mutation in
`.review/mutate11.py` and `.review/mutate11b.py` turns it red except one: dropping the x1 early
return in `golemUpperMassKg`, which is arithmetic-equivalent and exists only to keep x1
bit-identical, which is the fingerprint's job.

**What the wheel and the multileg do not carry.** Neither has `carry`, so the upper body's mass has
never reached their stability divisor. That predates this session, and weight inherits it: the
multileg's supported mass is its legs and chassis alone, 44.6 kg against 102.3 kg of body.

### Bench

Whole bodies, Node harness, `.review/weight-bench.mjs body`: the golem's summed solver mass, the
carrier's `supportedMassKg`, the impulse its stability diagnostic says staggers and fells it
(`staggerAtMps` and `fallAtMps` times the supported mass, which session 06 checked against measured
shoves), and the primary hand's swing inertia.

| Build | Level | Body kg | Supported kg | Stagger N.s | Fall N.s | Swing kg m2 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| default | x0.50 | 48.6 | 46.3 | 0.42 | 0.97 | 3.374 |
| | x1.00 | 90.6 | 89.1 | 0.80 | 1.87 | 3.988 |
| | x1.50 | 132.8 | 131.8 | 1.19 | 2.77 | 4.602 |
| | x2.00 | 175.1 | 174.6 | 1.57 | 3.67 | 5.215 |
| skeleton-warrior | x0.50 | 18.4 | 16.0 | 0.19 | 0.45 | 1.703 |
| | x1.00 | 30.4 | 28.3 | 0.34 | 0.79 | 1.823 |
| | x2.00 | 54.3 | 53.0 | 0.64 | 1.48 | 2.064 |
| human-warrior | x0.50 | 58.1 | 58.1 | 0.52 | 1.22 | 2.004 |
| | x1.00 | 111.4 | 111.4 | 1.00 | 2.34 | 2.404 |
| | x2.00 | 218.1 | 218.1 | 1.96 | 4.58 | 3.204 |
| wheel | x0.50 | 61.9 | 29.8 | 0.13 | 0.29 | 3.374 |
| | x1.00 | 117.4 | 59.7 | 0.25 | 0.58 | 3.988 |
| | x2.00 | 228.6 | 119.3 | 0.50 | 1.17 | 5.215 |
| multileg | x0.50 | 54.4 | 22.3 | 0.35 | 0.81 | 3.374 |
| | x1.00 | 102.3 | 44.6 | 0.70 | 1.62 | 3.988 |
| | x2.00 | 198.5 | 89.2 | 1.39 | 3.25 | 5.215 |

The ram-capped build's ram lands with 11.99 kg at x1, 7.69 at x0.5 and 20.57 at x2, and each cap
with 0.57, 0.28 and 1.13.

**Weight is stability bought with mass rather than with a threshold.** The stagger and fall speeds
do not move; the mass under them does, so the impulse that staggers a body is linear in the stat.
The stability stat (session 06) moves the same reading by raising the speed at fixed mass. Weight
also moves what the body's own blows arrive with, but only where the striker is body: the ram and
the cap. A sword blow arrives with the sword's 1.30 kg at every level.

Arms, Node harness, `.review/weight-bench.mjs arm`, one run a cell. The rest columns are
`runGolemBench`'s default sequence, worst mark: arrival, s; overshoot; tip wander at rest, mm;
anchor stray, mm; peak driven tip speed, m/s. The stroke columns are `runStrokeBench` with the
shipped cut, as in the arm-speed table: tip peak and speed at the mark, m/s; stray and lag, mm.

| Chain | Level | Arrival | Overshoot | Wander | Rest stray | Rest tip | Stroke tip | At mark | Stroke stray | Lag |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| wrist blade | x0.50 | 2.892 | 0.0009 | 0.963 | 107.4 | 29.19 | 19.0 | 14.3 | 48.7 | 223.5 |
| | x1.00 | 2.892 | 0.0004 | 0.856 | 110.8 | 27.91 | 18.1 | 15.5 | 37.9 | 314.9 |
| | x1.50 | 2.896 | 0.0003 | 0.794 | 124.1 | 24.29 | 18.4 | 14.9 | 38.8 | 336.0 |
| | x2.00 | 2.896 | 0.0003 | 0.559 | 138.7 | 22.53 | 17.4 | 14.2 | 46.3 | 365.6 |
| wrist mace | x0.50 | 2.896 | 0.0045 | 1.387 | 201.7 | 20.50 | 32.0 | 29.5 | 285.5 | 1298.1 |
| | x1.00 | 2.896 | 0.0035 | 1.386 | 208.0 | 20.74 | 31.9 | 29.5 | 297.5 | 1345.3 |
| | x2.00 | 2.896 | 0.0021 | 1.170 | 209.2 | 15.80 | 31.8 | 29.1 | 311.7 | 1399.3 |
| wrist maul | x0.50 | -- | 0.0085 | -- | 122.1 | 6.79 | 18.6 | 14.8 | 228.8 | 1495.6 |
| | x1.00 | -- | 0.0108 | -- | 106.3 | 8.52 | 17.3 | 12.1 | 209.9 | 1294.6 |
| | x2.00 | -- | 0.0152 | -- | 100.1 | 5.88 | 16.9 | 16.3 | 252.9 | 1287.4 |
| wrist plate | x0.50 | 2.367 | 0.0006 | 1.098 | 106.5 | 9.85 | 5.8 | 2.6 | 15.6 | 179.6 |
| | x1.00 | 2.367 | 0.0002 | 1.099 | 127.1 | 9.34 | 6.1 | 2.5 | 7.7 | 208.0 |
| | x2.00 | 2.371 | 0.0001 | 0.838 | 169.1 | 8.67 | 5.9 | 2.7 | 5.5 | 223.7 |
| skeletal blade | x0.50 | 2.883 | 0.0057 | 0.934 | 114.3 | 31.63 | 17.9 | 10.6 | 59.4 | 308.9 |
| | x0.75 | 2.879 | 0.0014 | 1.134 | 103.3 | 30.56 | 19.0 | 11.8 | 59.9 | 190.3 |
| | x1.00 | 2.879 | 0.0010 | 1.050 | 96.0 | 30.29 | 17.6 | 11.8 | 46.5 | 200.7 |
| | x2.00 | 2.883 | 0.0004 | 0.833 | 98.8 | 28.95 | 17.0 | 10.9 | 44.6 | 151.9 |
| anatomical blade | x0.50 | 0.313 | 0.0098 | 1.431 | 120.1 | 11.61 | 12.2 | 9.8 | 77.3 | 1025.6 |
| | x1.00 | 0.362 | 0.0177 | 1.797 | 131.7 | 11.01 | 11.1 | 8.8 | 77.3 | 1169.0 |
| | x1.25 | 0.392 | 0.0499 | 3.627 | 138.5 | 10.56 | 11.0 | 8.9 | 83.0 | 1249.7 |
| | x1.50 | 0.387 | 0.0386 | 4.454 | 144.9 | 10.12 | 10.9 | 8.9 | 91.8 | 1298.0 |
| | x2.00 | 0.508 | 0.0269 | 4.739 | 158.1 | 9.27 | 11.0 | 9.8 | 104.5 | 1290.5 |
| pitch blade | x0.50 | 0.812 | 0.2853 | -- | -- | 16.55 | 16.5 | 15.7 | -- | 282.0 |
| | x0.75 | 0.350 | 0.1806 | 0.509 | -- | 15.82 | 15.7 | 12.8 | -- | 231.8 |
| | x1.00 | 0.283 | 0.1038 | 0.760 | -- | 15.42 | 15.5 | 11.7 | -- | 287.8 |
| | x2.00 | 0.250 | 0.1416 | 0.591 | -- | 14.59 | 14.6 | 11.4 | -- | 311.2 |

A wander of `--` is the bench's 0: `tipWanderMm` is gated on the tip being slower than 0.05 m/s,
so it means the tip never came to rest. On the maul the trailing grip keeps it moving at every
level; on the pitch hinge it is new at x0.5, and it is the hinge ringing. The maul's arrival is not
read, and the pitch hinge has no anchor to stray from.

**A stroke hardly notices.** From x0.5 to x2, no chain's stroke tip peak is more than 10 % from its
x1 figure (the largest is the anatomical arm's 12.2 m/s at x0.5 against 11.1), and the speed at the
mark wanders without a trend. The rate limits shape a commanded move, and an arm's rotational inertia is its floor at every
level. What moves is the arm between strokes: a heavier wrist arm strays further from its anchor
while it holds (110.8 mm at x1, 138.7 at x2) and moves more slowly between marks (27.9 m/s peak at
x1, 22.5 at x2).

**The two ends, and what each costs:**

- **The anatomical arm at the heavy end.** Rest wander goes from 1.8 mm at x1 to 3.6 at x1.25 and
  4.5 at x1.5, and stroke stray from 77 to 83 and 92 mm.
- **The pitch hinge at the light end.** Overshoot is 0.10 at x1, 0.18 at x0.75 and 0.29 at x0.5,
  arrival slows from 0.28 s to 0.81 s, and at x0.5 the tip never comes to rest: the same motor rings
  on a lighter link.
- **The skeletal arm at the light end.** Its stroke misses by 94 mm at x0.5 against 50 at x1, and
  lags 309 mm against 201.

**The gait does not notice.** `.review/move-bench.mjs` with `ATTR=weight` runs the full locomotion
course on the legs-only bench, x0.5 to x2. Top speed, mean speed and distance are identical on all
four locomotion modules at every level, because each carrier is keyframed. The multileg's peak
joint lag rises from 0.30 rad at x1 to 0.64 at x1.5 and 0.70 at x2. Foot slip over the whole course,
which includes its shove, moves without a trend (604 to 791 mm/s on the biped).

**The jiggle is at the light end, and it sets the floor.** Weight changes the arm-to-blade mass
ratio, the one that once produced the jiggle (memory `jiggle-is-a-mass-ratio-bug`). Node harness,
`.review/weight-ring.mjs`, the module's own bench sequence with its final hold stretched:

- the **nudge**: `ringProbe`'s 1 N.s push on the terminal one second into the hold, with the peak
  excursion, mm; the settle time, s, where 2.40 is the window, so the tip did not settle; and the
  direction changes;
- the **sweep-then-hold**: a zero-impulse meter armed as the "extend" sweep lands in the hold, with
  its direction changes and whether they grow. Its peak is mostly the arm still travelling to its
  hold, and is not a ring.

| Chain | Level | Nudge peak | Settle | Reversals | Sweep-hold reversals |
| --- | ---: | ---: | ---: | ---: | ---: |
| wrist blade | x0.50 | 8.4 | 0.20 | 6 | 0 |
| | x1.00 | 6.4 | 0.09 | 4 | 0 |
| | x2.00 | 5.0 | 0.05 | 2 | 0 |
| wrist mace | x0.50 | 7.9 | 0.53 | 9 | 3 |
| | x1.00 | 4.5 | 0.14 | 5 | 0 |
| | x2.00 | 3.3 | 0.07 | 3 | 0 |
| wrist plate | x0.50 | 3.0 | 0.07 | 3 | 1 |
| | x1.00 | 2.1 | 0.02 | 2 | 1 |
| | x2.00 | 1.4 | 0.00 | 0 | 1 |
| skeletal blade | x0.50 | 12.7 | 0.40 | 9 | 5, growing |
| | x0.75 | 10.4 | 0.25 | 7 | 3, growing |
| | x0.80 | 10.2 | 0.20 | 7 | 0 |
| | x1.00 | 9.2 | 0.18 | 6 | 0 |
| | x2.00 | 7.0 | 0.08 | 4 | 0 |
| anatomical blade | x0.50 | 23.5 | 0.52 | 10 | 0 |
| | x1.00 | 17.0 | 0.18 | 6 | 0 |
| | x2.00 | 13.0 | 0.15 | 3 | 1 |
| pitch blade | x0.50 | 25.4 | 2.40 | 53 | 1 |
| | x0.60 | 25.5 | 2.40 | 41, growing | 0 |
| | x0.70 | 17.5 | 2.40 | 31 | 1 |
| | x0.75 | 11.5 | 0.65 | 25 | 1 |
| | x0.80 | 11.7 | 0.52 | 25 | 0 |
| | x1.00 | 10.6 | 0.40 | 18 | 1 |
| | x2.00 | 6.5 | 0.10 | 8 | 1 |

Every chain rings less as it gets heavier, and none grows at the heavy end. At the light end two
fail: the pitch hinge stops settling below x0.75 and is a limit cycle at x0.5, and the skeletal arm's
sweep-then-hold grows at x0.75 and below. From x0.8 up both are clean. The maul does not appear
because it fails at every level, x1 included -- its trailing grip never settles in the hold (peak
454 mm at x1, 9 to 12 reversals at every level) -- which is the maul's own and not weight's.

### Sweep

`research/runs/stat-weight`, 192 blocks per level, stone default, the four probe minds. Levels below
the row's x0.8 floor were run before the ripple table set it, and are kept as measurements.

| Level | Bouts | Win % [95 %] | Left / right % | Margin [95 %] | d | vs control [95 %] | d | Draws | Seconds | Dealt | Taken |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| x0.50 | 384 | 47.7 [42.4, 52.9] | 51.0 / 44.3 | -0.022 [-0.071, 0.028] | -0.06 | -0.014 [-0.077, 0.049] | -0.03 | 0 | 27.5 | 7.85 | 7.94 |
| x0.75 | 384 | 50.8 [45.3, 56.3] | 50.5 / 51.0 | -0.019 [-0.070, 0.030] | -0.06 | -0.011 [-0.065, 0.040] | -0.03 | 0 | 26.9 | 7.64 | 7.77 |
| x0.90 | 384 | 51.3 [46.4, 56.3] | 50.5 / 52.1 | 0.002 [-0.042, 0.047] | 0.01 | 0.010 [-0.047, 0.066] | 0.03 | 4 | 27.6 | 8.00 | 7.79 |
| x1.00 (control) | 384 | 48.8 [43.6, 54.3] | 51.0 / 46.6 | -0.008 [-0.057, 0.043] | -0.02 | -- | -- | 1 | 28.1 | 7.60 | 7.68 |
| x1.10 | 384 | 45.2 [39.8, 50.5] | 50.0 / 40.4 | -0.009 [-0.057, 0.039] | -0.03 | -0.001 [-0.058, 0.054] | -0.00 | 1 | 26.7 | 7.63 | 7.72 |
| x1.25 | 384 | 43.8 [38.5, 49.0] | 49.0 / 38.5 | -0.018 [-0.071, 0.033] | -0.05 | -0.010 [-0.067, 0.048] | -0.02 | 0 | 27.2 | 7.54 | 7.80 |
| x1.50 | 384 | 44.7 [39.6, 50.0] | 46.4 / 43.0 | -0.029 [-0.080, 0.023] | -0.08 | -0.020 [-0.079, 0.039] | -0.05 | 3 | 28.5 | 7.56 | 7.96 |
| x2.00 | 384 | 43.0 [38.0, 48.2] | 46.4 / 39.6 | -0.070 [-0.121, -0.017] | -0.19 | -0.062 [-0.121, -0.002] | -0.15 | 0 | 28.2 | 6.81 | 7.83 |

Win % of the modified corner by mind pair, modified mind first:

| Minds | x0.50 | x0.75 | x0.90 | x1.00 | x1.10 | x1.25 | x1.50 | x2.00 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| golem-brawler vs golem-brawler | 45.8 | 50.0 | 62.5 | 45.8 | 43.8 | 41.7 | 45.8 | 50.0 |
| golem-brawler vs golem-champion | 25.0 | 25.0 | 45.8 | 25.0 | 33.3 | 29.2 | 45.8 | 58.3 |
| golem-brawler vs golem-duelist | 29.2 | 62.5 | 33.3 | 41.7 | 37.5 | 29.2 | 43.8 | 37.5 |
| golem-brawler vs golem-miser | 54.2 | 54.2 | 56.3 | 79.2 | 87.5 | 83.3 | 79.2 | 87.5 |
| golem-champion vs golem-brawler | 79.2 | 75.0 | 72.9 | 62.5 | 62.5 | 54.2 | 64.6 | 66.7 |
| golem-champion vs golem-champion | 58.3 | 37.5 | 20.8 | 52.1 | 41.7 | 50.0 | 45.8 | 41.7 |
| golem-champion vs golem-duelist | 54.2 | 66.7 | 58.3 | 41.7 | 45.8 | 70.8 | 16.7 | 41.7 |
| golem-champion vs golem-miser | 79.2 | 95.8 | 95.8 | 79.2 | 62.5 | 62.5 | 75.0 | 54.2 |
| golem-duelist vs golem-brawler | 58.3 | 62.5 | 52.1 | 41.7 | 66.7 | 45.8 | 37.5 | 50.0 |
| golem-duelist vs golem-champion | 41.7 | 33.3 | 62.5 | 41.7 | 54.2 | 37.5 | 16.7 | 33.3 |
| golem-duelist vs golem-duelist | 50.0 | 50.0 | 54.2 | 45.8 | 54.2 | 62.5 | 50.0 | 33.3 |
| golem-duelist vs golem-miser | 66.7 | 91.7 | 62.5 | 83.3 | 70.8 | 62.5 | 66.7 | 58.3 |
| golem-miser vs golem-brawler | 33.3 | 12.5 | 60.4 | 41.7 | 29.2 | 20.8 | 56.3 | 16.7 |
| golem-miser vs golem-champion | 16.7 | 16.7 | 16.7 | 25.0 | 12.5 | 20.8 | 12.5 | 20.8 |
| golem-miser vs golem-duelist | 12.5 | 25.0 | 41.7 | 37.5 | 12.5 | 12.5 | 16.7 | 12.5 |
| golem-miser vs golem-miser | 58.3 | 54.2 | 25.0 | 37.5 | 8.3 | 16.7 | 41.7 | 25.0 |

| Level | Knockdowns | Other's knockdowns | Time down % | Other's time down % |
| --- | ---: | ---: | ---: | ---: |
| x0.50 | 14.61 | 5.72 | 40.6 | 17.5 |
| x0.75 | 8.85 | 4.96 | 25.3 | 14.7 |
| x0.90 | 6.01 | 5.12 | 17.9 | 16.4 |
| x1.00 | 4.89 | 4.96 | 15.1 | 14.5 |
| x1.10 | 4.17 | 4.89 | 13.1 | 15.0 |
| x1.25 | 3.09 | 4.73 | 11.1 | 14.0 |
| x1.50 | 1.62 | 4.70 | 6.1 | 14.1 |
| x2.00 | 0.65 | 3.96 | 2.8 | 12.2 |

| Level | Severed | Other's severed |
| --- | ---: | ---: |
| x0.50 | 0.52 | 0.49 |
| x0.75 | 0.52 | 0.52 |
| x0.90 | 0.53 | 0.56 |
| x1.00 | 0.51 | 0.53 |
| x1.10 | 0.54 | 0.48 |
| x1.25 | 0.60 | 0.49 |
| x1.50 | 0.58 | 0.46 |
| x2.00 | 0.65 | 0.45 |

Contacts a bout, and the share of them above the weapon's energy floor:

| Level | Contacts | Other's contacts | Real blows % | Other's real blows % |
| --- | ---: | ---: | ---: | ---: |
| x0.50 | 154.0 | 174.5 | 43.4 | 41.0 |
| x0.75 | 163.6 | 174.1 | 43.6 | 41.9 |
| x0.90 | 164.9 | 182.0 | 42.7 | 46.7 |
| x1.00 | 179.3 | 181.8 | 45.8 | 45.9 |
| x1.10 | 175.9 | 172.2 | 45.2 | 43.9 |
| x1.25 | 181.4 | 174.4 | 45.8 | 46.1 |
| x1.50 | 190.1 | 182.2 | 45.2 | 45.9 |
| x2.00 | 175.5 | 180.3 | 47.1 | 48.0 |

**Weight does not win stone bouts.** Every level from x0.5 to x1.5 is inside the control's noise:
47.7 % at x0.5, 44.7 % at x1.5, every paired d within 0.08 of zero. x2 reads 43.0 %, d -0.15 against
the control, with a confidence interval that only just excludes zero, and it deals 6.81 a bout
against the control's 7.60.

**What it does move is the floor, and on stone the floor does not decide much.** Knockdowns go from
4.89 a bout at x1 to 14.61 at x0.5 and 0.65 at x2, and the share of a bout spent down from 15.1 %
to 40.6 % and 2.8 %. A stone body that spends two fifths of its bout down still wins 47.7 %. That
matches what stability (session 06) and recovery (session 07) found on stone.

**A heavy body strokes more slowly than its arm needs to.** `strokeInertiaScale` in
`src/golem/tactics.ts` stretches a stroke's chamber and arc by `(swingInertia / ref)^0.5` above its
reference, so the minds time the default's primary arm 7.4 % slower at x1.5 and 14.4 % slower at
x2, while the bench above says the arm itself is not slower, because its rotational inertia is the
floor at every level. That is a likely part of the x2 cost and has not been isolated. The plan
called the retiming the intended physical consequence; on these arms its premise does not hold.

**The per-mind split is too thin to read one cell at a time.** Each cell is 24 bouts, a band of
about +-20 points. Taken as a row, the miser as the heavy corner reads under the control at x2 in all
four pairings (16.7, 20.8, 12.5 and 25.0 % against 41.7, 25.0, 37.5 and 37.5), which fits a mind
that trades least having least use for a body that shrugs off being knocked down. That is a
hypothesis, not a finding.

#### Skeleton

`research/runs/stat-weight-skeleton`, 192 blocks per level, `skeleton-warrior` with the skeleton duelist on
both sides.

| Level | Bouts | Win % [95 %] | Left / right % | Margin [95 %] | d | vs control [95 %] | d | Draws | Seconds | Dealt | Taken |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| x0.50 | 384 | 74.5 [70.1, 78.6] | 74.0 / 75.0 | 0.269 [0.218, 0.318] | 0.76 | 0.252 [0.183, 0.322] | 0.51 | 0 | 61.8 | 2.20 | 1.42 |
| x0.75 | 384 | 58.7 [53.4, 63.8] | 60.7 / 56.8 | 0.113 [0.053, 0.169] | 0.28 | 0.096 [0.014, 0.176] | 0.17 | 1 | 59.3 | 2.08 | 1.73 |
| x0.90 | 384 | 58.3 [53.6, 63.0] | 54.7 / 62.0 | 0.084 [0.031, 0.138] | 0.22 | 0.067 [-0.005, 0.142] | 0.13 | 0 | 59.1 | 2.09 | 1.77 |
| x1.00 (control) | 384 | 50.3 [45.1, 55.2] | 54.7 / 45.8 | 0.017 [-0.039, 0.071] | 0.04 | -- | -- | 0 | 59.5 | 1.89 | 1.89 |
| x1.10 | 384 | 47.1 [41.7, 52.6] | 45.3 / 49.0 | -0.052 [-0.112, 0.008] | -0.12 | -0.069 [-0.152, 0.016] | -0.12 | 0 | 57.8 | 1.76 | 1.95 |
| x1.25 | 384 | 46.1 [40.6, 51.3] | 45.8 / 46.4 | -0.029 [-0.093, 0.034] | -0.06 | -0.046 [-0.136, 0.044] | -0.07 | 0 | 56.9 | 1.81 | 1.93 |
| x1.50 | 384 | 38.8 [33.9, 44.0] | 37.5 / 40.1 | -0.131 [-0.188, -0.074] | -0.32 | -0.147 [-0.222, -0.069] | -0.27 | 0 | 57.2 | 1.67 | 2.08 |
| x2.00 | 384 | 45.3 [40.6, 50.3] | 49.5 / 41.1 | -0.057 [-0.114, -0.000] | -0.14 | -0.074 [-0.151, 0.006] | -0.13 | 0 | 52.9 | 1.73 | 1.89 |




| Level | Knockdowns | Other's knockdowns | Time down % | Other's time down % |
| --- | ---: | ---: | ---: | ---: |
| x0.50 | 7.05 | 6.20 | 33.1 | 28.6 |
| x0.75 | 5.95 | 5.35 | 28.1 | 26.1 |
| x0.90 | 5.31 | 5.01 | 26.5 | 25.0 |
| x1.00 | 4.90 | 4.79 | 23.9 | 23.5 |
| x1.10 | 4.12 | 4.45 | 21.0 | 22.0 |
| x1.25 | 3.58 | 4.34 | 18.8 | 22.5 |
| x1.50 | 2.94 | 3.96 | 14.6 | 19.9 |
| x2.00 | 1.75 | 3.43 | 9.2 | 18.9 |

| Level | Severed | Other's severed |
| --- | ---: | ---: |
| x0.50 | 0.30 | 0.80 |
| x0.75 | 0.46 | 0.66 |
| x0.90 | 0.52 | 0.68 |
| x1.00 | 0.59 | 0.57 |
| x1.10 | 0.61 | 0.54 |
| x1.25 | 0.67 | 0.57 |
| x1.50 | 0.75 | 0.48 |
| x2.00 | 0.70 | 0.54 |

| Level | Contacts | Other's contacts | Real blows % | Other's real blows % |
| --- | ---: | ---: | ---: | ---: |
| x0.50 | 193.3 | 190.5 | 15.5 | 13.1 |
| x0.75 | 183.8 | 188.3 | 14.6 | 12.7 |
| x0.90 | 187.5 | 191.2 | 13.7 | 13.4 |
| x1.00 | 191.8 | 189.9 | 12.9 | 13.0 |
| x1.10 | 188.8 | 184.9 | 11.9 | 12.7 |
| x1.25 | 182.2 | 176.4 | 12.0 | 13.0 |
| x1.50 | 185.3 | 179.7 | 11.2 | 12.7 |
| x2.00 | 181.2 | 165.4 | 10.4 | 13.2 |

**On the skeleton, lighter wins.** x0.5 takes 74.5 % (d 0.51 against the control), x0.75 58.7 % and
x0.9 58.3 %; x1.5 takes 38.8 % (d -0.27), and x2 reads 45.3 % with an interval that touches the
control's. Inside the row's range that is about +8 points at x0.9 and -11 at x1.5. Knockdowns fall
with weight exactly as they do on stone, 7.05 a bout at x0.5 and 1.75 at x2, so the heavy skeleton
stays up and loses anyway.

**What a light skeleton gains is in the exchange, not the floor.** It deals 2.20 a bout and takes
1.42 at x0.5, against 1.89 each way at x1. It loses 0.30 of its own modules a bout rather than 0.59,
and severs 0.80 of the other's rather than 0.57. Its share of contacts that are real blows is 15.5 %
against 12.9 %, and at x2 it is 10.4 %. Neither half is isolated: part health does not move with
weight, so a light body taking less damage has to come from how blows reach it, and the stroke
timing stretch above (`strokeInertiaScale`) applies to the skeleton's arm as well. Both are
hypotheses.

**So weight has no winning end on either body.** On stone it is flat to x1.5 and costs at x2; on the
skeleton it is a monotone cost from x0.5 up. The row keeps x0.8 to x2, because the bench floor is
where the arm stops ringing and nothing here says a heavy body breaks. But a player choosing weight
is choosing to stay on their feet at the price of the fight, and on the skeleton they lose it.

## Size (session 12)

**The knob.** Each body table a builder reads carries a size law per field, and `withSize` in
`src/golem/attributes.ts` hands the builder a per-build copy at the stat (session 12a). The laws are
similarity at constant density, with time going as the root of length, so a larger body is the same
body filmed slower:

| Law | Power of s | Law | Power of s |
|---|---|---|---|
| length | 1 | speed | 0.5 |
| perLength | -1 | frequency | -0.5 |
| mass | 3 | angularAcceleration | -1 |
| impulse | 3.5 | duration | 0.5 |
| force | 3 | torque | 4 |
| inertia | 5 | one (angles, ratios, counts) | 0 |

Weight multiplies the masses on top, so a body part weighs weight x s^3 of its x1 figure. Stability
thresholds and rise floors go as the root of size (`StabilityAuthority.sizeScale`). A human is fixed
at x1 (`FAMILY_FIXED_ATTRIBUTES`), because its skin is a fixed-size model.

**Items keep their size**: every terminal's metres and mass, and the ram's plate. A terminal's
`limits` and a maul's `crossing` describe the arm and not the item, so they scale with it. That
choice makes size two things at once. It is a bigger body, and it is a relatively smaller weapon.
Most of what follows comes from the second.

**What is not scaled**, deliberately or not yet. Each item has a reason:

- The servo responses that sit outside a table: `POSITION_RESPONSE`, and the wrist's
  `JointServo(..., 40)`.
- The arm core's thresholds: `5e-4` and `.02`.
- The torso's and shell's trim literals.
- The world constants: `STEP_HEIGHT_M`, the `ROOT_*` family and `SUPPORT_GRACE_S`. The floor does
  not get bigger.
- The tactics' `circleMin` and `circleMax`. A mind circles at the same distance whatever it is
  driving, and the sweep carries that.
- `defaultGolemDimensions` in `src/golem/build.ts`, which describes the default build at x1 (see below).
- The arm torques. They stay on pure similarity (torque as s^4). The bench below shows what that
  costs a small arm holding a full-size item.

### Whole bodies

Node harness, `.review/size-bench.mjs body`, with `ATTR=size`, output in `.review/size-body.out`.
The table gives the summed solver mass, the carrier's `supportedMassKg`, the impulse its stability
diagnostic says staggers and fells it, and the primary hand's swing inertia.

| Build | Size | Body kg | Supported kg | Stagger N.s | Fall N.s | Swing kg m2 |
|---|---|---|---|---|---|---|
| default | 0.8 | 49.6 | 47.4 | 0.38 | 0.89 | 2.441 |
| default | 1 | 90.6 | 89.1 | 0.80 | 1.87 | 3.988 |
| default | 1.25 | 171.1 | 170.6 | 1.72 | 4.00 | 7.566 |
| skeleton-warrior | 0.8 | 18.7 | 16.2 | 0.17 | 0.41 | 1.305 |
| skeleton-warrior | 1 | 30.4 | 28.3 | 0.34 | 0.79 | 1.823 |
| skeleton-warrior | 1.25 | 53.2 | 51.8 | 0.70 | 1.62 | 2.831 |
| wheel | 0.8 | 63.3 | 30.5 | 0.11 | 0.27 | 2.441 |
| wheel | 1 | 117.4 | 59.7 | 0.25 | 0.58 | 3.988 |
| wheel | 1.25 | 223.3 | 116.5 | 0.55 | 1.28 | 7.566 |
| multileg | 0.8 | 55.6 | 22.8 | 0.32 | 0.74 | 2.441 |
| multileg | 1 | 102.3 | 44.6 | 0.70 | 1.62 | 3.988 |
| multileg | 1.25 | 194.0 | 87.1 | 1.52 | 3.55 | 7.566 |

- **Mass goes almost exactly as s^3.** At x0.8 the default golem weighs 0.547 of its x1 mass, where
  pure body would be 0.512. The difference is the blade and the plate, which do not shrink.
- **The stagger impulse goes as about s^3.5**, which is the impulse law: 0.475 of x1 at x0.8,
  against a predicted 0.458.

`size grows a whole golem about its feet` in `tests/attributes.test.mjs` builds every playable build
the stat may be set on, at both ends of the row, and reads the solver back:

- every body part sits at s times its x1 offset from the origin, to a micrometre, and weighs s^3 of
  its x1 mass;
- every item part weighs exactly what it did;
- a wrist's cast link weighs its floor at the new size or its load, whichever is more;
- the carrier's supported mass is the legs' solver mass plus `golemUpperMassKg`.

**That last check, and the same one in the weight test, is circular.** The biped's `carry` is handed
`golemUpperMassKg`, so both sides of the comparison are the same arithmetic. Against the solver,
`golemUpperMassKg` understates the upper body, and it did so before size existed. Every chain's
`massKg` is its *unloaded* figure (the wrist chain says so beside it), so a cast link's load share is
never counted. `.review/upper-gap.mjs` compares the solver's mass above the legs, in kg, with the
carrier's figure:

| Build | x0.8 | x1 | x1.25 |
|---|---|---|---|
| default | 32.72 / 30.52 (7.2 %) | 57.72 / 56.17 (2.8 %) | 106.82 / 106.27 (0.5 %) |
| mace | 35.62 / 32.13 (10.9 %) | 60.63 / 57.79 (4.9 %) | 109.47 / 107.89 (1.5 %) |
| maul | 46.45 / 34.69 (33.9 %) | 71.46 / 60.34 (18.4 %) | 120.30 / 110.45 (8.9 %) |
| ram-capped | 26.12 / 25.54 (2.3 %) | 47.77 / 46.64 (2.4 %) | 90.07 / 87.85 (2.5 %) |
| skeleton-warrior | 14.62 / 12.15 (20.3 %) | 22.38 / 20.30 (10.2 %) | 37.54 / 36.22 (3.6 %) |
| skeleton-maul | 28.36 / 16.33 (73.7 %) | 36.12 / 24.48 (47.6 %) | 51.27 / 40.39 (26.9 %) |

The x1 column is the carrier every earlier section measured on, so the gap is **not repaired here**.
A small body makes it worse, because the floors shrink as s^3 and the load does not, so more of the
cast binds. The wheel and the multileg carry no upper mass at all (see "Weight").

**The diagnostic's impulse is the measured one at size.** `.review/size-shove.mjs` bisects the
shove that staggers and fells the locomotion bench's carrier, sizing its `shoveImpulseNs` override
back by s^3.5 so the impulse delivered is the one reported. Node harness, N.s, measured against the
stability diagnostic's prediction:

| Carrier | Size | Stagger (predicted) | Fall (predicted) |
|---|---|---|---|
| biped | 0.8 | 0.62 (0.60) | 1.40 (1.40) |
| biped | 1 | 0.84 (0.82) | 1.91 (1.91) |
| biped | 1.25 | 1.26 (1.23) | 2.87 (2.87) |
| skeleton | 0.8 | 0.68 (0.66) | 1.55 (1.55) |
| skeleton | 1 | 0.81 (0.79) | 1.84 (1.84) |
| skeleton | 1.25 | 1.00 (0.99) | 2.30 (2.30) |

These figures come from the bench carrier. Its block's mass does not follow s^3, so the whole-body
table above is the one to read for a golem's stagger impulse. What this table shows is that the
diagnostic behind it still agrees with the solver at both ends.

**What a mind sees.** The published `BodyView` scales with the body, per `.review/size-view.mjs`:

- crown height, vital height and collision radius are exactly s times their x1 value;
- reach is the arm times s plus the blade's fixed 0.80 m. For the default golem that is 1.63 m at
  x0.8, 1.84 at x1 and 2.10 at x1.25.

The minds' circling band (`circleMin` 1.3 m and `circleMax` 2.6 m) does not move. So a large golem
stands inside its own reach further out, and a small one has to close further in.

`defaultGolemDimensions` describes the registry's default build, which is at x1 by definition. Its
gate in `tests/golem-arena.test.mjs` is against that build, and a sized body publishes its own
dimensions, so nothing reads the registry row for a sized body.

### Arms

Node bench, `.review/size-bench.mjs arm`, `ATTR=size`, output in `.review/size-arm.out`. Each
module is on the stand, which stands its socket at the sized height. The readings are the stroke's
stray from its own anchor and the tip-to-command lag, in mm.

| Arm | x0.75 | x0.8 | x1 | x1.25 | x1.5 |
|---|---|---|---|---|---|
| wrist blade | 109 / 671 | 48.8 / 491 | 37.9 / 315 | 22.1 / 197 | 36.3 / 302 |
| skeletal blade | 67.0 / 739 | 66.0 / 416 | 46.5 / 201 | 23.5 / 113 | 15.1 / 113 |
| reach blade | 53.0 / 400 | 30.7 / 280 | 13.7 / 256 | 10.1 / 277 | 12.4 / 405 |
| wrist mace | 472 / 2273 | 392 / 1897 | 298 / 1345 | 78.5 / 1008 | 56.3 / 1203 |
| wrist maul | 228 / 1456 | 224 / 1466 | 210 / 1295 | 88.5 / 720 | 280 / 753 |
| wrist whip | 19.2 / 2180 | 10.4 / 1831 | 8.1 / 1712 | 9.5 / 1819 | 115 / 2080 |
| wrist fist | 24.5 / 128 | 15.2 / 135 | 6.6 / 64 | 7.4 / 77 | 8.7 / 125 |
| wrist plate | 36.8 / 197 | 22.1 / 196 | 7.7 / 208 | 5.6 / 248 | 6.3 / 339 |

The pitch hinge's arrival and overshoot on the same bench:

| Size | Arrival s | Overshoot rad | Stroke lag mm |
|---|---|---|---|
| 0.75 | 3.45 | 1.04 | 737 |
| 0.8 | 0.625 | 0.233 | 578 |
| 1 | 0.283 | 0.104 | 288 |
| 1.25 | 0.192 | 0.079 | 147 |
| 1.5 | 0.163 | 0.042 | 107 |

**A small arm is an underpowered arm, and pure similarity is why.** Its torque goes as s^4 and the
item it holds does not shrink. At x0.8 the wrist blade strays 49 mm, against 38 at x1 and the 50 mm
the bench test refuses. At x0.75 it strays 109 mm, and the pitch hinge takes 3.45 s to arrive with a
radian of overshoot.

At the top end, the whip's stray is 115 mm at x1.5, and the wrist maul's is 280 mm.

**So the row is x0.8 to x1.25.** The floor is where the wrist blade is still inside the bench's
50 mm. The ceiling is x1.25: every arm's stray there is better than at x1 or within 1.4 mm of it,
while at x1.5 the whip strays 115 mm and the wrist maul 280.

**Load-sized torques** would be the alternative for the small end. That means sizing each arm
torque off its load, as `AGENTS.md` says a force is sized: tau(s) = tau(1) x I(s)/I(1) x s^-1, with
I the swing inertia including the item. It is a balance decision rather than a physical one, so it
is left to the owner.

### Locomotion

Node harness, `.review/move-bench.mjs`, `ATTR=size`, the `walk` sequence, output in
`.review/size-move.out`:

| Carrier | Size | Top m/s | Slip mm/s | Joint lag |
|---|---|---|---|---|
| biped | 0.8 | 2.862 | 90.6 | 0.430 |
| biped | 1 | 3.200 | 99.1 | 0.399 |
| biped | 1.25 | 3.578 | 136.1 | 1.012 |
| skeleton | 0.8 | 2.862 | 88.7 | 0.483 |
| skeleton | 1 | 3.200 | 95.6 | 0.413 |
| skeleton | 1.25 | 3.578 | 123.8 | 0.874 |
| wheel | 0.8 | 2.862 | 0.0 | 0.001 |
| wheel | 1 | 3.200 | 20.5 | 0.002 |
| wheel | 1.25 | 3.578 | 450.8 | 1.482 |
| multileg | 0.8 | 1.252 | 591.8 | 0.133 |
| multileg | 1 | 1.400 | 524.3 | 0.103 |
| multileg | 1.25 | 1.565 | 584.9 | 0.079 |

- Top speed goes as the root of size, as the speed law says it must: 3.200 x 1.25^0.5 = 3.578.
- The biped's slip stays inside its `meanFootSlipBudgetMps` at x1.25, at 136 against 335. At x1.5 it
  is not: 414 against 367. That is a second reason for the ceiling.
- The multileg's slip is 592 at x0.8, against its budget of 626.
- **The wheel's x1.25 row and the bipeds' x1.25 joint-lag peaks are the arena, not the body.** The
  headless arena stands a ring of posts at 9.5 m, and a faster body reaches it inside the walk. The
  wheel covers 10.30 m at x1.25 against 9.25 at x1. `.review/wheel-trace.mjs` and
  `.review/biped-trace.mjs` trace a short straight walk that stays clear of the posts, and it is
  clean.

### Grip, clearance and the dungeon

- **A maul's grip holds at every size.** `.review/maul-latch.mjs` ran whole golems in 6 s bouts.
  The grip latches at 0.2 to 0.4 s and holds for 93 to 97 % of the bout at x0.75 to x1.5, with a
  peak stray of at most 11 mm. The crossing scales with the arm, so the second hand meets the shaft
  where it did.
- **Plate clearance against the sized chest.** `.review/size-clearance.mjs` runs the envelope
  sweep of the plate clearance test in `tests/golem-bench.test.mjs`, with each trunk box built from
  `withSize(torso, TORSO_SIZE, s)` around the socket the module hangs from. The figures are mm clear
  at the deepest approach; negative is inside.

  | Chain | Chest | x0.8 | x0.9 | x1 | x1.25 |
  |---|---|---|---|---|---|
  | wrist | plain | 82 | 107 | 134 | 229 |
  | wrist | plated | 68 | 90 | 122 | 204 |
  | reach | plain | 95 | 110 | 117 | 159 |
  | reach | plated | 85 | 95 | 104 | 144 |
  | pitch | plain | 4 | 2 | 7 | 26 |
  | pitch | plated | **-23** | **-5** | 7 | 26 |
  | skeletal | ribcage | 8 | 27 | 34 | 83 |

  Rung 1 has one hinge and no swing, and the board's own geometry is the only lever it has. A board
  that keeps its size on a smaller chest runs into it, and the collision filters forbid that pair,
  so the solver would never report it. The deepest pitch approach at x0.8 is lateral, at a raised
  pitch of 0.85 rad. `golemSetupRefusal` refuses a plate on the pitch chain below x1 by name. The
  dungeon's Start names the refusal instead of letting the body's constructor throw it from inside
  the run. The one named build this touches is `pitch-blade`, at x0.8.
- **The dungeon.** `.review/dungeon-size.mjs` force-walks the default hero to a room 16 cells away
  on seed 42. It arrives at 5.96 s at x0.8, 5.43 at x1 and 4.81 at x1.25, with no frame off the floor
  and no frame inside a wall at 0.9 of its sized radius. The path planner reads the radius from the
  built body's footprint, so it follows the body.

### Sweep

`research/runs/stat-size`, 192 blocks per level, stone default, the four probe minds, run from a
snapshot of the tree at 1309588.

| Level | Bouts | Win % [95 %] | Left / right % | Margin [95 %] | d | vs control [95 %] | d | Draws | Seconds | Dealt | Taken |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| x0.80 | 384 | 48.7 [43.5, 54.2] | 51.6 / 45.8 | -0.081 [-0.140, -0.021] | -0.19 | -0.073 [-0.139, -0.005] | -0.15 | 0 | 33.1 | 7.24 | 7.86 |
| x0.90 | 384 | 50.7 [45.3, 56.0] | 50.5 / 50.8 | -0.023 [-0.079, 0.034] | -0.06 | -0.014 [-0.077, 0.047] | -0.03 | 1 | 30.3 | 7.56 | 7.82 |
| x1.00 (control) | 384 | 48.8 [43.6, 54.3] | 51.0 / 46.6 | -0.008 [-0.057, 0.043] | -0.02 | -- | -- | 1 | 28.1 | 7.60 | 7.68 |
| x1.10 | 384 | 41.9 [37.0, 47.1] | 43.8 / 40.1 | -0.061 [-0.112, -0.010] | -0.17 | -0.053 [-0.119, 0.014] | -0.11 | 0 | 27.5 | 7.11 | 8.15 |
| x1.25 | 384 | 33.1 [28.1, 38.0] | 30.7 / 35.4 | -0.227 [-0.284, -0.171] | -0.56 | -0.219 [-0.284, -0.156] | -0.48 | 0 | 27.6 | 5.68 | 8.39 |

Win % of the modified corner by mind pair, modified mind first:

| Minds | x0.80 | x0.90 | x1.00 | x1.10 | x1.25 |
| --- | ---: | ---: | ---: | ---: | ---: |
| golem-brawler vs golem-brawler | 66.7 | 54.2 | 45.8 | 58.3 | 41.7 |
| golem-brawler vs golem-champion | 50.0 | 45.8 | 25.0 | 33.3 | 41.7 |
| golem-brawler vs golem-duelist | 70.8 | 56.3 | 41.7 | 37.5 | 50.0 |
| golem-brawler vs golem-miser | 66.7 | 62.5 | 79.2 | 45.8 | 29.2 |
| golem-champion vs golem-brawler | 58.3 | 45.8 | 62.5 | 41.7 | 16.7 |
| golem-champion vs golem-champion | 8.3 | 37.5 | 52.1 | 54.2 | 58.3 |
| golem-champion vs golem-duelist | 25.0 | 41.7 | 41.7 | 41.7 | 66.7 |
| golem-champion vs golem-miser | 79.2 | 100.0 | 79.2 | 75.0 | 62.5 |
| golem-duelist vs golem-brawler | 58.3 | 58.3 | 41.7 | 29.2 | 20.8 |
| golem-duelist vs golem-champion | 4.2 | 45.8 | 41.7 | 45.8 | 37.5 |
| golem-duelist vs golem-duelist | 37.5 | 50.0 | 45.8 | 58.3 | 54.2 |
| golem-duelist vs golem-miser | 62.5 | 75.0 | 83.3 | 58.3 | 45.8 |
| golem-miser vs golem-brawler | 83.3 | 58.3 | 41.7 | 20.8 | 0.0 |
| golem-miser vs golem-champion | 16.7 | 8.3 | 25.0 | 12.5 | 0.0 |
| golem-miser vs golem-duelist | 25.0 | 45.8 | 37.5 | 20.8 | 0.0 |
| golem-miser vs golem-miser | 66.7 | 25.0 | 37.5 | 37.5 | 4.2 |

| Level | Knockdowns | Other's knockdowns | Time down % | Other's time down % |
| --- | ---: | ---: | ---: | ---: |
| x0.80 | 13.08 | 6.06 | 29.5 | 21.2 |
| x0.90 | 9.24 | 5.66 | 25.7 | 19.7 |
| x1.00 | 4.89 | 4.96 | 15.1 | 14.5 |
| x1.10 | 2.26 | 4.41 | 12.1 | 15.8 |
| x1.25 | 0.59 | 2.49 | 3.6 | 9.4 |

| Level | Severed | Other's severed |
| --- | ---: | ---: |
| x0.80 | 0.55 | 0.44 |
| x0.90 | 0.56 | 0.50 |
| x1.00 | 0.51 | 0.53 |
| x1.10 | 0.60 | 0.47 |
| x1.25 | 0.66 | 0.38 |

| Level | Contacts | Other's contacts | Real blows % | Other's real blows % |
| --- | ---: | ---: | ---: | ---: |
| x0.80 | 188.3 | 174.9 | 41.5 | 29.5 |
| x0.90 | 181.0 | 173.1 | 43.6 | 38.3 |
| x1.00 | 179.3 | 181.8 | 45.8 | 45.9 |
| x1.10 | 153.8 | 149.0 | 40.9 | 46.5 |
| x1.25 | 139.7 | 170.8 | 38.3 | 51.1 |

**On stone, a big body loses.** x1.25 takes 33.1 % (d -0.48 against the control), and x1.1 takes
41.9 %, an interval that touches the control's. Below x1 the win rate is flat, 48.7 % at x0.8 and
50.7 % at x0.9, but x0.8's paired margin is a little worse than the control's (d -0.15).

**The floor moves the way the stagger impulse says it should, and on stone it does not decide the
fight.** A x0.8 body goes down 13.08 times a bout and spends 29.5 % of it down, and still wins
48.7 %. A x1.25 body goes down 0.59 times, knocks the other down half as often as it is knocked
down at x1 -- 2.49 a bout against 4.96 -- and loses two bouts in three. Weight (session 11) found
the same on stone: staying up is not winning.

**A big stone body lands less and is hit more.** At x1.25 it deals 5.68 a bout against 7.60 at x1,
and its share of contacts that are real blows falls from 45.8 % to 38.3 %. The other body's share
rises from 45.9 % to 51.1 %, and it deals 8.39. Part health does not scale with size, so a larger
body is a larger target with the same bar. The miser, the mind that trades least, reads 0.0, 0.0,
0.0 and 4.2 % as the x1.25 corner, which is the row's most lopsided signal. Each cell is 24 bouts,
though, so read that row as a whole rather than cell by cell.

#### What the minds do with a big arm

The minds stretch a stroke's chamber and arc by `strokeInertiaScale` (`src/golem/tactics.ts`),
read from the swing inertia each hand publishes. Size multiplies the chain's share of that by s^5
(`SIZE_LAW_POWER.inertia`) and moves the item out along a longer arm, so the published figure
grows much faster than the arm's own time scale does. `.review/size-inertia.mjs`, Node, the
published `swingInertia` in kg m^2 and the stretch it buys, against the √s that similarity at
constant density says a sized arm's times should grow by:

| Size | Stone primary | Stone secondary | Skeleton primary | Skeleton secondary | √s |
|---|---|---|---|---|---|
| 0.8 | 2.44, x1.000 | 2.32, x1.000 | 1.30, x1.000 | 0.98, x1.000 | 0.894 |
| 0.9 | 3.11, x1.000 | 3.10, x1.000 | 1.54, x1.000 | 1.25, x1.000 | 0.949 |
| 1 | 3.99, x1.000 | 4.11, x1.015 | 1.82, x1.000 | 1.57, x1.000 | 1.000 |
| 1.1 | 5.14, x1.135 | 5.42, x1.166 | 2.17, x1.000 | 1.97, x1.000 | 1.049 |
| 1.25 | 7.57, x1.377 | 8.12, x1.427 | 2.83, x1.000 | 2.72, x1.000 | 1.118 |

The default stone arm sits on the stretch's reference at x1. At x1.25 the minds time its strokes
38 to 43 % slower, against about 12 % for the arm itself. Nothing on the bench asks for more: at
x1.25 every arm's stroke stray is better than at x1 or within 1.4 mm of it, and the wrist blade's
tip-to-command lag falls from 315 mm to 197 (the table under "Arms"). Below x1 the stretch is at
its floor of 1, so a small arm's strokes are timed as if it were x1 sized, which is about 10 %
slower than its own time scale at x0.8. The skeleton's arms are light enough that the stretch never
engages at any size.

**The stretch is not why a big stone body loses.** `research/runs/stat-size-nostretch` reruns x1,
x1.1 and x1.25 from the same snapshot with `STROKE_INERTIA.gain` set to 0, so no mind stretches any
stroke on either side. 192 blocks per level, the same minds and seeds:

| Level | Win % [95 %] | vs control d | Dealt | Taken | Real blows % | Other's real blows % |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| x1.00 (control) | 48.0 [43.0, 53.5] | -- | 7.52 | 7.69 | 45.8 | 45.4 |
| x1.10 | 46.1 [40.6, 51.3] | -0.03 | 7.38 | 7.90 | 41.1 | 47.1 |
| x1.25 | 35.4 [30.2, 40.4] | -0.37 | 5.96 | 8.42 | 35.6 | 50.0 |

Without the stretch, x1.25 takes 35.4 % against 33.1 % with it, and x1.1 46.1 % against 41.9 %.
Both differences are inside either run's interval. The stretch may cost x1.1 a few points, but a
big stone body loses most of what it loses with every stroke timed as at x1. The same pattern is
still there: it lands a smaller share of real blows, the other lands a larger one, and the miser
as the big corner still reads 0.0 % in three pairings. What does cause it is not isolated. The
standing candidates are a larger target with an unscaled bar, and the minds' fixed circling band
against a longer reach (see "What a mind sees").

#### Skeleton

`research/runs/stat-size-skeleton`, 192 blocks per level, `skeleton-warrior` with the skeleton
duelist on both sides.

| Level | Bouts | Win % [95 %] | Left / right % | Margin [95 %] | d | vs control [95 %] | d | Draws | Seconds | Dealt | Taken |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| x0.80 | 384 | 42.4 [37.5, 47.7] | 41.7 / 43.2 | -0.113 [-0.164, -0.062] | -0.31 | -0.130 [-0.206, -0.052] | -0.24 | 0 | 66.3 | 1.60 | 2.00 |
| x0.90 | 384 | 29.7 [24.9, 34.6] | 32.6 / 26.8 | -0.258 [-0.308, -0.207] | -0.72 | -0.275 [-0.351, -0.199] | -0.51 | 2 | 67.2 | 1.30 | 2.15 |
| x1.00 (control) | 384 | 50.3 [45.1, 55.2] | 54.7 / 45.8 | 0.017 [-0.039, 0.071] | 0.04 | -- | -- | 0 | 59.5 | 1.89 | 1.89 |
| x1.10 | 384 | 72.9 [68.8, 77.1] | 75.5 / 70.3 | 0.302 [0.251, 0.352] | 0.83 | 0.285 [0.214, 0.355] | 0.57 | 0 | 50.0 | 2.54 | 1.47 |
| x1.25 | 384 | 60.9 [56.0, 65.6] | 64.1 / 57.8 | 0.207 [0.149, 0.263] | 0.51 | 0.190 [0.111, 0.268] | 0.34 | 0 | 42.4 | 2.51 | 1.69 |

| Level | Knockdowns | Other's knockdowns | Time down % | Other's time down % |
| --- | ---: | ---: | ---: | ---: |
| x0.80 | 7.80 | 5.88 | 31.1 | 24.5 |
| x0.90 | 6.53 | 4.84 | 28.1 | 20.7 |
| x1.00 | 4.90 | 4.79 | 23.9 | 23.5 |
| x1.10 | 3.70 | 4.38 | 22.7 | 26.2 |
| x1.25 | 2.83 | 4.74 | 20.8 | 33.0 |

| Level | Severed | Other's severed |
| --- | ---: | ---: |
| x0.80 | 0.67 | 0.29 |
| x0.90 | 0.72 | 0.24 |
| x1.00 | 0.59 | 0.57 |
| x1.10 | 0.31 | 0.97 |
| x1.25 | 0.44 | 0.95 |

| Level | Contacts | Other's contacts | Real blows % | Other's real blows % |
| --- | ---: | ---: | ---: | ---: |
| x0.80 | 193.6 | 241.9 | 15.0 | 9.0 |
| x0.90 | 186.8 | 218.1 | 12.8 | 10.3 |
| x1.00 | 191.8 | 189.9 | 12.9 | 13.0 |
| x1.10 | 184.8 | 149.4 | 12.3 | 17.6 |
| x1.25 | 161.2 | 126.1 | 12.2 | 24.9 |

**On the skeleton, a big body wins and a small one loses.** x1.1 takes 72.9 % (d 0.57 against the
control) and x1.25 60.9 % (d 0.34). x0.9 takes 29.7 % (d -0.51) and x0.8 42.4 % (d -0.24). The
curve is not monotone at either end. x0.9 is worse than x0.8 and x1.1 is better than x1.25, and in
both pairs the intervals do not overlap. Nothing here explains that, and it is not explained.

**A big skeleton wins in the exchange and keeps its limbs.** At x1.1 it deals 2.54 a bout and takes
1.47, against 1.89 each way at x1. It loses 0.31 of its own modules a bout and severs 0.97 of the
other's, against 0.59 and 0.57. Bouts get shorter as it grows, 59.5 s at x1 and 42.4 at x1.25. Why
the two bodies part ways is not established. The stroke stretch never touches the skeleton, but the
ablation above shows it is not what sinks the big stone body either.

**Size is the first stat that points opposite ways on the two bodies.** Inside the row's x0.8 to
x1.25, it costs stone up to 16 points at the top, and it is worth up to 23 points to the skeleton at
x1.1 while costing it 21 at x0.9. The row stays at x0.8 to x1.25, because that range is set by the
bench and the bouts show no body breaking. But the direction of the effect depends on the body, and
the minds were tuned at x1 on both. So a player choosing size is choosing a bout the minds were not
tuned for, and on stone they lose it.

## Physical contact baselines

The baseline the physical-contact set (`docs/plans/2026-09-23-physical-contact-00-overview.md`) is
judged against, written by session 01. Session 01 changes no behaviour; every figure is on the tree
whose body fingerprint is 54f8c58e92e5. Raw outputs are in `research/runs/pc01/`, which is not
committed.

### The x1 control band

`research/stat-sweep.mjs --attributes max,max-normal-body,size-weight-max`, control row: Node
harness, research runner, supported locomotion, cap 150 s, 192 blocks (384 bouts), stone `default`
mirror, the four probe minds, seed 20260923.

| Win % [95 %] | d | Dealt / taken | Knockdowns | Time down % | Contacts | Real blows % | Severed | Seconds |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 48.8 [43.6, 54.3] | -0.02 | 7.60 / 7.68 | 4.89 / 4.96 | 15.1 / 14.5 | 179.3 / 181.8 | 45.8 / 45.9 | 0.51 / 0.53 | 28.1 |

**The band.** `research/control-band.mjs research/runs/pc01/giant` reads the control row per body
a bout, with a 95 % bootstrap interval over the 192 blocks:

| Damage / body / bout | Knockdowns / body / bout | Seconds / bout |
| ---: | ---: | ---: |
| 7.64 [7.43, 7.85] | 4.93 [4.54, 5.32] | 28.1 [25.9, 30.4] |

From session 02 on, a session's x1-vs-x1 control is within band when its own interval, read by the
same script on the same seed, overlaps this one. That reading of the overview's "within the band"
was chosen on the owner's behalf (session 10's list).

### The giant

The same sweep. The modified corner carries each preset against an x1 stone default.

| Level | Win % [95 %] | Margin d | vs control d | Dealt / taken | Knockdowns | Other's knockdowns | Time down % | Other's % | Seconds |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| control | 48.8 [43.6, 54.3] | -0.02 | -- | 7.60 / 7.68 | 4.89 | 4.96 | 15.1 | 14.5 | 28.1 |
| max | 48.6 [43.2, 53.9] | -0.09 | -0.06 | 7.80 / 16.53 | 0.10 | 3.74 | 1.6 | 9.9 | 36.0 |
| max-normal-body | 94.7 [92.3, 96.6] | 2.42 | 1.55 | 10.15 / 6.52 | 1.77 | 5.77 | 6.3 | 19.6 | 25.7 |
| size-weight-max | 12.4 [9.0, 15.9] | -1.50 | -1.04 | 3.99 / 9.85 | 0.05 | 1.59 | 0.5 | 6.0 | 25.4 |

**The giant is almost never knocked down (0.10 a bout) and takes more than twice the damage it
deals, and it still breaks even.** Its bar is scaled to the same total as everybody's
(`GOLEM_ASSEMBLY.vitalityTotal`), so its size and mass buy stability, not a bigger bar. Every other stat at
max with a normal body wins 94.7 %. Size and weight alone lose 87.6 %.

### Downed census

`research/downed-census.mjs`: Node harness, research runner, supported locomotion, cap 150 s,
seed 20260923. 96 side-swap blocks (192 bouts) for each of three groups:

- stone: the `default` mirror with the four probe minds;
- skeleton: the `skeleton-warrior` mirror with the skeleton duelist;
- giant: the `max` preset against an x1 stone default, with the probe minds.

An episode runs from the frame a body enters `fallen` or `rising` to the frame it is supported
again. It is read off the locomotion port's support state and the new read-only
`riseGate()` diagnostic in `src/supported-locomotion-production.ts`.

| Group | Knockdowns / body / bout | Re-hits / body / bout | Episodes | p50 / p90 / max s | Episodes > 5 s | > 5 s time % | Down time % |
| --- | ---: | ---: | ---: | --- | ---: | ---: | ---: |
| stone | 3.99 | 0.99 | 1534 | 0.80 / 1.45 / 81.82 | 1 | 0.8 | 13.9 |
| skeleton | 4.56 | 0.16 | 1751 | 2.95 / 3.65 / 103.57 | 29 | 2.3 | 24.3 |
| giant group | 1.71 | 0.24 | 658 | 0.80 / 1.40 / 96.60 | 5 | 2.4 | 6.6 |

- **The census and the sweep count a knockdown differently.** The census counts an edge from
  supported into `fallen`, and counts a rise knocked back into `fallen` as a re-hit inside the same
  episode. The sweep's worker (`research/worker.mjs`) counts every edge into `fallen`. Stone's
  3.99 + 0.99 = 4.98 is the sweep's 4.9.
- **Giant group.** The giant itself goes down 0.11 times a bout and the x1 stone 3.32.
- **Episodes longer than 5 s**, by the gate cause they spent longest under, and how they ended:
  - stone: 1, wall; bout ended;
  - skeleton: 29. Unsettled 21, wall 6, occupancy 2. Ended rose 21, died 5, bout ended 3;
  - giant group: 5. No ground 2, wall 2, stuck rising 1. Ended bout ended 4, died 1.

  None of them is "no recover input", "re-hit" or a lying cap.
- **Where downed time goes.** Stone and the giant group spend most of it in the dwell and the rise
  itself. The skeleton spends almost half of it waiting for the fall to come to rest. Share of
  downed time by gate cause:

  | Group | Rising | Dwell | Unsettled | Wall | Occupancy | Acceleration | No ground | Stuck rising |
  | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
  | stone | 49.9 | 43.5 | -- | 5.4 | 0.0 | 0.8 | -- | 0.0 |
  | skeleton | 34.1 | 11.2 | 47.4 | 3.3 | 3.7 | -- | -- | -- |
  | giant group | 33.6 | 27.9 | -- | 11.7 | -- | 2.2 | 15.4 | 9.0 |

  The rest, under 0.5 % in every group, is re-hits, `fallen` frames with no gate reading, and
  `staggered`. The session 01 run also charged each episode's closing frame to "supported":
  1.19 % of stone's downed time, 0.37 % of the skeleton's and 0.86 % of the giant group's. That is
  left out of the table above, and the census worker no longer does it.
- **The human mirror never falls.** 32 blocks (64 bouts) of `human-warrior` with the humanoid
  duelist gave 0 knockdowns and 0.0009 damage a standing second, and every bout ran to about
  120 s. It is the attribute sessions' "the human mirror barely fights", measured again.

#### Stun-lock

Reported, not gated (the owner's answer, 2026-09-23). A repeat knockdown is one within 2 s of the
same body's last rise.

| Group | Repeat knockdowns | Share of episodes % | Longest chain | First down loses % (decided bouts) |
| --- | ---: | ---: | ---: | --- |
| stone | 564 | 36.8 | 10 | 54.3 (173) |
| skeleton | 354 | 20.2 | 5 | 59.7 (191) |
| giant group | 169 | 25.7 | 5 | 47.1 (172) |

**Going down first is barely a verdict.** The first body down loses 54 % of stone bouts and 60 %
of skeleton bouts. A third of stone's knockdowns come within two seconds of the last rise.

#### Finishing

The other body down, counted in one-second windows:

| Group | Down windows | Scored % | Damage / downed s | Damage / standing s | Share of damage on a downed body % | Socket to core p50 m |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| stone | 1962 | 58.8 | 0.586 | 0.214 | 33.8 | 1.56 |
| skeleton | 6336 | 30.4 | 0.072 | 0.022 | 57.8 | 1.48 |
| giant group | 1092 | 46.2 | 0.577 | 0.320 | 11.9 | 1.83 |

**A downed stone body is already struck at 2.7 times the standing rate, in 59 % of its downed
seconds.** Session 03 opens with "when one fighter is down, the other usually cannot hurt it". On
stone that is not so. The standing side is 1.56 m from the downed core (p50), which is inside a
wrist blade's 1.84 m extended tip, and it lands blows without any mind knowing the other is down.
The skeleton lands in only 30 % of windows. It deals 58 % of its damage to a downed body anyway,
because it is down for a quarter of every bout. Session 03's mechanisms are still real (the view
does not say a body is down, and aim reads standing heights). Its target is already met on stone
and not on the skeleton. See session 03's inputs.

### Idle-dummy matrix

`research/idle-dummy.mjs --blocks 12`: Node harness, research runner, supported locomotion,
cap 150 s, seed 20260923. Attackers run their family's probe minds; the dummy runs `idle`. The
giant is stone `default` at the `max` preset. The plan asked for 24 blocks a cell. This ran 12
side-swap blocks, which is 24 bouts a cell, because the human rows run at about 0.29 bouts a
second. The question is whether a win is reachable, and 24 bouts answers it.

Each cell gives:

- the outright win rate, meaning a win before the 60 s overtime drain (`CONFIG.bout.overtimeSeconds`);
- in brackets, the win rate with the drain;
- the median time of a win;
- the share of bouts that reached the cap.

| Attacker \ idle dummy | stone | skeleton | human | giant |
| --- | --- | --- | --- | --- |
| stone | 58 % (100) / 54.8 s / 0 % | 54 % (88) / 50.6 s / 0 % | 21 % (100) / 74.4 s / 0 % | 17 % (92) / 78.6 s / 0 % |
| skeleton | 13 % (100) / 80.9 s / 0 % | 29 % (100) / 68.1 s / 0 % | 13 % (100) / 76.4 s / 0 % | **0 %** (100) / 109.0 s / 0 % |
| human | **0 %** (50) / 119.3 s / 0 % | **0 %** (100) / 118.7 s / 0 % | **0 %** (67) / 119.4 s / 0 % | **0 %** (13) / 116.7 s / 0 % |
| giant | 29 % (96) / 65.3 s / 0 % | 17 % (96) / 86.7 s / 0 % | 8 % (96) / 97.1 s / 0 % | 13 % (100) / 78.0 s / 0 % |

**Five cells are at zero outright wins in session 01.** They are recorded as findings, not fixed
here:

- **The skeleton cannot kill an idle giant outright.** It wins every bout, but only through the
  drain.
- **The human cannot kill an idle anything outright.** With the drain it wins from 13 % (against
  the giant) to 100 % (against the skeleton). It is not the stroke. On the impact bench below, the anatomical blade peaks at
  11.2 m/s, closes at 7.8 and moves 0.99 kg plastically. The cause is the humanoid mind. Against an
  idle stone it holds about 1.6 m off the dummy's core; its tip comes no nearer than 0.47 m; and it
  deals 0 damage in 40 s. That is session 09 material (minds read bodies).

A later cell that falls to 0 outright wins from above 0 here is a red gate. Human rows are compared
on their drain column as well, since their outright column is 0 throughout.

### Effective mass

`tests/harness/impact-bench.mjs`: the Node impact bench, bench stand, NullEngine, real Havok.

**The tap.** Joints are free, the stand base is keyframed, and a unit impulse is applied at the tip.
The edge is across the blade and the axis is along the arm. "Free" is the terminal body alone;
"chain" is the whole arm. A chain that is straight along the normal reads `inf`, because it ends in
a keyframed base.

| Module | x1 edge | x1 axis | max edge | max axis | Terminal body kg (`impactMassKg`) |
| --- | ---: | ---: | ---: | ---: | ---: |
| wrist blade | 0.68 | 9.4-9.6 | 2.85-2.91 | inf | 1.30 |
| wrist fist | 2.44-2.49 | 9.5-9.7 | inf | inf | 1.30 |
| wrist mace | 1.74 | 12.6-13.1 | 2.91-2.95 | 37-38 | 2.92 |
| wrist maul | 4.45-4.53 | 34.8-43.7 | 5.41-5.49 | inf | 7.78 |
| wrist whip | 0.11-0.12 | 0.54-0.67 | 0.14 | 0.60-0.76 | 0.38 |
| wrist plate | 4.62-4.72 | 8.1-8.2 | 12.8-13.5 | 16.9-17.1 | 2.30 |
| skeletal blade | 0.68 | 4.4-4.6 | 1.53-1.55 | 24.6-25.1 | 1.30 |
| pitch blade | 0.79 | inf | 1.07 | inf | 1.30 |
| anatomical blade | 0.55 | 8.2-10.6 | 0.62-0.63 | 17.4-22.6 | 1.30 |
| anatomical fist | inf | 3.1-3.4 | inf | 5.7-6.1 | 0.35 |
| none (bare cap) | inf | inf | inf | inf | 0.57 / 2.21 |

**The stroke.** Each striker swings its own stroke into a free, gravity-free sphere hung at its
peak-speed point. The reading is taken at separation: the implied plastic mass
`M * dv / (v - dv)`. The table gives the 90 kg sphere (the 5, 20 and 500 kg readings are in the
raw output).

| Module | Level | Peak tip m/s | Closing m/s | Implied plastic kg | Restitution | Contact substeps |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| wrist blade | x1 | 18.2 | 12.7 | 1.45 | -0.17 | 2 |
| wrist blade | max | 21.1 | 17.4 | 4.17 | -0.09 | 5 |
| wrist mace | x1 | 34.4 | 29.0 | 3.67 | -0.03 | 9 |
| wrist mace | max | 36.2 | 31.7 | 7.55 | 0.04 | 6 |
| wrist maul | x1 | 22.6 | 19.5 | 7.18 | 0.09 | 2 |
| wrist maul | max | 18.6 | 16.0 | 9.29 | -0.02 | 2 |
| wrist whip | max | 21.0 | 17.7 | 0.29 | 0.27 | 2 |
| pitch blade | x1 | 15.3 | 9.2 | 1.14 | -0.02 | 2 |
| pitch blade | max | 20.2 | 12.0 | 1.61 | -0.02 | 2 |
| skeletal blade | x1 | 17.5 | 11.8 | 3.62 | -0.82 | 15 |
| skeletal blade | max | 18.0 | 14.3 | 4.29 | -0.72 | 15 |
| anatomical blade | x1 | 11.2 | 7.8 | 0.99 | -0.01 | 2 |
| anatomical blade | max | 12.7 | 9.5 | 1.15 | 0.02 | 2 |

- **An impulsive stroke moves about the terminal's own mass.** The x1 blade moves 1.45 kg against
  a declared 1.30, the mace 3.67 against 2.92, the maul 7.18 against 7.78. At max the chain comes
  in: the blade moves 4.17 kg and the mace 7.55.
- **Several strokes are pushes, not impacts.** Their readings are not effective masses, because
  the drive is in them (session 05's model leaves the motors out):
  - the wrist fist at x1 and max: 11 to 64 substeps, closing below 7.3 m/s;
  - the wrist plate at max: 12 to 71 substeps;
  - the anatomical fist at max: 17 to 29 substeps;
  - the skeletal blade: 15 substeps, restitution -0.8.

  The x1 whip reads a negative closing speed, because its lash met the sphere going backwards.
- **Some strikers overlapped the sphere where it was hung**, so the bench records no contact for
  them: the x1 plate, the bare cap at both levels, and the x1 anatomical fist. Their tap readings
  stand.

### Lift capacity

`tests/harness/lift-bench.mjs`: the Node lift bench, bench stand, NullEngine, real Havok.

A 20 kg plate rides a `Physics6DoFConstraint` slider to an ANIMATED anchor, with gravity off, at a
gap of 0.2 or 0.4 m from the arm's free tip. The arm is commanded into it, either up (pointer up,
thrust) or sideways (pointer out, thrust). Every substep from the command onward, an impulse
presses the plate back against the arm at `F * substep`. The capacity is the largest F under which
the plate still moves at least half the gap toward the tip. F doubles from 250 N until a failure
and then bisects to 50 N. Each figure is in N, with its ratio to the x1 family's body weight in
brackets.

**The plan's method was abandoned.** It pushed into a keyframed slab and summed the contact
impulses. That read several kN, and the readings were not monotonic, while the same arm dropped
a 50 kg dynamic plate. Against a keyframed body the contact reaction includes whatever the arm's
column carries structurally, so it does not measure what the motors can lift. The slider holds
the load dynamic and reads what the arm can move.

| Module | Level | Up 0.2 m | Up 0.4 m | Sideways 0.2 m | Sideways 0.4 m | x1 body weight N |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| reach blade | x1 | 1688 (1.90) | 1938 (2.18) | 188 | 31 | 889 |
| reach blade | x1.25 | 2875 (3.23) | 2563 (2.88) | 125 | 0 | 889 |
| reach blade | max | 1125 (1.27) | 781 (0.88) | 0 | 0 | 889 |
| reach fist | x1 | 1406 (1.58) | 1563 (1.76) | 1500 (1.69) | 438 | 889 |
| reach fist | x1.25 | 2844 (3.20) | 2750 (3.09) | 688 | 0 | 889 |
| reach fist | max | 2469 (2.78) | 2500 (2.81) | 250 | 0 | 889 |
| wrist blade | x1 | 1406 (1.58) | 1281 (1.44) | 31 | 94 | 889 |
| wrist blade | x1.25 | 2031 (2.28) | 1250 (1.41) | 0 | 0 | 889 |
| wrist blade | max | 688 (0.77) | 719 (0.81) | 0 | 0 | 889 |
| wrist fist | x1 | 1813 (2.04) | 1344 (1.51) | 625 (0.70) | 31 | 889 |
| wrist fist | x1.25 | 2250 (2.53) | 2250 (2.53) | 281 | 63 | 889 |
| wrist fist | max | 2031 (2.28) | 1875 (2.11) | 94 | 0 | 889 |
| pitch blade | x1 | 156 (0.18) | 125 (0.14) | 0 | 0 | 889 |
| pitch blade | max | 375 (0.42) | 344 (0.39) | 0 | 0 | 889 |
| pitch fist | x1 | 438 (0.49) | 0 | 0 | 0 | 889 |
| pitch fist | max | 938 (1.05) | 0 | 0 | 0 | 889 |
| skeletal blade | x1 | 1313 (4.40) | 1594 (5.35) | 94 | 125 | 298 |
| skeletal blade | max | 2125 (7.13) | 2594 (8.70) | 63 | 0 | 298 |
| skeletal fist | x1 | 2063 (6.92) | 2188 (7.34) | 2531 (8.49) | 1688 (5.66) | 298 |
| skeletal fist | x1.25 | 3625 (12.16) | 4219 (14.16) | 2875 (9.65) | 563 (1.89) | 298 |
| skeletal fist | max | 3906 (13.11) | 3906 (13.11) | 1844 (6.19) | 500 (1.68) | 298 |
| anatomical blade | every level | 0 | 0 | 0 | 0 | 1093 |
| anatomical fist | x1 | 94 (0.09) | 94 (0.09) | 188 (0.17) | 125 (0.11) | 1093 |
| anatomical fist | max | 63 (0.06) | 94 (0.09) | 125 (0.11) | 94 (0.09) | 1093 |

- **An x1 stone arm lifts 1.4 to 2.2 times its own body's weight straight up.** Sideways it moves
  next to nothing with a blade, which slides off the plate edge-on.
- **An x1 skeleton arm lifts 4.4 to 7.3 times the skeleton's weight.** An x1.25 skeletal fist
  lifts 14 times it.
- **The human arm cannot lift a tenth of a human.**
- **`max` is often below x1.25.** The wrist blade lifts 688 N at max and 2031 at x1.25. Max
  lengthens the arm as well as strengthening it, and the extra lever costs more than the torque
  buys.

Session 04 sizes a family's density at the lightest level where its x1 arms fall short of its x1
weight by a factor of 1.25. On these figures that takes stone to about 2.2 × 1.25 ≈ 2.7 times its
present body weight. It would take the skeleton to about nine times its own. Session 04 already
says to report the skeleton's case and not to make the skeleton heavier to hide it. The human
needs nothing.

### Mass census

`tests/harness/mass-census.mjs`: the Node mass census, `createBout`, supported locomotion,
NullEngine, real Havok. Every body a golem owns is asked `getMassProperties()`.

| Family | Whole kg | Carrier | Legs | Trunk | Head | Arm links | Items | Supported kg | Upper kg, build / solver |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| stone | 90.64 | 15.13 | 17.79 | 27.86 | 14.24 | 12.02 | 3.60 | 89.09 | 56.17 / 57.72 |
| giant (stone at max) | 337.54 | 59.10 | 69.48 | 108.84 | 55.62 | 40.88 | 3.60 | 337.54 | 208.95 / 208.95 |
| skeleton | 30.38 | 3.00 | 5.00 | 11.50 | 1.80 | 5.48 | 3.60 | 28.30 | 20.30 / 22.38 |
| human | 111.45 | 14.00 | 31.00 | 42.35 | 7.50 | 11.80 | 4.80 | 111.45 | 66.45 / 66.45 |
| wheel | 117.39 | 17.64 | 42.02 | 27.86 | 14.24 | 12.02 | 3.60 | **59.66** | 56.17 / 57.72 |
| multileg | 102.34 | 32.08 | 12.54 | 27.86 | 14.24 | 12.02 | 3.60 | **44.61** | 56.17 / 57.72 |

- **The wheel and the multileg carry their upper body for nothing.** Their locomotion computes the
  carried mass once at build from the mount, which reads 0 there, and only the biped has a
  `carry()` that updates it. So their stability divisor and their gravity-compensation drive leave
  out the 56 to 58 kg on top. That feeds sessions 04 and 05.
- **The effector definitions understate what the solver moves**, because their declared mass
  leaves out the wrist and roll-ring parts:
  - wrist blade arm: 6.53 kg declared, 6.91 in the solver;
  - wrist plate arm: 7.53 declared, 8.71 in the solver.

  The build's upper mass is 1.55 kg short on stone and 2.08 on the skeleton for the same reason.

## Physical contact 02: getting up

Session 02 (`docs/plans/2026-09-23-physical-contact-02-getting-up.md`) made rising the body's own,
let a refused rise relocate, retried a rise that never reached posture, took away the skeleton's
rise immunity, and gave every downed body one `GROUNDED_TONE` of 0.55. The census and the sweeps
below are on body fingerprint f47debdd7ce3, which is 7e2b4d3 with view fields and census
instrumentation that change no behaviour. Raw outputs are in `research/runs/pc02/`, which is not
committed. The bench that chose the tone is in the constant's doc comment.

### Downed census

`research/downed-census.mjs`: Node harness, research runner, supported locomotion, cap 150 s,
96 side-swap blocks a group, seed 20260923, the same three groups as session 01.

| Group | Knockdowns / body / bout | Episodes | p50 / p90 / max s | > 5 s | > 5 s time % | Down time % |
| --- | ---: | ---: | --- | ---: | ---: | ---: |
| stone | 3.96 | 1520 | 0.80 / 1.53 / 81.58 | 12 | 2.3 | 15.2 |
| skeleton | 3.79 | 1455 | 3.63 / 6.78 / 19.75 | 347 | 11.6 | 27.8 |
| giant group | 1.57 | 603 | 0.80 / 1.38 / 104.22 | 5 | 2.4 | 5.8 |

Against session 01, the skeleton's longest episode fell from 103.57 s to 19.75 and its episodes
over 5 s rose from 29 to 347. Nothing waits for ever now. The skeleton's episodes are longer at
the middle because its rises can be put down again.

**What put a rise back down.** Each rise that went back to `fallen` was named at the edge by a
latch on the port (`RiseGateDiagnostic.riseAbort`), because the census samples at 60 Hz and the
port steps at 240. The latch was added after this census. The rerun on d02007a reproduced every
figure above exactly.

| Group | Blow | Refused: occupancy | Refused: support chain | Posture deadline |
| --- | ---: | ---: | ---: | ---: |
| stone | 147 | 419 | 8 | 5 |
| skeleton | 345 | 204 | 2 | 0, and one the latch did not name |
| giant group | 30 | 101, not split by reason | | 0 |

The occupancy refusals are nearly all a touch. Another footprint sat inside the rise's target by
under a centimetre in 399 of stone's 419 and 203 of the skeleton's 204 (bucketed with a
diagnostic-only build of the same tree). The pair resolver holds two footprints exactly in contact,
and the gate judged a rise under way against zero clearance, so rounding at contact cancelled the
rise. The repair is under session 03 below.

**The target, "no episode longer than 5 s unless the body is struck through it", was missed.** A
long episode counts as struck through when a blow put at least one of its rises down.

- stone: 6 of its 12 long episodes were struck through;
- skeleton: 260 of its 347;
- giant group: none of its 5. Their causes are no ground (3) and a wall (2).

The skeleton's other 87 long episodes are the touch refusals. Every one of its long episodes spent
longest waiting for the fall to settle. That is a skeleton whose rise was put down lying out a
second settle, up to its 2.5 s cap.

**Stun-lock** (reported, not gated):

| Group | Repeat knockdowns | Share of episodes % | Longest chain | First down loses % (decided) |
| --- | ---: | ---: | ---: | --- |
| stone | 575 | 37.8 | 13 | 53.8 (173) |
| skeleton | 279 | 19.2 | 6 | 61.8 (191) |
| giant group | 109 | 18.1 | 5 | 47.1 (172) |

**Finishing:**

| Group | Down windows | Scored % | Damage / downed s | Damage / standing s | Share of damage on a downed body % | Socket to core p50 m |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| stone | 2174 | 56.6 | 0.544 | 0.218 | 34.6 | 1.55 |
| skeleton | 6771 | 32.4 | 0.071 | 0.022 | 63.2 | 1.48 |
| giant group | 1069 | 45.2 | 0.480 | 0.283 | 10.1 | 1.78 |

### x1 controls

- **Stone**, the control row of the giant sweep below: damage 7.58 [7.38, 7.79] and knockdowns
  5.36 [4.90, 5.82] per body a bout, 29.7 s. Both intervals overlap session 01's, so it is within
  band.
- **Skeleton**, `research/stat-sweep.mjs --build skeleton-warrior --minds skeleton-duelist --stat
  stability --levels 1 --pairs 192`, x1 level, the same seed. Session 01 wrote no skeleton band,
  so the before side was run on 2a8ff8d (session 01's tree):

  | Tree | Damage / body / bout | Knockdowns / body / bout | Seconds |
  | --- | ---: | ---: | ---: |
  | 2a8ff8d, before | 1.89 [1.84, 1.94] | 4.85 [4.64, 5.07] | 59.5 |
  | 7e2b4d3, after | 1.91 [1.87, 1.96] | 5.36 [5.11, 5.61] | 57.2 |

  Damage is unchanged. Knockdowns rose past the band. That is intended: a rising skeleton now falls
  at the standing fall line instead of being immune, so a rise is a knockdown that can happen.
- **Fingerprint diff**, 54f8c58e92e5 to f47debdd7ce3: `src/supported-locomotion-state.ts`,
  `src/supported-locomotion-production.ts`, `src/supported-locomotion.ts`, `src/golem/golem.ts`,
  `src/golem/locomotion.ts` and its three modules, `src/golem/module.ts`, `src/golem/config.ts`,
  `src/golem/skeleton/body.ts` and `src/dungeon/world.ts`. Every one is the session's own.

### The giant

`research/stat-sweep.mjs --attributes max,max-normal-body,size-weight-max --pairs 192`, as in
session 01:

| Level | Win % [95 %] | Dealt / taken | Knockdowns | Other's knockdowns | Time down % | Other's % | Seconds |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| control | 48.8 [43.6, 54.4] | 7.57 / 7.59 | 5.12 | 5.60 | 14.2 | 16.1 | 29.7 |
| max | 48.3 [42.8, 53.9] | 7.94 / 15.73 | 0.08 | 4.05 | 1.1 | 9.5 | 39.0 |
| max-normal-body | 96.6 [94.8, 98.2] | 10.00 / 6.26 | 1.77 | 5.92 | 6.0 | 22.4 | 23.1 |
| size-weight-max | 11.7 [8.6, 15.1] | 3.71 / 9.66 | 0.11 | 1.61 | 1.6 | 5.8 | 28.2 |

### Idle-dummy matrix

`research/idle-dummy.mjs --blocks 12`, as in session 01. The cells are outright win rate, win rate
with the drain, and median time of a win:

| Attacker \ idle dummy | stone | skeleton | human | giant |
| --- | --- | --- | --- | --- |
| stone | 50 % (100) / 61.5 s | 63 % (92) / 37.6 s | 21 % (100) / 74.4 s | 17 % (92) / 78.6 s |
| skeleton | 8 % (100) / 88.0 s | 75 % (100) / 50.6 s | 13 % (100) / 76.4 s | **0 %** (100) / 109.0 s |
| human | **0 %** (50) / 119.3 s | **0 %** (100) / 117.4 s | **0 %** (67) / 119.4 s | **0 %** (13) / 116.7 s |
| giant | 54 % (100) / 57.6 s | 54 % (92) / 48.5 s | 13 % (96) / 85.1 s | 13 % (100) / 78.0 s |

The same five cells are at zero as in session 01, and none newly. The skeleton dummy is easier to
beat now: skeleton on skeleton went from 29 % to 75 %, and giant on skeleton from 17 % to 54 %. It
falls, and it no longer rises through blows.

## Physical contact 03: finishing

Session 03 (`docs/plans/2026-09-23-physical-contact-03-finishing.md`) published support state and a
live vital point in the view, and gave every golem executor one finishing rule from `src/downed.ts`.
The census below also found a defect in session 02's rise, and its repair landed during this
session. So there are three trees after session 02's f47debdd7ce3, and each is named by its body
fingerprint:

- **c2684e7e4fa3**: 9a15d41, the finishing minds.
- **3fe903bf0f8d**: 7429947, the first repair of the rise, a hysteresis on the occupancy gate. It
  treated a symptom and was reverted.
- **1cf586933d58**: 1ae905f, the repair that stands: a rising carrier stands still. The census ran
  before a comment in that commit was reworded, so the idle matrix, run after the rewording, reads
  4fdcad54e456 for the same behaviour.

Raw outputs are in `research/runs/pc03`, `pc03b` and `pc03c`, which are not committed.

### Downed census

`research/downed-census.mjs`: Node harness, research runner, supported locomotion, cap 150 s,
96 side-swap blocks a group, seed 20260923.

| Group | Tree | Knockdowns / body / bout | p50 / p90 / max s | > 5 s | Down time % | Rises refused | Rises put down by a blow |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: |
| stone | f47debdd7ce3 (session 02) | 3.96 | 0.80 / 1.53 / 81.58 | 12 | 15.2 | 427 | 147 |
| stone | c2684e7e4fa3 | 4.35 | 0.80 / 1.57 / 62.03 | 11 | 16.0 | 535 | 155 |
| stone | 3fe903bf0f8d | 4.17 | 0.80 / 1.55 / 70.60 | 3 | 15.1 | 419 | 160 |
| stone | **1cf586933d58** | 4.26 | 0.80 / 0.82 / 52.62 | **1** | 11.3 | **19** | 97 |
| skeleton | f47debdd7ce3 (session 02) | 3.79 | 3.63 / 6.78 / 19.75 | 347 | 27.8 | 206 | 345 |
| skeleton | c2684e7e4fa3 | 4.58 | 3.65 / 7.22 / 71.52 | 503 | 35.0 | 448 | 411 |
| skeleton | 3fe903bf0f8d | 4.49 | 3.65 / 7.10 / 71.52 | 459 | 34.5 | 378 | 394 |
| skeleton | **1cf586933d58** | 4.47 | 3.63 / 6.73 / 16.58 | **363** | 32.2 | **99** | 399 |
| giant group | f47debdd7ce3 (session 02) | 1.57 | 0.80 / 1.38 / 104.22 | 5 | 5.8 | 101 | 30 |
| giant group | c2684e7e4fa3 | 1.60 | 0.80 / 2.20 / 104.03 | 9 | 6.1 | 442 | 47 |
| giant group | 3fe903bf0f8d | 1.59 | 0.80 / 1.90 / 104.03 | 4 | 5.7 | 269 | 46 |
| giant group | **1cf586933d58** | 1.65 | 0.80 / 0.82 / 104.03 | **2** | 4.1 | **2** | 39 |

"Rises refused" counts every rise the port put back down for occupancy or the support chain. On
session 02's tree it is the sum of those two columns of its table.

**The finishing minds put more rises down, and nearly all of them were refusals.** On c2684e7e4fa3
a standing mind walks in on a downed body, and refused rises went from 427 to 535 on stone and from
101 to 442 on the giant group.

**Why a rise was refused.** Diagnostic-only builds of 7429947 named the body inside a refused rise's
target; they are the `census-refusal*`, `census-stop*` and `census-held` logs in
`research/runs/pc03b`. The body was the **other** one, standing, and the rising body had led it
there. `PhysicalSupportedLocomotionPort.proposal` stopped the carrier only while `fallen`, so a
rising carrier walked on its mind's request. The pair resolver takes each carrier's closing move
away by its resistance share, so the follower kept pace, and the riser's own target, fixed where its
rise began, filled with the body walking after it. The hysteresis on 3fe903bf0f8d let a touch
through and left the walk alone. Holding the carrier while `rising` (1ae905f) took refused rises
from 419 to 19 on stone, from 378 to 99 on the skeleton and from 269 to 2 on the giant group. Two of
the 120 left were against a body on its feet.
`a_rising_body_that_is_asked_to_walk_keeps_its_carrier_on_its_rise_and_gets_up` in
`tests/supported-locomotion-obstacles.test.mjs` pins it.

**Session 02's target is now met on stone and the giant group, and still missed on the skeleton.**
One long stone episode is left, a body with no ground under it until the bout ended, and two giant
ones, at a wall. 304 of the skeleton's 363 long episodes were struck through. Each of the other 59
spent longest waiting for its fall to settle, which is session 08's.

**Stun-lock** (reported, not gated), on 1cf586933d58:

| Group | Repeat knockdowns | Share of episodes % | Longest chain | First down loses % (decided) |
| --- | ---: | ---: | ---: | --- |
| stone | 564 | 34.5 | 8 | 53.2 (173) |
| skeleton | 429 | 25.0 | 6 | 60.7 (191) |
| giant group | 109 | 17.2 | 4 | 48.8 (172) |

### Finishing

The same census, one-second windows of the other body down:

| Group | Tree | Down windows | Scored % | Damage / downed s | Damage / standing s | Share of damage on a downed body % | Socket to core p50 m |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| stone | f47debdd7ce3 (session 02) | 2174 | 56.6 | 0.544 | 0.218 | 34.6 | 1.55 |
| stone | c2684e7e4fa3 | 2269 | 60.7 | 0.544 | 0.230 | 34.9 | 1.33 |
| stone | 1cf586933d58 | 1787 | 67.0 | 0.590 | 0.193 | 30.3 | 1.32 |
| skeleton | f47debdd7ce3 (session 02) | 6771 | 32.4 | 0.071 | 0.022 | 63.2 | 1.48 |
| skeleton | c2684e7e4fa3 | 8915 | 27.8 | 0.058 | 0.022 | 68.1 | 1.32 |
| skeleton | 1cf586933d58 | 7833 | 30.4 | 0.064 | 0.023 | 65.0 | 1.31 |
| giant group | f47debdd7ce3 (session 02) | 1069 | 45.2 | 0.480 | 0.283 | 10.1 | 1.78 |
| giant group | c2684e7e4fa3 | 1040 | 57.9 | 0.656 | 0.308 | 12.9 | 1.58 |
| giant group | 1cf586933d58 | 804 | 61.1 | 0.665 | 0.266 | 10.0 | 1.49 |

The finishing minds moved the standing side's socket 0.16 to 0.22 m closer to a downed core (the
first two rows of each group).

**The plan's target reads "when the standing side is in reach", so the census now splits the
windows by it** (756e166). A window counts as in reach if, at any frame of it, the standing side's
socket came within its own published reach of the other body's core. "Touched" counts any contact,
under the weapon's energy floor or not. The control is windows with both bodies up. On
1cf586933d58:

| Group | Down windows in reach | Scored % | Touched % | Both-up windows in reach | Scored % | Touched % |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| stone | 1733 | 69.0 | 99.3 | 11292 | 33.7 | 93.4 |
| skeleton | 7056 | 33.4 | 87.3 | 11445 | 11.7 | 80.9 |
| giant group | 666 | 73.6 | 98.8 | 14899 | 42.0 | 94.1 |

- **A downed body in reach is struck in most of its windows on stone and the giant group.** That
  meets the target.
- **The skeleton misses the target, and not for want of reach.** It touches the downed body in 87 %
  of the windows and scores in a third of them, because its blows land under its weapon's energy
  floor. On a standing skeleton it scores at a third of that rate, so a downed skeleton is already
  the easier mark. The fix belongs to sessions 04 and 05: mass and the energy floor.

The hold each mind takes on a downed body is in the plan's "What landed". It came from a Node probe
in the headless arena, not from this census.

### x1 controls

The stone column is `research/control-band.mjs` on the control row of each giant sweep. The skeleton
column is `--level x1.00` of `research/stat-sweep.mjs --build skeleton-warrior --minds
skeleton-duelist --stat stability --levels 1 --pairs 192`. Both are Node harness, research runner,
supported locomotion, cap 150 s, seed 20260923. All four figures are per body a bout.

| Tree | Stone damage | Stone knockdowns | Skeleton damage | Skeleton knockdowns |
| --- | --- | --- | --- | --- |
| session 01 | 7.64 [7.43, 7.85] | 4.93 [4.54, 5.32] | 1.89 [1.84, 1.94] | 4.85 [4.64, 5.07] |
| f47debdd7ce3 (session 02) | 7.58 [7.38, 7.79] | 5.36 [4.90, 5.82] | 1.91 [1.87, 1.96] | 5.36 [5.11, 5.61] |
| c2684e7e4fa3 | 7.76 [7.57, 7.96] | 6.00 [5.52, 6.49] | 1.93 [1.88, 1.98] | 6.79 [6.49, 7.07] |
| 3fe903bf0f8d | 7.73 [7.52, 7.94] | 5.47 [5.05, 5.91] | 1.96 [1.90, 2.02] | 6.66 [6.39, 6.93] |
| 1cf586933d58 | 7.61 [7.39, 7.82] | 4.68 [4.31, 5.08] | 1.96 [1.91, 2.01] | 5.89 [5.66, 6.13] |

- **Damage never left the band.**
- **Stone's knockdowns rose out of the band with the finishing minds, and came back when the
  carrier was held.** `research/worker.mjs` counts every edge into `fallen`, and a refused rise is
  such an edge. So the 6.00 counted the refusals the finishing minds provoked, and the 4.68 is
  below session 02's figure.
- **The skeleton's knockdowns are still above session 01's**, for session 02's reason: a rising
  skeleton can fall.

The fingerprint diff from f47debdd7ce3 to 1cf586933d58 is `src/downed.ts`, `src/golem/golem.ts`,
`src/golem/tactics.ts`, `tactics-v2.ts` to `-v4.ts`, `src/mind.ts`, `src/options.ts` and
`src/supported-locomotion-production.ts`. Every one is this session's or the rise repair's.

### The giant

`research/stat-sweep.mjs --attributes max,max-normal-body,size-weight-max --pairs 192`, on
1cf586933d58:

| Level | Win % [95 %] | Dealt / taken | Knockdowns | Other's knockdowns | Time down % | Other's % | Seconds |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| control | 51.3 [46.1, 56.5] | 7.75 / 7.46 | 4.58 | 4.78 | 11.8 | 12.4 | 32.9 |
| max | 48.3 [42.7, 53.6] | 7.82 / 15.67 | 0.00 | 3.51 | 0.0 | 7.7 | 41.1 |
| max-normal-body | 95.3 [93.0, 97.4] | 9.96 / 7.01 | 1.99 | 5.47 | 4.9 | 15.7 | 30.1 |
| size-weight-max | 13.5 [9.9, 17.4] | 3.63 / 9.28 | 0.02 | 1.46 | 0.1 | 4.9 | 30.4 |

Every win rate is within its session 02 interval.

### Idle-dummy matrix

`research/idle-dummy.mjs --blocks 12`, on 4fdcad54e456, which behaves the same as 1cf586933d58.
Each cell is the outright win rate, the win rate with the drain in brackets, and the median time of
a win:

| Attacker \ idle dummy | stone | skeleton | human | giant |
| --- | --- | --- | --- | --- |
| stone | 58 % (100) / 54.8 s | 75 % (96) / 36.2 s | 21 % (100) / 74.4 s | 17 % (92) / 78.6 s |
| skeleton | 13 % (100) / 82.5 s | 83 % (100) / 45.8 s | 13 % (100) / 76.4 s | **0 %** (100) / 109.0 s |
| human | **0 %** (50) / 119.3 s | **0 %** (100) / 117.6 s | **0 %** (67) / 119.4 s | **0 %** (13) / 116.7 s |
| giant | 58 % (100) / 54.9 s | 71 % (100) / 39.1 s | 8 % (96) / 85.1 s | 13 % (100) / 78.0 s |

The same five cells are at zero, and none newly. Stone and skeleton attackers beat a stone or
skeleton dummy more often than on session 02's tree: stone on stone went from 50 % to 58 %, and
skeleton on skeleton from 75 % to 83 %.

## Physical contact 04: bodies heavy enough

Session 04 (`docs/plans/2026-09-23-physical-contact-04-family-masses.md`) landed in two commits:

- **66ee353**: every carrier holds up its whole body.
- **562f8b2**: stone's body takes its own density, `STONE_BODY_DENSITY` 1300 kg/m3 in
  `src/golem/config.ts`, with the per-family `stabilityMassRatio` as the holding repair.

The "before" of the benches and of the skeleton and human controls is 66ee353. The "before" of the
stone control is session 03's 1cf586933d58, so it includes both commits. "After" is 562f8b2, whose
body fingerprint is 2a589fb9fd98. Raw outputs are in `research/runs/pc04`, which is not committed.

### Mass census

`tests/harness/mass-census.mjs`: Node harness, `createBout`, supported locomotion, NullEngine, real
Havok. Whole kg:

| Family | Before | After | Carrier | Legs | Trunk | Head | Arm links | Items | Supported, after |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| stone | 90.64 | 247.17 | 46.70 | 54.90 | 86.00 | 43.95 | 12.02 | 3.60 | 247.17 |
| giant (stone at max) | 337.54 | 948.97 | 182.42 | 214.45 | 335.94 | 171.68 | 40.88 | 3.60 | 948.97 |
| wheel | 117.39 | 329.72 | 54.45 | 129.70 | 86.00 | 43.95 | 12.02 | 3.60 | 329.72 |
| multileg | 102.34 | 283.27 | 99.00 | 38.70 | 86.00 | 43.95 | 12.02 | 3.60 | 283.27 |
| skeleton | 30.38 | 30.38 | 3.00 | 5.00 | 11.50 | 1.80 | 5.48 | 3.60 | 30.38 |
| human | 111.45 | 111.45 | 14.00 | 31.00 | 42.35 | 7.50 | 11.80 | 4.80 | 111.45 |

- **Every family's supported mass now equals its whole mass, and the build's upper mass equals the
  solver's** (stone 145.57 kg). Before 66ee353 the wheel supported 59.66 kg and the multileg 44.61,
  and the build's upper mass was 1.55 kg short on stone and 2.08 kg short on the skeleton.
- **The stone body is 2.727 times what it was; the arm links and items did not move.**
- **The human is at human scale.** The reference is Winter's segment fractions: head and neck 8.1 %,
  trunk with pelvis 49.7 %, thigh 10.0 %, shank 4.65 %, foot 1.45 %, upper arm 2.8 %, forearm 1.6 %,
  hand 0.6 %. Without items the human weighs 106.65 kg, and reads head 7.0 %, trunk with pelvis
  52.8 %, thigh 9.4 %, shin 3.8 %, foot 1.4 %, upper arm 2.6 %, forearm 1.9 % and hand 1.0 %. Every
  part is within a few points of a 105 kg man, so nothing was corrected. The one change: the human's
  waist was stone's, and it is now pinned at the 5.346 kg it weighed then (`HUMAN_WAIST`).
- **The skeleton is lighter than the human in every part, and heavier than bone.** Without items it
  weighs 26.78 kg, 25 % of the human. A reference man's skeleton is about a seventh of his body
  (ICRP 89: 10.5 kg of 73 kg, marrow and cartilage included), which would make it about 15 kg. It was
  not moved; see the plan's "What landed".

### Lift

`tests/harness/lift-bench.mjs`: Node harness, bench stand, NullEngine, real Havok.

- Capacity is the largest force against a slider plate that the arm still moves half the gap
  toward its free tip within 1.5 s, bisected to 50 N.
- The x1 stone body weighs 2425 N.
- No arm changed, so the capacities are session 01's; only the weight they are read against moved.

| Chain, item | x1 N, gap 0.2 / 0.4 m | x1, share of an x1 body | x1.25, share | max, share |
| --- | --- | --- | --- | --- |
| reach, blade | 1688 / 1938 | 0.70 / 0.80 | 1.19 / 1.06 | 0.46 / 0.32 |
| reach, fist | 1406 / 1563 | 0.58 / 0.64 | 1.17 / 1.13 | 1.02 / 1.03 |
| wrist, blade | 1406 / 1281 | 0.58 / 0.53 | 0.84 / 0.52 | 0.28 / 0.30 |
| wrist, fist | 1813 / 1344 | 0.75 / 0.55 | 0.93 / 0.93 | 0.84 / 0.77 |
| pitch, blade | 156 / 125 | 0.06 / 0.05 | 0.14 / 0.14 | 0.15 / 0.14 |
| pitch, fist | 438 / 0 | 0.18 / 0.00 | 0.39 / 0.00 | 0.39 / 0.00 |

- **No single x1 stone arm lifts an x1 stone body.** The strongest arm reaches 0.80 of its weight,
  which is the 1.25 margin the density was chosen for.
- **Two x1 arms together still lift one**: two reach blades give 3876 N against 2425 N. The plan's
  target is read per arm, on the owner's behalf. Holding it for two arms as well needs about 5.5 times
  the shipped body, which is past solid stone.
- **The max giant lifts an x1 body with both fists, but not with both blades.**
  - Fists: reach 2 x 2500 N, wrist 2 x 2031 N.
  - Blades: reach 2 x 1125 N, wrist 2 x 719 N.
  - `max` lengthens the arm as well as strengthening it, so on a blade chain it lifts less than
    x1.25 does. That is a finding about the arm's torque against its length, and it goes to session
    07; the density was not moved for it.
- **The skeleton lifts 4.4 to 8.7 times its own 298 N** (x1 blade 4.40 / 5.35, x1 fist 6.92 / 7.34).
  **The human lifts under a tenth of its own 1093 N.** Both are unchanged from session 01. Change 3
  said to report the skeleton and not fix it.

### Torques that move the body

Every leg, waist, neck, wheel and ram-lunge torque on a stone part goes through `onBody()`, which
multiplies it by `BODY_OVER_SHIPPED`, 3.086. The arm chains do not.

The table is in `onBody`'s doc comment in `src/golem/config.ts`. It comes from the Node golem bench
`--locomotion` and the Node torso bench, each read three ways: on the shipped body, with the density
alone, and with the density and the torque factor.

- **With the density alone**, the biped's walk lag went from 0.40 to 1.03 rad, and the ram's lunge
  went from 0.76 to 0.35 rad.
- **With the torque factor as well**, every row is within 0.01 of the shipped reading, except the
  wheel's lean: 0.64 against 0.70 rad.
- **The ram's plate needed body density too** (`HEAD_RAM.plateMass`). Under `kg()`, no torque factor
  restored the lunge.

The arm bench (`.review/size-bench.mjs arm`, Node harness) reads identically before and after.

### Knockdown bench

`.review/shove-bench.mjs`: Node harness, bench stand. Stagger / fall at scale 1.00, in N.s:

| Family | 66ee353 | Density alone | 562f8b2 |
| --- | --- | --- | --- |
| biped | 0.82 / 1.91 | 2.52 / 5.88 | 0.92 / 2.16 |
| multileg | 1.60 / 3.73 | 4.93 / 11.51 | 1.78 / 4.16 |
| wheel | 0.49 / 1.15 | 1.52 / 3.55 | 0.54 / 1.27 |
| skeleton | 0.79 / 1.84 | 2.24 / 5.22 | 2.24 / 5.22 |

**The bench's body is not the game's, so the holding repair reads 12 % high here.**

- Each family's `stabilityMassRatio` is what its assembled game body grew by (stone biped:
  247.17 / 90.64 = 2.727).
- The bench carries a ride block in place of a trunk, and that block is at body density too, so the
  bench body grew by 3.087.
- In a bout, the ratio returns each family's earlier supported mass exactly.
- The skeleton row is the skeleton's legs under stone's stand, so its ratio of 1 does nothing here.

### x1 controls

- **Stone:** `research/control-band.mjs` on the giant sweep's control row.
- **Skeleton and human:** `--level x1.00` of `research/stat-sweep.mjs --stat stability --levels 1
  --pairs 192`, with `skeleton-duelist` and `humanoid-duelist`.
- All three: Node harness, research runner, supported locomotion, cap 150 s, seed 20260923.

Figures are per body per bout:

| Tree | Stone damage | Stone knockdowns | Stone bout, median / mean s | Skeleton damage / knockdowns | Human damage / knockdowns |
| --- | --- | --- | --- | --- | --- |
| session 01 | 7.64 [7.43, 7.85] | 4.93 [4.54, 5.32] | -- | 1.89 / 4.85 | -- |
| 1cf586933d58 (session 03) | 7.61 [7.39, 7.82] | 4.68 [4.31, 5.08] | 28.8 / 32.9 | 1.96 / 5.89 | -- |
| 66ee353 | -- | -- | -- | 1.95 / 5.30 | 0.10 / 0.00 |
| **562f8b2** | 7.26 [7.02, 7.48] | **3.99 [3.67, 4.32]** | 13.4 / 17.7 | 1.95 / 5.30 | 0.10 / 0.00 |

- **66ee353 moved the skeleton's knockdowns from 5.89 to 5.30**, below session 03's band
  [5.66, 6.13] and toward session 01's 4.85. Its supported mass had left out 2.08 kg of wrist and
  roll ring, 7 % of the body, so every shove was read against too little mass. It was a correction,
  not a holding repair, and it was left.
- **562f8b2 leaves the skeleton and the human identical bout for bout.** Neither mass moved, and both
  pin the stone torques they inherited.
- **Stone's damage held, but its knockdowns per bout fell out of session 01's band. The gate is
  red.**
- **Diagnosis: stone bouts got shorter, and per second a stone body falls more often.**
  - The median bout went from 28.8 to 13.4 s.
  - Knockdowns per body per second went from 0.142 to 0.225.
  - A heavier trunk recoils less from its own swing and from the other's, so more blows land and each
    lands harder. `blows.mjs` (Node harness, the same seeds) reads a p90 wounding speed of 15.05 m/s
    against 13.28.
- **What was done about it: nothing.**
  - Restoring the count per bout would need a per-second rate 60 % above session 01's, which is not a
    holding repair.
  - So the ratios stay where the rule put them, and the set went on.
  - The gate lapses at session 08, and session 05 recalibrates the energy a blow carries.
  - The entry is under "Chosen on the owner's behalf" in session 10's plan.

The fingerprint diff (`research/fingerprint.mjs`, Node harness) from 66ee353 to 562f8b2: 31 sections
the same and 24 moved, and every section that moved has a stone body in it.

### The giant

`research/stat-sweep.mjs --attributes max,max-normal-body,size-weight-max --pairs 192`, on 562f8b2.
Node harness, research runner, supported locomotion, cap 150 s, seed 20260923:

| Level | Win % [95 %] | Dealt / taken | Knockdowns | Other's knockdowns | Time down % | Other's % | Seconds |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| control | 46.6 [41.7, 51.8] | 7.18 / 7.33 | 4.01 | 3.97 | 19.3 | 19.3 | 17.7 |
| max | 57.0 [51.6, 62.2] | 8.02 / 14.36 | 0.00 | 3.18 | 0.0 | 9.9 | 26.6 |
| max-normal-body | 93.8 [91.1, 96.1] | 9.83 / 6.06 | 1.47 | 5.18 | -- | -- | 19.5 |
| size-weight-max | 14.8 [11.2, 18.5] | 3.97 / 9.26 | 0.07 | 1.21 | -- | -- | 20.5 |

- **The max giant went from 48.3 % to 57.0 %.** Its body grew with the family's density and the x1
  body's arms did not, so an x1 body now moves a giant less.
- The time-down columns of the last two rows were not kept.

### Idle-dummy matrix

`research/idle-dummy.mjs --blocks 12`, on 562f8b2 (2a589fb9fd98). Each cell gives the outright win
rate, then the win rate with the drain in brackets, then the median time of a win:

| Attacker \ idle dummy | stone | skeleton | human | giant |
| --- | --- | --- | --- | --- |
| stone | 75 % (100) / 29.2 s | 83 % (96) / 17.6 s | 75 % (100) / 32.0 s | 63 % (100) / 46.5 s |
| skeleton | 17 % (100) / 86.4 s | 75 % (100) / 46.7 s | 13 % (100) / 76.4 s | **0 %** (100) / 105.1 s |
| human | **0 %** (58) / 119.1 s | **0 %** (100) / 117.7 s | **0 %** (67) / 119.4 s | **0 %** (8) / 118.3 s |
| giant | 88 % (100) / 32.6 s | 75 % (92) / 29.4 s | 63 % (100) / 56.3 s | 54 % (100) / 55.7 s |

- **The heavier stone dummy is still beaten outright by stone, the skeleton and the giant.** The
  human beats no dummy outright. The same five cells are at zero as on session 03's tree, and none of
  them is new.
- **Stone and the giant became much better attackers.** It is the same effect as the shorter bouts:
  a heavier trunk behind the same arm.
  - Stone on human: 21 % to 75 %.
  - Stone on giant: 17 % to 63 %.
  - Giant on human: 8 % to 63 %.
  - Giant on giant: 13 % to 54 %.

## Physical contact 05: effective mass

Session 05 (`docs/plans/2026-09-23-physical-contact-05-effective-mass.md`) landed in three commits:

- **0e2dee5**: a striker's point velocity turns about its centre of mass.
- **4acc9e3**: the effective-mass model (`src/golem/effective-mass.ts`) and the walk that feeds it
  (`src/body-inertia.ts`).
- **16108d3**: `Combat` reads both effective masses at the contact, every declared `impactMassKg`
  is gone, and the prices rise by what the chain adds.

The "before" is 562f8b2 / d47753c (same physics; research fingerprint 2a589fb9fd98). The "after" is
16108d3 (e69f3f7ac344). Raw outputs are in `research/runs/pc05`, which is not committed.

### The model against the impact bench

`tests/harness/impact-bench.mjs`: Node harness, bench stand, NullEngine, real Havok.

**Against the edge tap, the walk agrees within 5 %** on the wrist blade, the mace and the pitch
blade (`the_walk_reads_what_the_solver_does_at_an_edge_tap`). Both hold the joints free and the base
keyframed.

**Against a stroke** into a 90 kg sphere, with the motors let go at contact and the joint stops
opened, the momentum the stroke gave up, in kg:

| Chain, item | Stroke | Walk, solver properties | Walk, parts' own solids |
| --- | ---: | ---: | ---: |
| wrist blade x1 | 1.47 | 1.11 | 0.77 |
| wrist blade max | 3.41 | 2.93 | 0.82 |
| mace x1 | 3.17 | 2.97 | 2.35 |
| mace max | 4.95 | 4.50 | 2.41 |
| maul x1 | 9.20 | 10.32 | 8.37 |
| maul max | 11.76 | 14.77 | 8.39 |
| pitch blade x1 | 0.96 | 0.89 | 0.89 |
| pitch blade max | 1.29 | 1.16 | 1.16 |

- The walk through the solver's properties is within about a quarter of the stroke either way.
  Through the parts' own solids, a max blade reads no heavier than an x1 one. So the walk reads the
  solver, floors and all, which reverses the plan (see session 10's "Chosen on the owner's
  behalf").
- **A joint resting on its stop is what the model leaves out.** With the stops left in place, the
  max mace gave up 7.51 kg against the walk's 4.50.
- Session 01's mace and maul ground truth was taken through the old lever, which read the angular
  term from the geometric centre (0e2dee5 fixes it). A tap on the mace's edge read 0.875 kg, against
  the 1.07 kg that the rigid-body formula and a reading from the centre of mass agree on. The stroke
  column above is re-measured through the new lever.

### Prices

Every contact of x1 bouts was recorded on the declared-mass tree, 4acc9e3's walk beside `Combat`'s
own masses, then re-scored offline through the real `scoreHit` (`.review/contacts.mjs` and
`solve.mjs` in a probe worktree, Node harness, `runBout`, supported locomotion). The re-score of
the declared masses reproduces `Combat`'s damage exactly (worst difference 0).

The factor that holds the summed contact damage at x1, per build and mechanism:

| Build | Edge | Blunt |
| --- | ---: | ---: |
| default | **1.783** | 3.660 |
| mace | -- | 3.085 |
| maul | -- | 4.974 |
| pooled default, mace, maul | -- | **3.786** |
| skeleton-warrior | 2.475 | 6.118 |
| human-warrior | 1.373 | -- |

- The edge factor is anchored on the default build (13879 contacts), and the blunt factor is pooled
  over the three stone blunt builds (41189 contacts).
- Each floor moves by its price's factor. Chop takes the edge's factor. The point floor stays: the
  only point is an arrow, and it still carries its own mass.
- The results are `cutJoulesPerDamage` 62.08, `chopJoulesPerDamage` 46.24, `crushJoulesPerDamage`
  436.29, `cutFloorJ` 10.62 and `crushFloorJ` 29.67.

**One price across bodies moves whatever couples differently.** Summed damage on the same contacts,
at the chosen factors:

| Build | Striker | Summed damage | Note |
| --- | --- | ---: | --- |
| default | sword | x1.000 | the anchor |
| default | fist | x0.950 | |
| mace | club | x0.688 | |
| maul | club | x1.399 | |
| ram-capped | ram | x0.199 | wounding contacts 89 to 24 |
| ram-capped | cap shove | x40.1 | a median 79 kg behind the 0.567 kg it declared |
| ram-blade | ram / sword | x0.49 / x0.922 | |
| whip | whip / fist | x0.496 / x1.296 | |
| fists | fists | x1.365 | |
| skeleton-warrior | sword / fist | x1.531 / x2.129 | |
| human-warrior | sword | x0.507 | effective 0.74 of the declared, median contact |

- **The ram fell because it was the only striker that had always declared its chain.** Its
  `kg(74)` already counted the neck and trunk, and every arm gained its chain for the first time.
- **The capped shove rose because its cap is bolted to a 250 kg body.**
- **The human fell because its light arm couples less than its blade declared.**

### What a blow carries

`.review/blows.mjs`: 64 stone default mirrors over the four probe minds, seeds 1000+i and 2000+i,
cap 150 s, Node harness, `runBout`, supported locomotion:

| Measure | Before | After |
| --- | ---: | ---: |
| Bout length | 18.6 s | 23.3 s |
| Contacts per second | 17.16 | 16.53 |
| Wounding blows per second | 1.49 | 1.71 |
| Median energy of a wounding blow | 14.9 J | 34.3 J |
| Damage per wounding blow | 0.439 | 0.366 |
| Its p10 / median / p90 | 0.064 / 0.206 / 0.949 | 0.047 / 0.196 / 0.853 |
| Its p99 / max | 4.186 / 8.43 | 2.279 / 6.48 |
| Damage per second | 0.656 | 0.628 |
| Wounding blows by striker | sword 1322, fist 460 | sword 2037, fist 518 |

**The tail shrank, and no extended thrust makes it.** The plan's warning sign was a tail of huge
blows from near-extended thrusts. What moved is where the tail sits on the blade:

- **Before:** 15 of the 17 blows above the 99th percentile landed within 0.3 m of the tip, at a
  median 21.6 m/s.
- **After:** 8 of the 25 did. The largest two were slow near-hilt draws:
  - 6.48, closing at 1.31 m/s and sliding at 27.8 m/s, 0.79 m from the tip, with 14.9 kg behind it;
  - 5.09, closing at 0.78 m/s, 0.77 m from the tip, with 15.1 kg.
- Near the hilt, the chain couples most. The draw term pays for the slide. It is on the eye list.

### Fingerprint

`tests/harness/body-fingerprint.mjs --against` session 04's, Node harness: 40 sections the same and
15 moved.

- Every bench, head, torso and walk section is the same.
- Every bout moved. The model reads the solver, and only scoring moved.

### x1 controls

Measured the way session 04's were: Node harness, research runner, supported locomotion, cap 150 s,
seed 20260923. Per body per bout, 95 % bootstrap over the 192 blocks:

| Tree | Stone damage | Stone knockdowns | Stone seconds | Skeleton damage | Skeleton knockdowns | Human damage / knockdowns |
| --- | --- | --- | --- | --- | --- | --- |
| session 01 | 7.64 [7.43, 7.85] | 4.93 [4.54, 5.32] | 28.1 | 1.89 | 4.85 | -- |
| 562f8b2 | 7.26 [7.02, 7.48] | 3.99 [3.67, 4.32] | 17.7 | 1.95 [1.90, 2.00] | 5.30 [5.04, 5.55] | 0.10 / 0.00 |
| **16108d3** | **7.81 [7.59, 8.03]** | **4.59 [4.33, 4.85]** | 21.1 | 1.76 [1.70, 1.81] | 3.77 [3.58, 3.97] | 0.06 [0.05, 0.06] / 0.00 |

- **Stone is back in session 01's band on both counts.** Session 04 left its knockdowns red,
  because its bouts had got shorter. Now a stone bout is longer (median 13.4 to 17.9 s) and a body
  falls about as often per second as before (0.226 to 0.217 per body). The win rate is 53.6 %
  [48.7, 58.9], d 0.10.
- **Per stone contact, damage held.** Real blows are 0.0782 damage before and 0.0774 after. Contacts
  per second fell from 18.8 to 17.5, and severs per bout rose from 1.01 to 1.28.
- **The skeleton lost its arms more often and fell less.**
  - Its bone arms now come off 1.64 times a bout, against 1.11.
  - Its contacts per second fell from 7.38 to 5.32, and its knockdowns per second from 0.185 to
    0.146 (both bodies).
  - Its sword's summed pace rose 1.53 times, so a light bone limb empties sooner. A body with an arm
    gone makes fewer contacts and shoves less.
  - Knockdowns are physical, and nothing that falls reads a blow's mass. Only its outcome moved.
  - The skeleton is not in the band's definition (stone's control row), so this is reported and
    does not stop the set.
- **The human deals less and still never falls.** Its damage fell from 0.10 to 0.06 a body a bout.
  Its contacts held (303.5 a bout, against 302.5), and the share of them that wound fell from 0.9 %
  to 0.8 %. Every one of its 384 bouts still runs out to the drain. This is the lighter arm behind
  its blade, as the offline re-score predicted, and it goes to session 09.

### The giant

`research/stat-sweep.mjs --attributes max,max-normal-body,size-weight-max --pairs 192`, on
16108d3. Node harness, research runner, supported locomotion, cap 150 s, seed 20260923:

| Level | Win % [95 %], before | Win % [95 %], after | Dealt / taken, after | Damage per real blow, own / other's, before | After |
| --- | ---: | ---: | ---: | ---: | ---: |
| control | 46.6 [41.7, 51.8] | 53.6 [48.7, 58.9] | 7.98 / 7.65 | 0.078 / 0.079 | 0.079 / 0.076 |
| max | 57.0 [51.6, 62.2] | **97.4 [95.8, 99.0]** | 11.16 / 4.61 | 0.100 / 0.109 | **0.273 / 0.091** |
| max-normal-body | 93.8 [91.1, 96.1] | 92.8 [89.8, 95.6] | 10.29 / 6.14 | 0.095 / 0.059 | 0.107 / 0.068 |
| size-weight-max | 14.8 [11.2, 18.5] | **77.6 [72.9, 82.0]** | 10.52 / 4.61 | 0.076 / 0.088 | **0.253 / 0.076** |

- **The giant's damage per wounding blow now exceeds the default's, 3.0 times over.** That was the
  plan's check. Before, its blows were worth less than the x1 body's, because its size and weight
  reached a blow only through a declared item mass that neither attribute scaled.
- **Size and weight alone went from 14.8 % to 77.6 %.** It is the same body with ordinary arms, and
  its blows now carry it.
- max-normal-body, the giant's stats on an x1-sized body, did not move. Its body is the default's,
  so no more mass stands behind its blows than before.
- The max giant is knocked down 0.00 times a bout, and fells the x1 body 1.66 times.

### Idle-dummy matrix

`research/idle-dummy.mjs --blocks 12` on 16108d3: Node harness, research runner, supported
locomotion, cap 150 s, 12 blocks a cell played from both sides, seed 20260923, fingerprint
e69f3f7ac344. Each cell is the attacker's outright win rate, then with the 60 s overtime drain,
then the median time of a win. Session 04's reading is in brackets.

| Attacker \ idle dummy | stone | skeleton | human | giant |
| --- | ---: | ---: | ---: | ---: |
| stone | 75 % (100) / 38.9 s [75 / 29.2] | 100 % (100) / 15.8 s [83 / 17.6] | 71 % (100) / 38.2 s [75 / 32.0] | 58 % (100) / 53.0 s [63 / 46.5] |
| skeleton | **0 %** (100) / 91.7 s [17 / 86.4] | 83 % (100) / 48.6 s [75 / 46.7] | **0 %** (100) / 89.4 s [13 / 76.4] | 0 % (100) / 111.5 s [0 / 105.1] |
| human | 0 % (42) / 119.7 s [0 (58)] | 0 % (100) / 117.5 s [0 (100)] | 0 % (21) / 119.9 s [0 (67)] | 0 % (17) / 119.7 s [0 (8)] |
| giant | **100 %** (100) / 13.6 s [88 / 32.6] | 88 % (100) / 9.0 s [75 / 29.4] | 92 % (100) / 19.7 s [63 / 56.3] | 79 % (100) / 30.9 s [54 / 55.7] |

- **The giant ends an idle body outright in 79 to 100 % of bouts, in a third to a half of the time.**
  Before, it managed 54 to 88 %. Its mass now reaches its blows.
- **The skeleton lost its only outright wins over stone and the human** (17 % and 13 % to 0 %). With
  the drain it still wins every bout against every dummy, as before. Its light bone arm puts less
  behind its blade than the blade used to declare, and it now loses that arm sooner (above).
- **The human wins nothing outright, as before, and less with the drain.** Against stone it falls
  from 58 % to 42 %, against itself from 67 % to 21 %, and against the giant it rises from 8 % to 17 %.
  That is its lighter arm again, and it goes to session 09 with the stand-off.
- Seven cells are at zero outright wins, against five. The owner's floor is that every body can
  defeat an idle dummy. With the drain, stone, skeleton and giant still do everywhere. The human
  does not, which was already true and is still session 09's.

## Physical contact 06: knockback from momentum transfer

Session 06 (`docs/plans/2026-09-23-physical-contact-06-knockback.md`) landed in one commit,
**134b867**: every contact, blow or parry, files into the struck body's stability ledger the
impulse of an inelastic contact between the striker's and the struck point's effective masses,
`contactImpulseNs` in `src/scoring.ts` (`J = mu v_n`, restitution 0). The horizontal part is read;
the vertical part rides along for session 07. Both authored shoves are gone, and nothing extra is
applied to a body.

The "before" is 16108d3 (research fingerprint e69f3f7ac344). The "after" is 134b867 (3d94193c01b9).
Raw outputs are in `research/runs/pc06`, which is not committed.

### Nothing is applied to the body

The plan said the struck body's centre of mass takes `dv = J / M`. `.review/momentum.mjs` read what
the solver already does: 4 bouts of the duelist against an idle stone body (Node harness,
`runBout`, supported locomotion, cap 30 s), each part's momentum summed across every frame holding
a wounding contact.

- Over 94 wounding contacts, the struck body's momentum along the blow changed by a median
  2.89 N.s, 0.23 of `J` (median 11.98 N.s).
- Frames with no contact at all change it by a median 5.92 N.s. The solver's push is real, but it is
  lost in the body's own motion, and the keyframed carrier takes none of it.

So nothing is added: an applied `J / M` would have been a second, authored push on top of the
solver's. The ledger reads `J`, and session 07 lets sustained contact move the carrier.

### The ledger's lines, scaled by one factor

`J` is about ten times the authored shove per wounding blow (median 11.9 N.s against 1.14), and it
is filed on every contact and parry rather than only on the ones past the edge's floor. So all
three lines of the ledger were scaled by one factor, read off stone x1 mirrors. Knockdowns per body
per bout, `research/control-band.mjs`, Node harness, research runner, cap 150 s, 96 blocks, seed
20260923:

| Factor | 1 | 6 | 10 | 16 | **20** | 22 | 25 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Knockdowns | 40.57 | 19.48 | 14.01 | 7.39 | **4.89 [4.39, 5.39]** | 3.87 | 3.16 |

At 20 the lines are 0.12 m/s (stagger), 0.28 m/s (fall) and 0.40 m/s per second (decay). Session
01's band is 4.93 [4.54, 5.32]. The constants' doc comment says this is a holding repair that
session 08 replaces.

### The shove bench

`.review/shove-bench.mjs`, Node harness, bench stand, x1. The measured fall equals the ledger's
prediction on every body, exactly 20 times session 04's:

| Module | Fall, N.s | Bench key, N.s | Key over fall, now | Before |
| --- | ---: | ---: | ---: | ---: |
| biped | 43.13 | 617 | 14.3 | 286 |
| multileg | 83.15 | 1200 | 14.4 | 288 |
| wheel | 25.30 | 800 | 31.6 | 630 |
| skeleton | 104.41 | 200 | 1.9 | 38 |

Every bench key still fells its body. The keys stay as they are; each `shoveImpulseNs` doc comment
now says what it is against the new lines.

### Fingerprint

`tests/harness/body-fingerprint.mjs --against` session 05's, Node harness: 40 sections the same
and 15 moved. Every bench, head, torso and walk section is the same; every bout moved.

### x1 controls

Node harness, research runner, supported locomotion, cap 150 s, seed 20260923, 192 blocks. Per body
per bout, 95 % bootstrap over the blocks:

| Tree | Stone damage | Stone knockdowns | Stone seconds | Skeleton damage | Skeleton knockdowns | Human damage / knockdowns |
| --- | --- | --- | --- | --- | --- | --- |
| session 01 | 7.64 [7.43, 7.85] | 4.93 [4.54, 5.32] | 28.1 | 1.89 | 4.85 | -- |
| 16108d3 | 7.81 [7.59, 8.03] | 4.59 [4.33, 4.85] | 21.1 | 1.76 [1.70, 1.81] | 3.77 [3.58, 3.97] | 0.06 [0.05, 0.06] / 0.00 |
| **134b867** | **7.94 [7.69, 8.18]** | **4.95 [4.60, 5.29]** | 21.3 | 1.76 [1.71, 1.81] | 4.51 [4.30, 4.72] | 0.06 [0.05, 0.06] / 0.00 |

- **Stone is in session 01's band on both counts**, and its time down rose from 19.1 % to 21.6 %
  of a bout (both bodies). The win rate is 48.4 % [43.1, 53.6].
- **The skeleton falls more again**, 3.77 to 4.51, back toward session 01's 4.85, and spends 30 %
  of a bout down against 25 %. Its damage did not move.
- **The human mirror did not move**: 0.06 damage a body, no knockdowns, 305.6 contacts a bout of
  which 0.7 % are real blows (before: 303.5 and 0.8 %). Every contact now pushes, and none of its
  pushes fells anybody. It is still session 09's.

### The giant

`research/stat-sweep.mjs --attributes max,max-normal-body,size-weight-max --pairs 192`, on 134b867.
Node harness, research runner, supported locomotion, cap 150 s, seed 20260923:

| Level | Win %, before | Win % [95 %], after | Its knockdowns, before / after | The x1's, before / after | The x1's time down, before / after |
| --- | ---: | ---: | ---: | ---: | ---: |
| control | 53.6 | 48.4 [43.1, 53.6] | 4.57 / 4.85 | 4.61 / 5.06 | 19.2 / 22.0 % |
| max | 97.4 | **98.4 [97.1, 99.5]** | 0.00 / 0.01 | **1.66 / 7.06** | **11.7 / 50.2 %** |
| max-normal-body | 92.8 | 95.3 [93.0, 97.4] | 1.41 / 2.06 | 5.34 / 5.41 | 24.9 / 24.9 % |
| size-weight-max | 77.6 | **92.2 [89.3, 94.8]** | 0.01 / 0.00 | 1.42 / 7.71 | 8.3 / 42.4 % |

- **The giant now fells the x1 body far more often than the reverse**: 7.06 times a bout against
  0.01. That was the plan's check. Before, a blow's shove carried no mass, so the giant's weight
  reached its blows' damage and not their push.
- **Size and weight alone went from 77.6 % to 92.2 %.** Its mass now reaches the ledger as well.
- The x1 body facing a max giant spends half the bout down. That is on the eye list.

### Stun-lock

`research/downed-census.mjs --groups stone,skeleton,giant --blocks 96`, before (16108d3) and after
(134b867). Node harness, research runner, supported locomotion, cap 150 s, seed 20260923. "Giant"
is the max giant against x1 stone, both corners counted:

| Group | Knockdowns / body / bout | Down time % | Repeat knockdowns, share of episodes | Longest chain | Rises put back down by a blow |
| --- | ---: | ---: | ---: | ---: | ---: |
| stone, before | 4.04 | 16.9 | 47.0 % | 14 | 136 |
| stone, after | 4.44 | 18.1 | 54.4 % | 13 | 147 |
| skeleton, before | 2.95 | 22.8 | 22.9 % | 5 | 217 |
| skeleton, after | 3.73 | 28.0 | 27.0 % | 7 | 235 |
| giant, before | 0.77 | 4.5 | 24.1 % | 5 | 14 |
| giant, after | **2.46** | **23.3** | **71.6 %** | **18** | **374** |

- **A rising body is driven back down**, and against the giant most knockdowns are repeats: 71.6 %
  of them land within 2 s of the same body's rise, in chains of up to 18. That is the stun-lock the
  owner asked to see, and it is on the eye list with no authored cure (the overview's rule).
- On stone the repeat share rose from 47.0 % to 54.4 %; its longest chain did not grow.
- **Parries push**: a blade caught on a plate files the same transfer into the plate's owner
  (`tests/knockback.test.mjs`). The census does not split parries out.

### Idle-dummy matrix

`research/idle-dummy.mjs --blocks 12` on 134b867: Node harness, research runner, supported
locomotion, cap 150 s, 12 blocks a cell played from both sides, seed 20260923, fingerprint
3d94193c01b9. Each cell is the attacker's outright win rate, then with the 60 s overtime drain,
then the median time of a win. Session 05's reading is in brackets.

| Attacker \ idle dummy | stone | skeleton | human | giant |
| --- | ---: | ---: | ---: | ---: |
| stone | 75 % (100) / 27.5 s [75 / 38.9] | 100 % (100) / 14.8 s [100 / 15.8] | 67 % (92) / 44.6 s [71 / 38.2] | 58 % (92) / 42.8 s [58 / 53.0] |
| skeleton | 0 % (100) / 92.5 s [0 / 91.7] | 88 % (100) / 46.6 s [83 / 48.6] | 0 % (100) / 90.4 s [0 / 89.4] | 0 % (100) / 108.0 s [0 / 111.5] |
| human | 0 % (42) / 119.7 s [0 (42)] | 0 % (96) / 118.1 s [0 (100)] | 0 % (25) / 119.9 s [0 (21)] | 0 % (25) / 119.7 s [0 (17)] |
| giant | 100 % (100) / 12.0 s [100 / 13.6] | 88 % (100) / 8.7 s [88 / 9.0] | 88 % (100) / 12.9 s [92 / 19.7] | 79 % (100) / 28.3 s [79 / 30.9] |

- **Every outright rate is within a block of session 05's**, and the same seven cells are at zero.
  A wounding blow's damage did not move, and neither did who wins. Stone ends an idle stone body in
  27.5 s rather than 38.9.
- With the drain, stone no longer ends every human and giant dummy (92 % each, from 100). The human
  is still session 09's.

## Physical contact 07: contact force lifts and pushes

Session 07 (`docs/plans/2026-09-23-physical-contact-07-lift-and-push.md`) landed in two commits:

- **733bf12**: an arm's torques follow its weight.
- **4df55cc**: contact lifts and pushes a standing body. `ContactPress` in `src/contact-press.ts`
  reads back what the solver did to a keyframed carrier's parts. The boundary reads that before the
  ledger does.

The "before" is 134b867 (research fingerprint 3d94193c01b9) and the "after" is 4df55cc
(62dd8e8ad7b4). Raw outputs are in `research/runs/pc07`, which is not committed.

### An arm's torques follow its weight

The weight stat doubled an arm's links and left the motors that lift them alone, so a heavier arm
lifted less. The first reading blamed length (the plan's input from session 04); the split says
weight and arm speed. `.review/lift-split.mjs`, Node lift bench, blade or fist under a free target
0.4 m off, the most upward force held, newtons:

| Chain | x1 | max | size 1.25 | size 1.25, weight 2 | size 1.25, arm speed 1.5 | max, weight 1 | max, arm speed 1 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| reach blade | 1938 | 781 | 2656 | 1844 | 1969 | 1969 | 1844 |
| wrist blade | 1281 | 719 | 1969 | 906 | 969 | 969 | 906 |
| reach fist | 1563 | 2500 | 3000 | 2719 | 2656 | 2656 | 2719 |

The reach core's yaw, shoulder and elbow torques, the pitch hinge's torque and the human arm's
drives now scale with the stat, alongside the links' masses. The wrist's roll and bend turn the
item, which does not follow the stat, and they stay put. After, same bench:

| Chain | x1 | max, before | max, after |
| --- | ---: | ---: | ---: |
| reach blade | 1688 / 1938 | 781 | **5125 / 4250** (2.11 / 1.75 of an x1 stone body's 2425 N) |
| reach fist | 1406 / 1563 | 2500 | 5656 / 5438 |
| wrist blade | 1406 / 1281 | 719 | 2469 / 1281 |
| wrist fist | 1813 / 1344 | -- | 4406 / 4438 |

Pairs are the two sockets. The x1 rows did not move. **Arm speed also cuts lift, and that is not
explained**: `JointServo.track` is a velocity motor, feed-forward plus proportional, and a rate
should not cut force. It is reported and not chased.

### What the solver reports between bodies

`.review/press-probe.mjs` and `.review/lift-who.mjs`, Node bout runner, stone x1 mirrors and the max
giant against x1:

- **Keyframed trunk against keyframed trunk reports no contact at all**: 0 events in 16 bouts. So
  change 4's premise holds, and walking into a body goes through the pair resolver.
- **A standing carrier's authority is unbounded, both ways.**
  - Sideways: up to 2.94 times a body's grip at x1, and 9.3 times an x1 body's grip from a max giant.
  - Upward: four bodies in eight x1 bouts read as lifted, by 2.09 W from a wrist blade under the
    pelvis, 1.34 W from a roll ring under the plate and 1.07 W from a wrist. The lift bench says a
    whole x1 arm holds 0.53 W (wrist blade) to 0.80 W (reach blade). A limb caught between two
    carriers is squeezed by both keyframes, and the solver reports whatever that takes.
- **A lying body is not a source.** A leg set down on a heap read 3.64 W upward from its plate and
  feet.

So each source is capped at its own grip sideways (`GRIP` 0.55, the sole's friction) and at its own
weight upward. Two bodies of one weight can therefore never push or lift each other. The upward
cap departs from the plan's "two x1 arms lifting is the rule working", and is recorded as Chosen.

### Lifts and pushes a bout

`.review/contact-bouts.mjs`, Node bout runner, supported locomotion, 16 bouts a cell, duelist
against champion, cap 60 s. Per body per bout:

| Cell | Lifts | Pushed, s | Bouts with a push | Falls |
| --- | ---: | ---: | ---: | ---: |
| x1 against x1 | 0 / 0 | 0 / 0 | 0 / 0 of 16 | 2.94 / 2.25 |
| max giant against x1 (the x1) | 0.44 | 0.22 | 10 of 16 | 6.69 |
| x1 against max giant (the x1) | 0.19 | 0.24 | 14 of 16 | -- |
| size-weight-max against x1 (the x1) | 0.19 | 0.46 | 15 of 16 | 9.94 |

- **x1 against x1 never lifts or pushes**, which the caps make a construction rather than a count.
- The earliest lift in any cell was at 2.13 s, so the opening blade clash lifts nothing.
- **It tips rather than launches.** `.review/launch-probe.mjs`, the max giant against x1, 7 lifts:
  the lifting force was 2461 to 3166 N against the x1's 2425. Peak upward speed was 0.14 to
  0.63 m/s, peak rise 9 to 37 mm, peak speed 0.87 to 2.29 m/s. A body lifted past its weight is set
  down fallen with the velocity the contact gave it, and that velocity is small.

### Fingerprint

`tests/harness/body-fingerprint.mjs --against` session 06's, Node harness: 46 sections the same and
9 moved. Every bench, head, torso and walk section is the same; nine bouts moved.

### x1 controls

Node harness, research runner, supported locomotion, cap 150 s, seed 20260923, 192 blocks. Per body
per bout, 95 % bootstrap over the blocks:

| Tree | Stone damage | Stone knockdowns | Stone seconds | Skeleton damage | Skeleton knockdowns | Human damage / knockdowns |
| --- | --- | --- | --- | --- | --- | --- |
| session 01 | 7.64 [7.43, 7.85] | 4.93 [4.54, 5.32] | 28.1 | 1.89 | 4.85 | -- |
| 134b867 | 7.94 [7.69, 8.18] | 4.95 [4.60, 5.29] | 21.3 | 1.76 [1.71, 1.81] | 4.51 [4.30, 4.72] | 0.06 / 0.00 |
| **4df55cc** | 8.00 [7.61, 8.47] | **4.14 [3.86, 4.42]** | 20.6 | 1.70 [1.66, 1.74] | **4.05 [3.86, 4.26]** | 0.06 / 0.00 |

- **Both bodies fall less, and stone drops out of session 01's band.** The cause is the
  one-source rule: a contact the press is already reading is not filed a second time by `Combat`'s
  transfer, so a sustained blade no longer re-files its momentum every step. Session 08 replaces
  the ledger's lines, and the band is its gate, not this session's.
- The skeleton spends 28.4 % of a bout down, both bodies.
- **The human mirror did not move**: 0.06 damage a body, no knockdowns, 305.6 contacts a bout of
  which 0.7 % are real blows. 245 of its 384 bouts were draws.

### The giant

`research/stat-sweep.mjs --attributes max,max-normal-body,size-weight-max --pairs 192`, Node harness,
research runner, supported locomotion, cap 150 s, seed 20260923:

| Level | Win % [95 %], 134b867 | Win % [95 %], 4df55cc | Its knockdowns | The x1's knockdowns, before / after | The x1's time down, before / after |
| --- | ---: | ---: | ---: | ---: | ---: |
| control | 48.4 [43.1, 53.6] | 50.0 [44.5, 55.2] | 4.12 | 5.06 / 4.15 | 22.0 / 18.5 % |
| max | 98.4 [97.1, 99.5] | **99.5 [98.7, 100.0]** | 0.01 | **7.06 / 11.09** | **50.2 / 75.5 %** |
| max-normal-body | 95.3 [93.0, 97.4] | 94.8 [92.4, 96.9] | 1.42 | 5.41 / 4.89 | 24.9 / 22.9 % |
| size-weight-max | 92.2 [89.3, 94.8] | **97.1 [95.3, 98.7]** | 0.01 | 7.71 / 15.25 | 42.4 / 77.4 % |

- **The giant's arms now lift what its weight says**, and its pushes are real. The x1 body facing a
  max giant is down three quarters of every bout. A max bout lasts 9.6 s, and the giant takes 1.98
  damage for the 12.53 it deals.
- Normal-sized bodies at max did not move: size and weight are what reach the contact.

### Stun-lock

`research/downed-census.mjs --groups stone,skeleton,giant --blocks 96`, on 4df55cc. Node harness,
research runner, supported locomotion, cap 150 s, seed 20260923. "Giant" is the max giant against
x1 stone, both corners counted:

| Group | Knockdowns / body / bout | Down time % | Repeat knockdowns, share of episodes | Longest chain | Rises put back down by a blow |
| --- | ---: | ---: | ---: | ---: | ---: |
| stone, 134b867 | 4.44 | 18.1 | 54.4 % | 13 | 147 |
| stone, 4df55cc | 3.77 | 15.1 | 46.7 % | 13 | 124 |
| skeleton, 134b867 | 3.73 | 28.0 | 27.0 % | 7 | 235 |
| skeleton, 4df55cc | 3.38 | 26.4 | 24.8 % | 7 | 196 |
| giant, 134b867 | 2.46 | 23.3 | 71.6 % | 18 | 374 |
| giant, 4df55cc | **3.15** | **40.0** | **84.1 %** | **20** | **640** |

- **Against the giant, 84.1 % of knockdowns are repeats**, in chains of up to 20, and the first
  body down lost all 188 decided bouts. The giant pushes and lifts now, and it still has no authored
  cure (the overview's rule).
- Every skeleton episode longer than 5 s is still "unsettled": 192 of them, 186 of which ended in a
  rise.
- A downed body takes 37.5 % of stone's damage, 54.8 % of the skeleton's and 88.7 % of the giant
  cell's.

### Idle-dummy matrix

`research/idle-dummy.mjs --blocks 12` on 4df55cc: Node harness, research runner, supported
locomotion, cap 150 s, 12 blocks a cell played from both sides, seed 20260923, fingerprint
62dd8e8ad7b4. Each cell is the attacker's outright win rate, then the rate with the 60 s overtime
drain, then the median time of a win. Session 06's reading is in brackets.

| Attacker \ idle dummy | stone | skeleton | human | giant |
| --- | ---: | ---: | ---: | ---: |
| stone | 75 % (100) / 27.5 s [75 / 27.5] | 100 % (100) / 15.2 s [100 / 14.8] | 79 % (83) / 34.9 s [67 / 44.6] | 63 % (100) / 46.8 s [58 / 42.8] |
| skeleton | 0 % (100) / 106.3 s [0 / 92.5] | 88 % (100) / 44.4 s [88 / 46.6] | 0 % (100) / 93.8 s [0 / 90.4] | 0 % (100) / 115.1 s [0 / 108.0] |
| human | 0 % (42) / 119.4 s [0 (42)] | 0 % (88) / 118.2 s [0 (96)] | 0 % (25) / 119.9 s [0 (25)] | 0 % (13) / 119.7 s [0 (25)] |
| giant | 100 % (100) / 12.4 s [100 / 12.0] | 100 % (100) / 7.8 s [88 / 8.7] | 100 % (100) / 15.8 s [88 / 12.9] | 63 % (100) / 42.0 s [79 / 28.3] |

- **The same seven cells are at zero.** The giant now ends every idle skeleton and every idle human
  outright.
- The giant against an idle giant fell from 79 % to 63 %. Two giants of one weight cannot push each
  other, and one of them is standing still.

## Physical contact 08: stability from the body

Session 08 (`docs/plans/2026-09-23-physical-contact-08-general-stability.md`) landed in three
commits: **84e8251** (the body's own lines, with a blow gain), **57bff3c** (a body past its base)
and **567350a** (a blow's height reaches the ledger, and the gain goes). How hard a body is to knock
over is now read off the live body. A standing body is treated as a rigid body rocking about the
edge of its base, and a blow tips it when it hands the body enough energy to lift its centre of mass
over that edge. The geometry is in `src/tipping.ts` and the lines are formed in `stabilityLines` in
`src/supported-locomotion-state.ts`. Every body runs one knockdown table. The brace multipliers, the
gait curves, the holding ratio and the frozen lines are gone.

The "before" is 3dd47ee (research fingerprint 62dd8e8ad7b4). Raw outputs are in
`research/runs/pc08` (the gain's calibration and the stance trial) and `research/runs/pc08b` (the
re-measure at 567350a, with session 09 in it), neither committed.

### The rocking body

A body's centre of mass stands `h` above the ground, its base reaches `r` from under it along the
push, and `k` is its radius of gyration. With `R = sqrt(h^2 + r^2)`, the ledger (a horizontal impulse
at the centre of mass's height over the body's mass, m/s) falls at `sqrt(2 g (R - h)(k^2 + R^2)) / h`.
Gravity rights a lean at `g r / h`. A blow at height `y` counts `y / h` of itself.

- **The base.** A standing body's base is its stance, lifted feet included, plus anything else of it
  within 0.03 m (`TIPPING.CONTACT_BAND_M`) of its lowest point. A lying body's base is what of it is
  in that band. A rising body is judged on the stance it rises onto.
- **The wheel's patch** is a square as wide as the wheel, since a line contact has no fore-aft base.
- **The stagger line** is 0.43 of the fall line, the ratio the two frozen lines had. A rigid body
  rocks from any blow, so no physical reading gives the stagger its own threshold.
- **The ledger is a vector.** Two opposite blows cancel, and a lean is righted along its own
  direction.

**The formula against the solver.** `tests/tipping.test.mjs`, headless arena, real Havok: a rigid
block standing on the floor and struck at a known height. The impulse that tips it, bisected, is
0.941, 1.009 and 0.940 of the prediction for three blocks (0.3 x 1.2 x 0.3 m, 100 kg, struck at
0.9 m; 0.4 x 1.0 x 0.4 m, 60 kg at 0.5 m; 0.3 x 1.6 x 0.5 m, 200 kg at 1.4 m). The test pins 15 %
either way.

### The shove bench

`.review/shove-bench.mjs`, Node locomotion bench, 2026-09-24. Each body stands on the bench and is
shoved at its supported mass along +x, and the impulses that stagger it and fell it are bisected.
"Predicted" is the body's own lines along the push, times its supported mass. The bench reads
the whole port: the ledger, the posture predicate and the solver's reaction together.

| Body | Supported mass | h / k, m | Lines at x1, stagger / fall | Predicted, N.s | Measured, N.s | Bench shove |
| --- | ---: | --- | --- | --- | --- | --- |
| stone biped | 280.0 kg | 1.115 / 0.446 | 0.405 / 0.945 m/s | 113.5 / 264.8 | 121.4 / 264.8 | 617 = 2.33 x fall |
| multileg | 316.1 kg | 0.775 / 0.330 | 0.846 / 1.973 | 267.3 / 623.7 | 286.1 / 622.1 | 1200 = 1.92 x |
| skeleton | 186.4 kg | 1.278 / 0.163 | 0.162 / 0.379 | 30.3 / 70.6 | 32.7 / 70.6 | 200 = 2.83 x |
| wheel | 362.6 kg | 1.066 / 0.515 | 0.130 / 0.304 | 47.2 / 110.1 | 50.8 / 110.2 | 800 = 7.26 x |

- **The fall agrees with the prediction to 0.3 % at x0.5 and x1.** The measured stagger is 1 to 17 %
  late, most at x0.5. That is consistent with gravity righting the lean before the next boundary:
  the righting rate does not scale with the stat, so it takes more of a low line.
- **At x2 every body falls early**: at 0.917 of its line (biped), 0.872 (multileg), 0.982 (skeleton)
  and 0.961 (wheel). A real impulse also carries the mass toward the edge, and the posture predicate
  catches that before the ledger reaches the line.
- **The multileg is harder to fell for geometry, not for a declared brace**: a lower centre of mass
  over a wider base gives 1.97 m/s against the biped's 0.95.
- **No walk leaves the supported state at any level**: 0 of 480 samples (0 of 300 for the wheel) at
  x0.5, x1 and x2.

### The physical way seemed to fail, and a rule came back for a while

With the lines read off the body and every blow filed at its own momentum, an x1 stone mirror all
but never fell. `.review/tip-bouts.mjs`, Node bout runner, supported locomotion, the duelist against
the champion, 8 bouts, cap 60 s: 0.38 and 0.13 knockdowns a body a bout at a gain of 4, and every one
of them was a leg cut off. That is the overview's second failure condition ("an x1 mirror never
falls").

A body is heavy (280 kg for stone), and a blade at 20 m/s moves a few newton-seconds of it. The
narrowest rule that fixes it was one factor on a blow's filing: `TIPPING.BLOW_GAIN`.
`Combat` still reports the physical impulse, and a press is not multiplied. It was calibrated on the
x1 stone mirror against session 01's band: `research/stat-sweep.mjs --stat stability --levels 1
--pairs 96`, Node harness, research runner, supported locomotion, cap 150 s, seed 20260923, 96
blocks, `research/control-band.mjs`:

| Gain | Knockdowns / body / bout | Damage / body / bout | Seconds / bout |
| ---: | --- | ---: | ---: |
| 6 | 3.70 [3.24, 4.16] | 8.16 | 24.6 |
| **7** | **4.83 [4.24, 5.43]** | **8.12** | **26.3** |
| 8 | 5.38 [4.84, 5.92] | 8.02 | 27.2 |
| 10 | 6.29 [5.77, 6.79] | 8.17 | 29.1 |
| 12 | 7.81 [7.25, 8.38] | 8.06 | 32.3 |

Damage does not follow the gain. What the gain moves is how often a body is on the floor. The gain
was removed in 567350a: see "The skeleton fell on everything" below.

### A rising body on the stance it rises onto

The first port judged a rising body by what of it was on the floor, as it judges a lying one.
`.review/rise-base.mjs` and `.review/tip-bouts.mjs`, Node bout runner, stone x1 mirrors: the rise is
keyframed, and the carrier hoists the pelvis while the legs still lie where they fell. So the points
on the floor stayed about a metre from the centre of mass for the whole rise, and the centre of mass
was outside that base in 135 of 142 rising samples in one bout. The fall line read 0 from 0.2 s into
every rise, so any touch put the body down. At a gain of 8 a body was down 62.8 % of every bout.

A rising body is therefore read against the last standing base that held its centre of mass, at its
live height and gyration. A low body on its feet is hard to tip and gets easier as it straightens,
and no blow is exempt. Down time at a gain of 8 fell to 34.3 %, and the centre of mass sits outside
the base in 0 to 2 of each bout's 57 to 149 rising samples.

### One knockdown for every body

Every locomotion table runs `KNOCKDOWN`, which was the skeleton's table:

- **Settle.** The fall is settled once the centre of mass has come down at least half its starting
  height above the floor, and its descent has stayed at or under 0.3 m/s for 0.2 s.
- **Cap.** It is also settled once the body has lain 2.5 s.
- **Rise.** The rise peaks at 0.9 m/s.

Stone, the wheel and the multileg used to rise after a frozen 0.35 s dwell, whether their fall had
stopped or not. On the bench's scripted shove (`.review/rise-budget.mjs`, Node locomotion bench),
fall to supported now takes 1.954 s on the biped, 1.817 on the skeleton, 1.933 on the wheel and
1.192 on the multileg. The biped used to take 1.158 s. Every table's `riseBudgetSeconds` is 2.50.

A gentle topple lies longer than a hard one. The wheel under 225 N.s rises 2.837 s after the shove,
and under 800 N.s after 1.933 s (`.review/wheel-gentle.mjs`, Node locomotion bench).

The one posture predicate was already true: every golem body, the human included, reads
`constructPostureIsSupported`, and the Warrior's `fighterPostureIsSupported` went with the Warrior.

### Fixtures that moved

- **The contact press's walking test** (`tests/contact-press.test.mjs`) drives a heavy walker into
  an idle x1 body. Under the gain its arm contacts filed at seven times their impulse and knocked
  the idle body down at 0.75 s, before the walk had pressed it far (`.review/walk-push.mjs`,
  headless arena), so the test reads the peak slide over 3 s rather than the slide at the end.
- **The pair corpus** (`physical_corpus_two_bipeds_share_one_registry_and_a_fallen_one_rises_clear_of_the_other`).
  While one body lies, the pair resolver separates the two overlapping carriers at about 0.5 m/s.
  Under the full lie they are already 0.897 m apart when the rise begins, so the corpus no longer
  exercised a relocated rise (`.review/pair-rise.mjs`, headless arena). The fixture's stated edit
  caps the lie at 0.1 s.
- **The research fixtures** (`tests/research-physical.test.mjs`). Under the gain the first pair on
  which a probe mind felled x0.5 and left x1 standing was the duelist on 54 and 55. With no gain no
  probe mind fells x0.5 at least twice and x1 never on any pair from 44 to 123
  (`.review/seed-search.mjs`, research runner), so the knockdown fixture's rule became the first pair
  on which x0.5 falls at least twice and more often than x1: the brawler on 50 and 51, 5 knockdowns
  and 7.98 s down at x0.5 against 2 and 3.77 s at x1. A count taken on every fallen frame reads 282.
  The sever fixture keeps 50 and 51, and its counts are re-pinned at [[48, 24], [37, 14]].
- **The thrust-booking fixture** (`a_thrust_books_a_thrust_in_a_real_bout`) went from one or a few
  thrusts on its twenty seeds to none. Its director answered every moment it could not thrust with
  `close`, which walked the body in to 0.94 m of ground gap against a 1.84 m reach, so every thrust
  began with its point already inside the other body and rested there: 355 of 364 point-first
  contacts near the tip were under the point's floor, at a median 0.65 m/s of closing speed. A
  bite past the mark (0.33, 0.66) did not change it. Answered with `hold`, the body keeps 1.6 m of
  gap between strokes and books 66 thrusts in six 20 s bouts against an idle body, and 6 on the
  fixture's seeds against the fencer (`.review/thrust-probe2.mjs`, `.review/thrust-stance.mjs`, Node
  bout runner). Disabling thrust booking turns it red.
- **The stability stat at x2** brackets the fall from 0.85 of the line, because every body falls
  early there (the shove bench above).
- `the_scripted_locomotion_run_walks_crouches_falls_and_rises` no longer pins the old 1.60 s
  scripted rise, and each module's cross-comparison reads the lines off the body.

### A centre of mass outside its base

After the first commit, a probe of each body's own walk found this (`.review/stride-zero.mjs` and
`.review/stride-outside2.mjs`, Node locomotion bench, the bench's walk):

- **Walking.** A walking body's centre of mass can run past its whole stance, lifted feet included.
  The biped's goes up to 0.27 m past, and the skeleton's up to 0.54 m, because the keyframed carrier
  runs ahead of the legs.
- **The stopped wheel** sits 20 to 35 mm off its patch in every sample after it stops.

`baseReachM` read zero in every direction there, so a body pushed back onto its own feet fell as
readily as one pushed further out. The reach is now the distance along the push to where the ray
leaves the base. A body already past its edge along a push still goes over at any touch. One pushed
back toward its base has to be carried across it and over the far edge.

That is 3 of 360 walking samples on the biped, 19 on the skeleton and 0 on the multileg. Counting
only planted soles as the base, those were 139 and 151 of 360, with a sole off the floor in about
half the samples. So the lifted-feet rule is what keeps a walking body from reading as one-legged.
`a_foot_in_the_air_is_still_part_of_the_base_a_walking_body_stands_on` pins it.

The carrier running ahead of the legs is a locomotion matter, not a stability one, and it is left
open.

### The skeleton fell on everything, and three causes were found

Session 08's batch put the x1 skeleton mirror at 22.0 knockdowns a body a bout, down 75.7 % of each
bout, against stone's 4.8. Lowering the gain did not cure it: 16.3 knockdowns at a gain of 1 and 18.6
at 2 (48 blocks each). So the gain was not the cause. Three things were.

**1. A blow's height never reached the ledger.** `copyStabilityEvent` in
`src/supported-locomotion.ts` copied the shove and dropped `atY`, so every blow was read as landing at
the centre of mass's height. A blow to the head counted no more than one to the belt, and a blow at
the ankle no less. The copy now keeps every field.
`a_blow_s_height_reaches_the_ledger_as_its_lever_about_the_base` (Node locomotion bench) shoves a
standing stone biped at 0.3 of its stagger line at three heights. The ledger reads the shove at the
centre of mass, under a thousandth of it at the ground, and 1.5 of it at 1.5 times the height. With
the copy reverted, it reads the shove at the ground.

**2. The skeleton stood with its centre of mass off its feet.** Its shield plate (2.30 kg at 0.56 m)
and blade (1.30 kg at 0.65 m) put the centre of mass of a 30.4 kg body 0.124 m ahead of the pelvis.
Stone's sits 0.033 m ahead and the human's 0.029 m. On 0.20 x 0.13 m feet that is outside the base in
36.3 % of its standing time, against stone's 0.2 % (`.review/outside-share.mjs`, Node bout runner, 2
bouts, 40 s). A body whose centre of mass is past its edge falls at any touch.

**A stance under the centre of mass was tried, and is not in the tree.** `bipedPose` took a balance
offset, fore and side: the centre of mass's ground point relative to the pelvis, in the pelvis's
frame, less the sole's lead over the ankle, low-passed over 0.5 s and read only while the body
stood or staggered. It turned each whole leg about the hip by `asin(offset / leg length)`. Three
variants were measured; the best clamps the offset to the hip's room and holds it per leg through
the swing (`.review/biped.balance-variants.ts` in the session's worktree, not committed).

| Stance | Skeleton's centre of mass outside its base, standing | x1 skeleton mirror knockdowns / body / bout |
| --- | ---: | --- |
| none (the tree) | 36.3 % | 16.40 [15.38, 17.41] |
| full offset | 6.2 % | -- |
| faded with the stride | 16.7 % | 13.74 [12.68, 14.80] |
| hip room, held per leg | 4.0 % | 11.41 [10.59, 12.23] |

Knockdowns are `research/stat-sweep.mjs --build skeleton-warrior --minds skeleton-duelist --stat
stability --levels 1 --pairs 48`, Node harness, research runner, supported locomotion, cap 150 s, no
gain; the shares are `.review/outside-share.mjs`, Node bout runner. Stone's is 0.0 % either way.

It costs the walk. Rotating a leg about the hip changes its height (`cos(b + x)` against
`cos(b - x)`), so two planted feet under an offset are unequal legs: the support passes to the swing
foot at the start of a walk and the stance foot lifts and slides. A rear offset also reaches the
hip's stop. Planted sole slip, Node locomotion bench (`runGolemLocomotion`), mm/s; the short walks
are means over eleven stand durations, about +-5, and the budget is 300 mm/s at x0.75 and x1.5:

| Stance | Biped: long walk / x0.75 / x1 / x1.5 | Skeleton: long walk / x0.75 / x1 / x1.5 |
| --- | --- | --- |
| none (the tree) | 99 / 200 / 186 / 214 | 96 / 274 / 180 / 285 |
| hip room, held per leg | 118 / 238 / 229 / **355** | 118 / **322** / 217 / **360** |
| the same, heights kept by the knee | 252 / **374** / **517** / **372** | 161 / **363** / **328** / 292 |

A slip regression over budget, to buy a knockdown rate nobody has asked to move, is not a trade to
take on the owner's behalf. The stance is out of the tree, and the choice is on session 10's list.

**3. The gain reached every contact, not only a scored blow.** The gain's own comment and this
section's first record both said it multiplied a scored blow. `Combat.transfer` multiplied every
contact: a parry, a slap and a blade leaned on each filed seven times their momentum. On the
skeleton a parry moves 2.2 N.s on average, which at seven times is nearly four times its 4.0 N.s
fall impulse.

`.review/fall-cause.mjs` (Node bout runner, the x1 skeleton mirror, 2 bouts of 60 s, after 1 and 2)
reads the contact that pushed hardest in the quarter second before each fall:

| Fell from | Parry | Unscored contact | Scored blow | None |
| --- | ---: | ---: | ---: | ---: |
| standing | 20 | 4 | 6 | 0 |
| rising | 3 | 7 | 8 | 1 |

Two of three standing falls followed a parry. Filing the gain on a scored blow alone was tried
next; with the height in the ledger no gain was needed at all, and it went. **567350a files every
contact at its physical impulse.**

### Without the gain

`research/stat-sweep.mjs --stat stability --levels 1 --pairs 96` on the stone mirror, Node harness,
research runner, supported locomotion, cap 150 s, seed 20260923, `research/control-band.mjs`, with
the lever in place and no gain: **0.49 [0.34, 0.66] knockdowns a body a bout**, 7.86 [7.49, 8.22]
damage, 19.9 s. The x1 mirror falls, and on far fewer than most scored blows, so neither of the
overview's failure conditions holds and no rule comes back. Session 01's band (4.93) was never the
plan's target ("the knockdown rate is not held"). Rare stone knockdowns are on the eye list; a gain
on a scored blow's filing, after `scoreHit`, is the rule to reach for if the owner wants them back.

The skeleton without the gain, at 567350a: `.review/fall-cause.mjs skeleton-warrior
skeleton-duelist 8 60` (Node bout runner, the x1 skeleton mirror, 8 bouts of 60 s). The hardest
contact in the quarter second before each fall, against every contact of that class received in that
state:

| Fell from | Scored blow | Parry | Unscored contact | None |
| --- | ---: | ---: | ---: | ---: |
| standing | 40 of 124 | 85 of 234 | 15 of 124 | 0 |
| rising | 34 of 109 | 36 of 91 | 51 of 278 | 9 |

- **It falls on a third of the scored blows it takes standing, not most**, so the overview's third
  failure condition does not hold either. But a parry fells it as readily as a blow does.
- The stone mirror on the same probe (`default golem-duelist`) took 508 scored blows standing and
  fell once, from a parry.
- **The skeleton's fall line is its stance's, and some skeletons stand outside their own feet.**
  Its published fall impulse is 4.0 N.s with the sword and shield, 6.7 with two blades, 2.1 with the
  maul, and **0.0 with the mace**: the mace skeleton's centre of mass is past the edge of its feet
  at rest, and the first touch that way fells it (`.review/body-facts.mjs`, Node arena harness,
  t = 1 s). That is the stance the trial above would have moved, and it is on the owner's list.

The bout-level readings for sessions 08 and 09 were taken together at 567350a, and they are under
session 09's "Re-measured at 567350a" below.

## Physical contact 09: minds read what the attributes do

Session 09 (`docs/plans/2026-09-23-physical-contact-09-minds-read-bodies.md`) landed in two
commits, **ec9b8b2** and **adfa2b4** (the stroke bench's capability builder). It made three changes:

- A body publishes what its stats do, as the physical quantities they produce.
- A stroke is timed by the arm that swings it.
- The stand-off is the shorter of the two arms, and a much heavier body closes.

The "before" is 57bff3c. Raw outputs are in `research/runs/pc09`, and the re-measure with session
08's last commit in `research/runs/pc08b`; neither is committed.

### What a body publishes

`BodyView` carries four new fields, on self and opponent alike. Each is read off the built body,
never off the attribute record, so a stat that later comes from an item reaches a mind unchanged.

- **`massKg`** is the mass the locomotion port divides a shove by (`supportedMassKg`).
- **`stabilityImpulseNs`** is the weakest of 32 directions of session 08's fall line, times that
  mass. It is 0 before the body's first control step, when its base has not been read.
- **`armRate`** is the primary arm's first angular rate times its reach: the tip speed its rate
  limit carries.
- **`soak`** is what a joule of a cut takes from the core's health: one minus its armour against a
  cut, over `cutJoulesPerDamage` times its health.

The x1 values, Node arena harness, t = 1 s (`.review/body-facts.mjs`):

| Build | massKg | stabilityImpulseNs, N.s | armRate, m/s | soak, 1/J |
| --- | ---: | ---: | ---: | ---: |
| default (stone) | 247.2 | 117.1 | 11.81 | 2.323e-3 |
| wheel | 329.7 | 81.1 | | |
| multileg | 283.3 | 374.8 | | |
| human-warrior | 111.4 | 43.6 | 4.54 | 1.291e-3 |
| skeleton-warrior | 30.4 | 4.0 | 13.47 | 3.051e-3 |
| default, all-max | 949.0 | 913.7 | 18.08 | |

`a_golem_publishes_what_its_stats_do_as_physical_quantities_a_mind_can_read` pins the stone row and
checks that weight, arm speed and toughness each move their own field.

The lab observation takes the four fields per side as **version 3**: 8 columns after every version 2
column, so a version 2 student reads what it was trained on. `neuralFeatures` did not take them, so
its version did not move.

### Stroke timing from the arm

`strokeInertiaScale` stretched a stroke by the square root of the arm's swing inertia over the
default arm's. That read the load and not the arm carrying it. The weight stat raises the arm's
torques with its mass (session 07), and size raises them by its fourth power, but the stretch still
timed a x2-weight arm 14 % slower and the all-max giant up to 2.9 times slower.

`strokeTimeScale` takes the slower of two times:

- **The arm's rate** against its chain's shipped table: `(1 / rateScale)^gain`. For the reach and
  wrist chains `rateScale` is the anchor rate over reach, which works out to arm speed over the
  square root of size.
- **Its load against its torque**: `(I / (ref x torqueScale))^(gain / 2)`. `torqueScale` is the
  shoulder torque against the table's, which works out to weight times size to the fourth.

At x1 both scales are 1 and the rule is the old one to the bit. A light load still never times a
stroke quicker than the arm's rate does. But the arm-speed stat now shortens a stroke, where the old
rule threw it away.

The stroke bench, timed as a mind times it (`.review/stroke-timing.mjs`, Node stroke bench,
2026-09-24). Each cell gives the time scale, then peak driven tip speed (m/s) / peak anchor stray (mm):

| Arm | Level | Before | After |
| --- | --- | --- | --- |
| wrist blade | x1.25 size | 1.377, 13.1 / 15 | 1.118, 14.3 / 20 |
| wrist blade | x2 weight | 1.144, 16.1 / 24 | 1.000, 16.3 / 25 |
| wrist blade | all-max | 1.684, 12.2 / 11 | 0.762, 22.4 / 37 |
| wrist mace | x1 | 1.364, 18.3 / 153 | the same |
| wrist mace | x2 weight | 1.472, 14.8 / 26 | 1.041, 19.8 / 33 |
| wrist mace | all-max | 2.007, 12.7 / 8 | 0.908, 25.2 / 21 |
| wrist maul | x2 weight | 2.156, 6.2 / 41 | 1.525, 15.7 / 125 |
| wrist maul | all-max | 2.880, 8.0 / 35 | 1.303, 17.0 / 173 |
| skeletal blade | x1.5 arm speed | 1.000, 17.5 / 46 | 0.676, 21.5 / 43 |
| anatomical blade | x1.5 arm speed | 1.000, 13.6 / 149 | 0.777, 13.7 / 173 |

- **A heavier arm now swings as fast as the shipped one.** Before, the x2-weight mace peaked at 14.8
  m/s against the shipped arm's 18.3. After, it peaks at 19.8.
  `a_heavier_arm_timed_as_the_mind_times_it_swings_no_slower_than_the_shipped_one` pins that at 0.9
  of the shipped peak, and the inertia-only mutation turns it red.
- **The maul strays.** At x1 it already strays 106 mm on its own timing. Timed faster, the heavy
  mauls stray 125 and 173 mm. The maul is a load the chain carries badly on any timing.
- **The anatomical blade at x1.5 arm speed misses its mark by 0.41 m**, against 0.20. No mind in play
  reads this: the human's mind, like the duelist's, is v1 `golemTactics`, which does not time strokes
  by the arm.

Of the probe minds, the champion (v2), the brawler (v3) and the miser (v4) time strokes this way.
The duelist (v1) does not.

### The stand-off

`standOffReach(self, them)` in `src/downed.ts` is the reach a mind floors its stand-off at. v1 (the
duelist and the human), v2 (the champion, through the planner) and v3 read it. v4 (the miser) does
not: its stand-off is a searched multiple of the other body's reach, which is the command itself, and
a floor would override the search.

- **Outreached, a body holds at its own reach.** Before, it held outside the longer arm, which against
  a body that never recovers is a distance it can never strike from. Session 01 found a human standing
  1.6 m off an idle stone body for 40 s, and dealing it nothing.
- **With the longer arm, it keeps outside the shorter one**, as before.
- **Against a downed body there is no stand-off.** Before this session that was already true.

**Pressing.** `presses(self, them)` is true when this body's published mass is at least
`PRESS_MASS_RATIO` (1.5) times the other's, and the other is standing. A pressing body holds at its
near range plus slack, which is push range. No two stone builds press each other: the widest pair,
the wheel against the plain biped, is 1.33. Stone presses a human (2.2) and a skeleton (8), a human
presses a skeleton (3.7), and the all-max giant presses every x1 body (3.8 against stone).

One test moved. `the_shorter_arm_holds_outside_and_goes_in_on_their_recover` pinned the v2 fencer
holding outside a blade's reach. It is now
`the_shorter_arm_walks_to_its_own_reach_and_goes_in_on_their_recover`: from the blade's reach the
fist is asked full forward, and it does not stroke from outside its own reach. The fencer's recover
rule still decides the walk inside it: with the rule on, their recover asks for 1.00; with it off,
0.22.

### The human against an idle dummy: the stand-off was half of it

Session 01 put the human's failure against an idle dummy down to its stand-off, and handed the cell
to this session. The stand-off is fixed, and the cell is still at zero outright wins. What remains is
the human's stroke.

**The idle probe.** `research/idle-dummy.mjs --attackers human --blocks 4`, Node harness, research
runner, supported locomotion, cap 150 s, seed 20260923, at ec9b8b2. Each cell is outright wins
(wins with the drain):

| | stone | skeleton | human | giant |
| --- | ---: | ---: | ---: | ---: |
| session 01 | 0 % (50) | 0 % (100) | 0 % (67) | 0 % (13) |
| session 09 | 0 % (100) | 0 % (100) | 0 % (25) | 0 % (100) |

The drained wins against stone and the giant went from 50 % and 13 % to 100 %, so the human now
deals something to both. It still deals too little to win before the drain.

**Where it stands and what lands.** `.review/human-idle.mjs`, Node bout runner, the human duelist
against an idle stone, seeds 1 and 2, 40 s:

- It holds 1.3 to 1.5 m off, ground to ground. Its nearest part is 0.3 to 1.0 m from its shoulder
  and its reach is 1.52.
- It makes 31 contacts. Every one is a slap or under the energy floor. It deals 0.119 damage, and
  the dummy's vitality falls to 0.987.
- **The blade arrives flat.** Edge alignment averages 0.24 to 0.36 on every kind of contact. Stone's
  duelist, against the same dummy, lands its cuts at 0.85 to 0.97.
- The same holds under the golem duelist, the champion and the fencer on the human body, so the
  cause is the body's and not the humanoid mind's.

**The stroke bench agrees, once it reads the arm as a bout does.** Its capability builder was a copy
of the golem's that had lost the full-orientation branch, so it drove the human arm at roll 0. It is
one builder now (adfa2b4). The bench also now reads the edge lead at the mark: the share of the tip's
motion the edge leads with. Node stroke bench, x1, timed:

| Arm | Edge lead | Speed at the mark, m/s | Miss, m |
| --- | ---: | ---: | ---: |
| wrist blade | 0.944 | 15.5 | 0.10 |
| skeletal blade | 0.692 | 11.8 | 0.05 |
| anatomical blade | 0.284 | 9.3 | 0.18 |
| pitch blade | 1.000 | 11.7 | 0.14 |

**A quarter turn.** Swept over the stroke's roll (`.review/roll-sweep.mjs`), the human blade leads
with its edge at a roll of -1.57 (0.898), against 0.284 at the shipped 0.30. But it then misses by
0.40 m, against 0.18. In a bout, with `cutRoll` at -1.57 (human only), the human deals 0.752 to an
idle stone in 40 s against 0.119, and its first real cuts appear: 2 on the core at 0.75 edge.

**And the tip.** Against an idle human it holds out of equal reach and lands 26 contacts in 30 s,
all with the last 0.05 m of the blade. Their blade speed is 7 to 9 m/s, but their closing speed is 0.8
to 1.8 m/s, so the blade slides across instead of striking in.

Neither is a stand-off matter, and neither is fixed here:

- The human arm's roll is a quarter turn from the stroke table's, and turning it costs aim. It needs
  the arm's own orientation solve looked at, not a constant.
- The human's hold is at the very end of its reach.

Both are on the session 10 list.

### Re-measured at 567350a

Sessions 08 and 09 together, against session 07's readings at 4df55cc. The tree carries the body's
own lines, a blow's height in the ledger, no blow gain, the published body facts, the arm's stroke
timing and the shared stand-off. `research/runs/pc08b/batch.sh`.

#### Fingerprint

`tests/harness/body-fingerprint.mjs --against` session 07's, Node harness: 10 sections the same and
45 moved. Every head and torso section is the same, and so are the empty effector bench and one
bout (the human warrior against the human maul, which falls in neither tree). Every other effector
bench moved (session 09's stroke timing and the bench's capability builder), every walk moved (the
walk sections read the body's lines), and 14 of 15 bouts moved.

#### x1 controls

Node harness, research runner, supported locomotion, cap 150 s, seed 20260923, 192 blocks. Per body
per bout, 95 % bootstrap over the blocks (`research/control-band.mjs`):

| Tree | Stone damage | Stone knockdowns | Stone seconds | Skeleton damage | Skeleton knockdowns | Human damage / knockdowns |
| --- | --- | --- | --- | --- | --- | --- |
| session 01 | 7.64 [7.43, 7.85] | 4.93 [4.54, 5.32] | 28.1 | 1.89 | 4.85 | -- |
| 4df55cc | 8.00 [7.61, 8.47] | 4.14 [3.86, 4.42] | 20.6 | 1.70 [1.66, 1.74] | 4.05 [3.86, 4.26] | 0.06 / 0.00 |
| **567350a** | 7.96 [7.71, 8.21] | **0.56 [0.45, 0.68]** | 20.5 | 1.84 [1.80, 1.89] | **16.49 [15.92, 17.05]** | 0.06 / 0.00 |

- **Stone all but stopped falling, and the skeleton falls four times as often.** Both are the
  lines read off the body. Stone's published fall impulse is 117.1 N.s at its weakest, which a blow
  moving 10 N.s on average seldom reaches; the skeleton's is 4.0, and the skeleton stands with its centre of mass outside its feet
  in a third of its standing time. Stone is down 4.4 % of a bout, the skeleton 64.0 %.
- Damage did not move for either: the bar is worn down at the same rate whoever is on the floor.
- **The human mirror did not move**: 0.06 damage a body, no knockdowns, 305.6 contacts a bout of
  which 0.7 % are real blows, 245 of 384 bouts drawn.
- **The stability stat now moves almost nothing.** Across x0.75 to x1.5 on the stone mirror,
  knockdowns go from 0.65 to 0.51 a bout and the win rate from 48.2 % to 49.7 %; the control-paired
  margin at x1.5 is 0.016 [0.004, 0.031], d = 0.17 (`research/stat-sweep.mjs --stat stability
  --pairs 192`). A stat that scales a line nothing reaches has little left to scale.

#### The giant

`research/stat-sweep.mjs --attributes max,max-normal-body,size-weight-max --pairs 192`, Node harness,
research runner, supported locomotion, cap 150 s, seed 20260923:

| Level | Win % [95 %], 4df55cc | Win % [95 %], 567350a | Its knockdowns, before / after | The x1's knockdowns, before / after | The x1's time down, before / after |
| --- | ---: | ---: | ---: | ---: | ---: |
| control | 50.0 [44.5, 55.2] | 47.7 [42.2, 53.4] | 4.12 / 0.62 | 4.15 / 0.51 | 18.5 / 4.1 % |
| max | 99.5 [98.7, 100.0] | 98.7 [97.4, 99.7] | 0.01 / 0.39 | 11.09 / **2.77** | 75.5 / **59.0 %** |
| max-normal-body | 94.8 [92.4, 96.9] | 91.4 [88.5, 94.0] | 1.42 / 0.43 | 4.89 / 0.92 | 22.9 / 6.0 % |
| size-weight-max | 97.1 [95.3, 98.7] | 94.0 [91.7, 96.4] | 0.01 / 0.60 | 15.25 / **4.34** | 77.4 / **67.6 %** |

- **The giant still wins like a giant**: 98.7 % at max, in 8.3 s, dealing 12.52 for 2.54.
- **The x1 body falls a quarter as often against it and is still down most of the bout**, because
  it now lies until its fall has stopped: fewer, longer episodes.

#### Stun-lock

`research/downed-census.mjs --groups stone,skeleton,giant --blocks 96`, Node harness, research
runner, supported locomotion, cap 150 s, seed 20260923, fingerprint c4472ec9fb7d. "Giant" is the max
giant against x1 stone, both corners counted:

| Group | Knockdowns / body / bout | Down time % | Repeat knockdowns, share of episodes | Longest chain | Rises put back down by a blow |
| --- | ---: | ---: | ---: | ---: | ---: |
| stone, 4df55cc | 3.77 | 15.1 | 46.7 % | 13 | 124 |
| stone, 567350a | **0.34** | **3.7** | **11.5 %** | **3** | **51** |
| skeleton, 4df55cc | 3.38 | 26.4 | 24.8 % | 7 | 196 |
| skeleton, 567350a | **9.41** | **63.6** | **60.2 %** | **14** | **2655** |
| giant, 4df55cc | 3.15 | 40.0 | 84.1 % | 20 | 640 |
| giant, 567350a | 1.26 | 37.2 | 42.7 % | 7 | 19 |

- **Stun-lock moved from the giant to the skeleton.** A skeleton mirror is down 63.6 % of a bout,
  60.2 % of its knockdowns come within 2 s of a rise, and 89.7 % of its damage lands on a downed
  body. The giant's chains are down from 20 to 7.
- The first body down loses 86.7 % of decided stone bouts, 54.2 % of skeleton ones and 98.9 % of the
  giant's.
- Every episode longer than 5 s is "unsettled": 14 for stone, 777 for the skeleton, 29 (and one
  stuck rising) for the giant.

#### Idle-dummy matrix

`research/idle-dummy.mjs --blocks 12` at 567350a: Node harness, research runner, supported
locomotion, cap 150 s, 12 blocks a cell played from both sides, seed 20260923, fingerprint
c4472ec9fb7d. Each cell is the attacker's outright win rate, then the rate with the 60 s overtime
drain, then the median time of a win. Session 07's reading is in brackets.

| Attacker \ idle dummy | stone | skeleton | human | giant |
| --- | ---: | ---: | ---: | ---: |
| stone | 83 % (100) / 30.8 s [75 / 27.5] | 100 % (100) / 11.9 s [100 / 15.2] | 92 % (100) / 29.5 s [79 / 34.9] | 75 % (100) / 45.8 s [63 / 46.8] |
| skeleton | 0 % (100) / 87.2 s [0 / 106.3] | 58 % (100) / 56.9 s [88 / 44.4] | 0 % (100) / 98.2 s [0 / 93.8] | 0 % (100) / 96.4 s [0 / 115.1] |
| human | 0 % (100) / 119.2 s [0 (42)] | 0 % (100) / 116.3 s [0 (88)] | 0 % (25) / 119.9 s [0 (25)] | 0 % (92) / 119.3 s [0 (13)] |
| giant | 100 % (100) / 8.1 s [100 / 12.4] | 100 % (100) / 2.8 s [100 / 7.8] | 88 % (96) / 11.2 s [100 / 15.8] | 83 % (100) / 42.0 s [63 / 42.0] |

- **The same seven cells are at zero, and no new one**, so the overview's fourth failure condition
  does not hold.
- The human now wears down every idle body but its own kind before the drain ends it (100 %, 100 %,
  25 %, 92 % with the drain, from 42 %, 88 %, 25 %, 13 %). The stand-off was half of it; the flat
  blade is the other half (above).
- The skeleton against an idle skeleton fell from 88 % to 58 %: the attacker is on the floor as
  often as the dummy.
