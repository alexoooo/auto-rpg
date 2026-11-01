# The command delay

A body's command applied a step after it is sent (`COMMAND_DELAY`, `src/core/world.ts`;
[the architecture](../architecture.md#the-command-delay)) costs the toed Warrior's balance at
120 Hz. A mind a step behind reads its body as its commands in flight will leave it, while the
body touches as it did when they were made, and its body corrects what the late command could not
see. With both, at one step, every gate probe holds but the halt (three of six moments walk on) and
the idle stagger (0.074 m of 0.06), and the stand-up stands 51 of 64 in 15.3 s, short of none's (56,
12.6 s). So the game's delay stays none.

## What is used

- **The delay as a rule** (`World.delay`, `delayLine`): any whole number of steps, every world.
  The game's is 0, the owner's decision held until the condition below is met (`owner-command-delay`).
- **Its condition**: one step, once the gate's probes and the stand-up target read at one step as
  they read at none ([below](#measurement)).
- **The forecast**: where the whole-body solve weighed the ground, motor control records the speed
  each channel's command was solved to reach (`MuscleDriver.expect`), and a mind with commands in
  flight carries its mirror's joints toward those speeds before it steps (`Mirror.forecast`,
  `embody`); the root moves as the joints and its own motion carry it. Only on its legs: while
  anything but its feet, paws or propped shins touches (`BodySpec.ends`), it reads the body as it
  was and its command expects nothing. A command made while the body touched otherwise than it
  touches now (a sole's strike or lift-off since, `touchingOf`) carries it no further. With no delay
  it does not run.
- **The plan's reflex**: a torque a late command gives is a velocity motor toward the speed the
  command expects, held within `PLAN_REFLEX` (0.03) of the channel's stronger side around that
  torque (`driveMuscles`). The forecast moves each channel toward that speed only as far as the
  reflex can: the margin over the inertia beyond the joint (`BodyDynamics.mass`). The engine's
  velocity motor takes a torque window that excludes zero (`EngineJoint.setMotorBounds`). The share
  is the owner's to set; 0.03 reads best of 0.015 to 0.1 ([below](#the-reflexs-share)).

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
there the same lumbar-and-hips swing starts at 0.3 to 0.5 rad/s and grows 2.3 times a step. The
reflex stops it: the solver holds the joint to the speed planned within the step.

## What chatters

Read step by step at one step (Node, the core world, Rapier, 120 Hz, the gate's probes, at
bd8ec5fc), the root's spin changes 8.6 to 8.9 rad/s rms a step in the walk, the halt and the run,
against 0.2 to 0.8 at none, its sign alternating on half the steps: the lumbar spine and both hips
counter-rotate at the pelvis (second difference of their speeds 18 to 26 rad/s rms, under 1 at
none). It starts at the first footstrike. The joints' speeds alternate first, under smooth commands;
then the commands follow (the lumbar's torque −108, +108, −112, +16 N m on successive steps). With
no forecast the walk's commands stay smooth (the root's change 0.66 rad/s rms). The forecast had
carried the command in flight across the strike as if the swing went on: the mind planned for a
body the impact had already stopped. Kept from it only while the body touches as when the command
was made, the walk's root changes 1.61 rad/s rms a step and the halt's 1.37.

## Measurement

With the delay at one step; Node, the core world, Rapier, 120 Hz.

**The gate's probes** (`tests/probes.test.mjs`, `tests/idle-settle.test.mjs`), each legs on the
Warrior in the guard:

| Probe | The delay alone | The forecast alone | As used | Limit |
| --- | --- | --- | --- | --- |
| a planted root pose, pitch 0.3 rad over 0.3 s | pitched 0.064 rad | 0.34 | met | 0.08 of 0.3 |
| the walk's heading | met | 0.284 rad off | met | 0.15 |
| the footing | met | 0.05 m | met | 0.04 |
| the swing | met | 0.058 m | met | 0.03 |
| the halt from 0.6 m/s | 0.159 m/s 0.6 s in | 0.461 | 0.611 | 0.15 |
| the heading at a run | met | — | met | 0.05 |
| idle legs correcting a stagger | 0.384 m left | — | met | 0.06 |
| idle placement untwisting a turned footing | the fixture does not turn the soles | — | met | — |
| two Lab shoves of 90 N s, stood again (seed 4) | — | — | stood, 7.5 s | 30 s |

As used, with the touch rule (at 00a042f5 and after): every probe above met but the halt (0.7 m/s
at its moment) and the idle legs' stagger (0.074 m left, limit 0.06); the kneel met. The reflex's
share again, with the rule: 0.015 fails the footing and the halt (1.32 m/s at worst of six); 0.05
the centre beyond the soles and the halt; 0.08 the footing, the height, the centre and the halt.

**The halt** read from six moments of the walk (the halt asked at 1.0 to 1.5 s, every 0.1 s): at
none, the stance's speed first falls under 0.15 m/s 0.21 to 0.54 s after it is asked, and is 0.04
to 0.25 m/s at 0.6 s; at one step without the touch rule, 0.57 to 1.1 s, and 0.02 to 0.63 m/s at
0.6 s; as used, 0.06 to 0.98 m/s at 0.6 s (0.33, 0.11, 0.7, 0.78, 0.98, 0.06), three of the six
walking on. The
probe's one moment reads either side of its limit as small changes move the gait's phase (0.17 to
2.4 m/s over the variants below), so it is read over the six. At both, the stance's speed after the halt is
asked does not depend on the moment: the step under way lands first, then the stance brakes in
double support and the centre of mass swings back over the soles (to 0.36 m/s at none, 0.54 to
0.81 m/s at one step). At one step with the delay alone it brakes as fast as at none (under
0.15 m/s 0.2 to 0.7 s after) but then walks away (0.9 m/s by 1.2 s): the forecast holds the stance
and costs the braking at the landing, where a foot's strike is read a step late.

**The stand-up target** ([rising](rising.md#the-owners-target), `npm run evaluate -- rising-target`):

| Group | Stood: none | the delay alone | without the touch rule | as used | Within 12 s: none | the delay alone | without the touch rule | as used |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Warrior, club | 16/16 | 13/16 | 14/16 | 14/16 | 10 | 6 | 3 | 7 |
| Warrior, empty | 16/16 | 16/16 | 15/16 | 15/16 | 14 | 6 | 6 | 13 |
| Rogue, club | 11/16 | 11/16 | 10/16 | 11/16 | 2 | 0 | 1 | 2 |
| Rogue, empty | 13/16 | 10/16 | 10/16 | 11/16 | 4 | 0 | 0 | 0 |
| all, time to stand (a fall not stood at the cap) | 12.6 s | 18.6 s | 17.3 s | 15.3 s | | | | |

Where the falls not stood at one step go wrong (without the touch rule; 15, 12 of them the Rogue's): their time is
spent in front (145 s), between positions (79), standing (70), on all fours (64) and on
the back (53); many reach standing two to ten times and fall from it. At none the 8 not stood spend
almost none of it standing. On four of the Rogue's falls traced through the rise (empty at 45 and
90 degrees, club at 225 and 315; three stood at none), the sit-back from the front finished 1 of 10
attempts at one step, most failing at the settle, against 2 of 7 at none; from all fours 1 of 7
against 1 of 5; the staged roll was interrupted at the settle at both.

The delay alone was read at `580880fb`; as used at 00a042f5, none at the same commit (56 of 64,
12.6 s, unchanged); 64 falls in 38 s on 8 workers. At no delay the forecast and the reflex do not run: the
gate passes, and the fingerprint (`scripts/fingerprint.mjs`) against the commit before moves no
pose (the bouts' saved state carries the commands in flight, so it is reshaped).

### The reflex's share

The probes at one step by `PLAN_REFLEX`, the forecast carrying the root as the solve planned it:

| Share | What failed |
| --- | --- |
| 0.015 | the halt (0.664 m/s) and the Lab shoves |
| 0.03 | the halt (0.768 m/s), the heading at a run, the Lab shoves |
| 0.05 | the halt (0.649 m/s), the centre beyond the soles (0.09 m) |
| 0.1 | the pose (0.528 rad), the footing (0.573 m), the halt, the centre, the height, the untwist |

On its legs, the root carried by the joints: at 0.02 the halt (0.63 m/s) and the Lab shoves; at
0.05 the halt (0.705) and the centre beyond the soles (0.114 m); at 0.08 six probes.

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

**The forecast and the plan's reflex, read otherwise** (at one step: the probes, the Lab shoves,
the stand-up target):

- **The forecast taking each command's planned accelerations as given**, the reflex at 0.03 to 0.1:
  the forecast misses what the reflex corrects, and the lumbar spine and hips chatter every other
  step (0.13 to 0.8 rad/s); the centre beyond the soles (0.449 m), the heading at a run (2.64 rad),
  the height and the effectors fail.
- **Each channel taken to the speed expected, unbounded**: the forecast runs away from the body
  when the reflex cannot reach that speed, and the mind with it (the halt read 2707 m/s on the
  mind's view, the body under 3 m/s).
- **The root carried as the solve planned it**, beside the joints: the solve weighs the root's
  spin at 1e-6 (`WEIGHT.spin`), so a plan's root spin is what is left over; in a stumble it reached
  600 to 1800 rad/s^2, the forecast followed it, and the mind's view ran away (1e37 m/s). Without
  it the root moves as the joints carry it.
- **The root set so the bearing segments stay still**: the legs' accelerations, carried through
  their levers, threw the root hundreds of m/s^2; the body fell standing.
- **Each forecast step scaled down to a bound on every segment's acceleration** (50 to 400 m/s^2,
  150 to 3000 rad/s^2): no runaway, but on the ground the bound held nearly every step (a pressed
  foot's or hand's plan reached 25 000 to 69 000 rad/s^2), and the body never stood from the
  shoves.
- **A command's saturation taken out of the speed expected** (activation over 1): none was.
- **Expecting from every solve, the servo's included**, on its legs: 37 of 62 stood, 21.8 s.
- **Expecting from the ground-weighed solve, with no rule on the legs**: 31 of 64 stood, 28.7 s.
- **On its feet alone** (the propped shins not counted, expecting from every solve): the kneel fails (0.273 m, limit 0.2).
- **The reflex kept on the ground**, the command expecting what the ground-weighed solve planned
  while the forecast still reads the body as it was: 50 of 63 stood, 16.5 s (0.68 to 0.88 of
  falls), within the spread of as used; it does not earn the moving part.
- **The same, expecting from the servo's solve too**: 14 of 63 stood, 30 s.

**Contacts in the forecast**, at one step:

- **The root solved so the points it is pushed at come to rest over the step**, by least squares
  with the joints' accelerations as the forecast has them: standing, the feet's contact jitter
  (about 0.08 m/s) over the step throws the light root about 9 m/s^2, since the joints are held and
  only the root moves to stop them; the face, the footing, the centre, the kneel and the points fail.
- **The root solved so each segment it bears on keeps its motion** (no rest asked): the root
  chatters as before (8.2 rad/s rms a step in the halt), the walk slows to 0.29 m/s.
- **The forecast and the reflex on the ground too**, the touch rule guarding them: the kneel fails
  (0.285 m), the halt 0.88 m/s.
- **No reflex, with the touch rule**: the face, the footing and the halt fail.

**The halt and the steadying**, at one step, the touch rule in (Node, the core world, Rapier,
120 Hz, at 220b67c8). The halt over the six moments, m/s at 0.6 s and at 1.2 s; the Rogue's 32
target falls through `research/rise-trace.mjs`, the steadying after a rise done, failed or timed
out, and the falls stood:

| Variant | The halt at 0.6 s | at 1.2 s | Steadyings done / failed / timed out | Rogue stood |
| --- | --- | --- | --- | --- |
| none, for reference | 0.07, 0.09, 0.05, 0.08, 0.17, 0.24 | 0.02 to 0.14 | 25 / 8 / 0 | 23 |
| as used | 0.33, 0.11, 0.70, 0.78, 0.98, 0.06 | 0.14 to 1.09 | 13 / 0 / 15 | 21 |
| a halted walk's step kept where the body needs it to stop | 0.20, 0.10, 0.41, 0.35, 0.19, 0.54 | 0.02 to 0.12 | | |
| the walk's alternation ended when the halt drops its step | 0.36, 0.16, 1.00, 0.70, 0.43, 0.03 | 0.01 to 0.44 | | |
| the alternation kept when the halt drops its step | 0.14, 0.14, 0.31, 0.30, 0.32, 0.74 | 0.10 to 0.64 | | |
| a rolled foot kept rolled while the plan's capture point is past its end | 0.21, 0.05, 0.42, 0.31, 0.19, 0.06 | 0.04 to 0.30 | | |
| no stepping out of the nearer foot | 0.08, 0.06, 0.36, 0.26, 0.18, 0.21 | 0.01 to 0.06 | | |
| the nearer steps out only from a far foot the ground pushed (`StanceReading.touching`) | 0.33, 0.11, 0.36, 0.26, 0.18, 0.06 | 0.03 to 0.30 | | |
| the forecast's body moved whole so its pressed points keep their motion | 0.14, 0.27, 0.23, 0.17, 0.10, 1.01 | 0.08 to 1.22 | | |
| the same, and turned whole so their segments keep their spin | 0.05, 0.14, 1.10, 1.06, 0.98, 0.76 | 0.10 to 3.33 | | |
| the forecast's centre kept going as it was (momentum) | 0.51, 0.46, 0.42, 0.60, 0.86, 0.04 | 0.04 to 0.94 | | |
| the forecast's root carried by the plan's root acceleration (`ask.root`) | 0.23, 0.10, 0.27, 1.32, 0.12, 0.10 | one fell | | |
| each late torque the mean of its command and the last | 0.10, 0.05, 1.07, 0.88, 0.72, 0.04 | 0.02 to 0.17 | 8 / 0 / 18 | 21 |
| no forecast | 0.07, 0.09, 0.04, 0.50, 0.57, 0.45 | one fell | 11 / 3 / 14 | 21 |
| no reflex | 0.23, 0.05, 0.23, 0.50, 0.35, 0.14 | 0.03 to 0.85 | 17 / 2 / 12 | 22 |
| the root's spin weighed 1e-5 under the wrench (`WEIGHT.spin`) | | | 7 / 3 / 18 | 20 |
| the same at 1e-4 | | | 7 / 3 / 21 | 23 |
| the reflex's share 0.1 | | | 14 / 1 / 12 | 24 |
| the reflex's share 0.2 | | | 14 / 2 / 13 | 22 |
| the forecast and the reflex on the ground too | | | 19 / 4 / 8 | 19 |

The steadying column, and the rows from the plan's root acceleration down, were read with the
far-foot rule (the eighth row) in as well. The nearer foot stepping out only from a loaded far
foot ends the walking on (each halt stops by
1.2 s) but not the late stop at 0.6 s. It moves the stand-up at none by one fall each way: 55 of
64 for 56 at the standard falls, 48 for 49 at the fresh. So it is not kept. Of the rest, no row
holds the six halts at 0.6 s nearer none's, and none is near none's steadying.

**Why the halt walks on.** In all six starts the halt meets the walk planning its next step in
double support. The halt drops that step; in the same pass the stance plans it again, because the
capture point is outside, and with the other foot. Its pre-swing rolls the loaded front foot
onto its toes, and the halt drops that step too (at none as well). Rolled, the front foot bears on
its front edge (`bearingOf`). At none its heel rises as the body brakes over it, and it stays
rolled until the body has stopped. At one step its ankle holds near 0.23 rad and the heel stays
down. The foot unrolls 0.09 s later, its held region falls back to what the ankle holds flat, and
the capture point is 0.056 m outside it. A recovery step follows: the nearer, loaded foot steps
out from the unloaded far one (`recoveryStep`), and the body speeds up over the swing, from
0.38 to 0.73 m/s. Without the forecast, three of the six halts stop as at none.

**Why the stand-up falls after rising.** The Rogue's losses at one step are in the steadying after
a rise (`stanceSteady`): 15 of its 28 time out at 3 s, against none of 33 at none. The falls stood
rise to standing more often before their last time (83 times against 17 at none, all 64 falls,
the far-foot rule in), and the falls not stood spend 81 s standing against 17. Through a timed-out steadying the pelvis
spins 4 rad/s on average, against 1.9 in a steadying done at none. It comes in bursts of a few
tenths of a second that grow out of a small alternation step by step: the same period-two swing
as the walk's. Most of it is in the lumbar, thoracic, hip and neck flexion, and the wrists
(second difference 18 to 29 rad/s^2 rms, against 2 to 8 at none, there mostly the ankles). The
Warrior and the Rogue stood on the core stand, lowered by up to 0.45 m, do not chatter (pelvis
0.02 rad/s). No variant above brings the steadying near none's, the forecast off and the reflex
off included. Next to try:
the steadying's start, where hands and knees leave the ground and the forecast begins.
