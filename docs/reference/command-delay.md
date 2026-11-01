# The command delay

A body's command applied a step after it is sent (`COMMAND_DELAY`, `src/core/world.ts`;
[the architecture](../architecture.md#the-command-delay)) costs the toed Warrior's balance at
120 Hz. A mind a step behind now reads its body as its commands in flight will leave it, and its
body corrects what the late command could not see. With both, the planted root pose, the walk, the
footing, the swing and the stagger hold at one step; the halt and the heading at a run do not. So
the game's delay stays none.

## What is used

- **The delay as a rule** (`World.delay`, `delayLine`): any whole number of steps, every world.
  The game's is 0, the owner's decision held until the condition below is met (`owner-command-delay`).
- **Its condition**: one step, once the gate's probes and the stand-up target read at one step as
  they read at none ([below](#measurement)).
- **The forecast**: motor control records the motion each command was solved for
  (`MuscleDriver.planned`), and a mind with commands in flight carries its mirror through them
  before it steps (`Mirror.forecast`, `embody`). With no delay it does not run.
- **The plan's reflex**: a torque a late command gives is a velocity motor toward the speed the
  command expects (`MuscleDriver.expect`), held within `PLAN_REFLEX` (0.03) of the channel's
  stronger side around that torque (`driveMuscles`). The forecast moves each channel toward that
  speed only as far as the reflex can: the margin over the inertia beyond the joint
  (`BodyDynamics.mass`). The engine's velocity motor takes a torque window that excludes zero
  (`EngineJoint.setMotorBounds`). The share is the owner's to set; 0.03 reads best of 0.015 to 0.2
  ([below](#the-forecast-and-the-reflex)).

## What drifts

The pelvis is the root, and it is light between the lumbar spine and the hips, whose torques (13 to
45 N m in the hold) must cancel within the step. Motor control computes those torques for the
motion it asks; an error in them turns the pelvis by the error over its small effective inertia
(about 0.03 kg m^2 in that mode). A constant ±0.5 N m on the lumbar flexion alone fails the root
pose's probe at no delay, and not monotonically in the offset. A step late, the torques are solved
for a body a step old: the lumbar spine and the hips swing against each other every other step,
the root's spin changing ±20 rad/s^2 a step and the swing growing about 16 % a step.

On the walk, at no delay, each channel ends its step within 0.07 to 0.10 rad/s of the speed its
command was solved for (mean over the walk), up to 6 rad/s at a foot's strike. A step late with the
forecast alone, the forecast is as close until the first lift-off into single support (0.49 s);
there the same lumbar-and-hips swing starts at 0.3 to 0.5 rad/s and grows 2.3 times a step.

## Measurement

At the branch's head with the delay at one step; Node, the core world, Rapier, 120 Hz.

**The gate's probes** (`tests/probes.test.mjs`, `tests/idle-settle.test.mjs`), each legs on the
Warrior in the guard:

| Probe | The delay alone | With the forecast | With the forecast and the reflex | Limit |
| --- | --- | --- | --- | --- |
| a planted root pose, pitch 0.3 rad over 0.3 s | pitched 0.064 rad | 0.34 | met | 0.08 of 0.3 |
| the walk's heading | met | 0.284 rad off | met | 0.15 |
| the footing | met | 0.05 m | met | 0.04 |
| the swing | met | 0.058 m | met | 0.03 |
| the halt from 0.6 m/s | 0.159 m/s 0.6 s in | 0.461 | 0.768 | 0.15 |
| the heading at a run | met | — | 1.237 rad off at 1.19 m/s | 0.05 |
| idle legs correcting a stagger | 0.384 m left | — | met | 0.06 |
| idle placement untwisting a turned footing | the fixture does not turn the soles | — | met | — |
| two Lab shoves of 90 N s, stood again | — | — | not stood by the cap | stood |

At one step with the forecast and the reflex, the halt's stopping step lands, but the body does not
brake in the double support after it: at no delay the stance's speed falls from 0.6 to 0.22 m/s
in 0.4 s; at one step it stays at 0.55 to 0.6 m/s and the legs step again, 0.9 m/s by the
probe's end.

At no delay the forecast and the reflex do not run; the gate passes, and the fingerprint
(`scripts/fingerprint.mjs`) against `79657d69` moves no pose (the bouts' saved state carries the
commands' plans in flight, so it is reshaped).

**The stand-up target** ([rising](rising.md#the-owners-target), `npm run evaluate -- rising-target`),
at `580880fb` with the delay alone; not read with the forecast and the reflex, whose probes fail:

| Group | Stood, none | Stood, one step | Within 12 s, none | Within 12 s, one step |
| --- | --- | --- | --- | --- |
| Warrior, club | 16/16 | 13/16 | 10 | 6 |
| Warrior, empty | 16/16 | 16/16 | 14 | 6 |
| Rogue, club | 11/16 | 11/16 | 2 | 0 |
| Rogue, empty | 13/16 | 10/16 | 4 | 0 |
| all, time to stand (a fall not stood at the cap) | 12.6 s | 18.6 s | | |

### The forecast and the reflex

The probes at one step with the forecast and the reflex, by the reflex's share (`PLAN_REFLEX`):

| Share | What failed |
| --- | --- |
| 0.015 | the halt (0.664 m/s) and the Lab shoves |
| 0.03 | the halt (0.768 m/s), the heading at a run, the Lab shoves |
| 0.05 | the halt (0.649 m/s), the centre beyond the soles (0.09 m) |
| 0.1 | the pose (0.528 rad), the footing (0.573 m), the halt, the centre, the height, the untwist |

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

Each was worse than the delay alone. A reflex closed at the joint pulls on the motion of a body
whose light pelvis carries the root: what it adds at the spine and hips the whole-body solve, a
step late, does not know of.

**The forecast with the plan's reflex, read otherwise** (at one step, the probes):

- **The forecast taking each command's planned accelerations as given**, the reflex at 0.03 to 0.1:
  the forecast misses what the reflex corrects, and the lumbar spine and hips chatter every other
  step (0.13 to 0.8 rad/s); the centre beyond the soles (0.449 m), the heading at a run (2.64 rad),
  the height and the effectors fail.
- **The forecast taking each channel to the speed expected, unbounded**: the forecast runs away
  from the body when the reflex cannot reach that speed, and the mind with it (the halt read
  2707 m/s on the mind's view, the body under 3 m/s); at 0.2 most probes fail.

What is left to try: the halt's braking in double support a step late, read every step against the
same halt at no delay; and contacts in the forecast (a foot's strike or lift-off is read a step
late).
