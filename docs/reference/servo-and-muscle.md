# The servo and the muscles

What the joint servo (`src/core/control/servo.ts`) does when it holds a whole body still: how
close it settles, how its held speeds flicker, and which time constants it holds without ringing.
The servo's module comment cites it; the readings bear on the servo's time constant,
`SERVO_SECONDS` in `src/core/body.ts`, which they show to be a choice rather than a floor.

## Holding a pose

The whole Rogue, lower trunk held, no ground, gravity on, servoed to the guard and held (Node core
stand, Rapier). Read over the third second of the hold. The three tables are `135d31fb`'s. The
script that read them was not committed, so its flags are not recorded: what is known of it is on
this page, the harness and the hold. No test reads the hold again; `tests/core-servo.test.mjs`
holds the servo on an arm.

At a time constant of 0.1 s, how far the worst freedom ends from its goal (the worst at a wrist or
the neck):

| Rate   | Time constant | Worst error, rad |
| ------ | ------------- | ---------------- |
| 120 Hz | 0.1 s         | 0.0001           |
| 960 Hz | 0.1 s         | 0.0002           |
| 960 Hz | 0.05 s        | 0.0001           |

A held freedom's speed changes sign on up to two steps in three at every rate. The fastest held
speed, the worst at the right wrist's radial deviation, grows as the step shrinks:

| Rate   | Fastest held speed, rad/s |
| ------ | ------------------------- |
| 120 Hz | 0.004                     |
| 240 Hz | 0.006                     |
| 480 Hz | 0.014                     |
| 960 Hz | 0.024                     |

The same hold at time constants of a few steps. At none of these does any freedom pass the speeds
above in the third second, nor end more than 0.0001 rad from its goal:

| Rate   | Time constants held, in steps |
| ------ | ----------------------------- |
| 120 Hz | 2, 3, 4, 6, 9, 10, 12         |
| 240 Hz | 6, 10                         |
| 480 Hz | 3, 6, 10                      |

The servo holds at time constants down to two steps, so `SERVO_SECONDS`, 0.1 s (twelve steps at
120 Hz), is a choice, not a floor.
