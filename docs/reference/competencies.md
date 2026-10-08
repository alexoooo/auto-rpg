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
| punch | `punchStand` (`research/punch-calibration.mjs`), the path fighter's planted cross | 8 s of crosses with each hand at a compliant pad: at the cell's place (0.1 m to the hand's side, 1.55 m up, 0.55 m ahead), at full reach (`fullReach`), and 1 m aside as a miss; the seed moves the target up to 2 cm | share of blows landed; hand speed over the last 10 cm; first contact after the order; upright and returned | impulse, effective mass, peak force, the chamber-to-contact time |
| walk | `walk`, `turn` (`research/core-stance-trials.mjs`), in the guard | 8 s at 0.3 to 1.4 m/s at 4 headings, then a stop; a half turn at 2 rad/s walking at 0.3 m/s, each way | the speed travelled (below); both turns upright | the fastest asked speed held upright at every heading, as at every slower one (the stance envelope's rule); falls |
| rise | `felled` (`research/core-rise-trials.mjs`) under the staged rise | shoved down at 1.5 N s/kg from 4 directions; watched 40 s | share of falls risen and up at the end; median time from the fall to standing 2 s | the slowest rise |
| kick | `frontKickStand` (`research/front-kicks.mjs`), the path fighter's front kick | 24 s of kicks with each foot at a pad 0.45 m up and ahead, and 1 m aside as a miss | share of blows landed; foot speed at contact; upright and returned | impulse, first contact after the order |
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
Physique cells join with the physiques.

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
