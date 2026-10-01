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

All three are the owner's (`owner-balance` in `SOURCES`), proposed and not yet confirmed:

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
