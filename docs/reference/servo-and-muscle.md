# The servo holding a body

How closely the joint servo (`src/core/control/servo.ts`) holds a whole body still, and at which
time constants it holds without ringing. `servo.ts` cites it, and it shows the servo's time
constant, `SERVO_SECONDS` in `src/core/body.ts`, to be a choice rather than a floor.

## Holding a pose

`SERVO_SECONDS`, 0.1 s (twelve steps at 120 Hz), is a choice: the servo holds at time constants
down to two steps.

The whole Rogue, lower trunk held, no ground, gravity on, servoed to the guard and held; read over
the third second of the hold (Node core stand, Rapier; `135d31fb`, by a script not committed). No
test reads the hold again; `tests/core-servo.test.mjs` holds the servo on an arm.

The worst freedom's final error (at a wrist or the neck):

| Rate   | Time constant | Worst error, rad |
| ------ | ------------- | ---------------- |
| 120 Hz | 0.1 s         | 0.0001           |
| 960 Hz | 0.1 s         | 0.0002           |
| 960 Hz | 0.05 s        | 0.0001           |

A held freedom's speed changes sign on up to two steps in three at every rate. The fastest held
speed (the right wrist's radial deviation) grows as the step shrinks:

| Rate   | Fastest held speed, rad/s |
| ------ | ------------------------- |
| 120 Hz | 0.004                     |
| 240 Hz | 0.006                     |
| 480 Hz | 0.014                     |
| 960 Hz | 0.024                     |

Time constants of a few steps at which no freedom passes those speeds in the third second, nor
ends more than 0.0001 rad from its goal:

| Rate   | Time constants held, in steps |
| ------ | ----------------------------- |
| 120 Hz | 2, 3, 4, 6, 9, 10, 12         |
| 240 Hz | 6, 10                         |
| 480 Hz | 3, 6, 10                      |
