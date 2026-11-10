# Developing a skill

How a skill goes from a request to something the owner sees in the game: a reader scoring the skill's
value, what the body can do, a native controller that already succeeds on some cases, then a
learned actor over it. [The training recipe](training.md) is the last of these steps. Each step's output
is the next step's input; a step skipped is how days pass without a kept gain.

## 1. The reader and its score

- **Read physical facts**: contact by collider, speed, energy, path, falls, where the limb ends.
  An executor's phase labels are not evidence.
- **One graded score a trial: the skill's value** ([AGENTS.md](../../AGENTS.md#developing-skills-and-options)),
  every effect priced in it, a fall at what it costs in play. Form the owner asks for (a blow's
  shape) is part of the score, graded by nearness, not a pass or fail. The same score is the
  search's objective, the training reward and the reading a change is kept on.
- **Show the reader scoring the visible failure low**, for a physical reason, before anything is
  searched.
- **Build only the primary screen first**: the reader, one fixture, one hand, one loadout, one
  rate. Misses, cancellations, moving targets, repetitions, other hands, loadouts and rates come
  once the primary screen succeeds on some cases.
- **Develop against a target that lets the case happen.** A drill opponent's guard in front of
  the mark fails a good blow for the target's stance; the guarded target is a later case.

## 2. What the body can do

- **Find what the body can do before building a controller**: a search with the skill's channels
  pushed flat out, or its controller's limits wide, scored on the skill's value.
  `punch-drill.mjs` and `swing-drill.mjs` search pushes so. The result is a scale beside later
  readings, never a gate.
- **A body that cannot do what the owner asks is changed here**: its muscles tuned for the result
  (a tuned `SOURCES` entry naming what it is set for). Never after a controller is built on it.
- **A form term must allow the mechanism its figure needs.** A club's speed comes from a whip
  (shoulder, elbow, then a wrist cock and snap); a run's from flight. Declare that mechanism as a
  phase of the motion, so the form term reads it rather than forbids it.

## 3. A native controller that succeeds on some cases

- **Name the mechanism that makes the motion** (foot placement from balance for a start or a stop,
  timed pushes for a blow) and check it against [the approaches](../approaches.md). A controller
  without it is not searched or trained.
- **Start from the simplest controller that can make the motion**: a schedule of timed pushes
  (`src/skills/strikes/timed-push.ts`) over a posture, a gait, a stance. A tracker following a
  declared course runs behind it by its response time; at a blow's speed that lag is the stroke.
- **Search it** with CMA-ES on drill trials, scored by the graded score, at both physics rates
  with the worse counting. A hand-picked set of variants is not a search. Price the search from
  its first generation; a search learns over tens of generations. A plateau is ten generations
  without a better best.
- **Before training, it succeeds on some held-out cases**: the sign the mechanism works. The straight punch's
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
- **A fixed bar deciding what is kept**: a gain short of an arbitrary number is thrown away.
- **A form term that forbids the mechanism its figure needs.**
- **Waiting for approval** to run a search or a training block.
- **Reading a record change on stale profiles**: a technique's digest covers its body's whole
  record (`techniqueDigest`), every loadout included, so a change to one loadout's settings
  leaves every loadout of that body without its profiles. Refresh the body's
  (`node research/skills/recovery/edge-profiles.mjs --model <body> --write`) before reading the
  change.
