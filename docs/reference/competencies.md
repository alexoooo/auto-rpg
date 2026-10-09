# Competencies

What today's skills can do, judged by what a person's motion is judged by. This is the "before"
table that every later change to a skill or a body is read against. The suite is
`research/competencies.mjs`, run by `research/control-foundation.mjs --suite competency`
([research](../../research/README.md)). One job is one trial in a fresh world, and the summary's
`competencies` holds each competency's figures by body, loadout and rate.

## The suite

Each competency wraps a fixture that already exists. All of them are unassisted: every character's
balance is 0 %, and the punch and kick stands fault any assist they meter.

| Competency | Fixture | A trial | Gated | Reported |
|---|---|---|---|---|
| stand | `shove` (`research/core-stance-trials.mjs`), in the guard | a level shove at the middle trunk's centre of mass, 0.2 to 0.8 N s per kg of the body's own mass, from 8 directions; upright through 10 s after it | the largest level held from every direction, as at every level below it (`fastestHeld`) | recovery steps |
| guard | the defense probe (`src/core/tasks/defense.ts`) | hinged clubs at the head and upper trunk, covered by the left, right or both hands; the predictive guard and the pose as its control | share of predictive trials that cover every blow, protect the head and upper trunk, and stay up | protected impulse |
| punch | `punchStand` (`research/punch-calibration.mjs`), the path strike's planted cross, or a blow part (`--blow`, [Research blows](#research-blows)) | 8 s of crosses with each hand at a compliant pad: at the cell's place (0.1 m to the hand's side, 1.55 m up, 0.55 m ahead), at full reach (`fullReach`), and 1 m aside as a miss; the seed moves the target up to 2 cm | share of blows landed; hand speed over the last 10 cm; first contact after the order; upright and returned | impulse, effective mass, peak force, the chamber-to-contact time |
| walk | `walk`, `turn` (`research/core-stance-trials.mjs`), in the guard | 8 s at 0.3 to 1.4 m/s at 4 headings, then a stop; a half turn at 2 rad/s walking at 0.3 m/s, each way | the speed travelled (below); both turns upright | the fastest asked speed held upright at every heading, as at every slower one (the stance envelope's rule); falls |
| rise | `felled` (`research/core-rise-trials.mjs`) under the staged rise | shoved down at 1.5 N s/kg from 4 directions; watched 40 s | share of falls risen and up at the end; median time from the fall to standing 2 s | the slowest rise |
| kick | `frontKickStand` (`research/front-kicks.mjs`), the front kick | 24 s of kicks with each foot at a pad 0.45 m up and ahead, and 1 m aside as a miss | share of blows landed; foot speed at contact; upright and returned | impulse, first contact after the order |
| run | none | an `unsupported` row in every cell | | |

A blow is each swing begun at least 0.5 s before the window ends; it lands when an eligible impact
of that swing reaches the pad. A hit trial succeeds with no fault (a fall, a trunk on the floor, a
failed cycle, an assist, the pad's stroke exceeded) and a blow landed. A miss trial succeeds with no
fault and nothing touched.

**The speed travelled** is the walk's gated figure. A walk's speed made is its centre of mass's
travel along its heading over seconds 5 to 8, divided by 3 s. At each asked speed where no walk
fell at any heading, as at every slower one, the slowest heading's speed made counts; the figure is
the best of those. It is the speed the body walks at every heading, whatever it was asked.

**Full reach** is where the target stands when the hand's strike point touches it with the arm
straight from the shoulder where the body is built. The arm's length runs shoulder to elbow to
wrist to the strike point, in the reference pose. The target keeps the cell's side and height.
That puts it at 0.64 m ahead for the Warrior and 0.51 m for the Rogue, whose straight arm does not
reach the cell's 0.55 m at 1.55 m up.

**The grid.** Each workshop body (`workshop-fighter`, `workshop-rogue`), empty-handed and with the
club in the right hand, at 120 Hz and at 480 Hz. Two development seeds per cell. A blow with a held
club is the club's competency and not the punch's, so the club's punch cell is an `unsupported` row.
The grid of physiques is the same suite on each physique of `PHYSIQUE_GRID`
([The physique grid](#the-physique-grid)).

## Physiques

A physique (`Physique`, `src/core/human/physique.ts`) is how a body differs from its model's
figure: four factors, each changing one thing. The owner chose them on 2026-10-08.

| Attribute | Changes | Leaves |
|---|---|---|
| size | every length, and the mass at the same density; the muscle is a share of that mass, so torque goes as size cubed | joint speeds |
| weight | the mass alone, a load the same muscles carry: every segment as long and as dense, broader by the square root | lengths, joint centres, torques, speeds |
| strength | every peak torque | everything else |
| speed | every muscle's unloaded speed of shortening | everything else |

Weight broadens a trunk segment's hull and each hand's hulls about the line along the segment
through the hull's centroid, a foot's box across and up from its sole, and a limb's capsule by
holding its mass at its density. The longitudinal radius of gyration broadens with it; de Leva's
transverse radii are kept, a stated assumption.

Weight has a ceiling in the body plan. Broadened, segments that share no joint come to touch in
the reference pose, where the engine would fling them apart: the Warrior's upper arms meet its
middle trunk past x1.30 (5.3 mm of room at x1.25), and the Rogue's thighs meet each other past
x1.35. The crypt skeleton takes no weight: its limbs are capped by the room its own trunk leaves,
which it would have to derive again.

The grid's ranges are the owner's: size x0.9 to x1.18, weight x0.85 to x1.25, strength x0.8 to
x1.25, and speed x0.85 to x1.15, the last an engineering range with no source. They are
`PHYSIQUE_GRID` (`research/physiques.mjs`), and a run overrides any of them by flag.

## Targets

| Competency | Human figure | Source |
|---|---|---|
| punch | 8.0 ± 1.2 m/s over the last 0.1 m, 22.8 N s; 29 untrained men, dominant fist, at maximum effort into a padded plate | Adamec, `HUMAN_PUNCH` (`research/punch-calibration.mjs`); trained 17.2 N s, `TRAINED_ATTACKS` |
| walk | comfortable 1.39 m/s and maximum 2.53 m/s, men aged 20 to 29; comfortable speed is 1.27 to 1.46 m/s across every age and sex group of 20 to 79 years | Bohannon RW (1997), *Age and Ageing* 26:15–19, doi:10.1093/ageing/26.1.15 |
| kick | front kick foot speed into a target: 7.7 ± 1.2 m/s novice, 8.56 ± 1.08 sub-elite, 9.61 ± 1.05 elite | Vagner M et al. (2023), *Sports* 11:141, doi:10.3390/sports11080141 |
| rise | every young adult (12 men, 12 women, mean age 23) rose from every lying position unaided; healthy older adults took twice as long as the young | Alexander NB et al. (1997), *J Am Geriatr Soc* 45:564–9, doi:10.1111/j.1532-5415.1997.tb03088.x (abstract; the times are in its tables, not read here) |
| run | none sourced; people change from a walk to a run near 2 m/s | |
| stand | none sourced | |
| guard | none: an engineering gate | |

## Thresholds

The owner accepted these on 2026-10-08. None is lowered after a held-out run.

A competency passes only where it meets its threshold at 120 Hz and at 480 Hz (`RATES`,
`competencyPasses`). The game runs at 120 Hz. The 480 Hz run reads the same skill at a quarter of
the step, nearer the continuous physics the body stands for, so a skill that works only through
120 Hz's integration error fails it; such a skill would also break when a body's size, weight or
strength changes. Each rate is a run of its own, and `research/competency-passes.mjs` reads the
runs together.

| Competency | Pass | From |
|---|---|---|
| stand | 0.5 N s/kg held from every direction | engineering: about 40 N s on the Warrior, the shove the stance's own tests hold sideways |
| guard | 95 % of predictive trials succeed | engineering |
| punch | every trial succeeds; 95 % of blows land; every landed blow at least 6.8 m/s; first contact within 0.5 s of the order | the untrained mean less one SD; the 0.5 s is engineering |
| walk | 1.27 m/s travelled; both turns upright | the slowest group's comfortable speed |
| rise | 95 % of falls risen; median 6 s or less | the share from the young adults; the time is engineering until the paper's tables are read |
| kick | every trial succeeds; 95 % of blows land; every landed blow at least 6.5 m/s | the novice mean less one SD |
| run | none yet | |

`THRESHOLDS` in `research/competencies.mjs` holds these, and each figure in a summary says whether
it `meets` them.

## Baseline

Node, the core's world on Rapier (`rapier/adapter-9`), symmetric actuation, development seeds 0
and 1, at 120 Hz and 480 Hz from the same source (`ecea5407`, content `3f8c80d6`). The rows and
manifests of both runs are `competencies-baseline.json.gz`. The figures are `competencyFigures`
over those rows; `node research/competency-passes.mjs docs/reference/competencies-baseline.json.gz`
prints them and the passes. Each cell is a body (Warrior: `workshop-fighter`, 79.0 kg; Rogue:
`workshop-rogue`, 57.6 kg) with empty hands or the club. Figures read "120 Hz | 480 Hz".

**The stand passes in every cell, and the guard in both bodies' empty-handed cells. Nothing else
meets its threshold at either rate.**

### Stand

The largest shove held from all 8 directions, as at every lighter one, in N s/kg (16 trials a
level), and how many of 16 held at 0.8:

| Cell | Held every way | At 0.8 | Mean steps at 0.6 |
|---|---|---|---|
| Warrior, empty | 0.6 \| 0.6 (47 N s) | 13 \| 14 | 1.8 \| 1.4 |
| Warrior, club | 0.6 \| 0.6 | 14 \| 14 | 1.5 \| 1.4 |
| Rogue, empty | 0.6 \| 0.6 (35 N s) | 6 \| 5 | 1.7 \| 1.6 |
| Rogue, club | 0.6 \| 0.6 | 6 \| 8 | 1.4 \| 1.4 |

Every cell meets 0.5.

### Guard

Predictive trials that succeed, of 2, by the hand covering (left, right, both). The pose, the
control, succeeds in none, with 5.6 to 64 N s on the protected parts.

| Cell | Left | Right | Both | Meets 95 % |
|---|---|---|---|---|
| Warrior, empty | 2 \| 2 | 2 \| 2 | 2 \| 2 | yes \| yes |
| Warrior, club | 2 \| 2 | 2 \| 2 | 2 \| 0 | yes \| no |
| Rogue, empty | 2 \| 2 | 2 \| 2 | 2 \| 2 | yes \| yes |
| Rogue, club | 1 \| 2 | 1 \| 1 | 0 \| 0 | no \| no |

### Punch

Empty hands. Blows landed of those thrown, the mean and slowest hand speed over the last 10 cm
(m/s), and the first contact after the order (s). Every miss trial stayed up and touched nothing,
except one of the Rogue's left at 120 Hz, which faulted a failed strike/return cycle. Nobody fell.

| Cell | Landed | Speed | Slowest | First contact |
|---|---|---|---|---|
| Warrior left, place | 13/13 \| 14/14 | 4.84 \| 4.46 | 4.65 \| 4.19 | 0.36 \| 0.36 |
| Warrior left, full reach | 4/13 \| 13/13 | 4.72 \| 4.78 | 4.43 \| 4.66 | 0.36 \| 0.37 |
| Warrior right, place | 7/13 \| 14/14 | 4.88 \| 4.38 | 4.78 \| 4.09 | 0.34 \| 0.36 |
| Warrior right, full reach | 4/14 \| 13/14 | 4.73 \| 4.78 | 4.47 \| 4.62 | 0.35 \| 0.36 |
| Rogue left, place | 7/11 \| 1/13 | 3.55 \| 1.68 | 1.91 \| 1.68 | 2.17 \| 4.76 |
| Rogue left, full reach | 5/12 \| 10/14 | 2.91 \| 3.99 | 1.61 \| 1.80 | 1.25 \| 1.69 |
| Rogue right, place | 3/15 \| 0/14 | 3.00 \| – | 1.71 \| – | 3.64 \| – |
| Rogue right, full reach | 3/13 \| 6/13 | 3.59 \| 3.83 | 1.52 \| 1.51 | 1.66 \| 3.19 |

The Warrior's cross takes 0.35 s from the chamber to the pad and reaches 4.4 to 4.9 m/s at
either distance: 55 to 61 % of the untrained 8 m/s, and below the 6.8 m/s proposed. The Rogue's
place is beyond its straight arm (0.55 m against 0.51), so most of its blows fall short or glance.
Impulse is 7.7 to 9.1 N s at 120 Hz and 4.7 to 5.2 N s at 480 Hz, as the contact model's
rate-dependence predicts.

### Walk

The speed travelled and the fastest asked speed held upright at every heading, in m/s, and falls
of 8 at 0.7 m/s. Every half turn stayed up (4/4).

| Cell | Travelled | Upright | Falls at 0.7 |
|---|---|---|---|
| Warrior, empty | 0.40 \| 0.40 | 0.5 \| 0.5 | 3 \| 3 |
| Warrior, club | 0.39 \| 0.39 | 0.5 \| 0.5 | 3 \| 3 |
| Rogue, empty | 0.25 \| 0.39 | 0.3 \| 0.5 | 5 \| 5 |
| Rogue, club | 0.23 \| 0.40 | 0.3 \| 0.5 | 4 \| 5 |

Each figure comes from the fastest asked speed held upright, where the slowest heading makes 77
to 85 % of it. The best is 0.40 m/s, 31 % of the 1.27 m/s threshold. At 1.4 m/s, 6 to 8 of 8
fall in every cell.

### Rise

Falls risen and up at the end of the 40 s watch, of 8, and the median and slowest time from the
fall to standing (s):

| Cell | Risen | Median | Slowest |
|---|---|---|---|
| Warrior, empty | 4 \| 0 | 23.5 \| – | 30.0 \| – |
| Warrior, club | 5 \| 0 | 25.2 \| – | 34.1 \| – |
| Rogue, empty | 0 \| 0 | – | – |
| Rogue, club | 0 \| 0 | – | – |

At 480 Hz the staged rise stops at the half kneel on the Warrior (14 of 16 falls; the other two at
the hold) and at the hold on the Rogue (13 of 16).

### Kick

Every hit landed every blow, and every trial stayed up. Two trials faulted a failed cycle at
120 Hz (the Warrior's left, one empty-handed hit and one miss with the club), and none at 480 Hz.
The foot's mean speed at contact (m/s), with the first contact after the order:

| Cell | Left | Right | First contact |
|---|---|---|---|
| Warrior, empty | 1.21 \| 1.13 | 1.17 \| 1.14 | 3.4 to 3.5 |
| Warrior, club | 1.21 \| 1.14 | 1.23 \| 1.16 | 3.4 to 3.5 |
| Rogue, empty | 1.37 \| 1.29 | 1.41 \| 1.44 | 3.2 to 3.4 |
| Rogue, club | 1.40 \| 1.33 | 1.48 \| 1.30 | 3.3 |

The front kick is a push: 0.9 to 1.0 s from its chamber to the pad, at 15 to 19 % of a novice's
7.7 m/s, and its first chamber comes about 2.4 s after the order.

### Run

An `unsupported` row in every cell.

## Agreement between the rates

The tolerance for the gated quantities is:
- a hand, foot or walking speed within 10 % of the 120 Hz figure;
- a stand level on the same rung of its ladder;
- a share whose 95 % intervals overlap.

Within it:
- the stand;
- the Warrior's walk, within 1 %;
- the punch's speed at full reach;
- the Warrior's first contact times;
- the kick, except the one cell below;
- the guard except the cell below.

Outside it, each a finding:

- **The staged rise does not rise at 480 Hz.** It gets 9 of 16 Warrior falls up at 120 Hz and
  none at 480 Hz, where it stops at the half kneel. It is a script of timed poses, tuned at one rate.
- **The Warrior's cross aborts most of its swings at 120 Hz and few at 480 Hz.** At full reach it
  lands 8 of 27 at 120 Hz, 26 of 27 at 480 Hz; at the place with the right hand, 7 of 13 and 14 of
  14. An aborted swing turns to its return about 0.07 s after it begins, without touching the
  pad. Why it aborts is not read here.
- **The cross is 8 to 10 % faster at the place at 120 Hz**: 4.84 and 4.88 m/s against 4.46 and 4.38.
  At full reach the two rates agree within 1.3 %.
- **The Rogue's right kick with the club** reads 1.48 m/s at 120 Hz and 1.30 m/s at 480 Hz, 12 %
  apart. Its other kicks agree within 8 %.
- **The Warrior's two-handed guard with the club** covers both trials at 120 Hz and neither at
  480 Hz (11.5 N s protected).
- **The Rogue walks faster at 480 Hz**: 0.39 and 0.40 m/s against 0.25 and 0.23 at 120 Hz. At
  120 Hz one or two of its walks asked 0.5 m/s fall in each loadout, so its figure comes from 0.3 m/s.
- **The Rogue's punch at the place** lands 10 of 26 at 120 Hz and 1 of 27 at 480 Hz, at a target
  beyond its straight arm.

Impulse is reported and not gated: 120 Hz reads 1.4 to 2.0 times 480 Hz on the punch and the kick.

## Research blows

The experimental blow parts (`driven-strike`, `whole-body-strike`), each on the punch competency
in place of the path strike: `control-foundation.mjs --suite competency --competency punch --blow
<kind>` (`blowConfig`, `research/competencies.mjs`), the whole-body strike's flat-out drive with
`--blow-settings drive=flat-out`. Node, the core's world on Rapier (`rapier/adapter-9`),
symmetric actuation, development seeds 0 and 1, at 120 Hz and 480 Hz from one source (content
`3a82bee4`). Everything else is the punch's: the walk and the guard beside the blow, a compliant
pad, both hands at the cell's place and at full reach, and the miss. The rows and manifests are
`competencies-driven-strike.json.gz`, `competencies-whole-body-timed.json.gz` and
`competencies-whole-body-flat-out.json.gz`; `node research/competency-passes.mjs <record>` prints
the figures. Figures read "120 Hz | 480 Hz", as the [baseline](#punch)'s do; a hit cell is two
trials, so its falls are of 2, and the misses clean are the miss trials that touched nothing and
stayed up.

**No part meets the punch's threshold in any cell, at either rate.**

### Driven strike

The path strike with its `driven` setting at its defaults (`DRIVEN_STRIKE`: drive 1, turn
0.43 rad, wind-up 0.3 m, contact 7.5 m/s), on the planted cross the baseline throws.

| Cell | Landed | Speed | Slowest | First contact | Falls, hit | Misses clean |
|---|---|---|---|---|---|---|
| Warrior left, place | 0/8 \| 0/8 | – \| – | – \| – | – \| – | 0/2 \| 0/2 | 2/2 \| 2/2 |
| Warrior left, full reach | 0/8 \| 0/8 | – \| – | – \| – | – \| – | 0/2 \| 0/2 |  |
| Warrior right, place | 0/8 \| 0/8 | – \| – | – \| – | – \| – | 0/2 \| 0/2 | 2/2 \| 2/2 |
| Warrior right, full reach | 0/8 \| 0/8 | – \| – | – \| – | – \| – | 0/2 \| 0/2 |  |
| Rogue left, place | 0/8 \| 0/8 | – \| – | – \| – | – \| – | 0/2 \| 0/2 | 2/2 \| 2/2 |
| Rogue left, full reach | 0/8 \| 0/8 | – \| – | – \| – | – \| – | 0/2 \| 0/2 |  |
| Rogue right, place | 0/8 \| 0/8 | – \| – | – \| – | – \| – | 0/2 \| 0/2 | 2/2 \| 2/2 |
| Rogue right, full reach | 0/8 \| 0/8 | – \| – | – \| – | – \| – | 0/2 \| 0/2 |  |

No blow lands. Every swing is aborted 0.07 to 0.13 s after launch without touching the pad, by
the strike cycle's support rule (`bearingSupport`): with that rule taken as held, a diagnostic
only, the Warrior's right-hand swings at the place ran 0.15 and 0.18 s. Nothing fell.

### Whole-body strike, timed

The spike's solve and punch ([whole-body spike](whole-body-spike.md#punch)) as a fighter's blow:
the pelvis and chest turn, and the fist goes on a 0.12 s minimum-jerk path to 0.2 m past the target
the way the body faces.

| Cell | Landed | Speed | Slowest | First contact | Falls, hit | Misses clean |
|---|---|---|---|---|---|---|
| Warrior left, place | 8/8 \| 8/8 | 4.47 \| 4.97 | 4.10 \| 4.49 | 0.20 \| 0.18 | 0/2 \| 0/2 | 2/2 \| 2/2 |
| Warrior left, full reach | 7/7 \| 7/7 | 4.59 \| 4.35 | 3.62 \| 3.25 | 0.22 \| 0.20 | 0/2 \| 0/2 |  |
| Warrior right, place | 7/7 \| 8/8 | 4.38 \| 4.70 | 2.71 \| 3.85 | 0.21 \| 0.18 | 0/2 \| 0/2 | 2/2 \| 2/2 |
| Warrior right, full reach | 5/7 \| 6/6 | 3.36 \| 3.98 | 2.85 \| 2.62 | 0.23 \| 0.21 | 0/2 \| 1/2 |  |
| Rogue left, place | 4/7 \| 7/7 | 3.34 \| 2.88 | 1.85 \| 2.20 | 0.22 \| 0.21 | 0/2 \| 0/2 | 2/2 \| 2/2 |
| Rogue left, full reach | 4/6 \| 7/7 | 2.82 \| 2.97 | 1.61 \| 2.04 | 1.25 \| 0.21 | 0/2 \| 0/2 |  |
| Rogue right, place | 2/7 \| 7/7 | 1.75 \| 2.83 | 1.57 \| 2.11 | 0.27 \| 0.21 | 0/2 \| 0/2 | 2/2 \| 2/2 |
| Rogue right, full reach | 6/6 \| 7/8 | 2.44 \| 3.15 | 1.47 \| 2.34 | 0.25 \| 0.19 | 0/2 \| 0/2 |  |

First contact comes 0.18 to 0.27 s after the order, within the threshold's 0.5 s but for one
Rogue cell at 120 Hz, at 1.8 to 5.0 m/s. One trial fell, the Warrior's right hand at full reach
at 480 Hz.

### Whole-body strike, flat out

The flat-out drive ([whole-body spike](whole-body-spike.md#flat-out)): the fist drawn back to 0.25 m
from the target, then driven along the line at 240 m/s² with the turns.

| Cell | Landed | Speed | Slowest | First contact | Falls, hit | Misses clean |
|---|---|---|---|---|---|---|
| Warrior left, place | 6/6 \| 3/3 | 4.25 \| 3.71 | 3.51 \| 3.65 | 0.22 \| 0.19 | 0/2 \| 2/2 | 0/2 \| 0/2 |
| Warrior left, full reach | 5/5 \| 4/4 | 2.77 \| 2.74 | 1.57 \| 1.01 | 0.24 \| 0.18 | 1/2 \| 1/2 |  |
| Warrior right, place | 5/6 \| 4/4 | 4.28 \| 3.88 | 3.78 \| 3.54 | 0.23 \| 0.19 | 0/2 \| 1/2 | 0/2 \| 0/2 |
| Warrior right, full reach | 5/6 \| 2/2 | 3.00 \| 3.53 | 2.28 \| 3.51 | 0.23 \| 0.18 | 1/2 \| 2/2 |  |
| Rogue left, place | 6/6 \| 6/6 | 3.19 \| 2.37 | 2.12 \| 1.66 | 0.26 \| 0.25 | 1/2 \| 0/2 | 0/2 \| 0/2 |
| Rogue left, full reach | 8/8 \| 4/6 | 2.97 \| 2.27 | 2.51 \| 1.97 | 0.26 \| 0.26 | 0/2 \| 0/2 |  |
| Rogue right, place | 8/8 \| 6/6 | 2.75 \| 2.47 | 0.75 \| 1.70 | 0.26 \| 0.25 | 0/2 \| 0/2 | 0/2 \| 0/2 |
| Rogue right, full reach | 6/6 \| 3/6 | 3.07 \| 2.20 | 2.68 \| 2.08 | 0.26 \| 0.26 | 1/2 \| 1/2 |  |

Every miss trial falls: nothing stops a drive that meets no pad until 0.45 s have passed. Hits
fall in 11 of 32 trials. The Warrior's blows at the place land at 3.7 to 4.3 m/s, under the
grid's 5.1 to 5.9.

### Against the spike

The part runs the spike's goals and settings inside a fighter, and three things differ from the
spike's rig, which runs its solve on the body the whole time:

- **Between blows the stance holds the body**, and the solve takes it from wherever the stance has
  it. The spike's solve had stood it from the start, and its blows begin from that.
- **The fist is closed**, as the path strike's is; the spike's hand is open.
- **The pelvis's height and turn are held from where the blow begins**: its height `lower` under
  its reference height over where the feet stand, and its turn as it is, where the spike holds
  both as built.

On the grid's own cell, the Warrior's right hand at 120 Hz, the flat-out part lands four blows at
3.2 to 5.1 m/s, against the grid's 5.1 to 5.9.

## The physique grid

The suite on every physique of `PHYSIQUE_GRID` by axes: the default, and each axis's two values
with the others at 1, nine a cell. Node, the core's world on Rapier (`rapier/adapter-9`),
symmetric actuation, development seeds 0 and 1, at 120 Hz and 480 Hz from the same source
(`a7832fb9`, content `0e8644ee`), 6336 jobs a rate:

```powershell
node research/control-foundation.mjs --suite competency --grid axes --workers 14
node research/control-foundation.mjs --suite competency --grid axes --hz 480 --workers 14
```

The rows of both runs, and their manifests without the job lists the rows repeat, are
`competencies-grid.json.gz`; `node research/competency-passes.mjs docs/reference/competencies-grid.json.gz`
prints the figures and the passes. Figures read "120 Hz | 480 Hz", a column a physique.

The default column is the [Baseline](#baseline)'s suite on a later tree: the club now stands
upright in the guard (`guardPosture`), so the club's cells differ from it (the Warrior with the
club rises from 6 of 8 at 120 Hz, against 5; the Rogue with the club kicks nothing at 480 Hz,
below), and the empty-handed cells read as they did.

**53 of 252 cells pass at both rates: the stand in all 36, and the guard in 17. Nothing else passes
on any physique.**

### Stand, by physique

The largest shove held from every direction, N s/kg:

| Cell | default | size=0.9 | size=1.18 | speed=0.85 | speed=1.15 | strength=0.8 | strength=1.25 | weight=0.85 | weight=1.25 |
|---|---|---|---|---|---|---|---|---|---|
| Warrior, empty | 0.6 \| 0.6 | 0.6 \| 0.6 | 0.8 \| 0.8 | 0.6 \| 0.6 | 0.6 \| 0.6 | 0.6 \| 0.6 | 0.6 \| 0.6 | 0.6 \| 0.6 | 0.6 \| 0.6 |
| Warrior, club | 0.6 \| 0.6 | 0.6 \| 0.6 | 0.8 \| 0.8 | 0.6 \| 0.6 | 0.6 \| 0.6 | 0.6 \| 0.6 | 0.6 \| 0.6 | 0.6 \| 0.6 | 0.6 \| 0.6 |
| Rogue, empty | 0.6 \| 0.6 | 0.6 \| 0.6 | 0.6 \| 0.6 | 0.6 \| 0.6 | 0.6 \| 0.6 | 0.6 \| 0.5 | 0.6 \| 0.6 | 0.6 \| 0.6 | 0.5 \| 0.5 |
| Rogue, club | 0.6 \| 0.6 | 0.6 \| 0.6 | 0.6 \| 0.6 | 0.6 \| 0.6 | 0.6 \| 0.6 | 0.5 \| 0.5 | 0.6 \| 0.6 | 0.6 \| 0.6 | 0.5 \| 0.5 |


### Guard, by physique

Predictive trials that succeed, of 6 (two a covering hand):

| Cell | default | size=0.9 | size=1.18 | speed=0.85 | speed=1.15 | strength=0.8 | strength=1.25 | weight=0.85 | weight=1.25 |
|---|---|---|---|---|---|---|---|---|---|
| Warrior, empty | 6/6 \| 6/6 | 5/6 \| 6/6 | 6/6 \| 6/6 | 5/6 \| 6/6 | 6/6 \| 6/6 | 6/6 \| 6/6 | 6/6 \| 6/6 | 6/6 \| 6/6 | 6/6 \| 6/6 |
| Warrior, club | 6/6 \| 4/6 | 4/6 \| 4/6 | 4/6 \| 4/6 | 6/6 \| 6/6 | 6/6 \| 6/6 | 6/6 \| 4/6 | 6/6 \| 4/6 | 6/6 \| 4/6 | 4/6 \| 4/6 |
| Rogue, empty | 6/6 \| 6/6 | 6/6 \| 5/6 | 6/6 \| 6/6 | 6/6 \| 6/6 | 6/6 \| 6/6 | 6/6 \| 6/6 | 6/6 \| 6/6 | 6/6 \| 5/6 | 6/6 \| 6/6 |
| Rogue, club | 2/6 \| 3/6 | 0/6 \| 0/6 | 6/6 \| 6/6 | 3/6 \| 4/6 | 2/6 \| 3/6 | 1/6 \| 3/6 | 3/6 \| 5/6 | 0/6 \| 4/6 | 3/6 \| 1/6 |


### Walk, by physique

The speed travelled, m/s:

| Cell | default | size=0.9 | size=1.18 | speed=0.85 | speed=1.15 | strength=0.8 | strength=1.25 | weight=0.85 | weight=1.25 |
|---|---|---|---|---|---|---|---|---|---|
| Warrior, empty | 0.40 \| 0.40 | 0.40 \| 0.39 | 0.41 \| 0.54 | 0.40 \| 0.39 | 0.40 \| 0.40 | 0.24 \| 0.39 | 0.40 \| 0.40 | 0.40 \| 0.39 | 0.40 \| 0.40 |
| Warrior, club | 0.39 \| 0.39 | 0.22 \| 0.38 | 0.40 \| 0.54 | 0.38 \| 0.39 | 0.39 \| 0.39 | 0.39 \| 0.39 | 0.39 \| 0.39 | 0.38 \| 0.39 | 0.40 \| 0.40 |
| Rogue, empty | 0.25 \| 0.39 | 0.24 \| 0.39 | 0.27 \| 0.38 | 0.25 \| 0.39 | 0.25 \| 0.39 | 0.25 \| 0.35 | 0.25 \| 0.41 | 0.25 \| 0.41 | 0.24 \| 0.36 |
| Rogue, club | 0.24 \| 0.39 | 0.23 \| 0.39 | 0.26 \| 0.38 | 0.23 \| 0.38 | 0.23 \| 0.39 | 0.23 \| 0.35 | 0.40 \| 0.41 | 0.40 \| 0.41 | 0.24 \| 0.36 |


### Rise, by physique

Falls risen and up at the end of the watch, of the falls:

| Cell | default | size=0.9 | size=1.18 | speed=0.85 | speed=1.15 | strength=0.8 | strength=1.25 | weight=0.85 | weight=1.25 |
|---|---|---|---|---|---|---|---|---|---|
| Warrior, empty | 4/8 \| 0/8 | 5/8 \| 0/8 | 1/7 \| 0/7 | 6/8 \| 0/8 | 7/8 \| 0/8 | 1/8 \| 0/8 | 3/8 \| 0/8 | 0/8 \| 0/8 | 0/8 \| 0/8 |
| Warrior, club | 6/8 \| 0/8 | 1/8 \| 0/8 | 2/7 \| 0/7 | 7/8 \| 0/8 | 7/8 \| 0/8 | 1/8 \| 0/8 | 0/8 \| 0/8 | 0/6 \| 0/8 | 0/8 \| 0/8 |
| Rogue, empty | 0/8 \| 0/8 | 0/8 \| 0/8 | 0/8 \| 0/8 | 2/8 \| 0/8 | 0/8 \| 0/8 | 0/8 \| 0/8 | 0/8 \| 0/8 | 0/8 \| 0/8 | 0/8 \| 0/8 |
| Rogue, club | 0/8 \| 0/8 | 0/8 \| 0/8 | 0/8 \| 0/8 | 0/8 \| 0/8 | 1/8 \| 0/8 | 0/8 \| 0/8 | 2/8 \| 0/8 | 0/8 \| 0/8 | 0/8 \| 0/8 |


### Punch, by physique

Blows landed at full reach, of those thrown, and their mean hand speed over the last 10 cm, m/s.
The club's punch is `unsupported`:

| Cell | default | size=0.9 | size=1.18 | speed=0.85 | speed=1.15 | strength=0.8 | strength=1.25 | weight=0.85 | weight=1.25 |
|---|---|---|---|---|---|---|---|---|---|
| Warrior, empty | 8/27 4.72 \| 26/27 4.78 | 7/24 4.39 \| 27/27 4.48 | 12/29 5.38 \| 22/23 5.03 | 2/27 4.35 \| 10/24 4.38 | 16/25 5.02 \| 24/26 5.06 | 4/27 4.56 \| 18/24 4.56 | 10/25 4.96 \| 27/27 5.02 | 10/24 4.95 \| 25/25 4.82 | 5/28 4.59 \| 21/25 4.55 |
| Warrior, club | n/a \| n/a | n/a \| n/a | n/a \| n/a | n/a \| n/a | n/a \| n/a | n/a \| n/a | n/a \| n/a | n/a \| n/a | n/a \| n/a |
| Rogue, empty | 8/25 3.25 \| 16/27 3.91 | 6/25 4.29 \| 22/24 3.94 | 0/30 – \| 1/28 4.68 | 12/25 4.21 \| 14/27 2.96 | 5/25 3.67 \| 19/27 4.02 | 7/27 4.02 \| 24/29 4.15 | 5/24 4.58 \| 22/27 4.25 | 6/25 4.80 \| 7/25 4.02 | 7/27 3.62 \| 9/28 3.09 |
| Rogue, club | n/a \| n/a | n/a \| n/a | n/a \| n/a | n/a \| n/a | n/a \| n/a | n/a \| n/a | n/a \| n/a | n/a \| n/a | n/a \| n/a |


### Kick, by physique

The foot's mean speed at contact, m/s; "–" where no blow landed:

| Cell | default | size=0.9 | size=1.18 | speed=0.85 | speed=1.15 | strength=0.8 | strength=1.25 | weight=0.85 | weight=1.25 |
|---|---|---|---|---|---|---|---|---|---|
| Warrior, empty | 1.19 \| 1.14 | 1.36 \| 1.27 | 1.10 \| 1.06 | 1.18 \| 1.13 | 1.21 \| 1.12 | 1.15 \| 1.16 | 1.24 \| 1.11 | 1.21 \| 1.13 | 1.17 \| 1.11 |
| Warrior, club | 1.21 \| 1.19 | 1.36 \| 1.29 | 1.10 \| 1.04 | 1.23 \| 1.18 | 1.21 \| 1.17 | 1.19 \| 1.21 | 1.18 \| 1.17 | 1.22 \| 1.19 | 1.19 \| 1.13 |
| Rogue, empty | 1.39 \| 1.37 | 1.41 \| 1.43 | 1.26 \| 1.26 | 1.45 \| 1.34 | 1.46 \| 1.34 | 1.31 \| 1.28 | 1.43 \| 1.40 | 1.34 \| 1.41 | 1.29 \| 1.14 |
| Rogue, club | 1.42 \| – | – \| 1.39 | 1.25 \| 1.27 | 1.38 \| 1.35 | 1.53 \| 1.35 | 1.43 \| 1.32 | 1.54 \| 1.54 | 1.39 \| 1.47 | 1.30 \| 1.07 |

### What the grid says

- **Only the stand holds on every physique.** Every cell holds 0.5 N s/kg every way at both
  rates; the larger Warrior (size x1.18) holds 0.8, and the Rogue at strength x0.8 or weight x1.25
  only 0.5.
- **The rise is the most brittle.** None rises at 480 Hz on any physique. At 120 Hz the Warrior's
  4 of 8 with nothing in its hands is 0 of 8 at weight x0.85 and at x1.25, 1 of 8 at strength
  x0.8, 1 of 7 at size x1.18, and 7 of 8 at speed x1.15: a script of timed poses works only near
  the body it was timed on.
- **The walk** reaches 0.54 m/s at best (the larger Warrior, at 480 Hz), 43 % of the threshold.
  At 120 Hz strength x0.8 takes the Warrior's empty-handed walk from 0.40 to 0.24 m/s, and size
  x0.9 its walk with the club from 0.39 to 0.22.
- **The punch's speed follows the speed axis less than in proportion**: the Warrior's 4.72 m/s at
  120 Hz is 4.35 at speed x0.85 and 5.02 at x1.15 (-8 % and +6 %), and 5.38 at size x1.18. At
  120 Hz it lands 2 of 27 at speed x0.85 and 16 of 25 at x1.15. The larger Rogue lands 0 of 30
  and 1 of 28.
- **The guard with the club** passes for the Warrior only at speed x0.85 and x1.15, and for the
  Rogue only at size x1.18; the smaller Rogue with the club covers none of 6 at either rate.
- **The club, held upright, sweeps through the other hand as the arms come up.** A body is built
  in its reference pose and its arms rise into the guard at the start. The club is one body with
  the right hand, and on the way it meets the left hand and forearm. On the Rogue at 120 Hz it
  grazes them with no impulse from 0.30 to 0.38 s, and the arms come free. At 480 Hz it pushes
  from 0.25 s and stays hooked on the left forearm. The body never settles; it steps at 2 s and
  goes down at 3.8 s, in the kick's setup. So every one of the Rogue's 8 club kick trials at
  480 Hz falls before a kick. The smaller Rogue (size x0.9) is struck on the left forearm at
  0.38 s at 120 Hz (1.7 N s) and falls the same way. The Warrior's club, at either rate, meets
  neither of its left arm's segments.
- **The upright guard stood the smaller Rogue with the club up.** Read on the same grid at
  `08045d38`, its club leaning back over its head, it held 0.2 | 0.0 N s/kg and walked
  0.00 | 0.00 m/s; it holds 0.6 | 0.6 and walks 0.23 | 0.39.
