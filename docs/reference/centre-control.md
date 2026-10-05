# Centre-of-mass motion objectives

The [joint-angle acceleration correction](joint-acceleration.md#capability-remeasurement)
remeasures the long-watch strike gates on the present tracker: moving targets 108/108 and
static targets 72/72, all replaying, upright and without rejected solves. The records below
preserve the original centre-control experiments and their frozen source revisions.

The optional motion interface accepts `centres`: named groups of physical segment/item frames.
Each frame contributes its mass once. A centre goal requests position, velocity and acceleration
on selected world axes, through the same bounded muscle solve as joint and point objectives.
Translation goals also accept an `axes` selection. Omission preserves all three components.
Groups, identifiers and axes are validated before any associated grip action is applied.

`coupledDynamics.motionRow` returns detached acceleration coefficients and velocity bias for a
weighted set of physical motion terms. The tracker builds a group's centre row by weighting
each member's centre-of-mass translation by its mass fraction. Feedback uses the group's
mass-weighted position and centre velocity. It includes separate items once and respects their
current grip constraints. Group membership is explicit; releasing an item does not silently
remove it from the requested group. A policy can change its next command's membership.

These are objectives, not external forces. Unreachable objectives remain bounded misses.
This supplies optional controller machinery; actuator policies need not use it.

## Standing experiment

The point-strike fixture's optional `centreControl` requests horizontal control of all its
segments and held items toward the midpoint of the initial feet's centres of mass. It asks
the root to track only vertical translation and orientation. This is an initially standing,
level-ground experiment; it does not plan steps, choose new supports or recover from a fall.
Every item in this fixture remains attached throughout the trial.

`CENTRE` contains declared engineering inputs: root height 0.04 m below its initial value,
root translation weight 10 and combined-centre translation weight 10. Root orientation keeps
weight 1. Feedback time remains 0.15 s, and anatomical strength, speed, mass and inertia are
unchanged. Assistance remains zero. The lower root target uses the same 0.04 m displacement
as the upright support fixture. The larger translation weights give balance more influence
than the posture preference for joint zero; they are controller weights, not muscle gains.
During return and continued guard, the arm posture preference targets the midpoint of each
sourced shoulder, elbow and wrist range. Point goals still determine the hand/item position;
the posture preference gives a nearly straight, limit-bound arm another route back to guard.
The centre-controlled fixture allows 0.75 s of follow-through, compared with 0.5 s for the
pose-controlled reference. At 0.5 s, the development Rogue two-hand moving trial contacts with
its left hand only after return begins. This changes the controller's timing, not the task's
contact threshold, hit window definition, return tolerance or deadline.
Static centre-controlled strikes use the same 0.005 N s / 0.15 s impact braking as the moving
fixture. On contact, each effector independently brakes from its measured position and velocity.
This avoids continuing to drive the limb into a rigid obstacle throughout follow-through.
The configuration records the applied impact response. A moving trial can still explicitly
disable braking; the original pose-controlled static fixture retains its existing behavior.

The configurable continuation extends the independent task watch after measured return.
Its default remains one second; long-watch development uses ten seconds. Separate runner
cells retain the controller choice and continuation duration.

```powershell
node research/control-foundation.mjs --suite moving-strike --actuation directional --centre-control --continue-seconds 10 --samples 2 --workers 1
```

The mechanical regression projects a closed-loop body's acceleration onto its mass-weighted
centre and checks Newton's force-over-total-mass result under internal torque, spin and either
grip release. A physical unequal-mass hand/item task tracks only the selected axis, with
detached command inputs and replay. No standing capability rate is implied by those checks.
The free anatomical-body check evaluates all actuator columns on every selected centre axis:
internal torques have zero predicted centre acceleration within a 1e-12 numerical tolerance.
Its 20-step physical run allows 10 micrometres of solver drift while asking for a metre on
each axis. It does not require exactly zero command: floating-point cancellation combined with
effort regularization can produce small internal torques for this unreachable objective.

## Moving-target development measurement

[The frozen run](centre-control.json), Node 24.19 / core world / Rapier
0.21.0-auto-rpg.4 / adapter 5 / 120 Hz, covers two development starts per body, hand selection,
loadout and target variant. All 108 trials pass their independent task score, replay exactly,
record no fall and reject no support solve. Root and weapon assistance remain zero.

| Body | Tracked hit and return | Fixed-aim hit and return | Deliberate miss and return |
|---|---:|---:|---:|
| Warrior | 12/12 | 12/12 | 12/12 |
| Rogue | 12/12 | 12/12 | 12/12 |
| Skeleton (placeholder anatomy) | 12/12 | 12/12 | 12/12 |

Every cell includes ten seconds of control after measured return. The JSON retains per-hand
and loadout denominators, Wilson intervals, actual observations and the source manifest. This
small development set does not establish gameplay reliability or a benefit of prediction:
fixed aim also passes these starts. Held-out integrated trials remain unused.
Completed trials last 12.858–13.625 s including the continuation; the largest final point
error is 0.013453 m, within the unchanged 0.02 m criterion.

The run used three workers, with production-build and browser checks overlapping part of it.
Its timing fields are retained as raw observations and are not a controller cost comparison.

[Seven built-browser cases](centre-control-browser.json) match Node's complete observation
hashes and step counts, including the Warrior right-hand instability case, the Rogue two-hand
timing case, the skeleton's two clubs, deliberate misses and a fixed-aim second start. Every
browser case also replays its own saved state. Inspected initial/final poses show the actual
items and targets; there were no browser warnings or errors. Point-only guard goals can leave
the skeleton holding its clubs awkwardly despite stable balance. This is no claim of natural
weapon posture, defense, shared-item combat or recovery.

Removing centre rows from a copied tracker makes the unequal-mass tracking regression fail
its physical position assertion. The ordinary tracker passes; the test is not merely reading
back the requested objective.

## Static-impact ablation

The first [static matrix](centre-control-static-ablation.json), Node 24.19 / core world /
Rapier 0.21.0-auto-rpg.4 / adapter 5 / 120 Hz / three workers, did not enable impact braking.
It passed 70/72 starts. Both skeleton bare-both-hands hit starts made qualifying impacts and
then fell, failing return with rejected support solves. The successful moving-target matrix
therefore did not establish safety against a rigid obstacle. All starts replayed exactly.
The ablation retains the complete manifest, per-cell summaries and both failed observations.

With impact braking enabled, the [repeated static matrix](centre-control-static.json) passes
72/72 starts: 12/12 hits and 12/12 deliberate misses for each body, spanning either hand,
both independent hands, empty hands and clubs. Every trial replays exactly, records no fall
and rejects no support solve over the ten-second continuation. The maximum final point error
is 0.004511 m and the longest completed trial is 13.625 s. The same Node/core/Rapier/120 Hz
harness uses three workers; concurrent diagnostic work makes its timing fields unsuitable
for a cost comparison. The static and moving runs retain their separate source archives.
Both previously failing static skeleton starts also match Node's observation hash and step
count in the built browser and replay exactly there, bringing the browser record to nine cases.
