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

