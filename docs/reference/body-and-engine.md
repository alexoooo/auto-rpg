# The body and the engine

Readings behind two choices: the servo's time constant, `SERVO_SECONDS` in `src/core/body.ts`,
and the rate and window at which `tests/core-dynamics.test.mjs@2a1b29ac` reads the body's dynamics against
Rapier. Both tables are `135d31fb`'s (Node core stand, Rapier); the scripts that printed them were
not committed, so they do not read again as they stand.

## Servo time constant

`SERVO_SECONDS` is 0.1 s, a choice: the servo holds at time constants down to two steps
([Holding a pose](servo-and-muscle.md#holding-a-pose)). At 0.1 s on the lab's scripted routine
(`src/core-lab/routine.ts@135d31fb`), read over the second half of each settle on the freedoms the
legs leave to the posture (the Warrior at 120 Hz over the first two settles; it fell in the third):

| Body    | Rate   | Largest step-to-step speed reversal, rad/s | Guard held within, rad |
|---------|--------|--------------------------------------------|------------------------|
| Rogue   | 120 Hz | 0.010                                      | 0.026                  |
| Rogue   | 480 Hz | 0.008                                      | 0.029                  |
| Warrior | 120 Hz | 0.026                                      | 0.039                  |
| Warrior | 480 Hz | 0.046                                      | 0.022                  |

The worst reversals are at a wrist's radial deviation or the lumbar spine, the worst guard error
at the trunk's flexion. That band is the standing body moving under the servo, which leaves out
the root's acceleration: with the lower trunk held the servo ends within 0.0002 rad of its goals.

## Rapier's per-step disturbance

Rapier moves each step's joint speeds by a disturbance of its own, about 0.007 rad/s a step on the
test chain, that does not shrink with the step; the joints' drift correction is the suspect (their
anchors part by under a micrometre). A one-step difference reads it as an acceleration that grows
with the rate, so the let-go test runs at 480 Hz, and the free chain's accelerations are read over
windows of 4 steps with the steps at a stop left out.

The chain of `tests/core-dynamics.test.mjs@2a1b29ac` (a three-, a two- and a one-freedom joint on tilted
axes, hung from a fixed post, no gravity), pushed by its muscles for 0.25 s and let go; each step's
change of joint speeds against the model's `M u' = -bias`, median error (alike with the steps at a
stop left out):

| Rate    | Median error |
|---------|--------------|
| 240 Hz  | 2.3 %        |
| 480 Hz  | 2.4 %        |
| 960 Hz  | 6.7 %        |
| 1920 Hz | 25 %         |
| 3840 Hz | 70 %         |

At 1920 Hz, leaving the gyroscopic torque out of the model reads 25.9 % against 25.0 %: the
disturbance hides the term.

The same chain holding a rod, free in the air under gravity at 480 Hz, read through the root's rows
(`BodyDynamics.root`; `abfe6153`): off every stop the rows give the bodies' momentum to 0.01 to
0.05 %; with a joint pressing its stop, 5 to 9 % off, and 44 % on the step it lands. Over windows of
4 steps the accelerations read 2.6 % off for the root and 1.8 % for the joints at the median; a step
at a time, 14 % and 8 %.
