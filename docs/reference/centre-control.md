# Centre-of-mass motion objectives

The motion interface's optional `centres` objectives, and the point-strike fixture's centre-control
experiment that uses them (`CENTRE` in `src/core/tasks/point-strike.ts`). The long-watch strike
gates on the present tracker are remeasured in
[joint acceleration](joint-acceleration.md#capability-remeasurement) (moving 108/108, static
72/72); the runs below keep their own frozen source revisions.

## The objective

A `centres` group names segment and item frames, each counting its mass once (an item once, under
its current grips; releasing it does not drop it from the group). A goal asks position, velocity and
acceleration on selected world `axes` (omitted: all three) through the same bounded muscle solve as
joint and point goals; `coupledDynamics.motionRow` gives the group's row as its members'
centre-of-mass rows weighted by mass fraction. These are objectives, not forces; an unreachable one
is a bounded miss.

## Standing experiment

The point-strike fixture's `centreControl` asks horizontal control of all its segments and held
items toward the midpoint of the initial feet's centres of mass, and asks the root only for height
and orientation. It starts standing on level ground; it plans no steps and recovers no fall.

`CENTRE` holds the controller's inputs:

| Input | Value | Why |
|---|---:|---|
| `lower` (root under its initial height) | 0.04 m | the upright support fixture's displacement |
| `positionWeight` (root translation) / `centreWeight` | 10 / 10 | balance outweighs the joint-zero posture preference; controller weights, not muscle gains |
| `followSeconds` | 0.75 s | at 0.5 s (the pose-controlled reference) the Rogue two-hand moving trial contacts only after return begins |

Root orientation keeps weight 1 and feedback time 0.15 s. During return and guard the arm posture
preference targets the midpoint of each shoulder, elbow and wrist range, a route back to guard for a
nearly straight arm. Static centre-controlled strikes use the moving fixture's 0.005 N s / 0.15 s
impact braking: on contact each effector brakes from its measured position and velocity. Task
thresholds, hit window, return tolerance and deadline are unchanged; assistance is zero. The watch
continues after measured return, one second by default and ten for long-watch runs.

```powershell
node research/control-foundation.mjs --suite moving-strike --actuation directional --centre-control --continue-seconds 10 --samples 2 --workers 1
```

The mechanical regression projects a closed-loop body's acceleration onto its centre and checks
force over total mass under internal torque, spin and either grip release. On a free body, every
actuator column predicts zero centre acceleration within 1e-12; a 20-step run asking a metre on
each axis drifts under 10 micrometres. Removing the centre rows from a copied tracker fails the
unequal-mass tracking test.

## Moving-target development measurement

[The frozen run](centre-control.json): Node 24.19, core world, Rapier 0.21.0-auto-rpg.4 / adapter 5,
120 Hz, two development starts per body, hand, loadout and target variant, ten seconds after return.
All 108 trials pass, replay exactly, never fall and reject no support solve.

| Body | Tracked hit and return | Fixed-aim hit and return | Deliberate miss and return |
|---|---:|---:|---:|
| Warrior | 12/12 | 12/12 | 12/12 |
| Rogue | 12/12 | 12/12 | 12/12 |
| Skeleton (placeholder anatomy) | 12/12 | 12/12 | 12/12 |

Trials last 12.858 to 13.625 s; the largest final point error is 0.013453 m (gate 0.02 m). Fixed
aim also passes, so the set shows no benefit of prediction. Timing fields are raw: the run overlapped
other work.

[Seven built-browser cases](centre-control-browser.json) match Node's observation hashes and step
counts and replay themselves. Point-only guard goals can leave the skeleton holding its clubs
awkwardly while balanced.

## Static-impact ablation

| Run | Impact braking | Passed | Failure |
|---|---|---:|---|
| [static ablation](centre-control-static-ablation.json) | off | 70/72 | both skeleton bare-both-hands hits fell after impact, with rejected support solves |
| [static matrix](centre-control-static.json) | on | 72/72 | none; final point error at most 0.004511 m, longest trial 13.625 s |

Same harness, three workers; every trial replays exactly. The two skeleton starts that failed
without braking also match Node in the built browser (nine browser cases in all).
