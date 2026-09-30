# The human and its strikes: tuning records

The measurements behind the strike skill's tuned constants: how long a body stands before it
throws (`STAND`) and how it comes to a recipe's place (`APPROACH`), both in
`src/core/skills/strike.ts`, which cites the sections below.

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

`STAND = 1.5`: the first time in the table at which each human is at 5 mm/s or less.

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

`APPROACH = { pace: 0.3, seconds: 1, reach: 0.25 }`: the pace is the Routine's pace through its
turns, which each human held.
