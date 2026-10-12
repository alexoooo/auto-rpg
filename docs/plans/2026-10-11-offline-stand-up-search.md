# Fast, robust rising: reproduce, adapt and train a published controller

## Mandate and outcome

Research and implement substantially better recovery by reproducing **Learning to Get Up**, then
adapting its learning method to the actual game body and Rapier. Use **HoST** to guide assisted
exploration and robustness experiments. Feet, open hands and whole-body IK remain supporting
experiments after the training loop works. Plan for **24 hours of active campaign time**, with
an explicit extension envelope to 32 hours. Writing this plan does not launch the campaign.
This is a research allocation, not a promise that full training fits within it.

Priority order: reliability, speed, compatibility with ordinary play, then appearance.
Human-looking movement is optional. Rolling, sliding, asymmetric pushes and unusual but
physically valid supports are acceptable. Novelty is a means, not a success criterion: even the
old strategy qualifies if it becomes substantially faster and more robust. The current
15.56-second single-case refinement does not qualify.

The owner permits experiments with sole geometry/materials, open-hand geometry and palm
compliance, body/leg geometry and muscles. Treat the current body as one design candidate.
The owner also permits **assisted get-up as a useful gameplay skill**, through existing Balance
or an explicit recovery attribute. Assistance may remain in the delivered controller; removing
it is not a prerequisite for success. Keep an additional recovery variant and explicit body/
assistance configurations until comparative results justify promotion; do not silently replace
shared anatomy, gameplay presets or physics.

This document replaces the previous campaign plan in place. Reuse its implemented tools and
retain its unmet objectives. Deliver physical demonstrations, a practical feedback controller
if feasible, a measured comparison and playable evidence. Infrastructure is not the outcome.
A successful tape establishes feasibility for one configuration and state, not optimality or
robustness. A failed search does not prove physical impossibility. Time is not a success guarantee.

## Starting evidence and hypotheses

The [existing study](../analysis/2026-10-11-stand-up-planning.md) records Node Stance Lab trials
on gameplay Rapier, 120 Hz, symmetric actuation and balance 0. On the experimental sole bodies,
unchanged support recovery completed 2/16 cardinal Warrior/Rogue, empty/club cases within the
35-second episode cap. The searched recipe completed 1/16: Front recovery in 15.5583 s versus
the baseline's 29.2917 s. Neither passed a six-second case. These figures do not describe every
existing recovery/body combination.

The Lab's **Get-up experiment** exposes that refinement, soles and exact timed shoves. Node tests
reproduce its witness and match the Lab actor's initial recovery motion to the search environment.
Visible browser review remains unperformed because browser tools were unavailable. This is a
starting exhibit, not a qualified result.

We tried full-trajectory sampling, branching continuations and reference compression as well as
recipe tuning. The native tracker's twelve-step lookahead was 0.1 s; that was not the horizon of
every experiment. Longer horizons alone are not an established cure.

The central hypothesis is that a published learning method and curriculum can discover a
closed-loop recovery that our hand-designed phases and trajectory scoring have not found.
Reproduce a known working reference before designing another optimizer. A paper citation or
pretrained replay is not a reproduction of training, and neither is a working Rapier controller.

Preserve the old search tools as controls and targeted diagnostics. Their height/uprightness
score can penalize useful rolling, and the beam's short interpolation-to-standing continuation
can misjudge intermediate support states. Those are hypotheses for bounded experiments, not the
main implementation agenda. Longer horizons alone are not an established cure.

The studies demonstrate success on their own bodies and simulators. We reuse training methods,
not an assumption that their weights or trajectories transfer. Local execution, dependency
audits and adaptation results are tracked in the existing study as the campaign proceeds.

## Success levels and clocks

These are engineering targets, not measured human benchmarks. A substantial improvement can land
under that label while the full target remains open.

| Level | Required outcome on the 64-case directional selection suite |
|---|---|
| Feasibility | One recovery from the exact two-Front-shove fall within 6 s at a declared assistance setting, followed by verified standing and walking. A slower route is a development seed only. |
| Substantial improvement | At least 58/64 completions within 12 s, at least 14/16 in each group, group median at most 8 s, every cardinal direction passing. |
| Full target | At least 61/64 completions within 6 s, at least 15/16 in each group, group median at most 4 s, every cardinal direction passing. |

Apply these gates separately to **assisted** and **zero-assist** configurations. A qualified
assisted result achieves the gameplay objective at its declared setting; zero-assist success is
an independent result and is not required to land it. Do not pool assistance levels to meet a
gate. Freeze one primary assistance configuration before final qualification; secondary settings
are explicitly exploratory unless they receive their own full qualification.

Groups are Warrior/Rogue crossed with empty hands/retained right-hand club. Both landing levels
also require independent validation and gameplay checks below. A claim of algorithmic substantial
improvement must beat the frozen matched-assistance comparator by at least 10 additional cases
at the same 12-second deadline; if that comparator already meets the substantial reliability gate,
require at least 30% reduction
in failure-inclusive median without losing completions instead. Also report 35-second completion
rates so a faster deadline cannot hide lost eventual recoveries. Compare against the original
body/controller and against the same controller on the selected body. Beating only the weak
15.56-second refinement is insufficient.

Screen staged rise and support recovery before candidate selection, freeze the principal
comparator and report the other. Match anatomy, assistance ceilings, recovery gating and ordinary
host Balance in controlled comparisons. Also run the old controller with the simple metered
recovery assist developed below: identify what assistance alone buys before crediting learning.
Keep original and current-sole anatomy separate. Report the original zero-Balance gameplay
baseline separately; that comparison measures the combined product change, not algorithm quality.
Do not select the weakest baseline after seeing results. If the simple assisted old controller
already meets the absolute reliability/time gates and the stated improvement margin over original
gameplay, it can land as the assisted product improvement. Report that learning has not added value;
do not require beating that new assisted control to deliver an already successful solution.

The clock starts at actual recovery takeover; also report first-down time and the Lab's deadline
from that origin. Landing, preparation, retries and the 0.5-second quiet-standing check count.
No clock reset at a milestone or route switch. Handover must survive 2 s of actual host standing
and 1 s of walking with at least 0.1 m displacement. This verification tail does not increase the
handover deadline. Failures are infinite/right-censored in medians, never omitted. Keep deadline
outcomes and later completion times separate.

## Time, compute and decisions

The nominal schedule totals 24 active wall-clock hours, including implementation, analysis,
experiments and review. Concurrent work is counted once. Record pauses/machine unavailability
separately; do not idle to consume time. A fully qualified result may finish early; otherwise
this is a meaningful 12+ hour effort, not closure after the first failed four-hour search.

| Active hours | Work | Observable deliverable |
|---|---|---|
| 0-3 | Reproduce upstream playback, audit training and freeze comparisons | Working reference or exact setup blocker; pinned sources, hardware and case manifests |
| 3-6 | Adapt observations/actions, assistance and learner to Rapier | End-to-end rollout/update/checkpoint loop; measured training throughput and actuator checks |
| 6-12 | Train recovery with a success-driven curriculum | First complete Rapier recoveries, retained assisted candidate and assistance ablation |
| 12-16 | Expand fall coverage and test selected contact designs | Repeated gains across starts/seeds; body/assistance shortlist |
| 16-20 | Export policy, test fallback and search adversarial failures | Playable feedback candidate, action parity checks and frozen final configuration |
| 20-24 | Held-out qualification and delivery | Results table, gameplay checks, visible review and reproducible artifacts |

Create a durable campaign ledger. Track wall time, worker-seconds, physics steps, evaluations,
body/engine/source identities, training updates, seeds and cancellations. Start with three worker
threads, at most four, one sequential physics loop per worker, leaving capacity for the owner's
session. This plan does not require sub-agent delegation.

The nominal campaign has a **160-million simulated physics-step cap** and a 24-hour active
allocation. Count all reference simulations, training environments, evaluation tails and failed
runs. Record engine steps, internal substeps, policy transitions, simulated seconds and learner
updates separately; one GPU batch is not one step, and engines need not cost the same per step.
Protect 15% of compute for validation. These are proposed caps, not throughput claims.
A 15-minute pilot measures end-to-end collection, transport, update and evaluation throughput,
including learner/worker idle time. Predict affordable training transitions and compare them with
the upstream schedule. Reduce experimental breadth before starving the main training run; record
if the budget cannot support a credible attempt. Training curves, not elapsed time, determine
whether to continue. Never claim nominally budgeted rollouts actually ran.

Checkpoint at least once a minute, including policy, normalizers, optimizer, replay buffer or
rollout state, curriculum, PRNGs, physical ancestry and budget. Verify resumed learning retains
that state; exact cross-hardware training determinism is not the runtime replay contract.
Reserve maximum steps before launching an evaluation and charge interrupted work conservatively.
Bound deadline overrun to an in-flight evaluation. Resume without resetting counters.

At hours 3, 6, 12, 16 and 20, record a continue/change/close decision using the phase gates. An
additional **8-hour / 40-million-step extension envelope** requires a written decision naming
the promising result or narrow blocker it addresses. It is not a fresh budget per failed idea.
Phases that pass early and branches that fail donate time to other declared work. Preserve the
validation reserve; with no viable candidate, use it for failure reproduction/reporting rather
than a misleading qualification run. Budget exhaustion is not achievement.

Inventory local CPU, GPU, Python, compatible Linux/WSL and simulator tooling in the first phase.
Use an isolated pinned environment for upstream dependencies. Upstream execution in MuJoCo is
part of reproduction, not a game-engine migration. Rapier data collection may be CPU-bound even
with a GPU learner; do not borrow Isaac Gym throughput claims. Cloud spending and new external
services are outside this plan. Bound setup work and record actionable blockers rather than
letting infrastructure replacement consume the campaign.

## Physical contract and reusable work

Qualify in gameplay `rapier-coordinate`, 120 Hz, symmetric actuation, the pinned vendored Rapier
artifact and explicitly declared Balance/recovery assistance. Keep collision, joint limits,
speed-dependent muscle bounds, retained items and material laws active. Qualified movement uses
`World.step`, ordinary muscle commands and the authorized metered `Assist` path. Root motion may
come from muscle/contact reactions and that declared external wrench, never pose/velocity writes.
Zero-assist claims require no external wrench and target-body muscle capacity restored.

The offline planner may inspect full state and restore candidate-start checkpoints. The runtime
policy reads only permitted body/senses observations and uses ordinary muscle/permitted grip
commands plus explicitly granted assistance requests. It has plain serializable state, immutable
tuning and deterministic core arithmetic.
Offline population search stays outside the game loop unless a separate runtime budget is measured.

Restore physics/world/body/controller/orders/actions/material history and clocks together.
Require exact continued observations in fresh-world and candidate-order replay. Changed geometry,
mass, material, actuation or engine revision requires new worlds and falls. Never transplant
contact manifolds across bodies. Include shared Lab recipe source in configuration identity.

| Existing component | Role |
|---|---|
| `research/stand-up-environment.mjs` | Actual host, action port, reset/replay and physical evaluator |
| `research/stand-up-search.mjs`, `stand-up-beam.mjs`, `stand-up-native.mjs` | Frozen search controls and targeted diagnosis; not the main learning algorithm |
| `research/cma.mjs` | Resumable covariance search, including PRNG and optimizer paths |
| `research/stand-up-design.mjs`, `stand-up-design-screen.mjs`, `stand-up-sole.mjs` | Extend narrow body screens to real sole/palm designs and matched trials |
| `src/lab/recovery-recipe.ts`, `research/stand-up-feedback.mjs` | Existing-recipe comparator and seed, not the required action representation |
| `research/stand-up-feedback-seed.json` | Preserve the portable slow witness as a regression/control |
| `src/lab/stance-scenario.ts`, `stance-mode.ts`, `history.ts` | Candidate playback, exact shove recipe and diagnostics |
| `research/stand-up-ik.mjs`, `stand-up-contact.mjs` | Optional geometry seeds and collision diagnosis |
| `tests/core-supported-extension.test.mjs` | Supported-extension fixture; revalidate its physical state/force path before relying on it |

Recheck action coordinates: legal min/max are already reference-relative; add bind only where
an anatomical posture API requires it. Test signs/coupling through actual joints. Keep the known
successful action replay and known failed/unfinished recovery as evaluator controls.

## 1. Reproduce a working reference before adapting it

Start with [Learning to Get Up](https://github.com/tianxintao/get_up_control): pin the upstream
revision, dependencies, body assets and pretrained teacher/student checksums. Check licensing
before incorporating source, assets or weights. Keep the research environment separate from game
runtime dependencies. Replay the supplied controller on its original MuJoCo model and save
observations, actions and video across varied fallen starts, including observed failures.

Audit the implementation rather than reconstructing it from the abstract. Extract the exact
observation normalization, action semantics, controller frequency, actuator model, rewards,
termination, fall initialization, SAC configuration and strength curriculum. Trace one episode
from state through action to applied torque. Execute a short training/resume smoke run; distinguish
that from successfully retraining the paper's result. Preserve a small unchanged upstream control.

The reproduction gate is successful pretrained playback plus a verified train/update/resume path
and a concrete mapping to our body. Upstream reward or termination is not our gameplay success
predicate. Record deviations required by the port, and introduce them separately from algorithm
changes. Natural-motion slowing/distillation is optional after reliable target-speed recovery.

**Hour-3 gate:** usable reference and adaptation spec, or an exact dependency/model blocker.
Bound compatibility fixes to this phase. If blocked, inspect FRASA's smaller published training
pipeline as the documented fallback; budget that substitution explicitly and retain its restricted
symmetric action-space caveat. Do not claim reproduction or default silently to more recipe tuning.
HoST is a robustness/assistance reference; switching the main learner to its PPO implementation
requires a specific failure hypothesis, a pinned configuration and a bounded comparison.

## 2. Adapt and train on actual Rapier dynamics

Connect an external learner to the existing headless environment through persistent batched
workers. Python may own learning; Node workers own actual `World.step` rollouts. Avoid starting a
process or sending an RPC for every joint or physics substep. Verify episode reset, terminal versus
time-limit handling, reward scaling, finite observations, action delays and randomization seeds.
Measure the complete pipeline before launching long training. Keep one primary learner/config.

Build an explicit joint/action map through actual muscles: signs, ranges, bind conventions,
reference frames and speed-dependent effort limits. A MuJoCo motor action is not automatically an
Auto-RPG muscle command. Test isolated channels and a coordinated supported rise. Action repeat
must preserve 120 Hz physics and a declared policy rate. Include any action filtering/history in
the exported controller. Do not secretly raise gains, strength or damping to make the port work.

Use only observations available to the runtime body/senses, including permitted configuration,
velocity, orientation, contact information, loadout and assistance setting. Privileged training
state may evaluate rewards or a separately identified critic, but cannot leak into the actor.
Retain full-body asymmetric control for coverage; reduced symmetric actions are an ablation or
initial curriculum, not evidence for handling one occupied hand and side falls.

Begin with the published reward and curriculum structure, translated for scale and actuator
semantics with each deviation documented. Audit reward components against actual successful and
failed traces. Penalize endless hovering, jitter and repeated resets through the task's real
completion/timeout criteria. Keep training returns separate from held-out recovery metrics.
Do not reward height as a substitute for terminal foot support and host handover.

Run a short fixed-body comparison of strength curriculum versus HoST-inspired root assistance,
then give the better-supported configuration the main budget. Do not change both at once and
attribute the result to either. Training strength overrides are immutable, labeled and restored
before target-body qualification. Retained gameplay assistance is governed below. Reduce difficulty
when learning stalls, retain successful checkpoints, and advance curricula based on measured
success across starts rather than elapsed updates alone. Keep an assisted checkpoint before
attempting reductions; unsuccessful zero-assist refinement cannot erase the playable result.

Physically reached near-standing/supported states from executed recoveries or lowering can seed
an easier reset curriculum. Save the generating prefix and velocities/contact history. Move toward
full falls as success grows; never stitch poses or count late-checkpoint success as a full get-up.
Train on prone, supine, both sides, residual spin, awkward arms, yaw and retained load. Try separate
posture experts with observable selection if a single policy fails; HoST's repository does not
establish joint prone/supine training as solved. Count switching time and policy-memory resets.

**Hour-6 gate:** correct rollout/update/resume loop, verified action/assist application and a
credible throughput budget. If an easy supported or assisted task cannot be learned, diagnose
that minimal task before spending millions of full-fall steps.

**Hour-12 gate:** repeated complete Rapier recoveries at a declared target assistance level,
preferably within six seconds, or an isolated adapter, exploration or mechanical failure.
Expose the best actual attempt and a representative failure in the Lab. A higher reward curve or
one lucky tape does not pass this gate. Evaluate at least three independent training seeds within
the allocated budget; report their spread and short/failed runs, not just the selected seed.

### Assistance is both a curriculum tool and a gameplay outcome

HoST uses temporary pulling during training. Retaining a bounded assist in our game is an
owner-authorized design choice inspired by that mechanism, not a claim about its deployed policy.
Maintain separate labels for temporary training help, retained gameplay help and zero-assist runs.

Prefer existing `AttributeSpec.balance`, `balanceCeiling` and `Assist` first. They already express
force in body weights and moment in weight-metres, clip requests, and meter actual delivered
wrenches (`src/core/control/assist.ts`, `src/core/rules/rulebook.ts`). A separate recovery attribute
is an allowed experiment if standing Balance and get-up power need independent control. Give it
explicit units, provenance, UI meaning and a shared ceiling/arbitration rule; never stack two
unmetered allowances or disguise support as anatomy. Do not change default character attributes
merely to expose the experiment.

Build a simple bounded root-height/orientation feedback assist as the first control, then compare
it with a learned wrench or learned modulation of that feedback. Start with requested upward force
and righting moment; extend directions only for a demonstrated need. Recovery cannot require
already-supported feet to access its assist. Route requests through the body's authorized port;
policies never receive engine handles. Audit `Assist.ask` ownership: the last ask wins, so stance
and recovery must not overwrite or double-count each other. Release recovery requests at handover,
interruption and death, and verify no stale wrench persists into another step or recovery.

Pilot Balance values 0, 10, 25, 50 and 100 percent on the fixed body, under the existing moment rule.
These are experimental ceilings, not selected game defaults. Temporary training help may start
higher when recorded, but qualification uses a frozen gameplay setting. Optimize success/time
first, then reduce required force, torque, duration and abruptness. Select the lowest useful
ceiling from a success/time/assistance comparison, not an arbitrary zero-assist requirement.
A change to the force/moment relationship is a separately named rule experiment.

Measure requested and delivered peak/mean force and moment, saturation, active duration, integrated
force magnitude (N s), integrated moment magnitude (N m s), and positive/negative external work
from wrench and root linear/angular velocities. `Assist.meter` sums magnitudes; it does not itself
measure work. Separate training, recovery and host-tail assistance. A positive Balance setting
with zero delivered wrench is not evidence that the policy actually needed assistance.

For causal comparisons, replay an identical physically reached fall with recovery help gated until
takeover; retain the same ordinary-host assistance across those variants. Separately test the full
gameplay configuration from standing, where Balance may prevent the fall. Fall prevention is not
get-up success. Restore assistance state together with physics and controller state.

Require loaded correctly oriented feet and a stable handover at the chosen assistance level.
A hovering upright body fails. The recovery-specific assist must ramp out and release to the host's
declared ordinary Balance before the completion check; this transition counts toward the clock.
The host standing/walking tail may use that declared Balance, with delivered help reported. Also
probe sudden loss/reduction of help as a robustness diagnostic, not a zero-assist landing gate.

### Targeted motion search and whole-body IK

Keep successful physical suffixes, loose contact sequences, 4-8 s trajectory search and partwise
optimization as targeted tools for a diagnosed transition or useful curriculum seed. They do not
replace the reproduction/training path by default. Allow at most two total hours within the main
schedule for this branch, including up to 90 minutes for whole-body IK.

Compare direct joint-space seeds, collision-aware whole-body IK contact seeds and contact goals
without IK at equal physical-rollout budgets. Coordinate pelvis/trunk, legs and available arms;
respect actual joint coordinates, whole-limb clearance and contact patches. Generate continuous
paths and execute them. Geometric fit alone cannot prove dynamic feasibility. Retain a seed only
if it improves executed recovery or sample efficiency; otherwise stop the branch. Reuse the prior
failure fixtures instead of repeating the whole IK study.

## 3. Make contact geometry work for recovery

Freeze one body for the first learning experiments. Once the training loop produces complete
recoveries, use contact failures to choose mechanics pilots and then retrain/fine-tune for each
surviving body. An isolated mechanical blocker may justify an earlier pilot, but do not multiply
body designs before establishing the learning method. Try rigid compounds on existing bodies
before adding tiny articulated bodies.

These are initial owner-authorized engineering search bounds, not anatomical facts. Freeze
exact dimensions/units per manifest, derive consistent mass/inertia and source any landed spec
values through the repository's provenance rules. Narrow ranges when mechanics requires it;
expansion needs a recorded decision.

| Family | Variables and initial bounds | Hypothesis |
|---|---|---|
| Sole outline | Length/width 0.85-1.25 times baseline; bevel/rocker radius up to 0.2 foot length; flat centre versus rounded edges | Reduce edge trapping and improve folding clearance while retaining terminal support |
| Sole material | Stiffness 0.25-4 times current; damping 0.5-2 times current; depth 2-12 mm; friction 0.4-1.2 under an explicit engine law | Reduce chatter/slip and soften abrupt load transfer |
| Sole regions | Heel/forefoot pads with stiff central support on one rigid body | Permit controlled rollover without a tiny toe body's mass ratio |
| Open-hand shape | Palm width/length 0.8-1.3 times baseline; thickness 0.75-1.5 times; bevels, flattened pad or rounded palm heel | Improve bearing patch, wrist clearance and snag resistance |
| Palm material | Rigid control; stiffness derived for 1-6 mm compression at a declared load; damping ratio 0.5-1.5; friction 0.4-1.2 | Stabilize loading, unloading and support transfer |
| Body clearance | Hip/torso/shank collider dimensions within 10% of baseline where contact diagnosis warrants it | Allow a blocked knee/foot to pass the torso or other leg |
| Muscle allocation | Selected bottleneck channel strength/speed factors 1-1.5, against unchanged muscles | Resolve a demonstrated actuation limit |

Avoid the full Cartesian product. Screen 4-8 mechanically distinct designs and retain at most
two for policy adaptation within hours 12-16. Include baseline, sole-only, palm-only and combined
sole/palm comparisons before attributing gains to a material change. Compare frozen-policy
transfer first, then equal-budget fine-tuning from the same checkpoint; report both. Preserve a
fixed-body training control so extra learner updates cannot masquerade as a geometry improvement.
Use scratch training only when the transfer experiment warrants its cost.

Verify the material path before claiming compliant palms. `ContactMaterial.sole` acts against
fixed colliders and covers the assigned collider's contacts; it is not intrinsically restricted
to the anatomical sole/palm face. Deliberately route a palm pad's shapes and materials. Injury
energy compliance alone is not mechanical deformation. Avoid unintentionally softening a closed
fist or club, and specify behavior against moving bodies rather than inheriting it accidentally.

Measure loaded force/deflection, tangential slip, edge rolling, unload/reload, compression
backstop, geometric penetration and energy. Derive palm damping from the declared effective-load
model; coupled contact dynamics must still be tested. Check open/closed/holding transitions
under load for impulse injection and stale material history. Read 120 Hz; sample finer-rate
diagnosis at the same observation times. Numerical damping/inertia floors remain explicit solver
experiments, not anatomy. Strength/speed changes require measured before/after tables.

Compare old-controller transfer and separately optimized new control for every retained body.
Regenerate falls, use matched external shove recipes and also actual reached lying states.
Report fall prevention separately: resisting the shove is not successful recovery. Record all
geometry/mass/material changes and equal compute allocations.

**Hour-16 gate:** a body/controller/assistance configuration with replicated gains across varied
development falls, or a no-go decision per design. A faster Front outlier that loses other cases
cannot win selection. Drop anatomy changes if the original body with assistance already performs
better under the same budget.

### Further mechanical branches with explicit exits

These are optional responses to measured blockers, sharing at most two hours within the existing
mechanics allocation. Neither expands the budget or delays a viable assisted candidate.

- **Articulated toes:** investigate only if rigid compound soles leave a measured rollover
  obstruction. Start with one loaded hinge and its actual ankle connection, reproducing the
  known mass-ratio failure and rigid control. A hybrid/reduced-coordinate solution needs effort,
  limits, load/unload and replay contracts before whole-body use. Cap the pilot at 90 minutes;
  a whole-engine migration is out of scope. See [passive toes](../reference/man-passive-toes.md)
  and the [solver-contract screen](../reference/solver-contract.md).
- **Alternate simulator for our body:** upstream MuJoCo reproduction is already required; porting
  our body to another simulator for training is a separate branch. Attempt it only if throughput
  or contact evidence justifies the cost and a useful model already exists. Compare loaded
  contact/actuation behavior first, then replay proposals in actual Rapier. Stop after a two-hour
  pilot without useful agreement. Alternate-engine success never qualifies our gameplay variant.

## 4. Export the learned feedback policy and make it playable

The primary deliverable is a compact policy that responds to current state, not playback of a
fixed successful trajectory. Export exact weights, normalization, observation ordering, action
mapping, policy rate, filtering and any recurrent state. Include body, loadout and assistance
conditioning or explicit compatible-model selection. Record the trained configuration's identity.

Compare training-side and exported inference on a saved observation corpus, then compare full
closed-loop episodes on the same Rapier states. Small action differences may change contacts;
a tolerant tensor comparison alone is insufficient. Preserve deterministic core arithmetic and
plain serializable policy state. Keep training libraries outside the browser/core; use an audited
inference implementation compatible with repository boundaries. Audit activation functions and
numeric precision rather than assuming a generic inference runtime preserves bout replay.

Integrate as an additional standing-up variant with the actual host's down/takeover/release rules.
Test interruption, retained item handling, repeated falls and changes in allowed assistance.
Bound stale actions when inference updates more slowly than physics. Explicitly clear recovery
requests on handover. Measure CPU time per active policy, memory and a multi-unit bout; a cheap
neural forward pass does not establish total control cost.

Train and test stuck states. Detect sustained stalls or recurrent state/action loops; permit a
bounded expert switch or existing-recovery fallback. Attribute improvement to the control path
that actually produced it; fallback cannot hide a failed quick-recovery deadline. Count all
retries, route switching and fallback time. Do not assume a selected expert recovers from arbitrary
mid-motion states without testing those transitions.

Probe success margins by perturbing incoming motion, friction and contact timing within declared
bounds. Curriculum/selection should widen that region. If compression or distillation is needed
for runtime cost, evaluate the student independently; teacher success does not transfer by label.
A route library with feedback is a bounded fallback deliverable, separately labeled if training
fails, rather than evidence that the reproduction objective succeeded.

Extend the Lab experiment to select the new variant, body configuration and allowed assistance.
Show Balance or recovery-attribute units, delivered force/moment, saturation, elapsed recovery time,
policy/expert and assist release. Keep the old slow witness available. Provide exact shareable
recipes for successful and failed attempts, including the two Front shoves and repeated falls.
Clearly distinguish upstream reference video, recorded action playback and live exported-policy
control. Verify visual motion from fall through host handover and movement.

**Hour-20 gate:** an exported feedback candidate approaching the substantial-improvement gate
on development cases, with action/replay checks and failure coverage, or a precise account of
what remains missing. Freeze body, policy, assist settings and normalizers before held-out trials.

## 5. Search for counterexamples before the owner does

Spend two hours within the 16-20 allocation trying to defeat the best candidate within declared
disturbance bounds. Search shove magnitude/separation, yaw, physically generated residual motion
and recovery-time impulses.
Include assist saturation and transitions between recovery and ordinary-host assistance.
Minimize each failure to the smallest input change that reproduces it.

Record the first meaningful divergence: wrong-face contact, insufficient friction, geometric
obstruction, actuator saturation, bad state estimate, early support release or missing successful
continuation. Separate observations from causes. Change one suspected cause and rerun the same
state before accepting an explanation.

Add counterexamples to development; they are not held-out validation. Repair the highest-impact
families within the allocation, freeze the final body/controller, and retain three representative
failures beside the successes in the Lab. Do not quietly discard failures after selection.

## 6. Independent validation and gameplay qualification

Create three partitions before training: development, selection and final validation. Generate
attainable states by real falls/disturbances, never interpenetrating installed poses. Freeze case
manifests, bounds and seeds before selection; do not inspect final outcomes while tuning. If
validation outcomes influence repairs, retire that set and reserve a fresh one within the budget.

The public 64-direction suite is selection data: 16 directions in each Warrior/Rogue, empty/club
group. Include the exact Lab Front case. If a redesigned body resists a recipe, report prevention
and obtain a real fall through a predeclared stronger/reoriented recipe. Do not count a non-fall
as get-up success. Classify actual prone, supine and side starts; directions alone do not ensure
lying-state coverage.

Reserve 128 independent final falls, 32/group, using non-grid directions, initial shove impulses
45-75 N s, separations 0.1-0.35 s and physically generated residual motion. Freeze generation
before tuning. Require actual prone, supine and both side states in each group's manifest; use
predeclared additional fall recipes if the shove family cannot supply them, report exclusions
and missing coverage rather than silently selecting favorable outcomes. This is a defined use
case, not arbitrary-force invulnerability.

| Final gate | Substantial improvement | Full target |
|---|---|---|
| 128 held-out falls | At least 116/128 within 12 s, at least 28/32 per group; group median <=8 s | At least 122/128 within 6 s, at least 30/32 per group; group median <=4 s |
| Repeated falls on one body/host | 16 sequences x 3 falls, four sequences/group; at least 15 whole sequences meet 12 s on every fall | At least 15 whole sequences meet 6 s on every fall |
| Disturbed recovery | 32 cases, eight/group; at least 29 within 12 s, at least 7/8 per group | At least 31 within 6 s, at least 7/8 per group |

Repeated falls occur after the prior standing/walking tail without recreating body or mind.
Disturbance trials add one lateral impulse of 10-20 N s at 0.5-2 s after takeover. Freeze direction,
magnitude and timing distributions before tuning. The original recovery clock continues.

Completion requires upright body, loaded correctly oriented feet, supported centre of mass and
segment linear speeds below 0.1 m/s for 0.5 s, then the real-host standing/walking tail. The
recovery-specific wrench has released before that check; ordinary-host Balance is the declared
configuration's and its contribution is reported. No airborne or externally suspended endpoint
passes, even if its orientation and velocity satisfy the numeric thresholds.
Preserve the evaluator's upright normal threshold of 0.9 for trunk and terminal foot support.
Redesign the geometric support predicate where necessary while retaining its physical meaning. Report exact counts,
all failures, censored timing and uncertainty. Finite test success is not a population-level
comparison with humans.

Test selected anatomy through standing, forward/backward/lateral walking and turning, held items,
representative attacks and wound/contact accounting. Use existing tests plus focused checks for
changed mechanics. Require return to combat in a short repeatable bout and exact checkpoint
continuation across contacts and a second recovery. No new hard test failure or concealed
locomotion regression is acceptable for promotion.

Visibly replay successes and representative failures in Lab/Arena from fall through handover
and movement. Check skin and physical shapes. Show intended/actual contacts, saturated channels,
elapsed clock and route. Verify visibility and real frame/world advancement. Node numbers stay
labeled Node; page measurements are named separately. Browser unavailability leaves visual review
explicitly incomplete.

A substantial result can land under that label only after all its gates pass; keep the four/six-
second target open. Do not remove the six-second failing TODO because a 12-second result passes.
No single-case or body-only improvement is the finished recovery skill. An assisted candidate
that passes all gates can land as assisted recovery even when its zero-assist counterpart fails;
keep the zero-assist limitation and its separate tests visible. Qualification results name both
recovery allowance and ordinary-host Balance.

## Evidence, reviewability and stopping

Each batch produces compact results and replayable best/worst examples, with body/material,
engine artifact, source, rate, actuation, balance/recovery allowance, delivered assistance,
loadout, case, learner and checkpoint identities.
Separate physical seconds, wall seconds and worker-seconds. Keep raw traces/checkpoints locally
resumable; commit portable inference weights/configurations and necessary regressions, not all
sampled worlds or replay buffers. Record upstream licenses, pinned revisions, dependency commands,
training commands, checkpoint checksums and every substantive method deviation. Keep pretrained
replay, partial training, successful retraining and successful game adaptation as separate claims.

Extend the Lab experiment to choose selected candidates and reproduce their recipes. Keep the
original slow witness available as a control. Display actual body settings and experimental
status. Clearly distinguish an exported runtime policy from replaying a recorded action tape;
a debug history does not show generalization.

At decision points report what executed, passed and failed; what hypothesis changed; consumed/
remaining budget; and the next discriminating experiment. A failed phase must not dissolve into
indefinite tuning. If the envelope expires, close the campaign with its achieved level,
executable counterexamples and the most informative next decision. Exhausting time or finishing
infrastructure does not mark the full target complete.

Follow `AGENTS.md`: commit landable changes; code runs `npm run check`, `npm test` and relevant
slow tests by name; browser/assets/dependencies also run `npm run build`; large world/engine/body
merges receive the required full gate. Keep new test files fast or list them in `tests/slow.json`.
Do not repeat a qualification battery for every minor tweak. Leave owner port 5180 untouched and
stop temporary servers by verified PID. Gate whitespace/line endings before commits. Code and
comments cite durable records, never this plan.

Update the existing study with measurements. Move selected body/material numbers into appropriate
reference records and landed behavior into architecture/roadmap. Keep one active recovery plan.
Remove it only when its outcome lands or the owner replaces it; retain evidence of incomplete
outcomes rather than relabeling them as success.

## Method references and limits of transfer

- [Learning to Get Up, SIGGRAPH 2022](https://tianxintao.github.io/get_up_control/),
  [official implementation and pretrained policies](https://github.com/tianxintao/get_up_control):
  primary reproduction/adaptation target. Its strong-to-weak curriculum supplies a demonstrated
  discovery method; the later stylistic slowing is optional for our objective. MuJoCo body,
  actuator and observation differences require adaptation/retraining, not direct weight reuse.
- [HoST, RSS 2025](https://taohuang13.github.io/humanoid-standingup.github.io/),
  [official implementation](https://github.com/InternRobotics/HoST): assistance, robustness and
  curriculum reference. Temporary pulling and motion constraints guide exploration. The repository
  notes unresolved joint prone/supine training; assess separate experts explicitly. Persistent
  gameplay help is our authorized extension, not an upstream demonstrated result.
- [FRASA paper](https://arxiv.org/html/2410.08655v1),
  [official implementation](https://github.com/Rhoban/frasa): fallback reproduction candidate and
  action-space simplification reference. Its roughly 2-3 s physical-robot recoveries use a small
  robot and five symmetric control degrees of freedom. Neither speed nor training cost can be
  assumed for our full-body, asymmetric, retained-item task.
- [PartwiseMPC: Interactive Control of Contact-Guided Motions](https://www.cs.ubc.ca/~van/papers/2024-partwiseMPC/index.html):
  bounded contact-guided proposal/transition diagnosis, not the primary training path. Flexible
  timing and partwise/whole-body optimization remain useful if a specific transition warrants it.
- [Existing assist contract and measurements](../reference/assist.md): game-side force/moment
  units, Balance mapping and metering. Prior standing/bout results do not establish get-up ability.

Published success motivates this campaign; it does not establish success on our body. The first
local reference execution, learning curves, actual Rapier recovery and exported gameplay result
must each be demonstrated and labeled separately.
