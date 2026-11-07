# Learner action timing

## Goal

Every learned controller decides through one handoff that native inference and training share.
The learner owns the schedule; a skill publishes what it reads and applies the action it is
given. One research adapter steps the world between decisions for every training environment,
so each training transition is the action the controller applied, over the steps it applied it.

This work supplies the learning contract needed by [Warrior travel](warrior-travel.md).
Implementing it does not resume that plan's paused training or change its capability gates.

## Problem

Each learner schedules its own decisions, and each environment is aligned by hand to the one it
drives:

- The [run](../../src/skills/locomotion/learned-run.ts) decides every `decisionSteps` control
  steps and applies a native action on the step it reads. Under the
  [case environment](../../research/case-learning-environment.mjs), a trainer's action lands on
  the following step only because `inference.velocityAction` shares its array with
  `learner.outputs`. In the `slow-velocity` blend, the blended array is built at the boundary from
  the outputs held before the trainer answers, so each action is applied a decision late and
  credited with its predecessor's reward.
- The [punch](../../src/skills/strikes/straight-punch.ts) decides every `PUNCH_DECIDE` seconds of
  its drive and applies an answer from the step after it reads. The
  [bare mind](../../src/entrants/bare/mind.ts) decides every `every` control steps and applies
  from the step after it reads.
- The [residual environment](../../research/skills/locomotion/residual-environment.mjs) applies a
  steering action for four physics steps at any rate, while
  [`learnedRunSteering`](../../research/skills/locomotion/learned-run-steering.mjs) replays it
  every `round(1 / (30 dt))` steps; the two agree only at 120 Hz.
- The [Option entry](../../research/skills/locomotion/option-entry-environment.mjs) and
  [Option travel](../../research/skills/locomotion/option-travel-environment.mjs) environments
  are aligned by asserting `decisionSteps === 4`, replacing `learner.outputs`, and locating the
  first decision with a look-ahead snapshot.

## The handoff

The [learner seam](../../src/core/math/learning/learner.ts) gains a decision interval in seconds
and an `answered` counter beside `decisions`. Two helpers beside it are the whole protocol:

1. **Ask**, called on each control step while the learner runs. On the first step of a run and
   every interval after it, rounded to whole control steps and at least one, it fills `inputs`
   through the skill's reader and increments `decisions`.
2. **Act**, called on each control step after the first request of a run. It returns the outputs
   of the last answered request and throws if the request asked before this step is unanswered.

A policy answers by writing `outputs` in place and setting `answered` to `decisions`. A native
policy answers inside Ask; the adapter answers while the world is stopped between steps. Both are
applied from the next control step until the next answer, so a decision's action covers exactly
its interval and native play matches training. An answer to an already answered request is a
defect and throws.

The schedule restarts when `running` turns true or the skill starts a new act (a punch's drive,
a run's new pace); the counters only increase, so an answer from before a restart cannot match a
new request. The state is plain data, so world saves and forks keep a pending request.

Existing intervals convert at the rate their policies trained at: the run's four steps at 120 Hz
are 1/30 s, matching `learnedRunSteering`. The run's native actions move one control step later;
the punch and bare mind keep their order.

## One adapter

The case environment's loop becomes the one adapter. An environment supplies its reset recipe,
a per-step reward and a termination reader; it never chooses how many steps an action covers.

- **Reset** steps until the first request and returns its inputs. No action is invented for
  the steps before it.
- **Step** answers the pending request with the action, then steps the world until the next
  request or the episode ends, summing each step's reward (a rate times the step's seconds, an
  event once). It returns the inputs of the request it stopped at, or the final reading where the
  episode ended, with the step count and seconds in its info.

The residual environment's steering becomes a learner on the run's cycle, and
`learnedRunSteering` keeps only its features and `steeringFrom`. The Option environments drop
their fixed four-step loops and look-ahead snapshot. An environment no open question trains is
deleted rather than migrated.

## Training

[`run-train.py`](../../research/run-train.py) keeps `--gamma` per decision. The layout file each
environment reads names its interval beside its inputs and outputs; a checkpoint keeps the layout
it trained on, and loading it into a different layout is refused. Training reports count
decisions, steps and seconds separately.

## Verification

- A test that fails on the current code: distinct successive actions through the run's
  `slow-velocity` blend under the adapter, each applied for exactly the steps of its own
  interval. Register it in the [test inventory](../../tests/README.md).
- Run, punch and bare mind with the same deterministic policy, native and through the adapter,
  at 120 Hz and 480 Hz: the same applied actions and poses at matching steps.
- The run's one-step change is read against its baselines before it is kept.
- A short training smoke run shows decision, step and second counts and a refused mismatched
  checkpoint; no locomotion gain is required.
- The architecture and training instructions describe the handoff; the
  [roadmap](../roadmap.md) line goes when this lands.

## Completion

- Every learned controller asks and acts through the seam's two helpers; none keeps a scheduler.
- Every training environment steps through the one adapter.
- Native and adapter play agree step for step; each transition is one applied action over its
  interval.
- Required checks pass, the run's behaviour change has paired readings, and Warrior travel
  remains paused until resumed separately.
