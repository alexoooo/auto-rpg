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
