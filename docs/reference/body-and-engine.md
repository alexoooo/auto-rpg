# The body and the engine: measurements

This file records the readings behind choices in the core body and in how its dynamics are tested
against the engine. `SERVO_SECONDS` in `src/core/body.ts` cites the servo's time constant section;
`tests/core-dynamics.test.mjs` cites the section on Rapier's per-step disturbance.

## Servo time constant

The joint servo was run at 0.1 s on the lab's scripted routine (`src/lab/routine.ts`), and read
over the second half of each settle, on the freedoms the legs leave to the posture. Harness: Node
core stand, Rapier. The Warrior at 120 Hz was read over the first two settles, since it fell in the
third strike. The table is `135d31fb`'s, read on the routine as it then was (a script of timed
steps, `src/core-lab/routine.ts@135d31fb`, which the lab no longer has). The script that read it
was not committed, so its flags are not recorded, and the table does not read again on the routine
as it stands.

| Body    | Rate   | Largest step-to-step speed reversal (rad/s) | Guard held within (rad) |
|---------|--------|---------------------------------------------|-------------------------|
| Rogue   | 120 Hz | 0.010                                       | 0.026                   |
| Rogue   | 480 Hz | 0.008                                       | 0.029                   |
| Warrior | 120 Hz | 0.026                                       | 0.039                   |
| Warrior | 480 Hz | 0.046                                       | 0.022                   |

The worst reversals were at a wrist's radial deviation or the lumbar spine; the worst guard error
at the trunk's flexion. That band is not the servo's: with the lower trunk held, the servo ends
within 0.0002 rad of its goals. The standing body moves under it, and the servo leaves out the
root's acceleration.

Choice: 0.1 s. The servo holds at time constants down to two steps
([Holding a pose](servo-and-muscle.md#holding-a-pose)), so the value is a choice, not a floor.

## Rapier's per-step disturbance

Rapier moves each step's joint speeds by a disturbance of its own, about 0.007 rad/s a step on the
test chain, that does not shrink with the step. Its cause is not established; the joints' drift
correction is the suspect (their anchors part by under a micrometre). A difference taken over one
step reads it as an acceleration that grows with the rate.

The chain of `tests/core-dynamics.test.mjs` (a three-, a two- and a one-freedom joint on tilted
axes, hung from a fixed post, no gravity) was pushed about by its muscles for 0.25 s and let go.
Each step's change of the joints' speeds was read against the model's M u' = -bias. Harness: Node
core stand, Rapier. The median error, alike with the steps at a stop left out:

| Rate    | Median error |
|---------|--------------|
| 240 Hz  | 2.3 %        |
| 480 Hz  | 2.4 %        |
| 960 Hz  | 6.7 %        |
| 1920 Hz | 25 %         |
| 3840 Hz | 70 %         |

At 1920 Hz, leaving the gyroscopic torque out of the model read 25.9 % against 25.0 %: at that rate
the disturbance hides the term.

Command: not recorded. The table is `135d31fb`'s; the chain and the let-go are that file's test
(`node --test tests/core-dynamics.test.mjs`), which runs at 480 Hz and asserts a bound on the
median. How the other rates were run and the medians printed was not kept.

The same chain holding a rod, free in the air under gravity at 480 Hz, was read through the root's
rows (`BodyDynamics.root`). Off every stop, the rows gave the bodies' momentum to 0.01 to 0.05 %;
while a joint pressed its stop, 5 to 9 % off, and 44 % off on the step one landed on it. Over
windows of 4 steps the accelerations read 2.6 % off for the root and 1.8 % for the joints at the
median; a step at a time, 14 % and 8 %. These are `abfe6153`'s, on the same file's free-chain test,
and how they were printed was not kept either.

Choice: the let-go test runs at 480 Hz, and the free chain's accelerations are read over windows
of 4 steps, with the steps at a stop left out.
