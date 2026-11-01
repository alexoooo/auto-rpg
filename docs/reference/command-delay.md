# The command delay

A body's command applied a step after it is sent (`COMMAND_DELAY`, `src/core/world.ts`;
[the architecture](../architecture.md#the-command-delay)) costs the toed Warrior's balance and the
stand-up at 120 Hz. Motor control does not hold a planted root pose a step late, and predicting
the body at constant velocity does not restore it. So the game's delay is none, as before, until
motor control predicts its own body from the accelerations its sent command was solved for.

## What is used

- **The delay as a rule** (`World.delay`, `delayLine`): any whole number of steps, every world.
  The game's is 0, the owner's decision held until the condition below is met (`owner-command-delay`).
- **Its condition**: one step, once the gate's probes and the stand-up target read at one step as
  they read at none ([below](#measurement)).

## Measurement

At `580880fb` with the delay at one step; Node, the core world, Rapier, 120 Hz.

**The gate's probes** (`tests/probes.test.mjs`, `tests/idle-settle.test.mjs`), each legs on the
Warrior in the guard:

| Probe | At one step | Limit |
| --- | --- | --- |
| a planted root pose, pitch 0.3 rad over 0.3 s | pitched 0.064 rad after 1 s | 0.08 of 0.3 |
| the halt from 0.6 m/s | 0.159 m/s 0.6 s in | 0.15 |
| idle legs correcting a stagger | 0.384 m left | 0.06 |
| idle placement untwisting a turned footing | the fixture does not turn the soles | — |

The root pose is held at none; at one step the pelvis reaches the pitch, then swings slowly
between 0.04 and 0.51 rad over about 2 s. The swing shrinks with the step:

| Rate | The pitch each 0.1 s from 0.5 s to 3 s, rad |
| --- | --- |
| 120 Hz | 0.30 0.28 0.25 0.20 0.12 0.06 0.04 0.06 0.36 0.44 0.47 0.51 … 0.36 |
| 240 Hz | 0.31 0.31 0.31 0.30 0.29 0.28 0.27 0.26 0.25 … 0.32 |
| 480 Hz | 0.24 0.26 0.27 0.28 0.29 0.29 … 0.30 |

Delaying only some channels at 120 Hz: the legs alone (hips, knees, ankles) or the arms alone
overshoot to 0.45 rad and settle at 0.29; the spine alone (lumbar, thoracic) swings the pelvis
from -0.33 to 0.47 rad. The hold's torques are 13 to 45 N m at the hips and the spine at either
delay; the pelvis, light between them, is what swings.

**The stand-up target** ([rising](rising.md#the-owners-target), `npm run evaluate -- rising-target`):

| Group | Stood, none | Stood, one step | Within 12 s, none | Within 12 s, one step |
| --- | --- | --- | --- | --- |
| Warrior, club | 16/16 | 13/16 | 10 | 6 |
| Warrior, empty | 16/16 | 16/16 | 14 | 6 |
| Rogue, club | 11/16 | 11/16 | 2 | 0 |
| Rogue, empty | 13/16 | 10/16 | 4 | 0 |
| all, time to stand (a fall not stood at the cap) | 12.6 s | 18.6 s | | |

At one step one fall of 64 was not made.

## Tried and not kept

Each a prediction of what motor control reads, made for its step and undone after it, on the root
pose's probe at 120 Hz:

- **The joints' angles a step ahead** (angle plus rate times the step): the same swing.
- **The segments' poses at constant velocity**: settles at 0.39 rad, 0.09 off.
- **The segments' poses and velocities and the joints' angles at constant velocity**: settles at
  0.33 to 0.37 rad, at the limit.
- **The same, each velocity changed as much as over the last step**: the body falls; the change
  over one step is noise.

What is left to try: the motion the motor's solve planned for the command in flight (its joints'
and its root's accelerations), carried through each segment's velocity and pose, on the mind's own
copy of its body, which the minds' split builds
([minds in parallel](../plans/2026-11-01-parallel-minds.md), step 3).
