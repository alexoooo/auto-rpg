# The command delay

The game's delay is one step (`COMMAND_DELAY`, `src/core/world.ts`;
[the architecture](../architecture.md#the-command-delay)). A mind a step late holds balance and
the rise when it is split in two: **its step decides its intent a step late, and its body's motor
part has its skills make the command from that intent on the body as it is** (`Mind.move`,
`SplitDriver`), on the senses the intent was decided on, and a body is born on the first step its
decision is carried out. Every gate probe passes; the walk falls as often as at none; the
stand-up stands as often as at none; the punch's networks, trained at none, land at one step
without a fine-tune.

## What is used

- **The delay as a rule** (`World.delay`, `delayLine`): any whole number of steps, every world.
  The game's is one step, the owner's decision (`owner-command-delay`).
- **The motor part** (`Mind.move`, `motorPart`, `answerOn`): with a delay, each step the motor part
  moves on the body as it is and its command is taken, then the mind steps on the same body; what
  the step sends goes with the next step's command, and the rings hold it the rest of the delay
  (`heldSteps`). With no delay the step decides and the motor part moves in the same step.
- **Birth at the first decision carried out** (`BodyView.born`, the command layers' `move`): at a
  delay a body's time starts on the first step its driver's decision is carried out, not the step
  before, when the motor part first reads it, so what the legs take at birth they take from the
  body as it was built: its facing (`locomotion`). The probes' rig builds its body turned a radian
  (`tests/harness/probes.mjs`); taken a step early, the legs keep heading 0 and turn the pelvis of
  every body built facing elsewhere toward it, 34 degrees in 0.2 s on the Warrior, and every legs
  probe fails.
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

With the delay at one step and at none; Node, the core world, Rapier, 120 Hz, at 25d720b9 (each
body born on its first decision carried out) unless named; the motor programs at 8411a492, their
delay set to one step.

**The gate's probes** (`tests/probes.test.mjs`): every probe passes at one step. The halt from
0.6 m/s reads 0.089 m/s at its moment (limit 0.15); the kneel 0.164 m (limit 0.2); the heading at
a run 0.372 rad, reported, as at none.

**The walk** (the Locomotion drill's `every`, 705 trials on the three bodies in every loadout):
11 trials fall at one step (`assets/evaluations/locomotion/2026-11-03-25d720b9-cf6cbec6.jsonl`),
11 at none (the record at 629f7c3b). At one step the Warrior falls in three turns, the Rogue in two
shoves of 43.7 N s, the Skeleton in six, shoves, turns and a walk.

**The stand-up** (`research/rise-trace.mjs`: the owner's target's 32 falls turned by the offsets
named, Option Mind's rise; [rising](rising.md#the-owners-target)), the Warrior, stood within 10 s:

| Offsets | None | One step | One step, motor programs (8411a492) |
| --- | --- | --- | --- |
| 0, 11.25 | 39 of 64 | 43 | 47 |
| 5.625, 16.875 | 38 of 64 | 38 | 41 |
| 2.8125, 8.4375, 14.0625, 19.6875 | 75 of 128 | 82 | 79 |

The Rogue on 0 and 11.25: 6 of 64 at none, 8 at one step; it stands 50 times at none, 48 at one
step. The falls stood within 10 s move by about six a draw of 64.

**The punch held out** (`research/punch-policy-check.mjs`, the asset networks, trained at none;
320 held-out trials a rate, landed; none fell):

| Body, seed | Rate | None | One step |
| --- | --- | --- | --- |
| Warrior, 5001 | 120 Hz | 225 | 228 |
| | 480 Hz | 247 | 253 |
| Rogue, 7001 | 120 Hz | 106 | 102 |
| | 480 Hz | 158 | 172 |

**The strikes' still rungs** (the Strike drill's `still`, 128 trials) at one step: the punch is
admitted 60 times and lands 35 (`assets/evaluations/strike/2026-11-03T011806-25d720b9-4635c08b.jsonl`;
none at f0c6807c: 62 and 31); the club blow with the buckler lands 6, admitted 16 (`786b1ad8`). The
stomp's `stomping` lands 4 of 12 at one step, none fallen (252a17eb). A club is swung, not punched
with: the punch's drive thrown with the club's head gives way to a swing, trained at the game's
delay.

**The profiles** are measured at one step at 25d720b9, each body born on its first decision
carried out, a blow's line clear of a guard by the fist's radius and the Rise drill's techniques in
the motor part: the punch's and the club blow's, the gaits' and the Rise drill's edges
(`assets/core/strike-profiles.json`, `gait-profiles.json`, `edge-profiles.json`); the stomp's
are its record at 252a17eb. A profile names the delay it was measured at (`Measured.delay`,
`staleness`), so one measured at another delay is stale and not read. Measured at none, the
Warrior's punch profile kept Option Mind from striking a still foe 0.9 m off (no strike in 8 s);
measured at one step, it strikes from 2.7 s.

**The Gait drill** (`stopped`, 20 trials on the Warrior): 20 ready at one step, none fallen
(`assets/evaluations/gait/2026-11-03-25d720b9-ab561cd7.jsonl`).

**The rise's edges hold at one step as at none.** The Rise drill plays each technique in its
body's motor part, as the game's ground actions run (`groundExecutor`), so a technique's command
reaches the muscles the step it is made (`src/evaluation/technique.ts`). The Warrior,
empty-handed and with the buckler and the club, done of begun; none at 84e7c898:

| Edge | Placed, none | Placed, one step | Moving, none | Moving, one step |
| --- | --- | --- | --- | --- |
| `staged-roll` | 36 of 36 | 36 of 36 | 8 of 8 | 7 of 7 |
| `staged-down` | 12 of 12 | 12 of 12 | 10 of 12 | 8 of 12 |
| `sit-back` | 12 of 12 | 12 of 12 | 4 of 6 | 7 of 11 |
| `front-sit-back` | 7 of 12 | 7 of 12 | 8 of 12 | 4 of 12 |

The front sit-back's moving cases on 72 seeds of each loadout (the drill's six, then 7 to 72) are
76 of 144 done at one step against 81 at none. Run in the mind's decision instead, a technique's command came a step late, and the sit-back
stood 6 of 10 and the front sit-back 1 of 12 (51aaf4d2, empty-handed, the two rungs together).

**The standard match** (`npm run match -- option bare`, protocol 908550df542eb469; ten minutes'
budget): Option Mind wins every unit played against the bare mind at one step as at none, by a
margin of 0.251 (0.214 to 0.290) over 34 units at ca5d8e8a, against 0.241 over 30 units at
8411a492 with no delay.

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
