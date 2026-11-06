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

1. Establish the current empty-handed baseline and identify whether forward speed is limited by
   gait entry, toe contact, push-off, flight, landing or braking. Check the command-to-motion path
   before searching settings so a capped order or failed handover is not trained around. Use the
   current [Locomotion cases](../../src/evaluation/locomotion/cases.ts),
   [readings](../../src/evaluation/locomotion/read.ts) and
   [table judge](../../src/evaluation/table/judge.ts) as the starting implementation; add explicit
   travel protocols and readings for the contracts above. Keep older protocol evidence distinct.
2. Retrain the forward gait on the toed Warrior using the curriculum below until acceleration,
   sustained speed and stopping meet their gates. Repair demonstrated controller or contact defects at their owning layer.
   A body change follows a measured anatomical limit and is sourced for the requested result.
   Establish a toe replacement on a mechanical fixture before whole-body integration: its passive
   torque law, ground clearance, support reactions and convergence across physics rates, with the
   heel raised, the foot rocking and the foot near vertical. Derive the physical toe's mass and
   inertia from its geometry and the foot's mass distribution; keep solver conditioning in
   `SOLVER`. Read reaction moments from actual force application points rather than contact
   centroids. Pair the resulting body's recovery and travel readings before retaining the change.
3. Establish facing-held directional speeds, then steering, corners and reversals. Retain paired
   evidence for each change and keep the forward and stopping gates met while adding manoeuvres.
4. Extend to every rated loadout: empty hands, club, sword, club and buckler, sword and buckler.
   Each loadout retains the 4 m/s forward floor and gets its own safe directional and turning
   envelope. A loadout short of a gate remains explicit; the equipped goal is not reduced.
5. Confirm on fresh starting headings, both initial stepping legs, and calm air and the Lab's
   gusts, seeds 1 to 4. Reserve intermediate directional headings for confirmation. Train on
   separate cases; do not select easier confirmation cases after seeing a failure.
6. Refresh the movement profiles and the evaluation table. Verify the configured Option Mind
   obeys travel, facing and stop orders with the published envelopes, and retains the braced
   fighting walk. Watch the failures first in the Locomotion reel, then the Lab and Arena.

Develop on one body, one loadout and calm air before widening. Each run answers one named
question, with its consequence stated before play. Price searches from their first trials and
follow the time limits, saved-row reuse and paired comparison rules in
[AGENTS.md](../../AGENTS.md#doing-the-work). Fix downstream defects exposed by a correction in the
same change. Read shared changes on every affected body and retain recovery and fighting-walk
comparisons; existing shortfalls remain named rather than being treated as passes.

## Training curriculum

Recover the retained learned runner's configuration, reward, observation layout, action timing,
normalisation and checkpoints before choosing a new learner. Replay its seed on the current
body, then use its moving-start and speed-range curriculum as the starting training recipe.
Keep body, engine and controller differences explicit; a historical speed is not a current
capability reading. Compare a changed learning method against this recipe before replacing it.

1. **Sustained running.** Train from physically reached moving states at several gait phases,
   on both stepping legs. Sample warm-up speeds from 1 to 4.5 m/s where reachable, episode
   starts from 2 to 9 s, and requested speeds from 1.4 to 6.5 m/s. Unreached warm-up states are
   reported and excluded, never manufactured by setting velocity. Widen the reachable states
   as the gait improves. Use pace-relative shortfall credit to provide a training gradient,
   and judge saved checkpoints by physical speed, falls and corridor error on retained cases.
2. **Entry and speed changes.** Extend requested speeds down to 0.9 m/s to exercise the
   walk-to-run handover, add from-rest episodes, and train acceleration and changes of pace.
   Retain moving-start episodes so entry work preserves sustained running. Polish a promising
   checkpoint at a lower learning rate rather than assuming the final checkpoint is best.
3. **Braking and manoeuvres.** Add stops, directional orders and turns from reached speeds,
   retaining straight running and entry cases. Widen to loadouts and gusts as the work above
   specifies; keep fresh confirmation cases separate from training and checkpoint selection.

These are development stages, not acceptance gates. A moving-start run does not prove entry
from rest; a higher requested speed does not satisfy a lower order that the configured Mind
must obey. Confirmation uses the actual orders, complete speed windows and deadlines in the
movement contract, including the stop and recovery guards. Training rewards and tolerances
never change those requirements.

Price each training block from its measured throughput and state its cumulative decision count,
initial checkpoint and stopping budget. Compare checkpoint trends in survival and sustained
speed separately. A short plateau does not establish an anatomical ceiling; an extended run
requires the approval specified in AGENTS.md. Retain full models, normalisation, configurations
and replay rows so the next block can reproduce and resume the selected checkpoint exactly.

## Completion

Every Warrior loadout meets every travel gate on the confirmation conditions, with complete
case coverage, no falls and independently confirmed directional and turning envelopes. The table
names the actual protocol, body, loadout, harness and current version. Implementation checks
follow [AGENTS.md](../../AGENTS.md#doing-the-work); capability evidence lives in drills and paired
evaluations. Provide watched drill links with the observed failures and outcomes. Only the
owner accepts a rung. Delete this plan when the work lands and place the resulting movement
contract in the reference documentation.
