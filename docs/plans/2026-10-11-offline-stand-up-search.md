# Robust and quick recovery through offline search

## Outcome and priorities

Build an additional recovery variant that gets Warrior and Rogue back into standing and moving
reliably and quickly, including with a retained right-hand club. Reliability comes first, then
speed: retain the four-second median target and six-second deadline defined below. Human-looking
motion is a bonus, not a requirement. Rolling, asymmetric pushes and use of the current foot
geometry are acceptable when they produce a valid recovery. Motion capture is optional.

The existing staged recovery already demonstrates complete stand-up on this engine and body,
although it is slow and unreliable across falls. The new work must improve that baseline.
Offline simulation search replaces manual tuning of the failing Dynamic rise phase sequence as
the main development method. Search for physically executed movements, save successful controls
and trajectories, and use those demonstrations to develop a cheap feedback controller.

Body design is part of the search. The owner explicitly permits changes to feet, compliant
soles, open hands, body and leg geometry, muscle properties and other relevant physical
parameters. The current anatomy is a baseline, not an immutable requirement. Each candidate has
explicit physical bounds; numerical conditioning remains separate from anatomy. Existing
recovery choices remain available, and an experimental candidate does not silently replace a
preset or shared body specification.

A successful action tape is a feasibility witness for its body, simulator and starting state.
It is neither a globally optimal solution nor a robust controller. Failing to find a motion
within a search budget is not proof that one cannot exist. The complete new recovery, runtime
feedback and final qualification remain open.

## Execution status

The outcome has not landed. The offline action environment, exact replay, resumable trajectory
and continuation searches, native lookahead experiments, explicit body screens and bounded
feedback-recipe search are implemented. The portable research seed in
`research/stand-up-feedback-seed.json` completes one Warrior/empty-hands/sole Front fall in
15.5583 seconds, with a verified standing/walking tail. It does not meet the timing target or
generalize across the tested development falls. It is not a gameplay preset.

The body/controller comparisons have not selected a qualified physical redesign. A fast,
robust runtime variant, visible motion review, repeated-fall/disturbance/combat qualification
and the final 64-case gate remain unfinished. Retain this plan until those requirements pass;
do not treat the research infrastructure or the slow witness as completion. Detailed results
and reproduction commands are in [the existing study](../analysis/2026-10-11-stand-up-planning.md).

## Existing evidence and reusable work

| Existing work | Role in this plan |
|---|---|
| `src/core/mind/rise/staged.ts`, `stages.ts` and `support-recovery.ts`; `research/core-rise.mjs` | Working comparison and source of successful control traces. Reproduce on the selected physical baseline; historical results are not new measurements. |
| `research/stand-up-replay.mjs` | Actual Lab host, repeated Front shoves, detached diagnostics and complete continuation checkpoints. Generalize the experiment adapter beyond the current Dynamic rise state schema. |
| `research/cma.mjs`, `research/rollout-pool.mjs`, `research/rollout-worker.mjs` | Seeded search and worker infrastructure. Reuse after checking action, error, cancellation and snapshot semantics for recovery. |
| `research/native-posture-control.mjs`; [native posture control](../reference/native-posture-control.md) | Actual-engine action evaluation and a saved half-kneel hold tape. Its one-step planning horizon and installed starting pose do not solve recovery. |
| `research/stand-up-ik.mjs`, `research/stand-up-contact.mjs` | Optional seed generation, geometry checks and focused contact diagnosis. Their existing A–E IK and boot-preparation results are documented failures, not a required sequence to repeat. |
| `tests/core-supported-extension.test.mjs` | Previously demonstrated half-kneel extension, handover and walking component. Revalidate when reused; it excludes fresh-fall preparation and is outside the fast test tier. |
| [Planning and contact findings](../analysis/2026-10-11-stand-up-planning.md) | Exact failing reproduction and limits of the earlier interpretations. |

The Lab reproduction is a standing Warrior for 240 world steps, a Front shove of 60 N s,
24 steps, and a second Front shove of 60 N s. Preserve one body and host throughout. The
recorded Dynamic rise reaches loaded hands and shins but loses support during placement;
`tests/lab-dynamic-rise.test.mjs` still has a failing six-second recovery TODO.

The prior IK experiment can fit a foot endpoint while intersecting the torso. Its constrained
variants find no complete path under their budgets. Boot contact can carry load on the wrong
face, and an upright torso can still depend on hands on the floor. These findings justify
evaluating complete physical execution rather than endpoint error, pose height or phase count.
They do not establish that the body or Rapier makes recovery impossible.

## Physical execution and comparisons

Begin on gameplay `rapier-coordinate`, 120 Hz, symmetric actuation and balance 0, using the
vendored Rapier artifact installed by the lockfile. All candidates advance through `World.step`
and the normal muscle action path. Joint limits, speed-dependent muscle bounds, friction,
collisions and material behavior remain active. Root movement comes from internal actuation and
contact reactions. No pose/velocity injection, unmetered root forces, hidden solver boosts or
relaxed physics qualify a motion.

The offline planner may own full-world snapshots and inspect complete state. The eventual game
policy receives only the established body/senses observations and permitted muscle/grip actions.
Restoring a candidate's initial checkpoint is allowed; resetting a live episode at intermediate
milestones is not. Counterfactual simulation advances neither the real episode clock nor its
metrics. Every selected continuation must start from the exact physical end of its predecessor.

Freeze engine artifact, source/configuration identity, body/material/muscle specifications,
actuation mode, host configuration, loadout and initial-state recipe for each experiment.
Restore all physics, world, body, controller, held action, orders and clock state. Preserve
optimizer state and random seeds for resumable search. Reject cross-configuration snapshots;
changed geometry or mass requires a newly built world and newly generated falls.

Compare old and new controllers from identical pre-recovery states for a fixed body, then
verify fresh falls under their real hosts. For different bodies, compare the same external
fall recipes and also physically reached lying states. Report whether a body resisted the shove
instead of recovering: preventing a fall cannot substitute for a required recovery trial.

## Work sequence and evidence gates

| Milestone | Deliverable and decision |
|---|---|
| 1 Establish the search environment | Replay the old controller and selected action tapes; verify real actuation, complete reset and independent candidate evaluation. Measure affordable search throughput. |
| 2 Find a complete physical recovery | Save a full action tape and observed trajectory from a real fall through stable handover and walking. Search time may be large; physical recovery time stays visible. |
| 3 Compare body and controller candidates | Use bounded geometry, material and muscle changes with matched search budgets. Keep only mechanically valid candidates with demonstrated recovery benefits. |
| 4 Build feedback and reduce recovery time | Adapt or learn control around demonstrations, test disturbances and changed falls, and meet the four/six-second targets. |
| 5 Qualify the additional variant | Pass directional, repeated-fall, disturbance, combat-return and replay checks on the selected body configuration. |

A failed milestone produces an actionable decision and reproducible evidence. It does not
trigger indefinite pose tuning, a larger budget without recording it, or a claim of completion
based on component tests. Body experiments may begin alongside motion search once their small
mechanical checks pass; a successful route on the unchanged body is not a prerequisite for them.

## 1 Establish the search environment

Create a research-only recovery environment around the real body and host. Give the search an
explicit action port that can replace the recovery sub-mind's commands while retaining the
ordinary muscle driver. The failing Dynamic rise phase machine must not select, veto or restart
the searched actions. Initially use smooth joint targets converted to the existing bounded
muscle commands; verify that the command path actually reaches the intended channels. Normalize
search variables by each candidate's legal ranges and capacities, without equalizing real
positive/negative strengths or defeating velocity-dependent limits.

An episode has a fixed initial checkpoint, complete recovery clock, terminal outcome and saved
action tape. The same detached observations feed evaluation and replay. Include actual contact
patches and loads, joint states and bounds, segment poses and velocities, centre of mass,
physical assistance and held-item state. Save the observation/action relationship explicitly so
there is no one-step timing ambiguity.

Before large searches, require these controls:

- Replaying a known successful old-controller action trace reaches its recorded outcome through
  the action port. Failure here is an environment/action-mapping issue to fix first.
- The known failed Dynamic rise and an unfinished short episode fail the recovery evaluator.
  A briefly upright body, wrong-face boot contact and a standing declaration without walking
  cannot pass it.
- Original continuation, fresh-world continuation and candidate-order permutations produce the
  same selected physical trace and saved policy state. Snapshot bytes need not be identical
  when internal storage histories differ; observable dynamics and continued state must agree.
- Candidate exceptions, non-finite state and malformed commands are explicit failures, never
  high scores or omitted trials. Search workers load Rapier once per realm and evaluate
  sequentially within each worker.

Run a small throughput pilot including snapshot restore, ordinary world stepping and scoring.
Report candidate/physics-step throughput and actual elapsed compute for the named harness.
Use CPU worker threads initially. A GPU or alternative engine is a separate implementation
choice; transfer from another simulator must pass our exact-engine replay before counting.

Initial operational budgets are engineering defaults, not predictions of sufficient compute:

- Pilot: at most 256 complete candidate evaluations or 10 minutes, whichever comes first.
- First search campaign: at most four wall-clock hours or 36 million counterfactual world steps
  across all workers, whichever comes first. This equals 50,000 six-second rollouts at 120 Hz;
  partial windows, verification tails and failed attempts consume the same step budget.
- Start with at most four workers and leave capacity for the owner's session. Save resumable
  search state and the best candidates at least once per minute, with bounded logs.
- Multiple seeds, restarts and body candidates share the declared campaign budget. Record any
  deliberate budget revision before restarting; do not silently launch unlimited campaigns.

**Gate:** known-action replay and evaluator controls pass, and the pilot gives a measured
throughput from which to choose population size, window length and campaign allocation.

## 2 Search for a complete movement

Search continuous control trajectories using bounded control points and interpolation. Start
with seeded evolutionary search using `research/cma.mjs`; its diagonal covariance is a starting
implementation, not evidence that joint correlations are irrelevant. Group coordinated joint
variables or change the sampler if controlled comparisons show the representation prevents
progress. The search operates on actual actions over time, not just the existing phase timers.

Use successful staged-recovery traces as seeds after verifying them on this environment. Include
independent starts so the search can leave the old route. Compress duration progressively while
reoptimizing actions; merely playing a tape faster changes its dynamics. Longer horizons may
find useful intermediate witnesses, but they do not relax the final recovery deadline.

Optimize overlapping windows with future lookahead. Keep several physically distinct promising
continuations and permit backtracking when their later windows fail. Preserve useful prefixes
with their exact physical states and action lineage. A locally high torso or good contact score
does not justify permanently committing to a state with no successful continuation. Search
timing as well as joint targets, and allow transient imbalance, momentum, sliding and rolling.
Do not require every intermediate pose to become a static hold.

Score complete candidates in this order:

1. Physical validity: finite state, legal actuation and constraints, retained equipment and no
   unauthorized assistance or dependence on numerical failure.
2. Verified recovery success over the candidate's evaluation cases, including the subsequent
   standing and walking tail.
3. Complete recovery duration, including failed retries; retain failures in aggregate timing.
4. Secondary costs such as excessive impacts, oscillation, effort and command variation.

Before any candidate succeeds, use graded progress costs to guide exploration: distance from
usable final support, remaining orientation/height error, velocity and progress over a window.
They are search heuristics, not alternative acceptance tests. Once success exists, a better
surrogate score must not replace it with a failed candidate. Appearance, motion-capture error
and a prescribed human contact sequence are absent from the required objective. Reasonable
effort/smoothness preferences must not reward remaining motionless on the floor.

Whole-body IK remains optional for seeds, clearance diagnosis and adapting targets. Reuse the
verified joint conventions and actual hand/boot/held-item geometry; check the whole moving limb
and path, respecting physical collision exclusions. Supporting shins and palms may roll or
slide, so they are not automatically welded material points. Do not repeat the entire A–E
comparison unless a changed hypothesis warrants it. IK output is always tested by forward
physics, and IK is not required in the final controller.

If the campaign stalls, inspect the first unrecoverable divergence among its best candidates:
actuator saturation, geometric obstruction, loss of support, poor future-state evaluation or a
restricted action representation. Use a focused fixture only when it resolves that decision.
Change one of the search representation, horizon, initialization, physical design or controller
execution according to evidence. Log the failure and exhausted budget; endless manual phase
patching is not the fallback workflow.

**Gate:** from one actual fallen state, one uninterrupted physical episode reaches quiet
standing, hands back to the real host, remains standing for two seconds and walks for one.
Save initial state, complete actions and observations, body/engine identities and elapsed times.
Replay it in a fresh compatible world and inspect the complete motion briefly in the visible
Lab. Mark a slow success as a feasibility result, not a passing new variant.

## 3 Search body and controller together

Keep the current body as one candidate. Declare a small parameter family and finite bounds
before each comparison; start with contact shape/material or an identified clearance/actuation
bottleneck rather than changing every property at once. Bounds preserve useful standing,
walking, reach, equipment handling and combat, without treating human appearance as a constraint.

| Design family | Candidate variables | Checks before recovery search |
|---|---|---|
| Rigid feet and soles | Dimensions, edge rounding, contact shape, friction | Loaded support, sliding/rolling response and standing/walking compatibility |
| Compliant soles | Stiffness, damping and maximum compression | Load/deflection and unloading response, penetration/backstop, energy behavior and stability |
| Open hands | Applied palm hull, thickness, friction, wrist range | Loaded support, floor/body clearance, pose changes and retained-item compatibility |
| Torso and legs | Collider clearance, proportions, mass distribution and inertia | Legal assembly, admitted self-contact, joint reach/limits and ordinary movement |
| Muscles | Joint-specific strength, speed, response and passive properties | Declared force/speed envelope, joint tracking and measured effects on recovery and combat |

Use the existing physical sole-contact capability in `src/core/engine/rapier.ts` and
`ContactMaterial.sole` in `src/core/spec/body.ts` for compliance candidates. Confirm its
load/unload behavior for the proposed settings. A changed mesh, friction coefficient or injury
compliance alone does not implement a mechanically compliant shoe sole.

The owner's authorization permits physical redesign without first proving that today's anatomy
is defective. Every changed spec still has provenance, with owner-chosen engineering values
identified as such. Muscle strength/speed changes carry the before/after measurements required
by `AGENTS.md`. Keep mass, inertia, gravity and geometry mutually consistent; solver inertia
floors or damping used solely for numerical conditioning remain named solver changes.

Search control separately for each body, reusing and adapting successful targets as seeds.
Allow a documented equal compute budget per candidate within a campaign, and compare both a
shared-policy transfer and the candidate's optimized policy where useful. Do not attribute a
benefit to geometry when only the optimizer budget or controller changed. Regenerate falls for
each physical specification; preserve the old/new body and old/new controller comparisons.

Reject a design that wins recovery through unstable joints, excessive interpenetration or
numerical energy creation. Geometrically unusual but valid use of a foot is allowed. Preserve
combat contact/wound behavior and locomotion with the relevant existing checks, and report the
tradeoffs of a deliberate change rather than hiding it inside recovery tuning.

### Optional toe experiment

The [passive-toe probe](../reference/man-passive-toes.md) failed under load on its recorded
Rapier revision. Higher frequency and iterations did not pass; artificial mass/inertia
conditioning improved some readings but left instability. The rigid-foot control passed.
Reproduce a relevant baseline on the selected artifact before claiming those numbers apply to
a changed solver or contact material.

The [multibody screen](../reference/solver-contract.md) rejected a whole-body drop-in switch:
two-axis angular joints trapped, three-axis limits differed from our coordinates, and required
effort/frame capabilities were missing. Gameplay `rapier-coordinate` is an impulse-joint limit
correction, not reduced-coordinate multibody dynamics. Those findings do not prove that an
isolated one-axis foot/toe assembly, or a hybrid connection to the current body, cannot work.

If articulated toes merit a bounded branch, test one loaded hinge/foot first, including load,
unload, spring response, limit behavior, contact penetration, drift, energy and exact replay at
120 Hz. Then test its connection to the actual ankle/leg and ordinary motor contract. A wider
engine change needs coordinate, effort, contact and closed-loop validation before adoption.
Passing an unloaded hinge or adding bindings is insufficient. Toe work is not a dependency for
rigid-foot recovery search, and unsupported toe configurations do not enter the optimizer.

**Gate:** selected body candidates pass their relevant mechanical checks and demonstrate
recovery improvements under declared search budgets, with locomotion/combat tradeoffs recorded.

## 4 Turn demonstrations into fast feedback control

Expand successful trajectories across nearby fallen states, different velocities and yaw,
actual front/back/left/right lying configurations, retained clubs and disturbances during
recovery. Classify actual lying states; shove direction alone does not supply that coverage.
Physically reach intermediate states when using a curriculum. Training from a restored later
state can help learn a suffix, but qualification always begins at the full fall.

Use a small library of trajectories with state-based selection, phase adaptation and feedback
as the first runtime candidate. Search feedback parameters over perturbed rollouts, not merely
one nominal action tape. If a compact learned policy is more successful, train it using the
demonstrations and physical rollouts, then evaluate the exported implementation in the actual
game world. Neural-network training, imitation learning or reinforcement learning are options,
not prerequisites for the first offline witness. Cheap inference does not excuse unverified
observation mappings, action scaling, limits or deterministic arithmetic.

The runtime policy observes actual contacts, body motion and progress. Default posture goals
yield when they conflict with the chosen movement. Stalls or lost supports select another
demonstrated continuation or route from the current state. Count and bound retries; changing
phase labels while repeating the same ineffective command is not progress. A fallback to the
old controller can preserve gameplay, but its time and failures remain part of the episode and
it cannot conceal a failed quick-recovery gate. Never reset the recovery clock on a retry.

Separate search/training, candidate-selection and final validation cases. Define disturbance
magnitudes, times and seeds before tuning. Hold out additional angles, shove timings, residual
velocities and repeated-fall sequences; the existing 64 directions are a public development
gate and cannot alone establish generalization. Once validation outcomes influence tuning,
treat them as development data and reserve fresh cases. Report all cases and failures.

Improve timing throughout this stage by shortening and overlapping successful movement while
preserving success rate. Avoid a requirement to settle between every contact transition. Match
the final body/actuation configuration in training, exported control and validation.

**Gate:** the executable feedback policy retains complete recovery across declared variations,
recovers again on the same host and can run within the game's per-step budget. Runtime code
uses immutable tuning, plain saved state and deterministic core arithmetic; no offline world
cloning or population search is placed in the real-time path without a separate measured budget.

## 5 Final qualification

Retain `research/dynamic-rise.mjs` and `research/dynamic-rise-qualification.mjs` as the
directional acceptance readers, extending configuration identities for selected body variants.
Do not silently rename changed bodies as the untouched baseline or weaken the evaluator to
make new traces pass.

- Warrior and Rogue, empty hands and a retained right-hand club: sixteen distinct directional
  falls per group, 64 actual falls, complete coverage and every cardinal direction passing.
- At least 15/16 verified completions within six seconds in each group, at least 61/64 overall,
  and a median recovery no greater than four seconds in every group. Failed/censored trials
  remain failures, including in the median. Recovery reliability takes priority over a faster
  median among successful outliers.
- Preserve the recovery-takeover clock, including landing, all attempts and the half-second
  quiet-standing gate. Preserve the Lab regression's first-down deadline and report differences
  in clock origin. No timing claim begins only at an optimized intermediate checkpoint.
- Final standing requires loaded, appropriately oriented support soles, an upright body, slow
  motion and supported centre of mass. For redesigned feet, define support faces from actual
  geometry/material behavior while preserving that physical meaning. This final handover
  condition does not restrict unusual intermediate recovery contacts.
- Each completion survives two seconds of actual host standing and one second of commanded
  walking with real displacement. Clubs remain held. An occupied hand's geometry and capability
  remain represented throughout search and execution.
- The exact two-Front-shove Lab reproduction passes as a required test, removing its TODO only
  after the complete deadline and handover assertions pass. Include additional held-out falls,
  actual lying-state coverage, repeated falls and recovery disturbances with predeclared gates.
- Verify return to combat, selected-body standing/walking/attack behavior, and exact checkpoint
  continuation during contact changes, feedback decisions and a second recovery on one host.
- Compare old and new recovery on the same final configurations and briefly verify the complete
  result in a visible Lab/Arena. Natural appearance is not a pass condition. Node results are
  not presented as browser measurements.

Declare the additional disturbance/repeated-fall test matrix and numerical acceptance before
training on its development counterpart. Run the broad directional qualification once a viable
feedback candidate exists and after the last substantive recovery/body change, not after every
search tweak. Report held-out failures even if the 64-case development gate passes.

## Landing and reporting

Land the environment and replay checks, offline search, qualified body candidates, runtime
feedback and final qualification as reviewable changes. Give each experiment a resumable
configuration, compute budget, outcome and next decision. Keep useful successful tapes and
failure fixtures with their identities; summarize generations instead of committing all sampled
worlds. Report both simulated recovery time and compute time, clearly distinguished.

Every physical figure names harness, engine artifact, rate, actuation, balance, loadout and body
configuration. A green suite containing the failing recovery TODO, an IK solution, a held
posture or a successful isolated suffix does not establish the feature. Mark the work complete
only when the additional runtime variant passes the qualification above.

Follow `AGENTS.md`: code changes run `npm run check` and `npm test`, relevant slow tests by name,
and `npm run build` when browser code/assets/dependencies/build configuration change. Large
engine/body changes receive the required full pre-merge gate. Relevant existing checks include
`tests/research-stand-up-planning.test.mjs`, `tests/research-stand-up-contact.test.mjs`,
`tests/research-native-posture.test.mjs`, `tests/core-supported-extension.test.mjs`,
`tests/core-support-load.test.mjs`, `tests/lab-dynamic-rise.test.mjs` and
`tests/arena-fork.test.mjs`. Keep new tests fast or list them in `tests/slow.json`.
Documentation-only changes check cited paths, whitespace and line endings. Commit each
landable change, update affected existing architecture/reference/roadmap documents, and delete
this plan when its outcome lands. Code and comments never cite a plan.

## Research basis

These methods inform implementation choices; their bodies, physics and results are not evidence
that our configurations will succeed or finish within a particular compute budget.

- [Trajectory Optimization for Full-Body Movements with Complex Contacts](https://cse.ucdenver.edu/mazen-alborno/papers/spacetime.pdf)
  demonstrates forward-simulation optimization of getting-up motion using control trajectories
  and overlapping windows. Its actuation and joint-limit assumptions differ from ours.
- [Sampling-based Contact-rich Motion Control](https://libliu.info/Samcon/Samcon.html) and
  [Improving Sampling-based Motion Control](https://www.cs.sfu.ca/~kkyin/papers/Samcon2.pdf)
  provide sampling, continuation and adaptive-distribution methods. Reference-motion tracking
  is optional guidance here, not the recovery objective.
- [Synthesizing Get-Up Motions for Physics-based Characters](https://profs.etsmtl.ca/sandrews/publication/getup_sca2022/)
  provides an example of learning get-up feedback. Its human-motion/style objectives are not
  requirements of this plan.
