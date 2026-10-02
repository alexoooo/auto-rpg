# The human and its strikes: tuning records

What the tuned constants of the skills and the tactics rest on: how long a body stands before it
throws (`STAND`) and how it comes to a recipe's place (`APPROACH`), both in
`src/core/skills/strike.ts`; how its feet are placed and when a walk may turn (`PLACING`,
`TURN_LEAD`, `src/core/skills/locomotion.ts`); the guard (`GUARD`, `src/core/skills/guard.ts`);
how near a fighter attacks (`ATTACK_METRES`, `src/core/mind/fighter.ts`); what shapes an
arm's path to a place (`IK_POSTURE_PULL`, `IK_TURN`, `src/core/control/kinematics.ts`); and
the heights a recipe is thrown at (`StrikeWindow.up`, `src/core/skills/strikes.ts`). Each
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

A step into a stance before the strike (the right foot set 0.3 m across and 0.15 m behind) was
tried on the Warrior and did not converge with the rate: at 1920 Hz the bearing foot slid 15 cm
toward the swinging one in the swing's last 60 ms and the body staggered at up to 1.4 m/s; at
480 Hz it slid 4 cm; at 120 Hz not at all. That was read at `5e652760`, on the engine that is
gone, with a script that was not kept, and has not been read on this one. Strikes are thrown from
the square stance the body was built in.

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
has moved by the same reach (`fighterTactics`, `src/core/mind/fighter.ts`).

## Placing

`PLACING.near` is 0.02 m: a foot further than that from its place steps there
(`Locomotion.place`). Set. It is under every window of the repertoire, of which the narrowest is
the club blow's 4 cm across (`assets/core/strikes.json`). Where a placed foot lands beside its
place has not been measured; the Routine's strikes above stood inside their windows with it.

## Turn lead

`TURN_LEAD` is 1 s: how long a walk goes straight after it sets off from standing before its
heading turns. Set. The argument for a lead: a heading turned over feet still planted for the
walk's first weight shift runs the shift away sideways until the body falls, and the envelope's
turn rates (`assets/core/stance-envelope.json`) are of a walk already under way, so they say
nothing of a turn from standing. The least lead that holds has not been swept.

## Guard

`GUARD` is the arms' posture when no skill owns them: each shoulder flexed 0.5 rad and drawn in
0.2, each elbow flexed 1.3. Set. Every recipe of `REPERTOIRE` (`assets/core/strikes.json`) was
searched thrown from a body standing in it (`research/core-strike-search.mjs`: the straights from
the guard itself, the club blow chambered from it), and `STAND` was measured standing in it, so a
change to the guard voids the recipes and the stand time. The skeleton's reference pose presses
the guard's elbows into their stops.

## Attack distance

`ATTACK_METRES` is 1.8 m, between the two centres of mass across the ground: nearer than that, a
fighter attacks its foe's head; further, it walks at it. Set. The club blow is thrown from 1.05 m
(its `distance`, `assets/core/strikes.json`), and the strike skill closes what is left itself
(`APPROACH`), so 1.8 m is the blow's distance and about a step.

## Window height

A recipe's window has a third way, up: the target's height over the head of the body that
throws (`StrikeWindow.up`). The strike skill throws a recipe at a target whose height is in its
window, and places its blow at any other ([blows.md](blows.md#placed)).
`research/core-strike-window.mjs` moves the target up and down from the recipe's place as it
moves it along the heading and across it, in steps of 2 cm, and reads a fist by its point's
forward speed into a sphere of the head's radius with no body at it (`evaluateStrike`), and
the club by the energy of its blow on a ball (`evaluateClubStrike`). Node core stand, Rapier,
each recipe thrown from standing in the guard; a miss is a throw that read nothing.

| Up, cm | The Warrior's straight, m/s: 120 Hz | 480 Hz | The Rogue's straight, m/s: 120 Hz | 480 Hz |
|---|---|---|---|---|
| -10 | miss | miss | miss | miss |
| -8 | miss | miss | miss | miss |
| -6 | miss | miss | 6.16 | 7.10 |
| -4 | 7.36 | miss | 7.02 | 7.73 |
| -2 | 7.83 | 9.17 | 7.53 | 7.98 |
| 0 | 8.06 | 9.51 | 7.70 | 8.06 |
| 2 | 8.21 | 9.61 | 7.70 | 8.06 |
| 4 | 8.31 | 9.65 | 7.71 | 8.03 |
| 6 | 8.37 | 9.66 | 7.71 | 8.02 |
| 8 | 8.36 | 9.66 | 7.71 | 8.04 |
| 10 | 8.31 | 9.65 | miss | 8.06 |
| 12 | miss | miss | miss | miss |

| Up, cm | The Warrior's club blow, J: 120 Hz | 480 Hz |
|---|---|---|
| -80 | 7.94 | miss |
| -74 | 37.91 | 4.64 |
| -70 | 55.57 | 21.31 |
| -60 | 85.79 | 64.90 |
| -58 | 90.28 | 70.93 |
| -56 | 94.00 | 74.50 |
| -50 | 103.46 | 93.99 |
| -40 | 125.91 | 123.77 |
| -30 | 138.24 | 144.05 |
| -20 | 134.89 | 147.20 |
| -10 | 129.86 | 143.75 |
| 0 | 119.45 | 136.09 |
| 10 | 113.19 | 124.06 |
| 20 | 80.17 | 72.22 |
| 22 | 67.27 | 49.98 |
| 24 | 45.52 | 14.28 |
| 26 | 21.94 | miss |
| 28 | miss | miss |

Command: `node research/core-strike-window.mjs --hz 120,480`, and with `--write` to put the
windows into `assets/core/strikes.json`.

The window up runs from the recipe's place out to the last height at which it, and every height
nearer, read half its reading at its place or more, at 120 and at 480 Hz (`--keep-up 0.5`): the
Warrior's straight from 2 cm under to 10 cm over, the Rogue's from 6 under to 8 over, the club
blow from 58 under to 20 over. Along the heading and across it the share is 0.95, the feet
being set to the window. Half is set, and not swept: nothing sets a target's height, the blow
outside the window is a placed one, a tenth of a recipe's, and a recipe at half is the better
blow.

A fist's window up is its reading's, and narrower than its blow: the point misses a sphere it
passes a radius from, 9.1 cm for the Warrior and 7.2 for the Rogue, whatever the fist and the
arm behind it would do to a head there. On a dummy the Warrior's straight lands 6 to 11 J from
14 cm under his head to 10 over ([blows.md](blows.md#against-a-recipe)).

## IK

`IK_POSTURE_PULL` is 0.5 and `IK_TURN` is 0.2 rad (`solveReach`): of the way from each angle to
its preferred one, the share a pass asks in the null space of the reach; and the most any angle
turns in a pass, the whole step scaled alike, so a place out of reach draws the arm straight
toward it. Both shape the path an arm takes to a place and not where it ends. Set. The solver's
other settings (its passes, tolerance, differencing step and damping, how far short of a half
turn it keeps an angle, and the least a way moves a place for the posture's pull to be kept off
it) are numerics.

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
