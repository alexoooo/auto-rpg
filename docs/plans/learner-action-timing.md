# Learner action timing

## Goal

Give every learned controller one observation/action contract shared by native inference and
external training. Each training transition records an action the controller consumes, with the
reward and elapsed simulation time attributable to that action. Controllers retain their own
decision cadence; physics and motor control continue at the world's rate.

This work supplies the learning contract needed by [Warrior travel](warrior-travel.md).
Implementing it does not resume that plan's paused training or change its capability gates.

## Problem and scope

The [learner seam](../../src/core/math/learning/learner.ts) exposes inputs, outputs and a decision
counter without an explicit distinction between requesting an action and consuming it.
The [run controller](../../src/skills/locomotion/learned-run.ts) publishes inputs and reads
external outputs at the same decision boundary. The
[punch controller](../../src/skills/strikes/straight-punch.ts) publishes inputs before native
inference uses them on a subsequent control step.

The [case environment](../../research/case-learning-environment.mjs) advances to the next
decision counter change. Run environments also implement their own stepping loops. A loop that
returns after every physics step can submit actions faster than the run consumes them, assigning
transitions to discarded proposals. Counting decisions alone also leaves observation/action
ordering ambiguous.

Fix the common seam and adapters, then migrate every learner producer and consumer found by an
inventory of the code and supported research entry points. Include experimental environments
that remain eligible for training; retire or refuse incompatible ones. Option selection and
motor control have their own clocks and remain outside this protocol.

## Shared contract

Use a small, explicit request/response handoff in the learner's plain state. A request has an
identity and its observation; a response names that request and carries its action. Track which
response is consumed. Keep the state copyable through the existing world snapshot machinery.
Use existing storage where possible and reuse arrays in the control path.

1. At its own decision boundary, the controller publishes the observation and a new request.
2. A policy answers that request exactly once. Native inference answers synchronously; the
   external adapter answers while the world is stopped between steps.
3. Both paths consume the response on the next control step, before calculating that step's
   motor commands. The controller holds the accepted action until its next response is consumed.
4. The next request closes the transition and supplies the next observation. The adapter stops
   there, before advancing physics under a new response.

This gives native and external policies the same one-control-step handoff. Migrate controllers
to this ordering explicitly; read any resulting behavior change rather than claiming parity
with their existing ordering. A request must be observable between world steps, including when
the controller requests an action on every step.

Reject responses to the wrong request and duplicate responses as returned protocol failures.
A missing response at its consumption point is a protocol failure, rather than an implicit zero
action or silent reuse of a response for another observation. An inactive controller may retain
its last accepted action only for the lifecycle that owns it; cancellation clears pending work.

## One environment adapter

Put request publication, response acceptance and consumption helpers beside the learner seam.
Put world advancement and transition collection in one research adapter, starting from the case
environment's loop. Skill environments supply reset recipes, observations, reward readers and
termination readers. They do not choose how many physics steps constitute an action.

Reset advances to the first request and returns its observation without inventing a training
action for warm-up. A submitted action must answer that request. Advance through its consumption
and collect each resulting physics interval exactly once until the next request or episode end.
Record the consumed request identity, elapsed time and physical step count with the transition.
Integrate reward rates by simulation time and count event rewards once; preserve each reader's
declared units rather than applying a blanket cadence multiplier.

Termination or truncation may close a partial interval. Return the final observation and the
correct termination flags for bootstrapping, without waiting for another request. If the episode
ends before the pending response is consumed, report that outcome explicitly and omit it from
action training. Bound advancement and report an inactive or stalled learner instead of spinning.
Warm-up, cancellation and time without an active learner are not fabricated action transitions.

World forks and restored snapshots preserve pending requests and accepted actions. An environment
reset starts a fresh protocol lifecycle; responses from another lifecycle cannot be accepted.

## Training configuration and saved policies

Declare observation layout, action layout, protocol version, decision schedule and reward units
in the environment/checkpoint metadata. Count training timesteps as consumed actions and report
physics steps and simulated seconds separately.

Express discount and rollout horizons against the declared decision interval. For supported
fixed schedules, derive trainer settings from that interval. If a controller has variable
intervals, use elapsed-time discounting through a trainer that supports it, or return an explicit
unsupported configuration. A fixed per-transition discount must not silently stand in for an
arbitrary physical duration. Handle terminal partial intervals consistently with bootstrapping.

Loading weights for inference is separate from resuming optimizer state. Validate resume
compatibility before training. Weights from a different protocol may seed a fresh run with
explicit metadata; incompatible counters, normalization, discount settings and optimizer state
are not silently resumed. Preserve useful candidate policies for paired evaluation.

## Implementation and verification

First inventory learner owners, inference paths, environments and checkpoint loaders. Trace
request, response, consumption and physics-step order for the run and punch to establish the
affected paths. Keep the shared protocol small enough that skill code only requests and consumes
actions; it does not implement a second scheduler.

Implement the handoff and common adapter, migrate supported callers, and remove their duplicate
action-stepping loops. Update the architecture and training instructions to describe the shared
contract. Register concrete regression coverage in the test inventory.

Reproduce the discarded-action defect with distinct successive actions on the affected run
environment. Verify that each returned action transition names exactly one consumed response,
with the corresponding observation and reward interval. Cover the observed publication/consumption
ordering difference through the punch path as well. Exercise reset, restored phase and terminal
partial intervals through those same paths, keeping retained tests focused and short.

Read native and external execution with the same deterministic policy and seed on run and punch,
including the supported 120 Hz and 480 Hz configurations. Compare consumed actions and physical
outputs at matching steps. Also trace distinct sampled actions: mean-policy parity alone cannot
establish that training assigns rewards to the actions actually consumed.

Run the required code checks and any build checks required by the changed modules. Read affected
capabilities against their paired baselines before keeping controller behavior changes. Use a
short training smoke run only to confirm transition counts, metadata and resume refusal; this
plan does not require a locomotion improvement or a long training campaign.

## Completion

- All supported learned controllers and training environments use the shared handoff.
- Every emitted action transition corresponds to one consumed response; stale, discarded and
  unconsumed proposals cannot enter the training batch as ordinary actions.
- Native and external execution agree on observation, consumption and reward interval timing,
  while each controller retains its declared cadence.
- Lifecycle and checkpoint compatibility failures are explicit, and training figures distinguish
  actions from physics steps and simulated time.
- Required checks pass, affected behavior changes have paired readings, and Warrior travel
  remains paused until resumed separately.
