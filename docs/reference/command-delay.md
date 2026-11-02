# The command delay

A mind a step late holds the game's balance and the rise when it is split in two: **its step
decides a step late, and its body's motor part carries the decision out on the body as it is**
(`Mind.move`). At one step (`COMMAND_DELAY`, `src/core/world.ts`;
[the architecture](../architecture.md#the-command-delay)) every gate probe passes, the halt
included; the walk falls as often as at none; the stand-up stands within the fall-set's spread of
none. The game's delay is none until the owner's switch.

## What is used

- **The delay as a rule** (`World.delay`, `delayLine`): any whole number of steps, every world.
  The game's is 0, the owner's decision held until the switch (`owner-command-delay`).
- **The motor part** (`Mind.move`, `motorPart`, `think`): with a delay, each step the motor part
  moves on the body as it is and its command is taken, then the mind steps on the same body; what
  the step sends goes with the next step's command, and the rings hold it the rest of the delay
  (`heldSteps`). It reads its own body, never its senses (`motorPart` refuses them). With no delay
  the step decides and the motor part moves in the same step.
- **The command layers' motor part** (`commandLayers`' `move`): the stance's and the ground's
  reads, the command decided a delay before (`pending`, in their state) and motor control. What
  the step decides is a command; how the body carries it out is read fresh.
- **Motor programs** (`Body.program`, `BodyCommand.programs`, `ActionClaim.program`,
  `LegsDrive.program`): a technique whose every step is a reflex of the body's motion runs in the
  motor part, its pushes given beside the command's. The ground techniques (`GROUND`,
  `src/core/recovery/ground/held.ts`) and the lowering (`LOWERING`,
  `src/core/recovery/rise/lowering.ts`) run so; which technique runs, and when it ends, the step
  decides.
- **The quadruped's motor part** (`quadrupedLayers`' `move`): the gait's last command, or the
  righting, on the body as it is: a step late at most, so its layers refuse a longer delay.
- **The mirror keeps what its mind asked** (`Mirror.command`, saved with the body) from step to
  step and drops it as its body leaves `full` (`Mirror.idle`); it shows its body after every step
  and again after a load (`World.loaded`), so a fork or a replay is the bout to the bit.

## Measurement

With the delay at one step and at none; Node, the core world, Rapier, 120 Hz, at 7c48c488 (main
at 536e2861 merged).

**The gate's probes** (`tests/probes.test.mjs`, `tests/idle-settle.test.mjs`): every probe passes
at one step. The halt from 0.6 m/s reads 0.04 m/s at its moment (limit 0.15); the kneel 0.177 m
(limit 0.2; 0.15 at none); the heading at a run 0.313 rad, reported, as at none. The whole gate
passes at one step but the step's allocation: the standing body 127 KiB a step (ceiling 124, 104
at none), the body lying 98 (ceiling 82, 66 at none), the mirror's reads of the body and its
contacts.

**The walk** (the Locomotion drill's `every`, 705 trials on the three bodies in every loadout):
12 trials fall at one step, 11 at none (the record at 629f7c3b). At one step the Warrior falls in
none; the Rogue in one, the largest shove from the front empty-handed, as at none; the Skeleton
in eleven, holding the club alone, as at none.

**The stand-up** (`research/rise-trace.mjs --offsets 0,11.25`: the owner's target's 32 falls and
32 more turned by 11.25 degrees, Option Mind's rise; [rising](rising.md#the-owners-target)):

| Body | Delay | Stood | Within 10 s | Median |
| --- | --- | --- | --- | --- |
| Warrior | none | 64 | 46 | 8.62 s |
| Warrior | one step | 62 | 47 | 8.17 s |
| Rogue | none | 50 | 6 | 15.96 s |
| Rogue | one step | 45 | 11 | 14.88 s |

The falls stood move by about six between draws of falls.

## Tried and not kept

- **The ground techniques decided a step late** (the goals late, no motor program): the Warrior
  stood 60 of 64, 26 within 10 s, median 10.55 s, the steadying timing out 22 times. A technique
  that reacts to the body's motion each step does not survive the delay; as a motor program it
  does.
- **Motor control a step late, its body forecast** (each channel carried toward the speed its
  command was solved for, `Mirror.forecast`; the body pulled toward that speed by a velocity motor
  held within 3 % of the channel's strength, `PLAN_REFLEX`; the forecast stopped by contacts other
  than the legs' ends): every probe but the halt (0.26 to 0.98 m/s at its moment over six moments
  of the walk), and the stand-up 51 to 52 of 64 against 56 at none, 15 to 17.5 s against 12.6.
  The pelvis is a light root between the lumbar spine and the hips, whose torques cancel within a
  step: solved for a body a step old, they swing against each other every other step, and a
  forecast that does not know the body's contacts cannot follow the body through a strike or a
  near touch. Read at 3bfa0efe (`docs/reference/command-delay.md@3bfa0efe` holds its tables).
- **A stretch reflex in the muscle driver**, the joint's servo closed by the body on the joint as
  it is when the command is applied, in six forms: each worse than the delay alone
  (`docs/reference/command-delay.md@39935459`).
- **Predicting the body a step ahead** from the joints' rates, the segments' motion at constant
  velocity, or with each velocity changed as over the last step: the root pose's probe fails or
  the body falls.
