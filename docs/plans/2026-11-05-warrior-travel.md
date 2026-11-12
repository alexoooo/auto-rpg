# Warrior travel

## Goal

The Warrior travels as fast as it can forward, moves in every direction, steers while moving,
takes corners, reverses direction and stops, each as quickly as it can and with as few falls. Travel uses its own speed
and turning limits; the braced walk remains available for fighting. Travel never steps by the
braced walk (the stance's walk): the Run starts from a stand, goes slow, turns and stops by its own
controller, and the stance only holds the body standing between orders.

Train and confirm on the game's toed Warrior, unassisted. Use existing gait implementations,
records and training checkpoints as seeds, replayed on this body before reuse; their
readings on this body are the baseline, taken before the body or controller changes. Every body
change is read on recovery as well.

This plan owns the Warrior's movement: the table's `run` row on `workshop-fighter`. Warrior
recovery is serviceable for this work: a change here that costs recovery reports the cost beside
its gain.
Body and controller changes serve travel and recovery together. A changed toe or other body part
retains the recovery capability; calibrate and read both skills on the changed body before keeping it.

## Movement contract

Movement direction is independent of facing. Held facing keeps the pelvis within 20 degrees of
the requested facing throughout movement and stopping. With facing free, travel turns toward its destination
and runs forward. With facing held, it moves in the requested direction relative to that facing,
using a declared safe speed for that direction. Test both contracts; turning around and running
forward does not demonstrate backward movement with facing held.

Publish a travel envelope per loadout: safe speed by direction and safe turning rate by speed.
The controller brakes before exceeding that envelope, then accelerates as the turn permits.
Changing orders while moving uses the body's current motion; it does not restart from rest.
Keep body-specific settings in the Warrior's records and pass immutable overrides to experiments.

### Start, slow paces and the stop

The Run owns the body from the order to the stand at its end. Today it walks by the stance's walk
until the body has faced the way asked for 0.6 s and has come near the walk's top pace or faced
it 2 s (`RUN_SWITCH`), and hands the body back to that walk to slow and stop; that handover goes.

The clip cycle cannot take these phases: it places no foot by balance
([the approaches](../approaches.md#travel)). A controller that places each foot from the capture
point takes them, hands the cycle a body at its slowest clip's pace (2.75 m/s) and takes it back
below that pace:

- **Start from a stand**: the first steps placed from the capture point toward the way asked,
  each longer than the last, the pace rising to the cycle's.
- **Turn while starting**, never on the spot: a way up to 90 degrees off by a step turn, the first
  foot landing turned toward it; a way behind by a spin turn on the standing foot.
- **Slow paces**: short places, a slot beside a door, the navigator's slow approach. Facing held,
  the other directions step the same way.
- **The stop**: steps placed to bring the capture point between the feet, then the stance holds the
  body standing.

Two candidates have that mechanism: a capture-point stepper built to accelerate, and the travel
actor with the swing foot's landing in its action, trained on starts from rest. The stance's foot
placement walks to about 1.7 m/s with no push-off, short of the cycle's 2.75 m/s, so a stepper on
it needs push-off or a handover the actor carries at a lower pace. Each candidate is played on the
Start cases first, for minutes, and the one that starts the body without falling is built. The
travel actor is trained on the current handover, so it is retrained from the entry stage on the
new start.

## Value and figures

The travel's value is the time from an order to the body standing, or moving as asked, where the
order asks, on the run drill's cases of the game's orders. A fall costs a fixed 10 s (`FALL_PRICE`);
a place missed costs the time to correct it. A change is kept when that time falls, paired
against the version before ([the skill recipe](../recipes/skill.md#what-a-change-is-kept-on)). The
figures below are read beside it on every case, in the direction named, to show where the time
goes; none is a gate. The owner's 4 m/s forward is the reference mark beside the held speed.

| Figure | Better | Case |
| --- | --- | --- |
| Start | sooner | From rest toward each of eight headings: the time until the centre of mass moves toward the way asked, and the stance-walk steps from the order to the stand after the stop. |
| Short place | nearer, sooner | From rest, a place 1 m and 3 m off at each of eight headings: the distance it stands at and the time it takes. |
| Reach | sooner | From rest, forward and toward each of eight headings: the time to the forward run's held speed. |
| Held speed | faster | Forward, each heading, and each of eight directions with facing held: the slowest held second over 10 s. |
| Steering | faster, less lag | At 2 m/s, a direction rotating at 1 rad/s through a full circle, left and right: the speed held along it and the travel direction's lag. |
| Corner, reversal | sooner | From a reached run, a 90- and a 180-degree change, left and right: the time to the held speed along the new way. |
| Stop | sooner | From each directional speed and after each turning case: the time until below 0.15 m/s and standing 2 s more. |
| Corridor | nearer | Straight travel, and the hold after a corner or reversal: the farthest from the requested line. |
| Falls | fewer | Every case, by phase; each priced in the value. |

A case whose entry is not reached (a corner from a run never reached, a stop from a speed never
held) is reported as unreached and read when it is reached.

Speed is the slowest rolling one-second average of centre-of-mass velocity projected along the
requested direction over the hold, the direction taken at each instant; a peak or a sideways
speed is not a held speed. Steering lag is read from horizontal centre-of-mass velocity against
the requested direction at the same instant. The heading-entry case's line follows its
destination heading from the start; a corner's or reversal's new line begins where the direction
changes, its transition free to leave the line.

## Directional speeds

Find each direction's speed by search, publish an operating speed below where it begins to fall,
and record the reserve tested. Read the intermediate headings between the eight training
directions to check the envelope's interpolation.

## Work

Training follows [the training recipe](../recipes/training.md); this section is the part
particular to travel. The seeds are in `research/runs/warrior-travel/` (its README names each):
native settings, reached warm-up recipes, the restored entry actor and its named transfer layout,
single-actor seeds with replayable primary rows in `sustained/` and `entry/`, and recovery,
walking and minimum-protocol comparison records. Transfer the entry policy by its
layout and retrain after changing the actor's observations, actions or native controller.

Train, screen and choose checkpoints on the run drill's twin, the Warrior's run row's cases
drawn at other points: the case environment (`research/skills/locomotion/environments/run.json`)
and `research/skills/locomotion/travel-screen.mjs`, which plays a record or each checkpoint's
actor in it on the twin and ranks them by the time they lose; `--cell` confirms the chosen one on
the row's own cases at 120 and 480 Hz. `research/skills/locomotion/travel-case.mjs` retains one
trial. The earlier screen's development cases and the restored actor's baseline on them are in
`research/runs/warrior-travel/development/`; that screen no longer plays them.
The restored entry actor is the stop stage's seed.

1. **Restore the forward run.** Retrain the entry seed on the run drill's twin
   (`environments/run.json`) on the current learner until the forward run's held speed plateaus. This is the seed for step 2.
2. **One travel actor.** Build one environment in which one actor steers the walk-run record in
   every phase: from rest and from reached runs, holding and changing pace, toward headings and
   with facing held, turning and stopping. An episode is a script of orders through the
   configured Option Mind. The actor replaces the velocity, low-speed and braking actors;
   `learnedRun` keeps it beside the frozen reference actor. The per-phase machinery it replaced is gone from the code.
3. **Forward and stop in the game.** Train the curriculum's first three stages until the
   forward run and the stop plateau, empty hands, calm air. Install the record in the
   Warrior's walk-run record so the game's Option Mind runs it, and report its table cells with
   what a fresh agent saw. This is the first milestone the owner watches.
4. **Start, slow paces and the stop by foot placement.** Play each candidate of
   [Start, slow paces and the stop](#start-slow-paces-and-the-stop) natively on the Start cases
   first; build the one that starts the body without falling, then its turns, slow paces and stop
   to a stand, drop the Run's handover to the stance's walk, and screen it on the Start and Short
   place cases until it succeeds on some of them. Then retrain the actor from its entry stage on it, keeping every
   earlier stage's episodes, and install it in the Warrior's walk-run record.
5. **Directions and manoeuvres.** Add headings, facing-held directions, continuous steering,
   corners and reversals as curriculum stages of the same actor, keeping the forward and stop
   episodes in the mix. Declare the directional speeds as
   [Directional speeds](#directional-speeds) says.
6. **Loadouts.** Train the same actor with every rated loadout in its episodes: empty hands,
   club, sword, club and buckler, sword and buckler. Each gets its own published envelope. A
   loadout that reads worse gets more episodes, never its own actor.
7. **Confirm** on fresh starting headings, both initial stepping legs, calm air and the Lab's
   gusts, seeds 1 to 4, with the intermediate headings reserved for confirmation. Train on
   separate cases; do not select easier confirmation cases after seeing a failure.
8. **Refresh** the movement profiles and the evaluation table. Verify the configured Option Mind
   obeys travel, facing and stop orders within the published envelopes and keeps the braced
   fighting walk. Watch the failures first in the Locomotion reel, then the Lab and Arena.

A body change follows a measured anatomical limit and is read with recovery before it is kept
(see the Goal). Fix a controller or contact defect at its own layer, then retrain the actor on
it before reading the change. Read shared changes on every affected body, keep recovery and
fighting-walk comparisons, and name each loss beside the gain.

## Training curriculum

Each stage resumes from the previous stage's chosen checkpoint and keeps the earlier stages'
episodes in the mix, half its episodes theirs (`travelCurriculum`). Checkpoints are ranked on
the run drill's twin (`travel-screen.mjs`), every phase the drill holds counting in the time lost. Half the training environments carry it too: empty-handed, the
actor drifts off its way with it. A travel run starts its spread at
`--log-std -1.4` (0.25), the most the seed survives, takes its seed's 64-unit layers, and reads
train.log's `down` and shortfall.

1. **Sustained running.** Physically reached moving states at several gait phases, on both
   stepping legs: warm-up speeds 1 to 4.5 m/s where reachable, episode starts 2 to 9 s,
   requested speeds 1.4 to 6.5 m/s. Keep the seed's from-rest forward entry in the mix from
   this stage. Unreached warm-ups are reported and excluded.
2. **Entry and pace changes.** Episodes from a stand toward every heading, requested speeds down
   to the slow cycle's, places 1 to 3 m off, and pace changes within an episode.
3. **Slowing and stops.** From reached runs, pace orders a little below the run's speed first,
   then larger drops, then stop orders from reached speeds and after holds, each size added
   once the smaller succeeds on development cases. Entry and moving episodes stay in the mix.
   The restored seed falls on nearly every order to slow from a reached run, so this stage
   opens on the smallest drop it survives, or on native braking work if it survives none.
   The game-orders run keeps the orders 3.5 to 1 m/s, stops after slowing to 1 and 2 m/s, and a
   stop straight from the forward run, which a nearer place ordered while running asks: without
   it, training on routes raised the screen's stop falls from the forward run from 1 to 5.
4. **The game's orders.** Places from rest at 2 to 15 m round the body, routes shaped as the
   navigator plans the Dungeon's (1 to 5 legs of 2 to 16 m, corners a median 29 degrees and 56 at
   the 90th percentile), and a place changed on the way (`placeScripts`), at the paces the
   navigator asks: the Run's stops
   planned at its `Locomotion.stopping` of 0.2 m/s² ask 1.8 m/s 8 m out and 2.4 m/s 15 m out. Heading orders,
   facing-held directions, rotating directions, corners and reversals from reached runs join as
   this stage's variations.
5. **Loadouts and gusts**, as step 6 of the work says.

A moving-start run does not read entry from rest, and a higher requested speed does not read a
lower order the configured Mind must obey: confirmation reads the value and figures on the
actual orders and the cases of [Value and figures](#value-and-figures).

## Where it stands

The row, from saved results: `npm run evaluate -- table --body workshop-fighter --skill run`. Each
loadout loses 6.8 to 7.1 s against the orders of the Travel confirmation protocol, falling on
none and ending down on 9 to 25 of 312, read before the protocol added a run from a walk and places
by a route with a corner and moved (352 a loadout), so the row reads again when played.

The actor of the curriculum's game-orders stage is the one the Warrior's walk-run record holds
(`assets/skills/locomotion/walk-run/walk-run.json`), and the game's Run gait uses it.
What limits it is named in [the approaches](../approaches.md#travel): the clip cycle has no gait
between the stance's walk and its slowest clip (2.75 m/s), so a start from a stand, a pace below
that clip and a quick stop are not its to give, and more training of this actor on them does not
move the row.

## The next question

Work step 4: which of the two candidates of
[Start, slow paces and the stop](#start-slow-paces-and-the-stop) starts the body from a stand
without falling. Its signal is the run drill's starts from a
stand and its places (the twin, `research/skills/locomotion/travel-screen.mjs`; Node, 120 Hz); on
the earlier screen's Start and Short place cases the installed record met none and fell on none.
A candidate that starts none of the eight headings after its three changes shows the mechanism
cannot, and is written into the approaches.

## To pick it up

- The seeds and the development cases: `research/runs/warrior-travel/README.md`.
- Screen a record: `research/skills/locomotion/travel-screen.mjs` on the run row's twin, then
  `--cell`.
- Work goes under `.tmp/warrior-travel/`.

## Completion

The plan lands when its work steps are built and no change left to try raises the row's value,
its ceiling named from a reading. The movement contract then goes into the reference
documentation and this plan is deleted.
