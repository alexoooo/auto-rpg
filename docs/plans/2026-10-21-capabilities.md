# Capabilities: locomotion, recovery, strikes and holds

## Scope

What a body can do, by any controller: run, stand up, strike and hold. Each capability has a task,
a target, the current reference implementation it is read against, and its evaluation. An
implementation may use the whole-body solve and the skills described in
[Motor control](../architecture.md#motor-control) and [Skills](../architecture.md#skills),
another controller, or an independent policy through the common observation and actuation
boundary. The whole-body stack is one candidate, not the plan's subject.

Components, tasks and the cycle are the [framework](2026-10-21-framework.md)'s, including its
compute rule. Evaluations and their records are [Ratings](2026-10-21-ratings.md)'. Existing
selectable implementations stay beside candidates; retiring one is the owner's decision.

All readings are on the Node stand, Rapier, 120 Hz, with Balance and Haste declared (nominal
comparisons at 0). A target's protocol is versioned; a changed protocol reads its reference
again, on the cases it needs, before a comparison.

## Locomotion: running and Haste

Forward running that uses the body's strength and speed, stops and turns, and carries equipment
without drift. Sideways and backward movement stay stepping walks at their own pace (the owner's
decision). Targets, together:

- The Warrior sustains at least 4.5 m/s forward, toward the owner's 5 m/s aim.
- Haste +100 adds at least 1 m/s under matched conditions, with its effect on falls reported.
- At most 19 falls in the 300-trial gait battery and 18 in its 150 club trials; the forward club
  envelope at or above SIMBICON's on matched cells.
- Travel, transitions, stops and turns exercised, not only straight-line top speed.
- The owner accepts the motion's look in the Lab and the game.

Apparatus: `research/locomotion-run.mjs`, `research/run-cycle-search.mjs`,
`research/core-stance-envelope.mjs`. The gait battery becomes an evaluation when it is next
worked on (Ratings, step 10). A candidate is screened on one body and one loadout before the
battery.

A gait states its own limits to the movement pipeline (top speed by direction, stopping
deceleration; [Movement](2026-10-21-movement-and-command.md), A0), so a faster gait raises every
pace the game asks with no change to the pipeline. A gait that changes updates its own limits as
part of that change.

## Recovery: fast, robust, unassisted

Feedback over support transitions and motion, a faster path onto support, and a stable hand-back
to locomotion. A planned contact, a completed stage or a briefly raised trunk is not a recovery:
the task verifies that the body stood and can move.

The owner's target is the 64-fall protocol (`research/rising-bed.mjs --target`,
[the recovery target](../reference/rising.md)): the Warrior and the Rogue, empty-handed and with
the club, each shoved sixteen ways, Balance 0 and Grit 0. It requires:

- every direction present;
- at least 15 of 16 verified recoveries within 6 s in every group, and 61 of 64 overall;
- every cardinal direction passing in every group;
- a failure-inclusive median at most 4 s.

`risingReport` owns the checks. Step-up is the baseline. Takeover, hand-back and verified
recovery are reported apart. The Lab's Stand-up scenario plays the same falls as a round on one
body and is reported separately. The target becomes the `rising-target` evaluation
(Ratings, step 13).

A candidate is screened on one group's sixteen falls before the 64. A policy acting on
observations through muscle or joint-target actions also runs the sixteen-fall screen
(`research/stand-up-acceptance.mjs --candidate <module>`); passing it does not establish the
target, and a rejected external-actuation request is a failure.

Nominal anatomy and muscle limits stay fixed for an unassisted claim. Improvement on a battery,
passing software checks and meeting the target are separate claims.

## Assists

Balance is the metered extra wrench; Haste changes the declared muscle-speed capability. Grit, a
proposed torque assist, is defined (limits, accounting, interaction with the muscles) before it
is used; its recovery objective is a median below 4 s under its declared configuration, separate
from the unassisted target. A controller trained with an assist is read without it before an
unassisted claim; lowering the assist over training is one way to get there. A policy consumes
the observed body and its actual actuation, so extra authority never overdrives a motion whose
feedback ignores it. Morphology and other assist mechanisms are separate experiments with their
own sourced changes.

## Strikes and holds

Point and orientation tasks that deliver motion through bounded muscles while keeping support:
a driven strike that sequences arm, trunk and ground reaction, returns under control and works in
a fight; and holds that keep equipment useful.

The strike is read on its task first (driven motion before contact, delivered effort,
self-injury, balance, return to readiness), the blade, buckler and court batteries among them
(Ratings, step 10). Then the same fighter with only its executor changed is read by the paired
report against the panel; its ablation says whether the gain matters in a fight. A battery gain
with no gain in fights is a finding.

Shield orientation, weapon lines and coupled two-hand control go through the same control path
as items arrive, with no controller per loadout.

## Cost

The solve's objective is 0.5 ms per body per step on the desktop, read with
`research/step-time.mjs` (machine, engine, rate and fixture named) when cost is the question.
Physics stays 120 Hz; a different policy cadence is an explicit experiment. A phone-class
reading is [Mind data](2026-10-21-mind-data.md)'s first question.

Learned weights are immutable versioned assets naming the run that made them, loaded through the
data store.

## Done when

Each target above is met on its evaluation, at a named commit, and the owner has accepted the
motion. Until then, each landed change carries its paired report against the previous version.
