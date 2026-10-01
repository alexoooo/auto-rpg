# The assist

The measurements behind the assist (`src/core/control/assist.ts`): a force and a moment on a
body's root that no muscle gives, within a ceiling, metered; and behind the attribute that sets
the ceiling, a character's balance.

## Balance

A character's **balance** is a number of points in its spec (`AttributeSpec.balance`,
`src/core/spec/body.ts`), beside its hit points. The rulebook says what a point is worth
(`Rulebook.balance`, `src/core/rules/rulebook.ts`): the most the assist gives the body, as a force
in the body's own weights and a moment in its weights times a metre, so the same points are the
same help to a light body and a heavy one. A fight gives each body the ceiling its points buy
(`balanceCeiling`) and withdraws the assist when the body is out of the fight. At 0 points the
assist is absent, and a bout is step for step the bout without it.

All three are the owner's (`owner-balance` in `SOURCES`). The owner confirmed the name; each
character's points and a point's worth are proposed and not yet confirmed. What each buys in
bouts is in "What balance does to a bout" below:

| What | Value | Where |
|---|---|---|
| The attribute's name | balance | `AttributeSpec.balance` |
| The Warrior's points | 0 | `workshopBalance` (`src/core/human/attributes.ts`) |
| The Rogue's points | 0 | `workshopBalance` |
| The skeleton's points | 0 | its figure (`src/core/human/skeleton.ts`), a placeholder as the rest of it is |
| A point's force | 0.05 of the body's weight | `RULES.balance.force` |
| A point's moment | 0.013 of the body's weight times a metre | `RULES.balance.moment` |

A point's worth puts 5 points at a quarter of a weight and, for the Warrior's 775 N, 50 N m: the
ceiling the pull below was first held at. A bout takes a balance for each side in place of its
character's (`DuelRecipe.balance`; in a link, `&balance=left,right`, or one number for both), and
a worth of a point in place of the rulebook's (`DuelRecipe.balancePoint`).

## What the soles miss

Each step a stance works out the wrench the ground must give for the accelerations it asks and
shares it among the bearing soles as far as soles can give it (`limitToSoles`,
`src/core/control/stance-dynamics.ts`). What they cannot give is `StanceReading.shortfall`, and it
is what the stance asks its assist for.

Harness: Node, the core world (`src/core/world.ts`), Rapier, 120 Hz; the nine matchups at 4 m,
each bout to its verdict, every character's balance 0. A row is one side of one bout: the bout's
mean of the missed force, in the body's weights, and of the missed moment; the share of its steps
in which either is over 0.05 weights or 5 N m; and the mean of each over the bout's last second.
Steps after the verdict are not read: past a fall the stance's ask has no bound.

```powershell
node research/assist-need.mjs --workers 14
```

| Left | Right | Gap, m | Ending | Seconds | Side | Fell | Mean force, weights | Mean moment, N m | Steps over, % | Last second: force, weights | Last second: moment, N m |
|---|---|---|---|---|---|---|---|---|---|---|---|
| workshop-fighter | workshop-fighter | 4 | severed | 20.07 | left |  | 0.026 | 22.2 | 37 | 0.001 | 1.5 |
| workshop-fighter | workshop-fighter | 4 | severed | 20.07 | right |  | 0.049 | 39.3 | 41 | 0.016 | 13.5 |
| workshop-fighter | workshop-rogue | 4 | fallen | 21.23 | left |  | 0.057 | 45.5 | 48 | 0.000 | 0.0 |
| workshop-fighter | workshop-rogue | 4 | fallen | 21.23 | right | yes | 0.044 | 22.8 | 33 | 0.651 | 304.0 |
| workshop-fighter | crypt-skeleton | 4 | severed | 10.22 | left |  | 0.015 | 13.6 | 39 | 0.020 | 16.8 |
| workshop-fighter | crypt-skeleton | 4 | severed | 10.22 | right |  | 0.012 | 10.8 | 37 | 0.028 | 21.8 |
| workshop-rogue | workshop-fighter | 4 | fallen | 13.04 | left | yes | 0.097 | 50.9 | 50 | 0.661 | 317.0 |
| workshop-rogue | workshop-fighter | 4 | fallen | 13.04 | right |  | 0.037 | 33.0 | 47 | 0.022 | 20.1 |
| workshop-rogue | workshop-rogue | 4 | fallen | 19.99 | left | yes | 0.059 | 28.3 | 38 | 0.694 | 285.7 |
| workshop-rogue | workshop-rogue | 4 | fallen | 19.99 | right |  | 0.017 | 9.1 | 28 | 0.026 | 15.2 |
| workshop-rogue | crypt-skeleton | 4 | fallen | 16.67 | left | yes | 0.050 | 25.8 | 35 | 0.668 | 314.9 |
| workshop-rogue | crypt-skeleton | 4 | fallen | 16.67 | right |  | 0.015 | 12.9 | 35 | 0.000 | 0.0 |
| crypt-skeleton | workshop-fighter | 4 | fallen | 11.73 | left | yes | 0.082 | 53.5 | 45 | 0.640 | 378.7 |
| crypt-skeleton | workshop-fighter | 4 | fallen | 11.73 | right |  | 0.034 | 31.0 | 49 | 0.131 | 99.5 |
| crypt-skeleton | workshop-rogue | 4 | fallen | 12.28 | left |  | 0.057 | 39.9 | 43 | 0.520 | 332.5 |
| crypt-skeleton | workshop-rogue | 4 | fallen | 12.28 | right | yes | 0.090 | 44.6 | 41 | 0.903 | 424.8 |
| crypt-skeleton | crypt-skeleton | 4 | fallen | 16.23 | left |  | 0.012 | 10.3 | 37 | 0.012 | 10.8 |
| crypt-skeleton | crypt-skeleton | 4 | fallen | 16.23 | right | yes | 0.049 | 32.2 | 42 | 0.607 | 359.9 |

Over a whole bout a stance misses 0.012 to 0.097 of its body's weight and 9.1 to 53.5 N m on
average, and asks more than the soles give in 28 to 50 % of its steps. In its last second a body
that falls misses 0.607 to 0.903 weights and 285.7 to 424.8 N m. The eleven sides that did not
fall miss 0.000 to 0.131 weights and 0.0 to 99.5 N m, but for one: the skeleton that beat the
Rogue missed 0.520 weights and 332.5 N m, and was itself going down (it fell at 12.55 s, 0.27 s
after the Rogue's fall ended the bout). One bout a matchup places none of these as a rate.

## A pull the soles cannot hold

Harness: Node stand (`tests/harness/core-stand.mjs`), Rapier, 120 Hz; the Warrior alone on a
ground, unarmed, under the command layers with an order to stand. One second to settle; then for
2 s a steady tenth of its weight forward at its root's centre of mass, an impulse before each
step; then 2 s more. The readings are over those 4 s. The fixture is `pulled` in
`tests/core-assist.test.mjs`, whose test holds the first row and the three 5-point rows.

| Balance, points | Force ceiling, weights | Moment ceiling, weight-metres | Fell | Centre of mass at its lowest, m | Centre of mass travelled, m | Recovery steps | Most the soles missed while it stood, weights | Mean given, N | Mean given, N m |
|---|---|---|---|---|---|---|---|---|---|
| 0 | 0 | 0 | yes | 0.18 | 1.46 | 11 | 0.710 | 0.0 | 0.0 |
| 0.02 | 0.001 | 0.00026 | yes | 0.19 | 1.67 | 11 | 0.836 | 0.6 | 0.2 |
| 0.05 | 0.0025 | 0.00065 | yes | 0.20 | 2.11 | 11 | 0.622 | 1.4 | 0.4 |
| 0.1 | 0.005 | 0.0013 | no | 0.93 | 0.86 | 7 | 0.281 | 2.2 | 0.6 |
| 0.2 | 0.01 | 0.0026 | no | 0.95 | 0.25 | 3 | 0.309 | 3.2 | 0.8 |
| 0.5 | 0.025 | 0.0065 | no | 0.98 | 0.05 | 0 | 0.012 | 2.2 | 1.7 |
| 1 | 0.05 | 0.013 | no | 0.98 | 0.05 | 0 | 0.010 | 2.0 | 1.9 |
| 5 | 0.25 | 0.065 | no | 0.98 | 0.05 | 0 | 0.010 | 2.0 | 1.9 |
| 5, the force alone | 0.25 | 0 | no | 0.98 | 0.05 | 0 | 0.020 | 4.1 | 0.0 |
| 5, the moment alone | 0 | 0.065 | no | 0.98 | 0.06 | 0 | 0.025 | 0.0 | 5.7 |

With none the body is pulled off its soles, steps eleven times and falls. Half a point holds it
where it stands with no step, on a mean of about 2 N and 2 N m: a quarter of a hundredth of its
weight. What is given early is what keeps the shortfall from growing, so the mean stays far under
the ceiling once the ceiling is enough; either part alone holds this pull at 5 points, on about
twice the mean. A part alone holds only because the legs are asked for the ground's wrench less
what the assist gives (`bear`, `src/core/control/stance.ts`): asked for all of it, the body
under the moment alone travels 0.42 m and takes five recovery steps. This is one body and one
pull, and says nothing of a rate in a fight.

## What balance does to a bout

Harness: Node, the core world (`src/core/world.ts`), Rapier, 120 Hz; the nine matchups at eleven
starting gaps from 3 to 5 m, each bout to its verdict or the 120 s cap, in a world of its own.
1485 bouts. A cell of the first two tables is 99 bouts, and of the third 198.

```powershell
node research/assist-sweep.mjs --workers 14
```

**Even**: both sides at the same balance, at the rulebook's worth of a point. Falls and wounding
blows are for each minute of the cell's bout time; the mean given is a side's, over its steps
until the verdict.

| Balance, points | Bouts | End by a fall | By a wound | At the cap | Bout time, s | Falls a minute | Wounding blows a minute | At the cap, % | Mean given a side, N | Mean given, N m |
|---|---|---|---|---|---|---|---|---|---|---|
| 0 | 99 | 80 | 19 | 0 | 1392 | 3.45 | 9.05 | 0 | 0.0 | 0.0 |
| 2 | 99 | 53 | 42 | 4 | 3028 | 1.05 | 18.68 | 4 | 8.2 | 4.5 |
| 5 | 99 | 19 | 56 | 24 | 5453 | 0.21 | 18.23 | 24 | 9.3 | 6.7 |
| 10 | 99 | 11 | 58 | 30 | 5905 | 0.11 | 18.74 | 30 | 10.4 | 9.0 |
| 20 | 99 | 11 | 58 | 30 | 5705 | 0.12 | 16.78 | 30 | 9.1 | 9.1 |
| 40 | 99 | 11 | 55 | 33 | 6180 | 0.11 | 17.35 | 33 | 8.9 | 9.3 |

By model: a model's sides are every side it fought on, and its bout time those bouts' (a mirror
counts twice).

| Balance, points | Model | Sides | Its bout time, s | Its falls | Its falls a minute | Mean given, N | Mean given, N m |
|---|---|---|---|---|---|---|---|
| 0 | workshop-fighter | 66 | 746 | 17 | 1.37 | 0.0 | 0.0 |
| 0 | workshop-rogue | 66 | 921 | 29 | 1.89 | 0.0 | 0.0 |
| 0 | crypt-skeleton | 66 | 1118 | 34 | 1.83 | 0.0 | 0.0 |
| 2 | workshop-fighter | 66 | 1257 | 5 | 0.24 | 10.7 | 5.9 |
| 2 | workshop-rogue | 66 | 2379 | 23 | 0.58 | 5.9 | 3.3 |
| 2 | crypt-skeleton | 66 | 2421 | 25 | 0.62 | 7.9 | 4.2 |
| 5 | workshop-fighter | 66 | 1935 | 0 | 0.00 | 11.1 | 9.2 |
| 5 | workshop-rogue | 66 | 4249 | 9 | 0.13 | 6.4 | 4.5 |
| 5 | crypt-skeleton | 66 | 4721 | 10 | 0.13 | 10.4 | 6.4 |
| 10 | workshop-fighter | 66 | 1619 | 0 | 0.00 | 11.2 | 11.3 |
| 10 | workshop-rogue | 66 | 4853 | 4 | 0.05 | 6.4 | 5.8 |
| 10 | crypt-skeleton | 66 | 5339 | 7 | 0.08 | 13.7 | 9.9 |
| 20 | workshop-fighter | 66 | 1424 | 0 | 0.00 | 10.6 | 12.2 |
| 20 | workshop-rogue | 66 | 4945 | 5 | 0.06 | 6.2 | 6.2 |
| 20 | crypt-skeleton | 66 | 5040 | 6 | 0.07 | 10.6 | 8.8 |
| 40 | workshop-fighter | 66 | 1911 | 1 | 0.03 | 11.4 | 13.3 |
| 40 | workshop-rogue | 66 | 4985 | 7 | 0.08 | 7.3 | 7.2 |
| 40 | crypt-skeleton | 66 | 5463 | 3 | 0.03 | 8.1 | 7.4 |

**Shapes**: both sides at 20 points, at another worth of a point.

| Balance, points | A point's force, weights | A point's moment, weight-metres | Bouts | End by a fall | By a wound | At the cap | Bout time, s | Falls a minute | Wounding blows a minute | At the cap, % | Mean given a side, N | Mean given, N m |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 20 | 0.05 | 0.026 | 99 | 12 | 55 | 32 | 6094 | 0.12 | 16.59 | 32 | 8.9 | 9.3 |
| 20 | 0 | 0.013 | 99 | 28 | 53 | 18 | 4989 | 0.34 | 19.07 | 18 | 0.0 | 12.8 |
| 20 | 0.05 | 0 | 99 | 44 | 27 | 28 | 5127 | 0.51 | 14.16 | 28 | 16.2 | 0.0 |

**Uneven**: one side at the greater balance and the other at the lesser, each matchup both ways
round. Every bout was decided: at the cap the fuller bar wins.

| More, points | Less, points | Bouts | Decided | Won by the side with more | Its share of the decided, % | Falls a minute: the side with more | The side with less | At the cap | Mean given the side with more, N | N m | The side with less, N | N m |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 5 | 0 | 198 | 198 | 165 | 83 | 0.05 | 2.57 | 0 | 8.6 | 7.2 | 0.0 | 0.0 |
| 5 | 2 | 198 | 198 | 122 | 62 | 0.14 | 0.40 | 24 | 8.7 | 6.5 | 7.7 | 4.1 |
| 10 | 5 | 198 | 198 | 101 | 51 | 0.06 | 0.10 | 58 | 11.0 | 9.3 | 9.1 | 6.5 |

What the tables carry, and what they do not:

- **Balance takes the falls out of a bout.** With none, 80 of 99 bouts end by a fall, at 3.45
  falls a minute; at 2 points 53, at 1.05; at 5 points 19, at 0.21. The wounding blows a minute
  double, since a bout that no fall ends goes on to be decided by its blows.
- **The attribute is spent by about 5 points, at this worth of a point.** From 10 points on the
  rows are one row (11 bouts ending by a fall in each), and the mean given stays near 9 N and
  9 N m however high the ceiling: the stance asks for no more. Nothing between 10 and 40 points is
  read from 99 bouts.
- **Bouts get long.** The mean bout is 14 s with no balance, 31 s at 2 points and 55 s at 5, and
  from 5 points on a quarter to a third of the bouts reach the 120 s cap.
- **The models differ.** At 5 points and above the Warrior fell once in 264 sides; the Rogue and
  the skeleton still fall, at 0.03 to 0.13 falls a minute.
- **Both parts of a point do work.** At 20 points the moment alone leaves 0.34 falls a minute and
  the force alone 0.51, against 0.12 for both; twice the moment beside the force changes nothing
  (0.12).
- **A difference in points buys bouts only where the lesser side still falls.** 5 points against
  none wins 83 % of bouts, 5 against 2 wins 62 %, and 10 against 5 wins 51 %, which is no
  difference: a share over 198 bouts is read to about 7 points either way.

On the page (Rapier, 120 Hz, the tab hidden and the world stepped by hand; one bout each, a count
and not a rate): Warrior against Warrior at `&balance=5` showed "balance 5 / 5" beside the clock,
each side's ceiling 196.5 N and 51.1 N m, and ended at 19.9 s by a fatal wound after 17 wounding
blows and no fall, on means of 8.7 and 12.6 N and 8.1 and 9.7 N m; with no balance it showed no
readout and ended by a fall at 28.5 s after 6 wounding blows.

## A force through the step, not an impulse before it

The assist is given through the engine's one-step force (`SegmentBody.applyForce` and
`applyTorque`, `src/core/engine/engine.ts`), which the solver integrates as it does gravity. An
impulse of the same force times the step, given before the step, is the same momentum and not
the same motion: the solver takes its 16 iterations as sub-steps, the impulse is whole at the
first and gravity arrives a sixteenth at each, so a body given exactly its weight creeps up.

Harness: Node, a bare core world (gravity, no ground), Rapier, 120 Hz; the Warrior limp, its
assist asked every step for two weights straight up under a ceiling of one; 60 steps. The fixture
is `lifted` in `tests/core-assist.test.mjs`.

| How the weight of force is given | Centre of mass moved in 60 steps, m | A step, m |
|---|---|---|
| An impulse before each step | 0.019153 | 0.000319 (gravity times the step squared, times 15/32) |
| A force through each step | 0.00000026 | |
| None given | 1.227 down (half of gravity over 0.5 s squared is 1.226) | |

## Inside the stance's solve, not beside it

The assist supplies what the stance's own solve finds its soles cannot give ("What the soles
miss"). A torque and a lift put on the root from outside that solve were measured first, and do
not hold a body up.

Harness: Node, the core world, Rapier, 120 Hz, at `144961d4`; the nine matchups at 4 m, each bout
to its verdict, so a count of nine and not a rate. On each body's root, a hook outside the core
that the tree does not keep: a torque toward upright about the level axes (300 N m/rad,
15 N m s/rad, clipped at a ceiling), and a lift at the root's centre toward its built height
(clipped at a share of the body's weight). The record is
`docs/plans/2026-09-30-minds-00-design.md@ecda48dc`.

| Torque ceiling, N m | Lift ceiling, weights | End by a fall, of 9 | Mean torque given, N m |
|---|---|---|---|
| 0 | 0 | 8 | 0 |
| 25 | 0 | 7 | 5.6 |
| 50 | 0 | 7 | 6.6 |
| 100 | 0 | 7 | 11.7 |
| 200 | 0 | 6 | 14.3 |
| 50 | 0.25 | 8 | 9.3 |
| 100 | 0.25 | 8 | 21.8 |
| 200 | 0.5 | 8 | 41.9 |
| 0 | 1 | 8 | 0 |
| 200 | 1 | 7 | 31.2 |
| 400 | 2 | 7 | 33.7 |

Nine bouts cannot tell 6 from 8, and the torque was at its ceiling in under a tenth of the steps:
righting the root is not what these bodies lack. With the gain scaled to the ceiling instead (the
ceiling over 0.15 rad, damped over 0.1 s) the torque sat at its ceiling in 78 to 98 % of steps
from 50 N m up, and at 200 and 400 N m every bout ended by a fall, in 3.1 and 1.1 s on average: an
explicit torque on one light segment at 120 Hz goes unstable. So the assist is solved with the
body, as every other torque here is, and what it gives is the wrench the soles miss.
