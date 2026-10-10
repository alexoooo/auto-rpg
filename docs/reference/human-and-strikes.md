# The human and its strikes: tuning records

What the tuned constants of the skills and the tactics rest on: how long a body stands before it
throws (`STAND`) and how it comes to a recipe's place (`APPROACH`), both in
`src/core/skills/strike.ts`; how its feet are placed (`PLACING`, `src/core/skills/locomotion.ts`)
and how fast a walk turns (the stance's envelope); the guard (`GUARD`, `src/core/skills/guard.ts`);
how near a fighter attacks (`ATTACK_METRES`, `src/core/mind/recipe-tactics.ts`); what shapes an
arm's path to a place (`IK_POSTURE_PULL`, `IK_TURN`, `src/core/control/kinematics.ts`); and
where about its place a recipe is thrown (`StrikeWindow`, `src/core/skills/strikes.ts`). Each
constant's comment cites its section below. A value said to be set was chosen and not swept: no
table read on the engine the game runs on stands behind the choice.

## Stand time

Each human stood still in the guard where it was built, 3 cm under its reference height, and the
speed of its centre of mass was read at each time stood, mm/s, at three physics rates (Node core
stand, Rapier). The readings converge with the rate:

    seconds                0.5   1    1.5   2
    Warrior 120 Hz          66   21    6    2
            480 Hz          67   22    6    2
            1920 Hz         66   23    6    2
    Rogue   120 Hz          52   15    4    1
            480 Hz          53   16    4    1
            1920 Hz         52   17    5    1

Command: `node research/core-stance-sweep.mjs --batteries stand --hz 120`, and with `--hz 480` and
`--hz 1920`; the reading is the `settle` of each line. The controller read is `e4ec0709`'s.

`STAND` is 1.5 s. Set: it was chosen as the first time at which each human was at 5 mm/s or less
in the same table read on an engine that is gone (`research/core-blow.mjs@5e652760`), where the
Warrior read 5 mm/s at 1.5 s; here it reads 6. Every recipe was searched from a body that had stood
1.5 s, so a change to it voids the recipes.

A step into a staggered stance converges with the rate. Each body stood 1.5 s in the guard,
square as built, then stepped its right sole's middle to 30 cm right of the left's and 15 cm behind
it over 0.3 s, lifted 5 cm, its weight shifted off the foot first, as `Locomotion.place` steps.
Read: how far the bearing foot slid, cm, in the step and to 2 s after it; the centre of mass's top
speed, m/s; and where the right sole landed against its goal, cm (Node core stand, Rapier):

                            slid   top speed   landed off
    Warrior   120 Hz        0.1      0.25         2.3
              480 Hz        0.0      0.25         2.3
              1920 Hz       0.0      0.24         2.4
    Rogue     120 Hz        0.1      0.25         2.3
              480 Hz        0.0      0.25         1.5
              1920 Hz       0.0      0.24         1.6
    skeleton  120 Hz        0.2      0.20         2.2
              480 Hz        0.2      0.19         1.3
              1920 Hz       0.0      0.19         1.3

Each stayed up, and the stance took no step of its own to catch it. Command:
`node research/stance-stagger.mjs`. Strikes are still thrown from the square stance the body was
built in: every recipe was searched from it.

## Approach

A walk alone does not stand a body where it stops. A walk's feet are the gait's 20 cm apart;
stopped, the stance steps one foot out to the 39 cm the body was built standing at, which moves
the feet's middle, and the body settling over it, some 10 cm to one side. A slow walk asked for a
few centimetres leans the body without stepping, and the lean comes back. Stopped by its head, the
Warrior settled out of the recipe's window each time and walked again, round and round the post
(the lab's Routine, Node core stand, Rapier, 120 Hz).

With the feet set at the place (`Locomotion.place`), each of the 360 strikes each human threw in
the Routine stood inside its window, at 120 and 480 Hz (`research/core-routine-battery.mjs`, Node
core stand, Rapier).

Command: `node research/core-routine-battery.mjs --seeds 6 --loops 10`, and with `--hz 480`: three
strikes a loop, 180 a human at each rate. Read at `8ee70e1e`; at `e4ec0709` each human throws the
same 180 at each rate and none falls. The walk stopped by its head was that commit's work before
the feet were set, and was not committed.

`APPROACH` is `{ pace: 0.3, seconds: 1, reach: 0.25 }`. `APPROACH.pace`, m/s, is the Routine's
pace through its turns, which each human held. `APPROACH.seconds` and `APPROACH.reach` are set:
the walk asked is the distance left over one second, and the feet are set once the centre of
mass is within 0.25 m of the place. The tactics hold an attack's point until the point ordered
has moved by the same reach (`recipeTactics`, `src/core/mind/recipe-tactics.ts`).

## Placing

`PLACING.near` is 0.02 m: a foot further than that from its place steps there
(`Locomotion.place`). Set. A recipe is kept only if its window is twice that wide or more along
the heading and across it ([Windows](#a-recipe-the-feet-cannot-be-set-to)). Where a placed foot
lands beside its place has not been measured; the Routine's strikes above stood inside their
windows with it.

## Turning

A walk's heading turns from the step the walk sets off, no faster than the stance's envelope turns
at the pace (`turnAt`, `assets/core/stance-envelope.json`). The envelope is measured on each body
as a fight plays it: built in the guard and holding it, under its character's balance, with a club in its right hand
and empty-handed; and its turns are begun at every eighth of a second from the walk's setting off
to 1.5 s, and under way (`research/core-stance-envelope.mjs`, Node core stand, Rapier, 120 Hz).
Measured unarmed, out of the guard, with no assist and on a walk already under way, it let the
Warrior walk 0.7 m/s and turn 2 rad/s there; a heading turned that fast from standing runs the
walk away sideways until the body falls, which a straight walk of a set lead before the turn hid
in some phases of the first strides and not in others.

| Body | Fastest walk, unarmed | as played | Turn at each speed to it, rad/s, unarmed | as played |
|---|---|---|---|---|
| Warrior | 0.7 | 0.5 | 4, 4, 4, 2, 2 | 4, 4, 4, 2 |
| Rogue | 0.5 | 0.4 | 4, 4, 4, 2 | 4, 1, 2 |
| skeleton | 0.2 | 0.4 | 2 | 4, 4, 1 |

The skeleton walks faster as played than on its muscles alone: its balance holds it at 0.3 and
0.4 m/s, where unarmed and unassisted it fell three ways of five. A turn as played is the fastest rate at
which no turn of the 56 fell (`turnHeld`): the Warrior's at 0.5 m/s, the Rogue's at 0.3 m/s and the
skeleton's at 0.4 m/s each lost one turn of 56 at the next rate up, and the Rogue's at 0.4 m/s three.

The game with no lead, against the envelope measured unarmed with a lead of 1 s:

| Harness | Read | Unarmed, a lead of 1 s | As played, no lead |
|---|---|---|---|
| A Warrior with a club or empty-handed, its fighter mind and balance, alone on a ground, ordered from standing or after walking 1 or 3 s to walk 0.5 to 3.14 rad off its heading, both ways, from three stand times: 126 a hand (Node core world, Rapier, 120 Hz) | falls, club and empty | 10 and 33 | 0 and 0 |
| `node research/strike-bouts.mjs --gaps 2.5,3,3.5,4,4.5,5,5.5 --held club,empty`: 126 arena bouts (Node core world, Rapier, 120 Hz, each side's balance its character's) | bouts with a side down inside 5 s; with one down at all | 24; 89 | 0; 82 |
| The crypt's hero alone against an enemy (`tests/crypt-core.test.mjs`' layout), seeds 1 to 24, 3, 3.75 and 4.5 m apart, 30 s (DungeonRun, Node, Rapier, 120 Hz) | the hero down with no blow on it inside 5 s; at all | 11; 28 of 72 | 2; 14 of 72 |
| The crypt, the hero and two Warriors, seeds 1 to 24, 150 s (DungeonRun, Node, Rapier, 120 Hz) | a body down with no blow on it within 1 s; of them, while its heading swept 1.5 rad in 3 s | 39 in 2622 s; 9 | 21 in 3215 s; 0 |

A placebo of the unarmed envelope, every turn 0.999 of its rate, read 80 arena bouts with a side
down and, in the crypt, 28 walking falls in 2833 s, 5 of them turning: a small change moves
those counts by about as much again, and the turns' share, and the falls inside 5 s, by less.
The two early falls left in the crypt's layout are the hero turned half round from standing at
2 rad/s, whose walk gathers speed past 1 m/s once the turn is done (seeds 3 and 11, 3 and 3.75
m); turned at 1 rad/s it keeps its feet there, and the stance battery's turn, the same half turn
at the same pace from the same start, keeps them at 2. The enemy does the same: on seed 1, where
the hero stands 2.75 rad from the skeleton's heading, the skeleton walks off sideways as it turns,
gathers speed to 1.6 m/s and is down with no blow on it at 2.6 to 2.7 s, at 3.5, 4 and 4.25 m of
the five gaps from 3.5 to 4.5 m; it does not with a lead of 1 s, nor on any other seed of 1 to 8.

The game sets a walk off on the body's first step after it is built, while it still settles; the
battery stands it first. The pelvis, turned toward the heading critically damped and not told the
turn's rate, lags a 2 rad/s turn by 0.6 rad; in each swing the one bearing sole cannot give the
yaw moment the swing leg's turn takes, and from the build the lag grows to 1.5 to 1.6 rad, past
the hips' rotation stops. The steps then land 12 to 16 cm short of where the capture point needs
them, the capture point leaves the support sideways, and the walk runs off at 1.1 to 1.6 m/s
(the battery's turn begun from the build, Node core stand, Rapier, 120 Hz).

A heading held to lead the pelvis by no more than the lesser of the hips' rotation stops (0.65
rad for the Warrior and the skeleton, 0.71 for the Rogue) keeps the battery's half turns from the
build: falls of 200 a body, Warrior, Rogue and skeleton, 0, 4 and 2 become 0, 0 and 0 at 2 rad/s,
and 53, 82 and 59 become 4, 2 and 0 at 4 rad/s. Measured against the pelvis's facing step by step,
which a swing whips a radian either way, the bound holds the heading still while the body walks
to its next place, and the crypt's skeleton goes down with no blow on it on 19 to 21 layouts of
72 where it goes down on 10, and on 9 under a placebo; the bound is not in the game.

What is in the game bounds the step instead (`landingHeading`, `src/core/control/support.ts`): a
foot lands facing the heading only as far as the bearing foot's hip lets the pelvis turn over it,
its step placed across that facing, and a turn past it is taken step by step. In the envelope's
battery, falls of the 56 at each body's top rates, 70 in all across the three bodies, become 10;
the Warrior's half turn begun from the build at 0.5 m/s and 4 rad/s, which fell, turns in about five steps and stands.
Placed across the heading instead, with only the foot turned, 41 of the 392 turns of the seven cells
that fall most fell where 10 do; with the walk's sway across the heading and its clearance across
the foot, 26. The turns that still fall do so as the Rogue's at 0.3 m/s and 2 rad/s does: after
the half turn the walk's plan runs to 0.58 m/s where 0.3 is asked, then about 1 m/s sideways, the
soles fall about 100 N short, and the pelvis twists (Node core stand, Rapier, 120 Hz).

## Guard

`GUARD` is the arms' posture when no skill owns them: each shoulder flexed 0.5 rad and drawn in
0.2, each elbow flexed 1.3. Set. Every recipe of `REPERTOIRE` (`assets/core/strikes.json`) was
searched thrown from a body standing in it (`research/core-strike-search.mjs`: the straights from
the guard itself, the club blow chambered from it), and `STAND` was measured standing in it, so a
change to the guard voids the recipes and the stand time. The skeleton's reference pose presses
the guard's elbows into their stops.

A body that holds an item holds `guardPosture`: `GUARD`, with the holding wrist alone solved
(`solveReach`) so the item stands as near upright as the wrist's range allows, the arm as `GUARD`
holds it within its ranges. The Warrior's and the Rogue's wrists stand the club within 1° of
upright, each freedom off its stops, the grip 3 to 5 cm from where `GUARD` puts it; the skeleton's
stops at its range, 35° short of upright and clear of its head. Solving the whole arm instead
for an upright club with its grip held in place put the humans' wrists at their ulnar stops and
has no answer for the skeleton, whose `GUARD` lies beyond its elbow's range. Held as `GUARD`
holds it, the club leaned back over the head and the head bore it: 17 N s over 2 s standing on the
Warrior, and on the Rogue at size x0.9 it fell across the other arm, which a shove of 0.2 N s/kg
then felled (Node core stand, Rapier, 120 and 480 Hz). A recipe is open loop, and a chamber
reached from another guard is not reached the same way in its time, so the club's recipes and
its best blow were searched again from `guardPosture` ([blows.md](blows.md#searched-from-the-upright-guard)).

## Attack distance

`ATTACK_METRES` is 1.8 m, between the two centres of mass across the ground: nearer than that, a
fighter attacks its foe; further, it walks at it. Set. The Warrior's club blows are thrown with
their target 0.93 m (a head) and 1.12 m (a trunk) ahead of its own head (`Recipe.place`,
`assets/core/strikes.json`), and the strike skill closes what is left itself (`APPROACH`), so
1.8 m is a blow's distance and about a step.

## The edge

`EDGE` is a band of 0.25 m and a patience of 4 s: a fighter that holds at the edge of its foe's
reach (`FighterMindConfig.range`, `"edge"`, `src/core/mind/config.ts@352fbe24`) stands no more than 0.25 m beyond where the foe's blow
at its head would reach it, and after standing still 4 s walks in to attack all the same. The
band is set, not swept: it is the strike skill's own slack about a blow's place
(`APPROACH.reach`), so a foe that comes on by that much brings itself into the window. The
patience is more than twice `STAND`, so a fighter is not drawn in by a foe that stands only to
settle a throw.

A fighter does not gain by holding at the edge, so `"close"` is every fighter's range.
`node research/core-range.mjs --bouts 48 --patience 2,4,8` plays each pair of bodies, club and
empty-handed, at 48 starting gaps from 3 to 5 m, each side holding at the edge in turn against
one that walks in, paired with the bout where both walk in: 6048 bouts (Node core world, Rapier,
120 Hz, each side's balance its character's). The side at the edge, pooled over every pair and
both sides:

| Held | Patience, s | Margin gained (its bar less its foe's) | d | Won, close / edge | Fell, close / edge | Foe's HP lost, close / edge |
|---|---|---|---|---|---|---|
| club | 2 | -0.019 | -0.12 | 0.50 / 0.44 | 0.29 / 0.35 | 0.400 / 0.274 |
| club | 4 | -0.025 | -0.15 | 0.50 / 0.45 | 0.29 / 0.34 | 0.400 / 0.267 |
| club | 8 | -0.026 | -0.16 | 0.50 / 0.44 | 0.29 / 0.34 | 0.400 / 0.264 |
| empty | 2 | -0.002 | -0.03 | 0.50 / 0.52 | 0.30 / 0.23 | 0.475 / 0.500 |
| empty | 4 | -0.001 | -0.01 | 0.50 / 0.52 | 0.30 / 0.22 | 0.475 / 0.504 |
| empty | 8 | -0.000 | -0.01 | 0.50 / 0.52 | 0.30 / 0.22 | 0.475 / 0.502 |

Of the 108 cells (what is held, the pair, the side at the edge, its patience), the edge gains
margin at d over 0.2 in 26 and loses it at d under -0.2 in 30. With a club, a fighter at the
edge takes off its foe about a third less; empty-handed it falls less and does as much, and
gains nothing in margin.

The clinch is 0.65 m: a fighter at the edge backs out, facing its foe, from a blow walking in or
settling while their centres of mass are within it across the ground (`seekFoe`). Read on the
Puncher with the straight punch against Classic, Behaviours, Combat, Brawler, Kicker and
Scrapper, empty-handed, 40 s bouts at ten gaps from 1.2 to 3.9 m and both sides (Node core world,
Rapier, 120 Hz, 120 bouts a clinch): with none it won 0.94 and fell 0.12 a bout; at 0.6 to
0.7 m it won 0.99 to 1.00, fell 0.03 to 0.10, and took a quarter of the damage from the two that
walk into it; from 0.75 m it backs out of its own punch's window and throws ever less (0.8 m: 15
blows a bout to 27, 0.9 m: none). In the empty-hand league (`research/empty-hand-league.mjs`,
120 s, gaps 3 to 5 m) the clinch of 0.65 m rated 1431 to the Puncher's 1322 without it, 0.7 m
1348.

## Windows

A recipe's window is where its target may stand from its place for the recipe to be thrown at
it: along the heading, across it, and up, the target's height over the head of the body that
throws (`StrikeWindow`). The strike skill throws a recipe at a target whose height is in its
window, sets the feet until the target stands in the window along and across, and places its
blow at a height no window holds ([blows.md](blows.md#placed)).

`research/core-strike-window.mjs` throws each recipe as its search threw it, through the strike
skill at a ball of its band's part hung at its place (`evaluateBlow`,
`research/core-blow.mjs`), and moves the ball one way at a time in steps of 2 cm. A stand-off is
in the window if at it, and at every stand-off nearer the place, the blow

- landed: the ball lost hit points;
- left its body up: not down `WATCH` (3 s) after its pushes;
- did a share of what it does at its place, or more: `--keep` (0.8) along the heading and across
  it, where the feet are set to the window, and `--keep-up` (0.5) up, where nothing sets a
  target's height and the blow outside the window is another recipe or a placed one;

at 120 and at 480 Hz, each reading the mean of four throws (`--trials`): the recipe as written,
and three with each push's timing moved by up to 1/240 s and its level by up to 0.02, as a search
perturbs its trials. A window is read by what the blow does its target, and not by what it nets:
a blow that costs its hand more than it does its target nets under nothing, and the less of it
lands the more it nets. Node core stand, Rapier, standing on its feet as built, ground on, no
assist; the arena's rulebook.

`node research/core-strike-window.mjs --write --spare <the repertoire's spare searches>`, on the
repertoire of [blows.md](blows.md#the-repertoire): what each recipe does its target at its
place, the mean of four throws, and its window.

| Body | Held | Band | Does at its place, HP: 120 Hz | 480 Hz | Window along, cm | across | up |
|---|---|---|---|---|---|---|---|
| Warrior | wooden club | high | 1.15 | 1.09 | -8 to 2 | -2 to 2 | -54 to 14 |
| Warrior | wooden club | middle | 1.12 | 0.99 | -14 to 4 | -4 to 4 | -32 to 18 |
| Warrior | fist | high | 0.16 | 0.16 | -6 to 6 | -14 to 4 | -6 to 8 |
| Warrior | fist | middle | 0.58 | 0.41 | 0 to 4 | -2 to 6 | -34 to 18 |
| Rogue | wooden club | high | 0.40 | 0.31 | -2 to 8 | -6 to 2 | -18 to 6 |
| Rogue | wooden club | middle | 0.50 | 0.46 | -16 to 4 | -4 to 4 | -22 to 26 |
| Rogue | fist | high | 0.05 | 0.06 | -4 to 4 | -2 to 4 | -14 to 8 |
| Rogue | fist | middle | 0.22 | 0.24 | -4 to 2 | -2 to 4 | -24 to 24 |
| skeleton | wooden club | high | 0.84 | 0.83 | -2 to 6 | -2 to 2 | -26 to 26 |
| skeleton | wooden club | middle | 1.30 | 1.29 | -12 to 16 | -6 to 4 | -36 to 12 |
| skeleton | fist | high | 0.19 | 0.17 | -4 to 6 | -6 to 2 | -24 to 12 |
| skeleton | fist | middle | 0.78 | 0.49 | -4 to 2 | -4 to 6 | -18 to 2 |

No window comes to the 60 cm the ball is moved to. The fists' are 4 to 14 cm wide along the
heading and 6 to 18 across; the clubs' 8 to 28 and 4 to 10.

### Four throws

One throw a stand-off reads the step grid along with the blow. The Warrior's club blow at a
head, at 120 Hz, its target 6, 8 and 10 cm over its place, thrown as written and with its
pushes moved as three perturbed trials move them (Node core stand, Rapier; HP done):

| Up, cm | As written | -2.2 ms, level 0.995 | +0.04 ms, level 1.008 | -3.75 ms, level 0.995 |
|---|---|---|---|---|
| 6 | 0.90 | 0.62 | 1.06 | 0.06 |
| 8 | 0.11 | 0.99 | 1.04 | 0.94 |
| 10 | 1.12 | 0.99 | 0.95 | 0.93 |

One throw in four at a height reads a tenth of the others, and not the same throw at the next
height: the swell passes the ball between two steps. Read once, the 0.11 at 8 cm ended the
window at 6 cm. The mean of four is what a stand-off is read by.

### The watch

A blow that leaves its body down is no blow to throw, and a search scores it under any miss
(`FELL`). A search asks more: that the body stands on both feet a second after its pushes
(`RECOVER`). Held to that, a window ends wherever the body is still stepping at the second,
whether it then stands or falls. 27 stand-offs of the Warrior's club blow at a head and of its
straight at a trunk, each watched 1, 2 and 3 s after its pushes (Node core stand, Rapier, 120
and 480 Hz):

| At 1 s | Stand-offs | Standing at 2 s | Down at 2 s | Standing at 3 s | Down at 3 s |
|---|---|---|---|---|---|
| Standing on both feet | 18 | 18 | 0 | 18 | 0 |
| Still stepping | 9 | 5 | 3 | 6 | 3 |

Every body that was going to fall was down within 2 s, and the last to recover stood by 3 s.
`WATCH` is 3 s, and what is asked at its end is that the body is not down.

### The share kept

The windows of the Warrior's recipes along the heading and across it, cm, at each share of the
reading at the place (`--keep`), from one throw a stand-off (the windows up are `--keep-up`'s,
and do not move):

| Keep | Club, high: along | across | Club, middle: along | across | Fist, middle: along | across |
|---|---|---|---|---|---|---|
| 0.95 | -4 to 12 | 0 to 0 | -6 to 6 | -2 to 2 | 0 to 2 | -6 to 0 |
| 0.9 | -4 to 12 | 0 to 2 | -8 to 6 | -2 to 2 | 0 to 2 | -6 to 2 |
| 0.8 | -10 to 12 | -2 to 2 | -18 to 12 | -4 to 6 | -2 to 2 | -6 to 2 |
| 0.65 | -12 to 12 | -2 to 4 | -24 to 16 | -6 to 8 | -2 to 6 | -10 to 4 |
| 0.5 | -16 to 12 | -4 to 6 | -28 to 16 | -8 to 12 | -6 to 6 | -10 to 4 |

The skill throws a recipe only with its target in the window, and sets each foot within
`PLACING.near` (2 cm) of its place: a window narrower than 4 cm is one it cannot set its feet
to, and a recipe with one is never thrown. At 0.95 the club's blow at a head has no width
across, and at 0.9 it has 2 cm. 0.8 is the greatest share of the sweep at which every one of the
three is 4 cm wide both ways, and is the one set.

### A recipe the feet cannot be set to

A recipe whose window along the heading or across it is narrower than twice `PLACING.near` is
taken out of the asset (`setTo`). Its cell takes the next of its searches that beat the placed
blow, in the order of what they net, whose window is read in its turn
(`research/core-strike-repertoire.mjs --spare`); a cell none of whose searches the feet can be
set to is thrown at by placement. The asset says which recipes were passed over (`passed`) and
which cells are placed (`placed`), and why.

One recipe of the 12 was passed over: the Rogue's club blow at a trunk of seed 1, which nets
0.532 HP at 120 Hz, and at 480 Hz lands once in eight throws and leaves the Rogue down thrown at
nothing, so that its window is 0 cm along and across. Its cell has seed 2's, 0.424 HP, with a
window 20 cm along and 8 cm across.

## IK

`IK_POSTURE_PULL` is 0.5 and `IK_TURN` is 0.2 rad (`solveReach`): of the way from each angle to
its preferred one, the share a pass asks in the null space of the reach; and the most any angle
turns in a pass, the whole step scaled alike, so a place out of reach draws the arm straight
toward it. Both shape the path an arm takes to a place and not where it ends. Set. The solver's
other settings (its passes, tolerance and damping, how far short of a half turn it keeps an
angle, and the least a way moves a place for the posture's pull to be kept off it) are numerics.

The solve's Jacobian is the kinematics' own derivative in closed form (`reachJacobianTo`): how a
point of the chain's last segment moves for a unit of each freedom, from the joints' own axes
(`motionAxesToRef`, `turningToRef`), one walk of the chain a pass. A solve says how many passes
it took and whether it stopped of itself (`ReachEnd`), and motor control counts them
(`ReachMeter`); what the count is in a bout, and which solves still run to the cap, is in
[step-cost.md](step-cost.md#the-reach-solver-at-its-cap).

**The wrist is the arm's.** A hand goal moves the shoulder's, the elbow's and the wrist's
freedoms, seven for the three rows of one place. With the wrist held at the posture's angles, a
point of a held item half a metre from the hand has no path the solve can follow: the map of
where one place is solved has holes inside it. The Warrior with the club, each place straight
ahead of his right shoulder, each row solved in turn from the guard; the distance left, mm
(`node research/core-reach-map.mjs`; kinematics alone, Node core stand):

The club's swell, the wrist held: 24 of 54 places within a millimetre.

| Up, m \ ahead, m | 0.3 | 0.45 | 0.6 | 0.75 | 0.9 | 1.05 |
|---|---|---|---|---|---|---|
| 0.4 | 607 | 660 | 728 | 814 | 908 | 1011 |
| 0.6 | 416 | 481 | 561 | 660 | 766 | 883 |
| 0.8 | 0 | 0 | 0 | 69 | 189 | 316 |
| 1 | 0 | 0 | 0 | 0 | 89 | 227 |
| 1.2 | 87 | 0 | 0 | 0 | 23 | 170 |
| 1.4 | 150 | 1 | 0 | 0 | 0 | 147 |
| 1.6 | 108 | 0 | 0 | 0 | 15 | 163 |
| 1.8 | 0 | 0 | 0 | 0 | 75 | 215 |
| 2 | 0 | 0 | 0 | 47 | 169 | 298 |

The club's swell, the wrist freed: 35 of 54, and every place from 0.8 to 2 m up and 0.3 to 0.9 m
ahead within 14 mm.

| Up, m \ ahead, m | 0.3 | 0.45 | 0.6 | 0.75 | 0.9 | 1.05 |
|---|---|---|---|---|---|---|
| 0.4 | 0 | 30 | 204 | 354 | 559 | 708 |
| 0.6 | 0 | 0 | 0 | 28 | 251 | 551 |
| 0.8 | 0 | 0 | 0 | 0 | 14 | 295 |
| 1 | 0 | 0 | 0 | 0 | 0 | 124 |
| 1.2 | 0 | 0 | 0 | 0 | 0 | 6 |
| 1.4 | 7 | 0 | 0 | 0 | 0 | 2 |
| 1.6 | 8 | 0 | 0 | 0 | 0 | 7 |
| 1.8 | 0 | 0 | 0 | 0 | 0 | 87 |
| 2 | 0 | 0 | 0 | 0 | 8 | 120 |

The knuckles' map is the same either way: 13 places of 54 with the wrist held and 11 with it
freed, the two lost left 2 and 4 mm at the edge of the arm's reach.

**Two places lay a line.** Two points of what the hand holds, the ends of the club's swell,
asked to the places a pose of the arm puts them (`tests/core-reach.test.mjs`; the Warrior, the
lower trunk held, gravity on, Node core stand, Rapier): across the body, upright, and askew
from the guard, each point ends within 0.3 mm of its place at 120 Hz and at 1920 Hz, the wrist
turned up to 1.07 rad from the posture's. With one place alone the other end of the swell lay
0.3 to 0.7 m from where the pose had it.

**A freedom at the end of its range has no part in a pass.** Clamped after the step, the others
move as though it had moved, and the posture's pull leaks into the reach by its share: the
swell asked to one place whose pose has the wrist's radial deviation at its stop settled 30.5 mm
short, at both rates, and settles on it with the freedom left out.

**An angle is kept 0.1 rad short of a half turn.** A joint's angles read within a half turn
(`rotationOfToRef`), and three ranges reach it: the Rogue's shoulder flexion (3.156 rad) and
the skeleton's shoulder flexion (3.144) and abduction (3.138). A solve drawn to those stops
asked for a rotation that does not exist.

**The posture's pull is kept off only the ways the arm sees.** The pull toward the posture is
projected off what the reach sees, through the inverse of J J'. An arm laid straight by a placed
blow, its elbow and two of its wrist's freedoms at their stops, has four freedoms left that move
the knuckles in a plane and not along the arm: J J' has no inverse, and the pass's step was not
a number. Two of 45 bare-handed bouts threw on it (the fighter against the rogue from 3 m and
from 5 m; Node, Rapier, 120 Hz). The projector's inverse is taken with `IK_BLIND`, 1e-5 m a
radian, squared on its diagonal: a way that moves the place less than that is not seen, and the
pull along it is left in. For a way an arm does move a place, a decimetre a radian, what that
lets the pull leak into the place is a part in a hundred million. The 45 bouts run to their
ends, and the arm of the bout that threw is the fixture of `tests/core-reach.test.mjs`.
