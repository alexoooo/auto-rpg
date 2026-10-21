# The assist

The assist (`src/core/control/assist.ts`) is a force and a moment on a body's root that no muscle
gives, within a ceiling, metered. This records the attributes that set it and its kin (balance,
haste: `AttributeSpec`, `src/core/spec/body.ts`; `Rulebook.balance`, `src/core/rules/rulebook.ts`),
what a gait asks of it (`gaitAssist`, `src/core/skills/gait-assist.ts`), and what each buys in bouts.

## Balance

A character's **balance** is a per cent of its own weight, in its spec (`AttributeSpec.balance`)
beside its hit points: the most force its assist gives. The rulebook gives the moment that goes with
a per cent (`Rulebook.balance`), in body weights times a metre, so the same balance is the same help
to a light body and a heavy one. A fight gives each body the ceiling its balance comes to
(`balanceCeiling`) and withdraws the assist when the body is out of the fight. At 0 % the assist is
absent, and a bout is step for step the bout without it.

All of it is the owner's (`owner-balance` in `SOURCES`):

| What | Value | Where |
|---|---|---|
| The attribute's name | balance | `AttributeSpec.balance` |
| The Warrior's balance | 0 % | `workshopBalance` (`src/core/human/attributes.ts`) |
| The Rogue's balance | 0 % | `workshopBalance` |
| The skeleton's balance | 0 % | its figure (`src/core/human/skeleton.ts`), a placeholder as the rest of it is |
| A per cent's force | 0.01 of the body's weight, which is what a per cent is | `RULES.balance.force` |
| A per cent's moment | 0.0026 of the body's weight times a metre | `RULES.balance.moment` |

The moment is the force at a lever of 0.26 m: at 25 % a quarter of a weight and, for the Warrior's
775 N, 50 N m. The stance reads the ceiling before it steps (`assistReach`,
`src/core/control/gait.ts`; what the shoves hold with it is in `stance-tuning.md#assisted`). A bout
takes a balance for each side (`DuelRecipe.balance`; `&balance=left,right` in per cent, or one
number for both), and a force and a moment for a per cent in place of the rulebook's
(`DuelRecipe.balancePercent`).

## Haste

A character's **haste** is how much faster its legs' muscles are than its model's baseline, a per
cent over it, in its spec beside its balance (`AttributeSpec.haste`): 0 is unchanged, +50 is legs
half again as fast. It multiplies the unloaded speed of shortening of the hip's, the knee's and the
ankle's exertions (`jointSpeed`, `src/core/human/speed.ts`), and the girdle, bend and ankle joints on
the reptile's four legs (`reptilePhysique`), and nothing else: strength, mass and gravity are as they
are, so a hasted body neither floats nor looks fast-forwarded. It is not an assist. Speed
(`Physique.speed`) multiplies all muscle speeds; haste multiplies the legs' again.

All of it is the owner's (`owner-haste` in `SOURCES`):

| What | Value | Where |
|---|---|---|
| The attribute's name | haste | `AttributeSpec.haste` |
| Every character's haste | 0 % | `HUMAN_HASTE` (`src/core/human/attributes.ts`) |
| What it quickens | the hip's, knee's and ankle's (and the foot's) exertions, each way | `jointSpeed` |

A setup sets it per side through the shared character configuration (Arena `&left.haste=` and
`&right.haste=`, Lab `&body.haste=`, Crypt `&hero.haste=` or `&enemy.reptile.haste=`; the flat
`&haste=` still reads). A figure on a hasted body names each side's haste.

**What haste buys is pace.** The run's pace goes no more than `ahead` past the body's own
(`RunCycleSettings`), so a body asked past what it holds settles where the cycle's stride makes no
more speed, and faster muscles move that up. The battery: Node stand, Rapier, 120 Hz; the Warrior,
the Rogue and the skeleton, empty-handed and with the club, asked 1.4, 2, 3, 4 and 5 m/s, to stop
from 1.5, 2.4 and 3.5 and to turn at ±0.6 rad/s, calm and in four seeds of the Lab's 5 N gusts:

```powershell
node research/run-cycle-search.mjs --score --speeds 1.4,2,3,4,5 --stops 1.5,2.4,3.5 --turns 0.6,-0.6 --winds 1:5:5,6,7,8 --holds empty,club --seconds 22 --windows --haste <h> --hasted <power> --balance <b>
```

The speed held over the last 6 s of the empty-handed runs asked 5 m/s, the score, and the trials
that fell (of 150 runs, 60 turns, 90 stops); `RUN_CYCLE` is searched at both hastes (`--haste 0,50`):

| Haste | Balance | Warrior | Rogue | skeleton | Score | Runs, turns, stops fell |
|---|---|---|---|---|---|---|
| 0 % | 0 % | 3.38 | 3.15 | 3.47 | 1.77 | 19, 20, 18 |
| +50 % | 0 % | 3.67 | falls at 12 to 15 s, past 3.5 | 3.49 | 1.76 | 26, 23, 18 |
| 0 % | 25 % | 3.59 | 2.83 | 3.09 | 1.87 | 2, 2, 1 |
| +50 % | 25 % | 3.68 | 2.99 | 3.21 | 1.90 | 4, 6, 5 |

**The gait is not timed to its muscles.** `SimbiconSettings.hasted` shortens a gait's times and
raises its speeds and its envelope's by the haste to a power (`scaledGait`, `quickened`). Measured,
the power is 0: a gait quickened by its muscles keeps its strides and steps faster than gravity lets
the body fall onto them.

| Haste | Power | Score | Runs, of 150 | Turns, of 60 | Stops, of 90 |
|---|---|---|---|---|---|
| 0 % | any | 1.77 | 19 | 20 | 18 |
| +50 % | 0 | 1.76 | 26 | 23 | 18 |
| +50 % | 1/2 | 1.29 | 68 | 53 | 39 |
| +50 % | 1 | 0.44 | 106 | 60 | 57 |

## A gait's assist

A gait that drives the legs itself (the SIMBICON walk and its run, `simbicon.ts`) has no bearing
solve to say what the soles miss, so it asks the assist each step for a moment on the root that
turns the pelvis to the gait's own: facing its heading, at the walk's lean or the lean and bank the
run's stance hip last held, in 0.15 s as a body of 0.3 m radius of gyration would be turned
(`GAIT_ASSIST`), less any part that would lean it further forward (`gaitAssist`). On the battery of
[Haste](#haste) at haste 0, the trials that fell, and the Warrior's speed asked 5 m/s empty-handed:

| Balance | Runs, of 150 | Turns, of 60 | Stops, of 90 | Warrior asked 5, m/s |
|---|---|---|---|---|
| 0 % | 19 | 20 | 18 | 3.38 |
| 10 % | 10 | 15 | 8 | 3.72 |
| 25 % | 2 | 2 | 1 | 3.59 |
| 50 % | 0 | 1 | 0 | 3.54 |

At 0 % every trial is the one without it, to the bit. The Rogue's turns fall most without it (13 of
20) and least from 25 % (2, and 1 at 50 %); the Warrior's 5 none from 10 %; the skeleton's 2 none
from 25 %. The Rogue and the skeleton are slower for it, asked 4 or 5 m/s: at 25 %, 2.83 against
3.15 and 3.09 against 3.47.

## What the soles miss

Each step a stance works out the wrench the ground must give for the accelerations it asks and
shares it among the bearing soles as far as they can give it (`limitToPatches`,
`src/core/control/bearing.ts`). What they cannot give is `StanceReading.shortfall`, and it is what
the stance asks its assist for.

Node, the core world, Rapier, 120 Hz; the nine matchups at 4 m, each bout to its verdict, every
balance 0; a side of a bout read until the verdict (past a fall the ask has no bound):

```powershell
node research/assist-need.mjs --workers 14
```

- Over a whole bout a stance misses 0.012 to 0.097 of its body's weight and 9.1 to 53.5 N m on
  average, and asks more than the soles give (over 0.05 weights or 5 N m) in 28 to 50 % of its
  steps.
- In its last second a side that falls (7 of 18) misses 0.607 to 0.903 weights and 285.7 to
  424.8 N m; the sides that do not, 0.000 to 0.131 weights and 0.0 to 99.5 N m, but for the skeleton
  that beat the Rogue, which missed 0.520 and 332.5 and fell 0.27 s after the bout ended.

One bout a matchup places none of these as a rate.

## A pull the soles cannot hold

Node stand, Rapier, 120 Hz; the Warrior alone, unarmed, ordered to stand. After 1 s, a steady tenth
of its weight forward at its root's centre of mass for 2 s, then 2 s more; read over those 4 s. The
fixture is `pulled` in `tests/core-assist.test.mjs`, which holds the first row and the three at
25 %; it is given the two ceilings as a row writes them.

| Balance, % | Force ceiling, weights | Moment ceiling, weight-metres | Fell | Centre of mass at its lowest, m | Centre of mass travelled, m | Recovery steps | Most the soles missed while it stood, weights | Mean given, N | Mean given, N m |
|---|---|---|---|---|---|---|---|---|---|
| 0 | 0 | 0 | yes | 0.18 | 1.46 | 11 | 0.710 | 0.0 | 0.0 |
| 0.1 | 0.001 | 0.00026 | yes | 0.19 | 1.67 | 11 | 0.836 | 0.6 | 0.2 |
| 0.25 | 0.0025 | 0.00065 | yes | 0.20 | 2.11 | 11 | 0.622 | 1.4 | 0.4 |
| 0.5 | 0.005 | 0.0013 | no | 0.93 | 0.86 | 7 | 0.281 | 2.2 | 0.6 |
| 1 | 0.01 | 0.0026 | no | 0.95 | 0.25 | 3 | 0.309 | 3.2 | 0.8 |
| 2.5 | 0.025 | 0.0065 | no | 0.98 | 0.05 | 0 | 0.012 | 2.2 | 1.7 |
| 5 | 0.05 | 0.013 | no | 0.98 | 0.05 | 0 | 0.010 | 2.0 | 1.9 |
| 25 | 0.25 | 0.065 | no | 0.98 | 0.05 | 0 | 0.010 | 2.0 | 1.9 |
| 25, the force alone | 0.25 | 0 | no | 0.98 | 0.05 | 0 | 0.020 | 4.1 | 0.0 |
| 25, the moment alone | 0 | 0.065 | no | 0.98 | 0.06 | 0 | 0.025 | 0.0 | 5.7 |

With none the body steps eleven times and falls; 2.5 % holds it with no step, on about 2 N and
2 N m. What is given early keeps the shortfall from growing, so the mean stays far under the ceiling
once the ceiling is enough. A part alone holds only because the legs are asked for the ground's
wrench less what the assist gives (`bear`, `src/core/control/stance.ts`): asked for all of it, the
body under the moment alone travels 0.42 m and takes five recovery steps.

## What balance does to a bout

Node, the core world, Rapier, 120 Hz; the nine matchups at eleven gaps from 3 to 5 m, each bout to
its verdict or the 120 s cap: 1485 bouts.

```powershell
node research/assist-sweep.mjs --workers 14
```

**Even**: both sides at one balance, the rulebook's moment for a per cent. Falls and wounding blows
a minute of bout time; the mean given is a side's until the verdict.

| Balance, % | Bouts | End by a fall | By a wound | At the cap | Bout time, s | Falls a minute | Wounding blows a minute | Mean given a side, N | Mean given, N m |
|---|---|---|---|---|---|---|---|---|---|
| 0 | 99 | 80 | 19 | 0 | 1392 | 3.45 | 9.05 | 0.0 | 0.0 |
| 10 | 99 | 53 | 42 | 4 | 3028 | 1.05 | 18.68 | 8.2 | 4.5 |
| 25 | 99 | 19 | 56 | 24 | 5453 | 0.21 | 18.23 | 9.3 | 6.7 |
| 50 | 99 | 11 | 58 | 30 | 5905 | 0.11 | 18.74 | 10.4 | 9.0 |
| 100 | 99 | 11 | 58 | 30 | 5705 | 0.12 | 16.78 | 9.1 | 9.1 |
| 200 | 99 | 11 | 55 | 33 | 6180 | 0.11 | 17.35 | 8.9 | 9.3 |

**By model**: a model's falls a minute over every side it fought on (66 a cell; its falls in
brackets).

| Model | 0 % | 10 % | 25 % | 50 % | 100 % | 200 % |
|---|---|---|---|---|---|---|
| workshop-fighter | 1.37 (17) | 0.24 (5) | 0.00 (0) | 0.00 (0) | 0.00 (0) | 0.03 (1) |
| workshop-rogue | 1.89 (29) | 0.58 (23) | 0.13 (9) | 0.05 (4) | 0.06 (5) | 0.08 (7) |
| crypt-skeleton | 1.83 (34) | 0.62 (25) | 0.13 (10) | 0.08 (7) | 0.07 (6) | 0.03 (3) |

**Shapes**: both sides at 100 %, another force and moment for a per cent.

| A per cent's force, weights | A per cent's moment, weight-metres | End by a fall | By a wound | At the cap | Falls a minute | Mean given a side, N | N m |
|---|---|---|---|---|---|---|---|
| 0.01 | 0.0052 | 12 | 55 | 32 | 0.12 | 8.9 | 9.3 |
| 0 | 0.0026 | 28 | 53 | 18 | 0.34 | 0.0 | 12.8 |
| 0.01 | 0 | 44 | 27 | 28 | 0.51 | 16.2 | 0.0 |

**Uneven**: one side at more, each matchup both ways round, 198 bouts a row, every one decided (at
the cap the fuller bar wins).

| More, % | Less, % | Won by the side with more | Its share, % | Falls a minute, more | Falls a minute, less | At the cap |
|---|---|---|---|---|---|---|
| 25 | 0 | 165 | 83 | 0.05 | 2.57 | 0 |
| 25 | 10 | 122 | 62 | 0.14 | 0.40 | 24 |
| 50 | 25 | 101 | 51 | 0.06 | 0.10 | 58 |

- **Balance takes the falls out of a bout**: 80 of 99 end by a fall with none, 53 at 10 %, 19 at
  25 %; the wounding blows a minute double, since a bout no fall ends is decided by blows.
- **The attribute is spent by about 25 %** at this moment for a per cent: from 50 % the rows are
  one row, and the mean given stays near 9 N and 9 N m however high the ceiling.
- **Bouts get long**: 14 s on average with none, 31 s at 10 %, 55 s at 25 %, and from 25 % a quarter
  to a third reach the cap.
- **The models differ**: at 25 % and above the Warrior fell once in 264 sides.
- **Both parts work**: at 100 % the moment alone leaves 0.34 falls a minute and the force alone
  0.51, against 0.12; twice the moment changes nothing.
- **A difference in balance buys bouts only where the lesser side still falls**: 51 % at 50 against
  25 is no difference (a share over 198 bouts reads to about 7 points).

The tables were read with the balance as twentieths of the body's weight (0, 2, 5, 10, 20 and 40,
at 0.013 weight-metres each); each ceiling is the per cent's, so a row is the bout the command
plays. On the page (Rapier, 120 Hz, the tab hidden and stepped by hand; one bout each):
Warrior against Warrior at `&balance=25` (each ceiling 196.5 N and 51.1 N m, the clock reading
"balance 25 / 25 %") ended at 19.9 s by a fatal wound after 17 wounding blows and no fall; with none
it ended by a fall at 28.5 s after 6.

## A force through the step, not an impulse before it

The assist is given through the engine's one-step force (`SegmentBody.applyForce`, `applyTorque`,
`src/core/engine/engine.ts`), which the solver integrates as it does gravity. An impulse of the same
force times the step, given before it, is the same momentum and not the same motion: the solver's
16 iterations are sub-steps, the impulse is whole at the first and gravity a sixteenth at each, so a
body given exactly its weight creeps up. Node, a bare core world (gravity, no ground), Rapier,
120 Hz; the Warrior limp, its assist asked for two weights up under a ceiling of one, 60 steps
(`lifted` in `tests/core-assist.test.mjs`):

| How the weight of force is given | Centre of mass moved in 60 steps, m | A step, m |
|---|---|---|
| An impulse before each step | 0.019153 | 0.000319 (gravity times the step squared, times 15/32) |
| A force through each step | 0.00000026 | |
| None given | 1.227 down (half of gravity over 0.5 s squared is 1.226) | |

## Tried and not kept

- **A torque and a lift outside the stance's solve** (at `144961d4`, a hook the tree does not keep;
  record `docs/plans/2026-09-30-minds-00-design.md@ecda48dc`): a torque toward upright about the
  level axes (300 N m/rad, 15 N m s/rad, clipped) and a lift toward the root's built height, on the
  nine matchups at 4 m. With neither 8 of 9 bouts end by a fall; with torque ceilings of 25 to
  200 N m, 6 or 7; with lifts of 0.25 to 2 weights, 7 or 8. The torque was at its ceiling in under a
  tenth of the steps. With the gain scaled to the ceiling (the ceiling over 0.15 rad, damped over
  0.1 s) it sat there in 78 to 98 % of steps from 50 N m, and at 200 and 400 N m every bout ended by
  a fall, in 3.1 and 1.1 s: an explicit torque on one light segment at 120 Hz goes unstable. So the
  assist is solved with the body, and gives the wrench the soles miss.
- **Other gait assists**, on the Warrior and the Rogue asked 3 and 4 and to stop from 2.4, calm and
  in two seeds, at 25 %, on the run of two clips (`assets/core/run-cycle.json@65e674be`): a force
  across the heading toward the walk asked, in 0.25 s, alone: the falls of none; the moment toward
  the run's settled lean (`RunCycleSettings.lean`): no run falls, and every run held under about
  2.4 m/s; the moment's pitch both ways: the Warrior falls in 7 of 12 stops against 1; damping the
  pelvis's spin alone: the Rogue's falls of none.
- **Haste as a forward force on the root**: an assist, which reads as sliding.
