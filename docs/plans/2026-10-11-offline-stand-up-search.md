# Fast, robust rising: a 24-hour research campaign

## Mandate and outcome

Research and implement substantially better recovery through joint design of movement,
feedback, feet and open hands. Plan for **24 hours of active campaign time**, with an explicit
extension envelope to 32 hours. This is a sustained research effort, not another short parameter
sweep. Writing this plan does not start the campaign or launch compute.

Priority order: reliability, speed, compatibility with ordinary play, then appearance.
Human-looking movement is optional. Rolling, sliding, asymmetric pushes and unusual but
physically valid supports are acceptable. Novelty is a means, not a success criterion: even the
old strategy qualifies if it becomes substantially faster and more robust. The current
15.56-second single-case refinement does not qualify.

The owner permits experiments with sole geometry/materials, open-hand geometry and palm
compliance, body/leg geometry and muscles. Treat the current body as one design candidate.
Keep an additional recovery variant and explicit body configurations until comparative results
justify promotion; do not silently replace shared anatomy, gameplay presets or physics.

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

Replace and compare two concrete weaknesses:

- `recoveryScore` rewards failed candidates mainly for height, uprightness and low velocity.
  A useful roll/unload can initially worsen all three. Its causal effect needs an experiment.
- `beamEvaluator` forecasts a candidate pose followed by interpolation toward standing, with
  one second of combined control/lookahead and a narrow retained frontier. That is not a
  reliable test of whether an intermediate contact state has a successful continuation.

Keep the old score/planner as controls. Compare methods at equal compute, on identical starting
states and bodies. Do not attribute gains to a new algorithm when only its budget increased.

## Success levels and clocks

These are engineering targets, not measured human benchmarks. A substantial improvement can land
under that label while the full target remains open.

| Level | Required outcome on the 64-case directional selection suite |
|---|---|
| Feasibility | One unassisted recovery from the exact two-Front-shove fall within 6 s, followed by verified standing and walking. A slower new route is a development seed only. |
| Substantial improvement | At least 58/64 completions within 12 s, at least 14/16 in each group, group median at most 8 s, every cardinal direction passing. |
| Full target | At least 61/64 completions within 6 s, at least 15/16 in each group, group median at most 4 s, every cardinal direction passing. |

Groups are Warrior/Rogue crossed with empty hands/retained right-hand club. Both landing levels
also require independent validation and gameplay checks below. Substantial improvement must beat
the frozen existing comparator by at least 10 additional cases at the same 12-second deadline;
if that comparator already meets the substantial reliability gate, require at least 30% reduction
in failure-inclusive median without losing completions instead. Also report 35-second completion
rates so a faster deadline cannot hide lost eventual recoveries. Compare against the original
body/controller and against the same controller on the selected body. Beating only the weak
15.56-second refinement is insufficient.

Screen staged rise and support recovery before candidate selection, freeze the principal
comparator and report the other. Keep original and current-sole anatomy separate. Do not select
the weakest baseline after seeing results.

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
| 0-2 | Audit, manifests, baseline and optimizer controls | Replayable failures, frozen comparison/validation recipes, calibrated budgets |
| 2-5 | Mechanical pilots and successful recovery suffixes | Valid foot/palm designs and short routes into standing, or isolated failure evidence |
| 5-10 | Contact-strategy and long-horizon discovery | Diverse physical routes; first complete fall-to-standing demonstration and playback |
| 10-14 | Body/controller co-optimization and timing | Matched comparisons and a reliability/time/design shortlist |
| 14-18 | Feedback, curriculum and switching | Runtime candidate handling varied falls without repeating failed actions |
| 18-20 | Adversarial failure search and repairs | Minimal failure recipes; frozen final candidate |
| 20-24 | Held-out qualification and delivery | Results table, gameplay checks, visible review and reproducible artifacts |

Create a durable campaign ledger. Track wall time, worker-seconds, physics steps, evaluations,
body/engine/source identities, seeds and cancellations. Start with three worker threads, at most
four, one sequential physics loop per worker, leaving capacity for the owner's session. This plan
does not require sub-agent delegation.

The nominal campaign has a **160-million counterfactual physics-step cap** and a 24-hour active
allocation. All methods, restarts, body designs, finite differences, tails and failed evaluations
share it. Protect 15% of compute for validation. These are proposed caps, not throughput claims.
A 15-minute pilot measures restore/step/score cost and predicts affordable complete evaluations.
Reduce branch/population counts when needed; never claim nominally budgeted rollouts actually ran.

Checkpoint at least once a minute, including optimizer state, physical ancestry and budget.
Reserve maximum steps before launching an evaluation and charge interrupted work conservatively.
Bound deadline overrun to an in-flight evaluation. Resume without resetting counters.

At hours 5, 10, 14 and 20, record a continue/change/close decision using the phase gates. An
additional **8-hour / 40-million-step extension envelope** requires a written decision naming
the promising result or narrow blocker it addresses. It is not a fresh budget per failed idea.
Phases that pass early and branches that fail donate time to other declared work. Preserve the
validation reserve; with no viable candidate, use it for failure reproduction/reporting rather
than a misleading qualification run. Budget exhaustion is not achievement.

Use local CPU execution initially. Inventory available GPU/training/simulator tooling in the
first two hours. Cloud spending and new external services are outside this plan. Any GPU or
alternate-engine branch needs a bounded setup cost and a measured reason it can improve the
working path. Do not let infrastructure replacement consume the campaign.

## Physical contract and reusable work

Use gameplay `rapier-coordinate`, 120 Hz, symmetric actuation, balance 0 and the pinned vendored
Rapier artifact. Keep collision, joint limits, speed-dependent muscle bounds, actual retained
items and material laws active. Qualified movement uses `World.step` and ordinary muscle commands;
root motion comes from internal actuation and physical contact reactions.

The offline planner may inspect full state and restore candidate-start checkpoints. The runtime
policy reads only permitted body/senses observations and uses ordinary muscle/permitted grip
commands. It has plain serializable state, immutable tuning and deterministic core arithmetic.
Offline population search stays outside the game loop unless a separate runtime budget is measured.

Restore physics/world/body/controller/orders/actions/material history and clocks together.
Require exact continued observations in fresh-world and candidate-order replay. Changed geometry,
mass, material, actuation or engine revision requires new worlds and falls. Never transplant
contact manifolds across bodies. Include shared Lab recipe source in configuration identity.

| Existing component | Role |
|---|---|
| `research/stand-up-environment.mjs` | Actual host, action port, reset/replay and physical evaluator |
| `research/stand-up-search.mjs`, `stand-up-beam.mjs`, `stand-up-native.mjs` | Controls and rollout machinery; replace weak continuation scoring rather than adding phase patches |
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

## 1. Give the search an achievable ending

Build a library of **physically reached** near-standing, crouched and supported states from
executed baseline recoveries and controlled physical lowering. Save velocities, contacts,
material history and the prefix that produced each state. Do not install attractive poses and
call them reachable. Label assistance-dependent fixtures separately.

Optimize 0.5-2 s suffixes into quiet standing and the host tail. Then move the starting point
earlier, retaining successful suffixes as initial guesses while allowing them to change. This
is a curriculum over starting difficulty, not reverse-time physics or teleported stitching.
Continue every segment from its predecessor's actual state and reoptimize; pose matching cannot
join dynamic trajectories. Final qualification always starts at the full fall.

Keep independently generated strategies alongside the old controller's seeds. Measure each
suffix's capture region by perturbing incoming configuration, velocity and contact load, then
actually executing it. A matched endpoint is not a universal terminal controller.

Before scaling up, recover a perturbed known-solvable suffix and reject unfinished, airborne,
wrong-support and artificially assisted traces. If the final supported rise remains unsolved
at hour 5, isolate the first lost contact, blocked joint or saturated actuator. Spend at most
the next two hours on that reduced problem before changing approach. Deliver an executed
counterexample, not a generic claim about Rapier or an inability to diagnose it.

## 2. Search contact strategies and coordinated motion

Use two levels: loose contact sequences and continuous timed muscle/joint trajectories. Contacts
are goals, not welded anchors. Timing, release, rolling and sliding are variables. Describe
actual body patches, orientation and load: touching is not necessarily useful support.

Seed several families where geometry allows:

- Roll prone, acquire hand/shin support, bring feet underneath and extend.
- Side roll into one-hand support, fold a leg underneath and rise asymmetrically.
- Supine rock/sit-up into a squat, helped by an arm or forearm when available.
- Wide-foot crouch, early hand release and coordinated hip/knee/ankle extension.
- Unstructured trajectories without a prescribed contact order, allowing unexpected solutions.

A retained club remains physically present. Adapt to the unavailable palm, use other valid
supports or actual item contacts; never discard the loadout silently.

Search whole-recovery trajectories of 4-8 s, allowing 12 s feasibility seeds, and local windows
of 1-3 s with a physically simulated successful continuation where one exists. Compare a small
horizon sweep at matched budget. Never replace continuation with interpolation toward standing.
Where no successful suffix is known, retain uncertainty and state diversity rather than treating
the leaf as nearly solved.

Start with coarse smooth temporal knots and coordinated limb/trunk variables. Refine knots and
release symmetry around contact changes. Alternate arm, trunk and leg blocks with whole-body
updates; preserve coupled optimization when separate blocks stall. Optimize duration/overlap
without compulsory settling. Compare against the old action representation at equal step budget.

Maintain an archive indexed by support set, lying orientation, foot availability and momentum
direction. Start with 16-32 physically distinct retained states if memory permits, rather than
three branches. Save ancestry and backtrack. Diversity is useful for finding continuations, not
as an independent objective. Route switches start from the current physical state.

Rank physical validity, successful recovery, robustness margin, then time and optional effort/
smoothness. Before success, compare contact-aware shaping with the old height score. Permit
useful temporary loss of height or increase in velocity. Assess leaves with executed suffix
rollouts; a learned predictor is advisory, independently calibrated and cannot declare success.

**Hour-10 gate:** a full unassisted demonstration, preferably within six seconds, or a precise
unsolved suffix/transition. Explore at least one strategy outside the old staged recipe. Expose
the best complete attempt, failures included, in the Lab before the next large allocation.

### Whole-body IK is a bounded experiment

Allow at most 90 minutes within motion discovery for an A/B/C comparison: direct joint-space
seeds, collision-aware whole-body IK contact seeds, and contact goals optimized without IK.
Give them equal physical-rollout budgets and the same final evaluator.

Coordinate pelvis/trunk, legs and available arms; respect measured joint coordinates, whole-limb
clearance, contact normals and patches. Generate continuous paths, not endpoint fits. Avoid
static-balance constraints during intended dynamic transfers. Judge IK by executed recovery and
search efficiency. Drop it if geometric precision does not help. Reuse prior failure fixtures;
do not repeat the entire old IK study.

## 3. Make contact geometry work for recovery

Run mechanics pilots early, then optimize movement for each surviving body. Cheap body pilots
and motion discovery can overlap but share one ledger. Try rigid compounds on existing bodies
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

Avoid the full Cartesian product. Screen roughly 12-20 mechanically distinct designs, retain at
most four, give those equal initial controller-search budgets, then advance at most two to long
feedback search. Include baseline, sole-only, palm-only and combined sole/palm comparisons before
attributing gains to one material change.

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

**Hour-14 gate:** a body/controller pair with replicated gains across development falls, or a
no-go decision per design. A faster Front outlier that loses other cases cannot win selection.

### Creative branches with explicit exits

Use at most four total hours from the existing phase allocations on these branches, chosen by
evidence. Their individual caps do not add to the campaign budget. None is a prerequisite.

- **Assistance that disappears:** temporarily supply declared, metered pelvis support or increased
  muscle capacity to discover a route, then progressively remove it while reoptimizing. Label all
  assisted results. A route counts only at zero artificial assistance with target-body actuator
  limits restored. A zero-assist failure is not a demonstration or a gameplay solution.
- **Learn success prediction or a compact policy:** with positive/negative continuation data,
  train a small predictor or feedback policy on actual rollouts. Compare to nearest-demonstration
  feedback at equal simulation budget. Cap setup/training at three hours and stop without improved
  independent rollout success. Imitating only the old recipe is not a new discovered strategy.
- **Articulated toes:** investigate only if rigid compound soles leave a measured rollover
  obstruction. Start with one loaded hinge and its actual ankle connection, reproducing the
  known failure and rigid control. A hybrid/reduced-coordinate solution needs effort, limits,
  load/unload and replay contracts before whole-body use. Cap the pilot at 90 minutes; a whole
  engine migration is out of scope. See [passive toes](../reference/man-passive-toes.md) and
  the [solver-contract screen](../reference/solver-contract.md).
- **Another simulator as proposal generator:** only if preflight finds an existing useful model.
  First show contact/actuation agreement on a simple loaded task. Transfer proposals into actual
  Rapier and reoptimize there; another engine's success never counts as ours. Stop the port if
  its two-hour pilot does not establish useful agreement and affordable throughput.

## 4. Turn demonstrations into robust, cheap feedback

Begin with a library of verified routes, state-based selection, phase adaptation and bounded
feedback around actual contact transitions. No neural network is required. Inputs include body
configuration/velocity, loaded patches, orientation and progress; no engine handles or camera
information enter the policy.

Train on small variations around successful starts, then expand to forward/backward/side falls,
residual spin, awkward arms, yaw and retained load. Curriculum states must be physically reached.
Training from late checkpoints cannot replace full-fall evaluation. Search gains/selection on
sets of cases with at least three independent optimizer seeds, not one nominal tape.

Measure progress toward attainable support/continuation, not phase number. Detect sustained
stalls or recurrent state/action loops; switch to a different verified route or bounded exploratory
action. Explicitly test stuck states. Count every retry and fallback second. Existing-recovery
fallback can preserve gameplay but cannot conceal a failed quick-recovery deadline.

Probe each route's margin: increase perturbations until it fails, vary materials/friction in a
declared neighborhood and delay contact acquisition. Prefer a slightly slower route with a wider
successful neighborhood. Curriculum and candidate selection should grow that neighborhood.

If a learned policy wins, export exact normalization/weights/action mapping, verify agreement
between training and exported actions, preserve deterministic arithmetic and plain saved state,
and test a second recovery in the same world. Measure runtime cost for this actual budget question;
offline throughput is separate. Keep population search outside the game loop.

**Hour-18 gate:** a candidate meeting a development approximation of the substantial-improvement
gate, or a precise account of missing coverage. A nominal action tape is not robust feedback.

## 5. Search for counterexamples before the owner does

Spend two hours trying to defeat the best candidate within declared disturbance bounds. Search
shove magnitude/separation, yaw, physically generated residual motion and recovery-time impulses.
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
segment linear speeds below 0.1 m/s for 0.5 s, then the real-host standing/walking tail.
Preserve the evaluator's upright normal threshold of 0.9 for trunk and terminal foot support. Redesign the geometric
support predicate where necessary while retaining its physical meaning. Report exact counts,
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
No single-case or body-only improvement is the finished recovery skill.

## Evidence, reviewability and stopping

Each batch produces compact results and replayable best/worst examples, with body/material,
engine artifact, source, rate, actuation, balance, loadout, case and optimizer identities.
Separate physical seconds, wall seconds and worker-seconds. Keep raw traces/checkpoints locally
resumable; commit portable seeds/configurations and necessary regressions, not all sampled worlds.

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

- [PartwiseMPC: Interactive Control of Contact-Guided Motions](https://www.cs.ubc.ca/~van/papers/2024-partwiseMPC/index.html)
  motivates loose contact keyframes, flexible timing and partwise/whole-body optimization.
  Adapting those ideas to our actuator/contact model is an experiment, not a reproduction claim.
- [Learning to Get Up](https://tianxintao.github.io/get_up_control/)
  demonstrates discovering motions with stronger characters and adapting to weaker ones.
  Our temporary-assistance branch borrows the curriculum idea; only final unassisted target-body
  execution counts. Its motion-style objectives are not our priority.
- [MuJoCo MPC overview](https://github.com/google-deepmind/mujoco_mpc/blob/main/docs/OVERVIEW.md)
  provides trajectory-cost and predictive-control formulations. Borrowing those methods does not
  require migrating the game; another engine's motion must survive actual Rapier execution.
