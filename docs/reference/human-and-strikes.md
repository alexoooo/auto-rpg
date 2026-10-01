# The human and its strikes: tuning records

What the tuned constants of the skills and the tactics rest on: how long a body stands before it
throws (`STAND`) and how it comes to a recipe's place (`APPROACH`), both in
`src/core/skills/strike.ts`; how its feet are placed and when a walk may turn (`PLACING`,
`TURN_LEAD`, `src/core/skills/locomotion.ts`); the guard (`GUARD`, `src/core/skills/guard.ts`);
how near a fighter attacks (`ATTACK_METRES`, `src/core/mind/fighter.ts`); and what shapes an
arm's path to a place (`IK_POSTURE_PULL`, `IK_TURN`, `src/core/control/kinematics.ts`). Each
constant's comment cites its section below. A value said to be set was chosen and not swept: no
table stands behind it.

## Stand time

Each human stood still in the guard where it was built, and the speed of its centre of mass was
read at each time stood, mm/s, at three physics rates (Node core stand, Rapier). The readings
converge with the rate:

    seconds                0.5   1    1.5   2
    Warrior 120 Hz          62   19    5    1
            480 Hz          66   20    5    1
            1920 Hz         67   20    5    1
    Rogue   120 Hz          43   14    3    0
            480 Hz          52   15    3    1
            1920 Hz         52   15    3    0

`STAND` is 1.5 s: the first time in the table at which each human is at 5 mm/s or less.

A step into a stance before the strike (the right foot set 0.3 m across and 0.15 m behind) was
tried on the Warrior and does not converge with the rate: at 1920 Hz the bearing foot slid 15 cm
toward the swinging one in the swing's last 60 ms and the body staggered at up to 1.4 m/s; at
480 Hz it slid 4 cm; at 120 Hz not at all. Strikes are thrown from the square stance the body was
built in.

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

## IK

`IK_POSTURE_PULL` is 0.5 and `IK_TURN` is 0.2 rad (`solveReach`): of the way from each angle to
its preferred one, the share a pass asks in the null space of the reach; and the most any angle
turns in a pass, the whole step scaled alike, so a place out of reach draws the arm straight
toward it. Both shape the path an arm takes to a place and not where it ends. Set. The solver's
other settings (its passes, tolerance, differencing step and damping) are numerics.
