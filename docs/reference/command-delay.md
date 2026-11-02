# The command delay

The game's delay is one step (`COMMAND_DELAY`, `src/core/world.ts`;
[the architecture](../architecture.md#the-command-delay)). A mind a step late holds balance and
the rise when it is split in two: **its step decides its intent a step late, and its body's motor
part has its skills make the command from that intent on the body as it is** (`Mind.move`,
`SplitDriver`), on the senses the intent was decided on. Every gate probe passes; the walk falls
as often as at none; the stand-up stands within the fall-set's spread of none. The trained
strikes land less often than at none and are on the table's fine-tune list.

## What is used

- **The delay as a rule** (`World.delay`, `delayLine`): any whole number of steps, every world.
  The game's is one step, the owner's decision (`owner-command-delay`).
- **The motor part** (`Mind.move`, `motorPart`, `think`): with a delay, each step the motor part
  moves on the body as it is and its command is taken, then the mind steps on the same body; what
  the step sends goes with the next step's command, and the rings hold it the rest of the delay
  (`heldSteps`). With no delay the step decides and the motor part moves in the same step.
- **The split driver** (`SplitDriver`, `src/core/body.ts`): a driver decides on the view
  (`decide`) and carries the decision out (`carry`). The command layers' motor part reads the body
  (`feel`), has the driver carry out what it decided a delay before (`pending`, in their state) and
  runs motor control; their step only decides. A mind driven by its decider (`driveBy`) decides
  its intent, and its skills (`Skills.command`: the arbiter, the legs, the guard, the actions,
  the ground techniques, the lowering) make the command from it fresh. A driver that is one
  function decides its command whole.
- **The senses as decided on** (`Mirror.sense`, `Mirror.seen`, `Mirror.recall`): the mirror reads
  its body (`refresh`) apart from its senses, which it reads after the motor part has moved, so
  the motor part reads the senses its intent was decided on; what they showed is kept in the
  body's state, by each body's id, and shown again after a load. The motor part reads no fresh
  senses (`motorPart` refuses them).
- **The quadruped's motor part** (`quadrupedLayers`' `move`): the gait's last command, or the
  righting, on the body as it is: a step late at most, so its layers refuse a longer delay.
- **The mirror keeps what its mind asked** (`Mirror.command`, saved with the body) from step to
  step and drops it as its body leaves `full` (`Mirror.idle`); it shows its body after every step
  and again after a load (`World.loaded`), so a fork or a replay is the bout to the bit.
- **Contacts cross as numbers**: the mirror's writer has the engine tell it each segment's
  contacts and manifolds number by number (`PhysicsWorld.tellContacts`, `tellManifolds`,
  `ContactSink`), so a step on mirrors makes no contact objects for the writer. The step's
  allocation holds its ceilings at one step (`tests/core-step-cost.test.mjs`): the standing body
  109 KiB (ceiling 124), the body lying 77 (ceiling 82).

## Measurement

With the delay at one step and at none; Node, the core world, Rapier, 120 Hz, at the switch's
commit against 8411a492 (the motor-program version, its delay set to one step) and at none.

**The gate's probes** (`tests/probes.test.mjs`): every probe passes at one step. The halt from
0.6 m/s reads 0.089 m/s at its moment (limit 0.15); the kneel 0.164 m (limit 0.2); the heading at
a run 0.372 rad, reported, as at none.

**The walk** (the Locomotion drill's `every`, 705 trials on the three bodies in every loadout):
10 trials fall at one step, 11 at none (the record at 629f7c3b). The Warrior falls in one, a turn
of 270 degrees; the Skeleton in nine, shoves and a turn.

**The stand-up** (`research/rise-trace.mjs`: the owner's target's 32 falls turned by the offsets
named, Option Mind's rise; [rising](rising.md#the-owners-target)), the Warrior, stood within 10 s:

| Offsets | None | One step, motor programs | One step, split |
| --- | --- | --- | --- |
| 0, 11.25 | 46 of 64 | 47 | 34 |
| 5.625, 16.875 | 41 of 64 | 41 | 41 |
| 2.8125, 8.4375, 14.0625, 19.6875 | | 79 of 128 | 85 |

The Rogue on 0 and 11.25: 6 of 64 at none, 11 with motor programs, 4 split; it stands 51 times
split, 50 at none. The falls stood within 10 s move by about six a draw of 64.

**The strikes' still rungs** (the Strike drill's `still`, 128 trials; the stomp's `stomping`, 12):

| Rung | Figure | None | One step, motor programs | One step, split |
| --- | --- | --- | --- | --- |
| `option/straight-punch` | landed | 0.203 | 0.000 | 0.047 |
| | energy, J, median | 34.8 | 4.6 | 12.5 |
| `option/club-blow@empty,club` | landed | 0.047 | 0.023 | 0.008 |
| | energy, J, median | 60.5 | 25.0 | 20.4 |
| `option/stomp` | landed | 0.25 | 0.167 | 0.167 |
| | fell | 0 | 0.083 | 0.083 |

The punch is refused more often at one step (81 of 128 against 66) and lands on 6 against 26: its
policy was trained at none. The punch, the club and the stomp are fine-tuned at one step in the
table's pass ([Option Mind on every body](../plans/2026-11-01-option-mind-everywhere.md)).

**The fingerprint** at one step against none moves 18 cases: the ten arena cases (the
`straight-punch` data case among them), the four stands, the Crypt's seeds 1 and 2 and the Lab's
run circle on the Warrior and the Rogue. At none the split moves no case.

## Tried and not kept

- **Motor programs** (`Body.program`, `BodyCommand.programs`; 8411a492): the step decided the
  whole command a step late, and the ground techniques and the lowering ran fresh in the motor
  part beside it. The stand-up held as well as split; the strikes, their pushes and points worked
  out on the body a step old, landed least (the punch none of 128).
- **The ground techniques decided a step late** (the goals late, no motor program): the Warrior
  stood 60 of 64, 26 within 10 s, median 10.55 s, the steadying timing out 22 times. A technique
  that reacts to the body's motion each step does not survive the delay.
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
- **Judging the body down again after the carried command** (its height held and stance asked):
  the land mode no longer begins and ends each step (1692 times on 64 falls), and the stand-up
  reads the same (35 of 64 within 10 s on 0 and 11.25).
