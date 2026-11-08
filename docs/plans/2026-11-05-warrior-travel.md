# Warrior travel

## Goal

The Warrior travels at 4 m/s or faster forward, moves safely in every direction, steers while
moving, takes corners, reverses direction and stops without falling. Travel uses its own speed
and turning limits; the braced walk remains available for fighting.

Train and confirm on the game's toed Warrior, unassisted. Use existing gait implementations,
records and training checkpoints as seeds, replayed on this body before reuse; they do not
establish that its travel meets the gates. Establish the baseline on the current body and
controller before changing them, and retain the current recovery readings as a guard.

This plan owns the Warrior's movement requirement within [Options trained body by
body](2026-11-03-options-training.md). The Rogue's run remains that plan's. Warrior recovery is
serviceable for this work: preserve its ability to get up and its recorded recovery performance;
the ten-second stand-up target remains separate work rather than an entry requirement here.
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

## Gates

The hard forward floor is 4 m/s. The other thresholds below define useful initial targets to
establish on the body; a short reading remains short and names its limiting layer.

| Capability | Requirement |
| --- | --- |
| Forward run | From rest, reach 4 m/s within 4 s of the order, then hold at least 4 m/s for 10 s. |
| Travel to a heading | From rest, turn toward each of eight compass headings and perform the forward run; allow up to 6 s from the order to reach 4 m/s, then hold it for 10 s. |
| Facing held | Move along each of eight directions relative to a fixed facing. Forward meets the forward gate; each other direction reaches its declared speed within 4 s and holds it for 10 s. |
| Continuous steering | Enter at 2 m/s, then follow a direction rotating at 1 rad/s through a full circle, left and right. Hold at least 2 m/s along the requested direction, with at most 20 degrees of travel-direction lag throughout the circle. |
| Corner | From an established 4 m/s forward run, accept a 90-degree direction change, left and right. Brake as needed, reach 4 m/s along the new direction within 5 s of the change, then hold it for 10 s. |
| Reversal | From an established 4 m/s forward run, accept a 180-degree direction change. Test left and right turning routes. Brake, turn and reach 4 m/s along the new direction within 7 s, then hold it for 10 s. |
| Stop | From each declared directional speed and after each turning case, stop below 0.15 m/s within 2 s of the stop order and remain below that speed, standing, for 2 s more. |

Every case remains upright through acceleration, travel, turning, braking and final settling.
A fall followed by recovery fails the movement case. An unreached entry condition is reported
explicitly and cannot pass: a corner or reversal starts from a demonstrated 4 m/s run, continuous
steering starts from a demonstrated 2 m/s run, and a stop starts from its declared speed.

Speed is the slowest rolling one-second average of centre-of-mass velocity projected along the
requested direction over the entire hold. The direction used for a turning projection is the
requested direction at that instant. A peak or sideways speed cannot satisfy the forward floor.
Reach times require a complete one-second window at the required speed ending by the deadline.
Read steering lag from horizontal centre-of-mass velocity against the requested direction at
the same instant; the speed window does not delay the heading comparison.

Straight travel stays within 1 m of its requested line from the start through the stop.
The heading-entry case's line follows its destination heading from the starting position.
The corner and reversal's new line begins at the position where the direction changes; their
transition may leave that line, but the following ten-second hold and stop stay within 1 m.
Continuous steering follows the requested direction and lag bound; it does not use a straight-line
corridor. After the circle, hold 2 m/s along its final tangent for 2 s before stopping; corners
and reversals use their specified ten-second holds.

## Safe directional speeds

Start sideways and backward searches at 1 m/s as useful minimum targets. Establish diagonals
explicitly: forward diagonals have a 1 m/s minimum, as do backward diagonals. Forward remains
4 m/s. A direction below its minimum is short, even if a slower speed is safe.

Find each direction's reliable range, then declare an operating speed below its observed failing
boundary and confirm it independently. Record the tested reserve rather than assuming a fixed
percentage is safe. Freeze the declared speeds and turning envelope before confirmation; failure
returns them to development rather than silently lowering a gate. Confirm the intermediate
headings between the eight training directions to check the envelope's interpolation.

## Work

Training follows [the training recipe](../recipes/training.md); this section is the part
particular to travel. The seeds are in `research/runs/warrior-travel/` (its README names each):
native settings, reached warm-up recipes, the restored entry actor and its named transfer layout,
single-actor seeds with replayable primary rows in `sustained/` and `entry/`, and recovery,
walking and minimum-protocol comparison records. Transfer the entry policy by its
layout and retrain after changing the actor's observations, actions or native controller. Screen a record with
`research/skills/locomotion/warrior-travel.mjs --settings <record>`, then the `travel`
evaluation's minimum protocol.

1. **Restore the forward run.** Retrain the entry seed through the `travel-orders`
   environment on the current learner until the forward case meets the forward gate (4 m/s
   within 4 s, held 10 s, upright). This is the seed for step 2.
2. **One travel actor.** Build one environment in which one actor steers the walk-run record in
   every phase: from rest and from reached runs, holding and changing pace, toward headings and
   with facing held, turning and stopping. An episode is a script of orders through the
   configured Option Mind. The actor replaces the velocity, low-speed and braking actors;
   `learnedRun` keeps it beside the frozen reference actor. Delete the per-phase machinery
   (`slowVelocity`, `steered`, `trainingActor`, the braking-only `option-travel` kind) once the
   one actor replaces it.
3. **Forward and stop in the game.** Train the curriculum's first three stages until the
   forward run and stop gates are met, empty hands, calm air. Install the record in the
   Warrior's walk-run record so the game's Option Mind runs it, and send the owner a drill link
   with what was seen. This is the first milestone the owner watches.
4. **Directions and manoeuvres.** Add headings, facing-held directions, continuous steering,
   corners and reversals as curriculum stages of the same actor, keeping the forward and stop
   episodes in the mix. Declare the directional speeds as
   [Safe directional speeds](#safe-directional-speeds) says.
5. **Loadouts.** Train the same actor with every rated loadout in its episodes: empty hands,
   club, sword, club and buckler, sword and buckler. Each keeps the 4 m/s forward floor and gets
   its own published envelope. A loadout short of a gate gets more episodes, never its own actor.
6. **Confirm** on fresh starting headings, both initial stepping legs, calm air and the Lab's
   gusts, seeds 1 to 4, with the intermediate headings reserved for confirmation. Train on
   separate cases; do not select easier confirmation cases after seeing a failure.
7. **Refresh** the movement profiles and the evaluation table. Verify the configured Option Mind
   obeys travel, facing and stop orders within the published envelopes and keeps the braced
   fighting walk. Watch the failures first in the Locomotion reel, then the Lab and Arena.

A body change follows a measured anatomical limit and is read with recovery before it is kept
(see the Goal). Fix a controller or contact defect at its own layer, then retrain the actor on
it before reading the change. Read shared changes on every affected body, keep recovery and
fighting-walk comparisons, and name existing shortfalls rather than treating them as passes.

## Training curriculum

Each stage resumes from the previous stage's chosen checkpoint and keeps the earlier stages'
episodes in the mix.

1. **Sustained running.** Physically reached moving states at several gait phases, on both
   stepping legs: warm-up speeds 1 to 4.5 m/s where reachable, episode starts 2 to 9 s,
   requested speeds 1.4 to 6.5 m/s. Unreached warm-ups are reported and excluded.
2. **Entry and pace changes.** Requested speeds down to 0.9 m/s for the walk-to-run handover,
   episodes from rest, and pace changes within an episode.
3. **Stops.** Stop orders from reached speeds and after pace changes.
4. **Directions and turns.** Heading orders from rest, facing-held directions, rotating
   directions, corners and reversals from reached runs.
5. **Loadouts and gusts**, as step 5 of the work says.

These are development stages, not acceptance gates. A moving-start run does not prove entry
from rest; a higher requested speed does not satisfy a lower order that the configured Mind
must obey. Confirmation uses the actual orders, complete speed windows and deadlines in the
movement contract, including the stop and recovery guards. Training rewards and tolerances
never change those requirements.

## Completion

Every Warrior loadout meets every travel gate on the confirmation conditions, with complete
case coverage, no falls and independently confirmed directional and turning envelopes. The table
names the actual protocol, body, loadout, harness and current version. Implementation checks
follow [AGENTS.md](../../AGENTS.md#doing-the-work); capability evidence lives in drills and paired
evaluations. Provide watched drill links with the observed failures and outcomes. Only the
owner accepts a rung. Delete this plan when the work lands and place the resulting movement
contract in the reference documentation.
