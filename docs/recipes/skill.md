# Developing a skill

How a skill goes from a request to something the owner can accept: a reader with a graded score,
a bar the body can reach, a native controller that already succeeds on some cases, then a learned
actor over it. [The training recipe](training.md) is the last of these steps. Each step's output
is the next step's input; a step skipped is how days pass without a kept gain.

## 1. The reader and its score

- **Read physical facts**: contact by collider, speed, energy, path, falls, where the limb ends.
  An executor's phase labels are not evidence.
- **One graded score a trial.** Short of a test, it pays nearness to it; past a test, its margin
  toward that test's best; a fall scores lowest. `barScore` (`src/evaluation/strike/score.ts`)
  is the strikes' form. The same score is the search's objective and the training reward. The
  plan's acceptance reads the same tests as met or short.
- **Show the reader scoring the visible failure low**, for a physical reason, before anything is
  searched.
- **Build only the primary screen first**: the reader, one fixture, one hand, one loadout, one
  rate. Misses, cancellations, moving targets, repetitions, other hands, loadouts and rates come
  once the primary screen succeeds on some cases.
- **Develop against a target that lets the case happen.** A drill opponent's guard in front of
  the mark fails a good blow for the target's stance; the guarded target is a later case.

## 2. Feasibility

- **Before freezing a number, find what the body can do**: a search with the skill's channels
  pushed flat out, or its controller's limits wide, scored on the figure the bar reads (speed,
  energy). `punch-drill.mjs` and `swing-drill.mjs` search pushes so.
- **A body short of the bar is settled here**: its muscles tuned for the result (a tuned
  `SOURCES` entry naming what it is set for, the least factor that reaches the bar), or the bar
  corrected. Never after a controller is built on the short body.
- **A form test must allow the mechanism its figure needs.** A club's speed comes from a whip
  (shoulder, elbow, then a wrist cock and snap); a run's from flight. Declare that mechanism as a
  phase of the motion, so the form test reads it rather than forbids it.

## 3. A native controller that succeeds on some cases

- **Start from the simplest controller that can make the motion**: a schedule of timed pushes
  (`src/skills/strikes/timed-push.ts`) over a posture, a gait, a stance. A tracker following a
  declared course runs behind it by its response time; at a blow's speed that lag is the stroke.
- **Search it** with CMA-ES on drill trials, scored by the graded score, at both physics rates
  with the worse counting. A hand-picked set of variants is not a search. Price the search from
  its first generation; a search learns over tens of generations. A plateau is ten generations
  without a better best.
- **The gate before training: it succeeds on some held-out cases.** The straight punch's
  schedule landed 8 of 60 before training took it to 35. A controller that succeeds on none is
  not a seed: change the controller, or go back to feasibility. Training does not make up for it.

## 4. A learned actor over it

Follows [the training recipe](training.md). What is particular to a new skill:

- **The actor corrects the native controller**: it adds to its pushes and asks its stance. An
  output acts only through something that can move: a push on a leg bearing the body moves
  nothing, so the stance is asked instead.
- **The reward is the graded score of step 1**, and an episode is a drill trial from saved
  starts at the action's first decision, at places the action's window admits.
- **Start from scratch or from this skill's own earlier actor.** Another skill's network starts
  behind scratch.

## 5. Widen and confirm

- Add what step 1 held back, one at a time, as episodes and cases: the other hand, loadouts,
  rates, approaches, moving targets, the guarded target, misses and cancellations. Each keeps the
  earlier cases in the mix.
- Confirm on held-out cases once, on the chosen checkpoint or record, and send the drill link
  after watching the reel, failures first.
- Then register it in Option Mind and read its profiles; a drill Commander using it alone does
  not show the Mind uses it.

## Traps

- **Infrastructure first**: readers and fixtures for every case before any trial succeeds. Each
  is right and none moves the skill.
- **An all-or-nothing objective**: with nothing met, every candidate ties and the search returns
  nothing to keep.
- **Tightening a bar mid-work**, before anything reaches the bar it had.
- **A form test that forbids the mechanism its figure needs.**
- **Waiting for approval** to run a search or a training block.
