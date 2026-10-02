# The human and its strikes: tuning records

What the tuned constants of the skills and the tactics rest on: how long a body stands before it
throws (`STAND`) and how it comes to a recipe's place (`APPROACH`), both in
`src/core/skills/strike.ts`; how its feet are placed and when a walk may turn (`PLACING`,
`TURN_LEAD`, `src/core/skills/locomotion.ts`); the guard (`GUARD`, `src/core/skills/guard.ts`);
how near a fighter attacks (`ATTACK_METRES`, `src/core/mind/fighter.ts`); what shapes an
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
(`Locomotion.place`). Set. A recipe is kept only if its window is twice that wide or more along
the heading and across it ([Windows](#a-recipe-the-feet-cannot-be-set-to)). Where a placed foot
lands beside its place has not been measured; the Routine's strikes above stood inside their
windows with it.

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
fighter attacks its foe; further, it walks at it. Set. The Warrior's club blows are thrown with
their target 0.93 m (a head) and 1.12 m (a trunk) ahead of its own head (`Recipe.place`,
`assets/core/strikes.json`), and the strike skill closes what is left itself (`APPROACH`), so
1.8 m is a blow's distance and about a step.

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
| Warrior | wooden club | high | 1.02 | 1.11 | -2 to 12 | -4 to 2 | -6 to 12 |
| Warrior | wooden club | middle | 1.37 | 1.31 | -16 to 8 | -6 to 4 | -30 to 26 |
| Warrior | fist | high | 0.12 | 0.11 | -6 to 2 | -2 to 14 | 0 to 8 |
| Warrior | fist | middle | 0.53 | 0.36 | -2 to 2 | -8 to 2 | -36 to 20 |
| Rogue | wooden club | high | 0.42 | 0.46 | -14 to 6 | -2 to 6 | -8 to 8 |
| Rogue | wooden club | middle | 0.54 | 0.57 | -10 to 10 | -6 to 6 | -40 to 24 |
| Rogue | fist | high | 0.05 | 0.05 | -6 to 8 | -2 to 6 | -12 to 6 |
| Rogue | fist | middle | 0.31 | 0.15 | -4 to 2 | -6 to 2 | -14 to 20 |
| skeleton | wooden club | high | 0.67 | 0.70 | -4 to 4 | -2 to 2 | -14 to 26 |
| skeleton | wooden club | middle | 1.08 | 1.14 | -8 to 6 | -4 to 6 | -18 to 14 |
| skeleton | fist | high | 0.18 | 0.15 | 0 to 6 | -4 to 2 | -28 to 18 |
| skeleton | fist | middle | 0.54 | 0.50 | -4 to 0 | 0 to 8 | -14 to 24 |

No window comes to the 60 cm the ball is moved to. The fists' are 4 to 14 cm wide along the
heading and 6 to 16 across; the clubs' 8 to 24 and 4 to 12.

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

One recipe of the 12 was passed over: the skeleton's club blow at a head of seed 2, which nets
0.755 HP and at its own place, at 120 Hz, leaves the skeleton down in one throw of the four, so
that no stand-off is in its window. Its cell has seed 3's, 0.660 HP, with a window 8 cm along
and 4 cm across.

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
