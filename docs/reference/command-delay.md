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

**A stretch reflex in the muscle driver**, the joint's servo closed by the body on the joint as
it is when the command is applied: each servoed freedom's command carrying its natural rate, the
angle and rate it was solved at and the acceleration solved, and the driver adding the servo's
damped pull on the joint's motion since to the commanded torque. With no delay it adds nothing (the
gate's probes read as before). At one step, on the gate's probes and the idle settle (each legs on
the Warrior in the guard, Rapier, 120 Hz, at 39935459; 18 cases):

| The reflex's torque | What failed |
| --- | --- |
| none (the delay alone) | the root pose (0.064 rad), the halt (0.159 m/s), the stagger (0.384 m), the untwist's fixture |
| the pull times the inertia beyond the joint, on its own freedom | those, and the walk (0.237 m/s of 0.5), the footing (0.667 m), the height (0.177 m), the centre (0.186 m), the kneel and the swing (0.162 m) |
| the same, the joint's errors turned into the freedom's speed (`turning`) | the root pose (0.486 rad), the walk (0.145 m/s), the footing, the height, the centre and the swing |
| the pull turned, times the mass matrix, as the servo forms its torques | the root pose met; the walk (0.174 m/s), the centre (0.227 m), the height, the swing and the elbow's posture |
| the same, about the motion solved rather than the angle solved at | 12 of the 18 cases; the root pose (0.385 rad), the halt (0.663 m/s) |
| the same, in the servo's solve only, not the whole-body solve's | 9 of the 18 cases; the root pose (0.427 rad), the halt (1.01 m/s), the stagger (0.478 m) |

Each was worse than the delay alone, so none was kept. A reflex closed at the joint pulls on the
motion of a body whose light pelvis carries the root: what it adds at the spine and hips the
whole-body solve, a step late, does not know of.

**What the swing is.** Read every step on the root pose's probe at one step, the lumbar spine flexes
at a steady 0.84 rad/s on past where, with no delay, it slows to its posture: no faster ringing,
and the hips then straighten the knees to their stops and the root rises 0.1 m. The assist is not
in it (the probes run with none; given at once, the readings are the same) and neither are the
bearing legs (a reflex left off them changes nothing).

What is left to try: the motion the motor's solve planned for the command in flight (its joints'
and its root's accelerations), carried through each segment's velocity and pose on the mind's own
copy of its body (`mirrorBody`, `src/core/mind/mirror.ts`).
