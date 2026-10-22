# The human and its strikes: tuning records

What the tuned constants of the skills and the tactics rest on: `STAND` and `APPROACH`
(`src/core/skills/strike.ts`), `PLACING` (`src/core/skills/locomotion.ts`), the stance's turning
envelope, `GUARD` (`src/core/skills/guard.ts`), `ATTACK_METRES` and `EDGE`
(`src/core/mind/recipe-tactics.ts@cee7aae2`; the edge's band and patience are now the edge
behaviour's settings, `EDGE`, `src/core/mind/behaviours/edge.ts`, and the clinch the break-clinch
behaviour's `metres`), `IK_POSTURE_PULL` and `IK_TURN`
(`src/core/control/kinematics.ts`) and `StrikeWindow` (`src/core/skills/strikes.ts`). Each
constant's comment cites its section. A value said to be set was chosen, not swept. Figures are
Node, Rapier, no assist, unless a table says otherwise.

## Stand time

`STAND` is 1.5 s: by then each human standing still in the guard has settled its centre of mass
to 6 mm/s or less. Set: chosen as the first time each human read 5 mm/s or less on an engine that
is gone (`research/core-blow.mjs@5e652760`). Every recipe was searched from a body that had stood
1.5 s, so a change to it voids the recipes.

Centre-of-mass speed, mm/s, at each time stood, built 3 cm under the reference height
(`node research/core-stance-sweep.mjs --batteries stand --hz <rate>`, the `settle` of each line;
the controller of `e4ec0709`; Node core stand):

| Body | Rate, Hz | 0.5 s | 1 s | 1.5 s | 2 s |
|---|---|---|---|---|---|
| Warrior | 120 | 66 | 21 | 6 | 2 |
| Warrior | 480 | 67 | 22 | 6 | 2 |
| Warrior | 1920 | 66 | 23 | 6 | 2 |
| Rogue | 120 | 52 | 15 | 4 | 1 |
| Rogue | 480 | 53 | 16 | 4 | 1 |
| Rogue | 1920 | 52 | 17 | 5 | 1 |

A step into a staggered stance converges with the rate too (`node research/stance-stagger.mjs`):
after 1.5 s in the guard, the right sole stepped 30 cm right of the left and 15 cm behind over
0.3 s, lifted 5 cm, as `Locomotion.place` steps. Every body stayed up without a step of its own:
the bearing foot slid 0.0 to 0.2 cm, the centre of mass peaked at 0.19 to 0.25 m/s, and the sole
landed 1.3 to 2.4 cm from its goal, at 120, 480 and 1920 Hz on the Warrior, the Rogue and the
skeleton. Strikes are thrown from the square stance the body was built in, which every recipe was
searched from.

## Approach

`APPROACH` is `{ pace: 0.3, seconds: 1, reach: 0.25 }`. `pace` (m/s) is the Routine's pace
through its turns, which each human held. `seconds` and `reach` are set: the walk asked is the
distance left over one second, and the feet are set (`Locomotion.place`) once the centre of mass
is within 0.25 m of the place. The tactics hold an attack's point until the point ordered moves
by the same reach (`recipeTactics`, `src/core/mind/recipe-tactics.ts@cee7aae2`).

The feet are set because a walk alone does not stand a body where it stops: stopped, the stance
steps a foot out from the gait's 20 cm to the 39 cm it was built at, moving the body some 10 cm
to one side, out of the recipe's window, and a slow walk asked for a few centimetres leans the
body without stepping.

With the feet set, each of the 180 strikes each human threw in the Routine stood inside its
window, at 120 and 480 Hz, and none fell (`node research/core-routine-battery.mjs --seeds 6
--loops 10`, and `--hz 480`; read at `8ee70e1e` and again at `e4ec0709`; Node core stand).

## Placing

`PLACING.near` is 0.02 m: a foot further than that from its place steps there
(`Locomotion.place`). Set, not measured. A recipe is kept only if its window is twice that wide
or more along the heading and across it
([A recipe the feet cannot be set to](#a-recipe-the-feet-cannot-be-set-to)); the Routine's
strikes ([Approach](#approach)) stood inside their windows with it.

## Turning

A walk's heading turns no faster than the stance's envelope at the pace (`turnAt`,
`assets/core/stance-envelope.json`), and a foot lands facing the heading only as far as the
bearing foot's hip lets the pelvis turn over it (`landingHeading`, `src/core/control/support.ts`):
a turn past that is taken step by step.

**The envelope is measured as a fight plays it** (`research/core-stance-envelope.mjs`, Node core
stand, 120 Hz): each body built in the guard and holding it, under its character's balance, with a
club and empty-handed, turns begun at every eighth of a second from setting off to 1.5 s, and
under way. A turn's rate is the fastest at which none of 56 turns fell (`turnHeld`).

| Body | Fastest walk, m/s: unarmed / as played | Turn at each speed up to it, rad/s: unarmed / as played |
|---|---|---|
| Warrior | 0.7 / 0.5 | 4, 4, 4, 2, 2 / 4, 4, 4, 2 |
| Rogue | 0.5 / 0.4 | 4, 4, 4, 2 / 4, 1, 2 |
| skeleton | 0.2 / 0.4 | 2 / 4, 4, 1 |

The skeleton walks faster as played: its balance holds it at 0.3 and 0.4 m/s, where unarmed and
unassisted it fell three ways of five.

**Measured as played, the game's walking falls go** (the envelope measured unarmed, out of the
guard, with a lead of 1 s, against as played with no lead):

| Harness (Node, 120 Hz) | Read | Unarmed, lead 1 s | As played |
|---|---|---|---|
| A Warrior alone, fighter mind and balance, ordered 0.5 to 3.14 rad off its heading, 126 a hand (core world) | falls, club and empty | 10 and 33 | 0 and 0 |
| `node research/strike-bouts.mjs --gaps 2.5,3,3.5,4,4.5,5,5.5 --held club,empty`, 126 bouts (core world) | bouts with a side down inside 5 s; at all | 24; 89 | 0; 82 |
| The crypt's hero against one enemy (`tests/crypt-core.test.mjs@2a1b29ac`' layout), seeds 1 to 24, 3 gaps, 30 s (DungeonRun) | hero down unstruck inside 5 s; at all | 11; 28 of 72 | 2; 14 of 72 |
| The crypt, hero and two Warriors, seeds 1 to 24, 150 s (DungeonRun) | a body down unstruck within 1 s; of them turning 1.5 rad in 3 s | 39 in 2622 s; 9 | 21 in 3215 s; 0 |

A placebo (every turn 0.999 of its rate) read 80 arena bouts with a side down and 28 walking falls
in the crypt in 2833 s: a small change moves the counts about as much again, and the falls inside
5 s by less. The two early falls left are a body turned half round from standing at 2 rad/s,
whose walk gathers speed past 1 m/s once the turn is done.

**Why a turn falls**: the pelvis, turned toward the heading critically damped and not told the
turn's rate, lags a 2 rad/s turn by 0.6 rad; the one bearing sole cannot give the yaw moment the
swing leg's turn takes, and from the build the lag grows past the hips' rotation stops (1.5 to
1.6 rad). The steps then land 12 to 16 cm short of where the capture point needs them and the
walk runs off at 1.1 to 1.6 m/s. `landingHeading` takes the envelope's falls at each body's top
rates from 70 to 10; the Warrior's half turn from the build at 0.5 m/s and 4 rad/s turns in about
five steps and stands. The turns that still fall run the walk's plan past the pace asked (the
Rogue's at 0.3 m/s and 2 rad/s to 0.58 m/s, then 1 m/s sideways), the soles about 100 N short.

Not kept: **the heading held within the hips' rotation stops of the pelvis** (0.65 rad, the
Rogue 0.71). It keeps the battery's half turns from the build (falls of 200 at 4 rad/s 53, 82 and
59 become 4, 2 and 0), but read against the pelvis's facing, which a swing whips a radian either
way, it holds the heading still while the body walks: the crypt's skeleton goes down unstruck on
19 to 21 layouts of 72 where 10.

## Guard

`GUARD` is the arms' posture when no skill owns them: each shoulder flexed 0.5 rad and drawn in
0.2, each elbow flexed 1.3. Set. Every recipe of `REPERTOIRE` (`assets/core/strikes.json`) was
searched thrown from a body standing in it (`research/core-strike-search.mjs`), and `STAND` was
measured in it, so a change to the guard voids the recipes and the stand time. The skeleton's
reference pose presses the guard's elbows into their stops.

A body that holds an item holds `guardPosture`: `GUARD`, with the holding wrist alone solved
(`solveReach`) so the item stands as near upright as the wrist's range allows. The Warrior's and
the Rogue's wrists stand the club within 1° of upright, each freedom off its stops, the grip 3 to
5 cm from where `GUARD` puts it; the skeleton's stops at its range, 35° short of upright and
clear of its head. The club's recipes were searched again from it
([blows.md](blows.md#searched-from-the-upright-guard)).

Not kept (Node core stand, 120 and 480 Hz):

- **The club held as `GUARD` holds it** leans back over the head, and the head bears it: 17 N s
  over 2 s on the Warrior; the Rogue at size x0.9 falls to a shove of 0.2 N s/kg.
- **The whole arm solved for an upright club**, grip held, puts the humans' wrists at their
  ulnar stops, and has no answer for the skeleton, whose `GUARD` lies beyond its elbow's range.

## Attack distance

`ATTACK_METRES` is 1.8 m between the two centres of mass across the ground: nearer, a fighter
attacks; further, it walks at its foe. Set. The Warrior's club blows are thrown with their target
0.93 m (a head) and 1.12 m (a trunk) ahead of its own head (`Recipe.place`), and the strike skill
closes the rest itself (`APPROACH`), so 1.8 m is a blow's distance and about a step.

## The edge

`EDGE` is a band of 0.25 m and a patience of 4 s: a fighter holding at the edge of its foe's reach
(`FighterMindConfig.range`, `"edge"`, `src/core/mind/config.ts@352fbe24`) stands no more than
0.25 m beyond where the foe's blow at its head would reach it, and after standing still 4 s walks
in all the same. The band is the strike skill's slack about a blow's place (`APPROACH.reach`); the
patience is more than twice `STAND`. Set.

**`"close"` is every fighter's range**: holding at the edge gains nothing.
`node research/core-range.mjs --bouts 48 --patience 2,4,8`: each pair of bodies, club and empty,
48 gaps from 3 to 5 m, each side at the edge in turn against one that walks in, paired with both
walking in; 6048 bouts (Node core world, 120 Hz, each side's balance its character's). The side at
the edge, pooled:

| Held | Patience, s | Margin gained | d | Won, close / edge | Fell, close / edge | Foe's HP lost, close / edge |
|---|---|---|---|---|---|---|
| club | 2 | -0.019 | -0.12 | 0.50 / 0.44 | 0.29 / 0.35 | 0.400 / 0.274 |
| club | 4 | -0.025 | -0.15 | 0.50 / 0.45 | 0.29 / 0.34 | 0.400 / 0.267 |
| club | 8 | -0.026 | -0.16 | 0.50 / 0.44 | 0.29 / 0.34 | 0.400 / 0.264 |
| empty | 2 | -0.002 | -0.03 | 0.50 / 0.52 | 0.30 / 0.23 | 0.475 / 0.500 |
| empty | 4 | -0.001 | -0.01 | 0.50 / 0.52 | 0.30 / 0.22 | 0.475 / 0.504 |
| empty | 8 | -0.000 | -0.01 | 0.50 / 0.52 | 0.30 / 0.22 | 0.475 / 0.502 |

Of 108 cells the edge gains at d over 0.2 in 26 and loses at under -0.2 in 30. With a club it
takes about a third less off its foe; empty-handed it falls less and gains nothing in margin.

**The clinch is 0.65 m**: a fighter at the edge backs out, facing its foe, while their centres of
mass are within it (`seekFoe`, `src/core/mind/recipe-tactics.ts@cee7aae2`). The Puncher against six minds, empty-handed, 40 s bouts at ten
gaps from 1.2 to 3.9 m, 120 bouts a setting (Node core world, 120 Hz):

| Clinch, m | Won | Falls a bout | Note |
|---|---|---|---|
| none | 0.94 | 0.12 | |
| 0.6 to 0.7 | 0.99 to 1.00 | 0.03 to 0.10 | a quarter of the damage from foes that walk in |
| 0.8 | | | backs out of its own punch's window: 15 blows a bout where 27 |
| 0.9 | | | throws none |

In the empty-hand league (`research/empty-hand-league.mjs`, 120 s, gaps 3 to 5 m) 0.65 m rated
1431, none 1322, 0.7 m 1348.

## Windows

A recipe's window is where its target may stand from its place for the recipe to be thrown at it:
along the heading, across it, and up (the target's height over the thrower's head)
(`StrikeWindow`). The strike skill throws a recipe at a target whose height is in its window, sets
the feet until the target stands in it along and across, and places its blow at a height no
window holds ([blows.md](blows.md#placed)). The windows in use are
[blows.md](blows.md#the-repertoire)'s.

`research/core-strike-window.mjs` throws each recipe as its search threw it (`evaluateBlow`,
`research/core-blow.mjs`) at a ball of its band's part hung at its place, and moves the ball one
way at a time in steps of 2 cm, up to 60 cm. A stand-off is in the window if at it, and at every
stand-off nearer the place, the blow

- landed: the ball lost hit points;
- left its body up: not down `WATCH` (3 s) after its pushes ([The watch](#the-watch));
- did `--keep` (0.8) of what it does at its place along and across, where the feet are set to the
  window ([The share kept](#the-share-kept)), and `--keep-up` (0.5) up, where nothing sets a
  target's height;

at 120 and 480 Hz, each the mean of four throws (`--trials`): as written, and three with each
push's timing moved by up to 1/240 s and its level by up to 0.02, as a search perturbs its trials.
A window is read by what the blow does its target, not what it nets: a blow that costs its hand
more than it does its target nets less the more of it lands. Node core stand, standing as built.

### Four throws

One throw a stand-off reads the step grid along with the blow. The Warrior's club blow at a head,
120 Hz, HP done, its target over its place, as written and with three perturbed timings:

| Up, cm | As written | -2.2 ms, level 0.995 | +0.04 ms, level 1.008 | -3.75 ms, level 0.995 |
|---|---|---|---|---|
| 6 | 0.90 | 0.62 | 1.06 | 0.06 |
| 8 | 0.11 | 0.99 | 1.04 | 0.94 |
| 10 | 1.12 | 0.99 | 0.95 | 0.93 |

One throw in four reads a tenth of the others, and not the same throw at the next height: the
swell passes the ball between two steps. Read once, the 0.11 at 8 cm ended the window at 6 cm.

### The watch

`WATCH` is 3 s, and what is asked at its end is that the body is not down. A search asks more,
that the body stand on both feet a second after its pushes (`RECOVER`); held to that, a window
ends wherever the body is still stepping at the second, whether it then stands or falls. 27
stand-offs of the Warrior's club blow at a head and straight at a trunk, watched 1, 2 and 3 s
after the pushes (Node core stand, 120 and 480 Hz):

| At 1 s | Stand-offs | Standing / down at 2 s | Standing / down at 3 s |
|---|---|---|---|
| Standing on both feet | 18 | 18 / 0 | 18 / 0 |
| Still stepping | 9 | 5 / 3 | 6 / 3 |

Every body that was going to fall was down within 2 s, and the last to recover stood by 3 s.

### The share kept

`--keep` is 0.8, the greatest share at which each of the Warrior's three recipes below has a
window 4 cm wide both ways, the least the feet can be set to (twice `PLACING.near`). Windows, cm,
from one throw a stand-off:

| Keep | Club, high: along / across | Club, middle: along / across | Fist, middle: along / across |
|---|---|---|---|
| 0.95 | -4 to 12 / 0 to 0 | -6 to 6 / -2 to 2 | 0 to 2 / -6 to 0 |
| 0.9 | -4 to 12 / 0 to 2 | -8 to 6 / -2 to 2 | 0 to 2 / -6 to 2 |
| 0.8 | -10 to 12 / -2 to 2 | -18 to 12 / -4 to 6 | -2 to 2 / -6 to 2 |
| 0.65 | -12 to 12 / -2 to 4 | -24 to 16 / -6 to 8 | -2 to 6 / -10 to 4 |
| 0.5 | -16 to 12 / -4 to 6 | -28 to 16 / -8 to 12 | -6 to 6 / -10 to 4 |

### A recipe the feet cannot be set to

A recipe whose window along the heading or across it is narrower than twice `PLACING.near` is
taken out of the asset (`setTo`). Its cell takes the next of its searches that beats the placed
blow, in the order of what they net, whose window is read in its turn
(`research/core-strike-repertoire.mjs --spare`); a cell none of whose searches the feet can be set
to is placed. The asset names the recipes passed over (`passed`) and the cells placed (`placed`),
and why: in the repertoire in use, the Warrior's fist at a head of seed 1 (0.1194 HP, a window 6
cm along and 2 across) is passed over, and the Rogue's fist at a head is placed, its searches'
windows narrower than 4 cm.

## IK

`IK_POSTURE_PULL` is 0.5 and `IK_TURN` is 0.2 rad (`solveReach`): of the way from each angle to
its preferred one, the share a pass asks in the null space of the reach; and the most any angle
turns in a pass, the whole step scaled alike, so a place out of reach draws the arm straight
toward it. Both shape the path an arm takes to a place, not where it ends. Set. Near full stretch
and beyond it the pull is not asked and the place is brought short of the stretch, `IK_STRETCH`
(0.04) of the last link, so an arm out of reach ends still bent toward its place, the bare elbow
about 15 degrees from straight ([step cost](step-cost.md#the-reach-solver-near-full-stretch)). The
solver's other settings (passes, tolerance, damping and its growth, the margin short of a half
turn, `IK_BLIND`, `IK_NEAR`) are numerics.

The Jacobian is the kinematics' own derivative in closed form (`reachJacobianTo`), from the
joints' own axes (`motionAxesToRef`, `turningToRef`). A solve says how many passes it took and
whether it stopped of itself (`ReachEnd`), and motor control counts them (`ReachMeter`); the
counts in a bout are [step-cost.md](step-cost.md#the-reach-solver-at-its-cap)'s.

**The wrist is the arm's.** A hand goal moves the shoulder's, the elbow's and the wrist's
freedoms, seven for the three rows of one place. With the wrist held at the posture's angles, a
point of a held item half a metre from the hand has no path the solve can follow: the map of
where one place is solved has holes inside it. The Warrior's club swell, each place straight
ahead of his right shoulder, 0.3 to 1.05 m ahead and 0.4 to 2 m up, solved from the guard
(`node research/core-reach-map.mjs`, kinematics alone):

| Wrist | Places within 1 mm, of 54 | Where it fails |
|---|---|---|
| held | 24 | every place 0.6 m up or lower (0.4 to 1.0 m off), the far edge, and holes inside the reach: 87 to 150 mm at 0.3 m ahead and 1.2 to 1.6 m up |
| freed | 35 | the lowest places and the far edge: every place from 0.8 to 2 m up and 0.3 to 0.9 m ahead within 14 mm |

The knuckles' map is the same either way (13 places held, 11 freed, the two lost 2 and 4 mm off
at the edge of reach).

**Two places lay a line.** The two ends of the club's swell, asked to where a pose of the arm puts
them (`tests/core-reach.test.mjs@2a1b29ac`; the Warrior, lower trunk held, gravity on, Node core
stand): across the body, upright and askew, each ends within 0.3 mm of its place at 120 and 1920 Hz,
the wrist turned up to 1.07 rad from the posture's. With one place alone the other end lay 0.3 to
0.7 m from where the pose had it.

**A freedom at the end of its range has no part in a pass.** Clamped after the step, the others
move as though it had moved and the posture's pull leaks into the reach: the swell asked to a
place whose pose has the wrist's radial deviation at its stop settled 30.5 mm short, and settles
on it with the freedom left out.

**An angle is kept 0.1 rad short of a half turn.** A joint's angles read within a half turn
(`rotationOfToRef`), and three ranges reach it: the Rogue's shoulder flexion (3.156 rad) and the
skeleton's shoulder flexion (3.144) and abduction (3.138).

**The posture's pull is kept off only the ways the arm sees.** It is projected off what the reach
sees through the inverse of J J'. An arm laid straight, elbow and two wrist freedoms at their
stops, has four freedoms left that move the knuckles in a plane: J J' has no inverse, and two of
45 bare-handed bouts threw on it. The inverse is taken with `IK_BLIND`, 1e-5 m a radian, squared
on its diagonal: a way that moves the place less is not seen. For a way an arm moves a place a
decimetre a radian, that leaks a part in a hundred million. The bout that threw is the fixture of
`tests/core-reach.test.mjs@2a1b29ac`.
