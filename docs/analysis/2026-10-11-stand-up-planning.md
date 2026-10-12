# Stand-up planning and contact experiments

The owner's goal of substantially faster, robust unassisted recovery is **not achieved**.
The optimized unassisted recipe is a slow, narrow feasibility witness. The additional
`assisted-rise` variant lifts and rights the body with external forces and moments at Balance 100;
its results below are assisted-only evidence, not completion of that goal. Turning off recovery
help produced zero of sixteen twelve-second completions in the recorded ablation. That ablation
still allowed host assistance and is not a fully unassisted evaluation.

The earlier campaign-completion and early-finish claims were incorrect: assistance permission
was treated as permission to substitute a different objective. The work remains incomplete.
See [frozen unassisted comparison](#frozen-unassisted-comparison) for the acceptance repair.

## Harness and reproduction

All figures below use the **Node Stance Lab host**, Warrior (`workshop-fighter`), empty hands,
gameplay `rapier-coordinate`, 120 Hz, symmetric actuation and balance 0. The engine is adapter 11
and the committed `dimforge-rapier3d-simd-compat-0.21.0-auto-rpg.9.tgz`, SHA-256
`0bcb12014c0e982ea2bda99a3d1ab8e263bb81f0d2abcb7d2ade2b578b87b77c`.
The core/Lab source digest is
`b672a9fe1c6ea453a1356bcd9d74efe8679a7d76f1cdc535efa1b80edb2460a3`.
Recovery uses ordinary muscles, with no pose/velocity injection or assist.

`research/stand-up-replay.mjs` runs the actual Lab host through 240 standing steps, a Front
60 N s shove, 24 steps and another Front 60 N s shove. The same body and host persist throughout.
It saves full physics, world, body, skill and order state at distinct transitions, with content
identities and engine/configuration checks. Diagnostic samples are detached and include actual
floor patches, self contacts, applied hand poses, joint limits/efforts, commanded activation,
effort-bound readings, rejected predictions and the complete recovery clocks.

Measured from the second shove, the first down step is 0.475 s, tuck begins at 1.050 s,
prop at 2.492 s, fours at 2.875 s and placement at 3.350 s. Both hands and shins carry actual
load at placement and the trunk is clear. Placement loses support, retries at 4.817 s and
returns to orientation at 6.050 s. Completion count remains **zero after eight seconds**.

Restoring the placement checkpoint into a fresh compatible world gives an identical 60-step
observation trace and controller/world state. The regression also compares the original
uninterrupted continuation and a second fresh checkpoint's continuation. Rapier's internal
serialized storage can differ between an uninterrupted world and a restored one; checkpoint
identity describes the captured contents, rather than equating every world with identical motion.

## Bounded whole-body IK comparison

`research/stand-up-ik.mjs` calculates poses without moving the physical body. It reads the
actual joint conventions, legal ranges, applied hand colliders, complete boots and compound
held shapes. Collision screening excludes adjacent joint-connected pairs and queries admitted
self pairs with native shapes; floor clearance uses the complete shape geometry.

At the actual placement checkpoint, maximum forward-kinematic discrepancy is 0.0000707 m
and 0.000306 rad. Independent point-derivative comparisons with the core's analytic Jacobian
have maximum discrepancy 2.22e-8. Read-only planning leaves checkpoint contents unchanged.
The derivative and geometry regression exercises an obstructed route and a stationary route
that can actually satisfy its tasks; it also checks simultaneous goals for both boots.

The declared target is the production-sized lead step: 0.2 leg lengths sideways and 0.3 ahead
of the captured pelvis, with a flat boot. Both hands and the rear shin retain their measured
material points. Each A–D variant uses the same five seeds and declared iteration budget.
This prototype uses damped least squares and rejects every candidate whose final constraints
fail; its penalties are not a proof that a constrained solution cannot exist.

| Variant, measured seed | Foot position error (m) | Foot rotation error (rad) | Largest penetration (m) | Feasible |
|---|---:|---:|---:|---|
| A: lead limb, fixed pelvis/spine | 0.3042 | 0.4823 | 0.3659 | No |
| B: floating pelvis, fixed spine | 0.0561 | 0.5542 | 0.1308 | No |
| C: floating pelvis and spine | 0.00157 | 0.01086 | 0.1596 | No |
| D: C with collision penalties | 0.1446 | 0.8173 | 0.01087 | No |

C fits the endpoint while the thigh penetrates the upper trunk by about 16 cm. That is an
invalid movement target. D reduces penetration but leaves foot and retained-contact errors;
none of its five seeds passes. E follows a continuous branch and screens interpolated poses.
Its first waypoint passes, but its second fails with 0.0312 m foot error, 0.0652 rad rotation
error and floor violations. No complete collision-screened path is established by this search.

These results identify a conflict in this particular planted-hand placement request. They do
not establish an anatomical or Rapier defect, global infeasibility, or a reason to adopt this
solver in the runtime controller. Whole-body IK remains an optional planning tool.

## Physical boot preparation

`research/stand-up-contact.mjs` retains actual hands and capsule shins through ordinary native
bearing control. It removes the propped-shin boot proxy from this experiment, retains the
captured legal posture and blends knee/ankle goals over 0.5 s. Identical support shares and
control response compare knee targets 1.6, 1.9 and 2.2 rad with ankle targets -0.9, -0.3 and
0.36 rad, clamped to the body's actual ranges. The record hashes the experiment source and
its complete configuration. It measures boot normal load and sole orientation separately.

None of the nine combinations produces both soles facing up under load for the 0.05 s
component gate during the six-second observation. All have zero complete recoveries. For
knee 1.6 and ankle 0.36, the final sampled boots carry 7.37 and 7.48 N, but their sole-up
components are -0.0148 and -0.0169. Boot contact alone would misclassify this preparation.
The regression reaches this physical configuration, verifies bounded muscle efforts and zero
assist, and checks its full observation/controller continuation in a fresh world.

## Reproduction and implications

From the repository root, choose output destinations that do not yet exist:

```powershell
node research/stand-up-replay.mjs --out .review/stand-up-replay
# Use the placement checkpoint listed in replay.json:
node research/stand-up-ik.mjs --checkpoint .review/stand-up-replay/<identity>.checkpoint --out .review/stand-up-ik.json
node research/stand-up-contact.mjs --out .review/stand-up-contact.json
node --test tests/research-stand-up-planning.test.mjs tests/research-stand-up-contact.test.mjs
```

These results reject the tested fixed-contact placement requests, not every recovery route.
Repositioned hands, a side-sitting transition or another contact sequence remain candidates;
none is established as a prerequisite. The half-kneel extension is a separate component witness.
Offline search can reuse these checkpoints and geometry checks while evaluating complete
physical movements with different actions or body configurations. Full timing and robustness
remain pending until uninterrupted fresh-fall recovery, host handover and walking qualify.

## Offline action search

`research/stand-up-environment.mjs` exposes actual muscle commands independently of the recovery
phase machine. Its Node Stance Lab host uses the engine artifact, 120 Hz, symmetric actuation
and balance 0 named above. This experiment's core/Lab source digest is
`74e7e3b183c90dd6f4b5a5419593e831250c6b0be09faed3f1807d9966b5734e`.
Checkpoints include world, physics, host, skills, orders and held
research commands. They reject mismatched source, body and engine identities. Recorded actions
precede their corresponding observations by exactly one world step.

The independent completion predicate requires upright root and soles, loaded foot support,
supported centre of mass, slow motion for half a second, actual host handover, two seconds of
standing and one second of walking with at least 0.1 m displacement. It counts the whole
takeover interval. A slow completion is a feasibility witness, not a passing quick recovery.

For Warrior with empty hands, on the unchanged body, the staged support-recovery baseline
completes the two 60 N s Lab shoves at 90 degrees in 25.275 s from takeover, followed by the
three-second verification tail. Every physical observation replays exactly through the action
port. Original continuation, restored continuation, fresh-world continuation and candidate-order
permutations agree. The Front reproduction does not complete in 50 s with this baseline; Dynamic
rise also fails a twelve-second Front episode in the new environment.

`research/stand-up-search.mjs` records/replays complete demonstrations and searches smooth
bounded target trajectories or retimed command windows with smooth residuals. Command windows
retain their exact physical prefix and evaluate their entire future, including the host tail.
`research/cma.mjs` persists the mean, diagonal covariance, evolution paths, step size, random
state, best candidate and generation; interrupted generations cache completed evaluations.
Workers evaluate sequentially, propagate errors and cancel queued work. All sampled candidates,
prefix construction and winner materialization consume the declared compute budget.

The repaired command pilot evaluates 144 candidates in 216.17 wall-clock seconds across three
workers: 503,922 world steps including materialization, approximately 2,331 steps/s. Other local
checks shared the machine, so this is an observed run rate, not a hardware benchmark. The only
successful candidate is the unchanged replay, with automatic handover one step earlier
(25.2667 s). A fresh-world replay verifies it. Full-tape retiming/residuals at the tested scale
destroy the contact trajectory; they establish no speed improvement. An earlier aborted pilot
revealed command-index rounding at unchanged playback speed. Integer-first indexing and a
full-length regression correct it; those candidate results are excluded.

The first target-trajectory comparisons are invalidated: the adapter subtracted bind angles
from joint limits that are already reference-relative. This incorrectly narrowed some ranges
and extended others. The corrected adapter reads `DofSpec.min/max` directly, as `buildBody`
passes them to the physical joints. Those searches are not evidence about the available action
space, anatomy or relative merits of the two body candidates. Their 2,240,846 computed steps
remain charged to the campaign. New comparisons require corrected inputs and fresh checkpoints.

The corrected comparison uses 1,200 candidates per body, four target knots, the same successful
90-degree baseline as posture guidance, and the Front fall. Neither body completes recovery:
the original takes 1,237,166 counterfactual steps in 483.26 wall-clock seconds; the sole candidate
takes 1,218,924 in 380.26 seconds. Both use three workers and the physical configuration named
above. These are failed smooth-target searches, not evidence of physical impossibility.
The original body's selected failure carries substantial load through the left palm and thigh
while the right thigh contacts the middle trunk. Its left wrist pronation remains about 1.84 rad
from its target at its approximately 6.33 N m directional motor bound. Whole-body posture error
and torso height conceal this blocked contact configuration; a higher surrogate score is not a
recovery.

`research/stand-up-beam.mjs` retains distinct contact/height/orientation prefixes, evaluates
overlapping half-second windows with half-second lookahead, and commits only a quarter second.
Its checkpoints retain ancestry, physical state, optimizer state and a rewind operation. A
one-worker, width-two Front run spends 459,120 world steps and reaches a five-second failed
prefix, still near the floor. The recorded 8,667.31 wall-clock seconds include an unexpected
long execution pause and are unsuitable for throughput comparison. The search stops at its
wall budget. Short-horizon improvement of height/orientation does not supply a complete route.

The existing `withSoles` body is a separate physical candidate, with the same muscle bounds.
Under the staged baseline it completes Front in 29.2917 s but fails the 90-degree recipe in
45 s. These two observations do not establish improved robustness. `research/stand-up-sole.mjs`
checks actual boot dimensions, mass, inertia and the existing sole law on an isolated loaded
boot. At 120 Hz the Warrior's half/full-body loads compress it by 1.18145/2.36291 mm, and the
Rogue's by approximately 0.861/1.722 mm. Both unload to their own-weight compression, remain
within the 6.1 mm layer and show no energy increase during free unloading. Complete physical
and world-state restoration reproduces unloading exactly. This is a material fixture, not a
recovery or whole-leg qualification.

`research/stand-up-design-screen.mjs` separately screens the unchanged support controller on
Front and 90-degree falls for forty seconds each. `research/stand-up-design.mjs` declares strength
factors 1–3, unloaded-speed factors 1–2 and weight factors 0.6–1 through the existing physique
specification, with baseline or compliant-sole contact. Defaults reproduce the original spec
exactly. Every record contains original/candidate mass and all directional muscle envelopes,
actual peak delivered torques and motor bounds. No change is a new shared-body default.

| Warrior, empty hands, unchanged controller | Front | 90 degrees |
|---|---|---|
| Original body | No recovery in 40 s | Verified, 25.275 s |
| Compliant soles | Verified, 29.2917 s | No recovery in 40 s |
| Soles, strength factor 1.5 | No recovery in 40 s | No recovery in 40 s |
| Soles, strength factor 3 | No recovery in 40 s | No recovery in 40 s |
| Soles, unloaded-speed factor 2 | No recovery in 40 s | Handover at 33.1917 s, walking fails |
| Soles, weight factor 0.6 | No recovery in 40 s | No recovery in 40 s |

All twelve trials actually fall. The speed candidate's failed walking tail is a failure, not a
completion. These shared-policy transfer results reject immediate adoption of these settings;
they do not compare separately optimized controllers on every body. The changed weight also
changes geometry through the existing physique system. It is not an isolated mass experiment.

`research/stand-up-native.mjs` evaluates bounded muscle commands in the actual engine to track
the segments of a complete demonstration. Its unchanged-speed reference reproduces the
baseline; counterfactual steps advance neither episode time nor the selected physical path.
Compressing the 25.275 s demonstration to a 20 s target with one optimization iteration per
step fails: no handover after 25 s, 118,692 computed world steps and 537.48 wall-clock seconds.
The one-step tracker loses the reference through changing contacts. This does not establish
that a longer-horizon optimizer or another trajectory cannot succeed.

`research/stand-up-feedback.mjs` searches bounded posture, timing, response and intermediate
transition parameters while retaining the existing contact feedback. It supplies an immutable
recipe to `supportRecovery`; the final standing and walking criteria are not search variables.
The neutral recipe reproduces the baseline physically. Checkpoints identify the complete
physical configuration and search source; interrupted native, trajectory, feedback and beam
work retains a conservative charge for in-flight evaluations.

For the same Warrior/empty/sole Front fall, 600 evaluations and 2,363,058 world steps take
902.07 wall-clock seconds on three workers and find a verified 19.1667 s recovery, compared
with the unchanged controller's 29.2917 s. Its complete action tape replays exactly in a fresh
world. A bounded single-parameter refinement of roll, preparation, subsequent poses, bearing
response and posture response takes 183,308 additional steps and reaches 16.2667 s, including
all attempts before handover and followed by the three-second host tail. This remains far from
the timing target and is evidence for one development fall only.

The feedback experiments use core/Lab source digest
`786a34e6877169fed56b85f0eed219cd014b8808cefc897c2826ca9096342810`, the same vendored engine,
120 Hz, symmetric actuation and zero balance. Recipe changes do not alter the shared presets.
The sole material and body specification are unchanged across this feedback comparison.
The 19.1667 s trace reaches hands-and-knees support at about 8.675 s and begins final
stabilization at 16.35 s. The successful sequence is still predominantly serial. Progress in
one fall does not establish a robust new policy.

A second seeded feedback search evaluates 296 candidates on two workers, using 901,847 world
steps in 907.17 wall-clock seconds. Its best completes the same development fall in 15.5583 s.
A separately charged fresh-fall reconstruction and full action replay verify that result.
This search stops on its wall budget; finishing the in-flight generation accounts for the
7.17 s overrun. No additional candidates are launched afterward.

`research/stand-up-feedback-seed.json` retains the 15.5583 s witness's parameters, physical
identity, configuration and full terminal result as a portable seed. It is not a gameplay
preset. Recording it generates the complete physical action/observation tape from a new fall;
no installed pose or opaque checkpoint is needed to reconstruct it:

```powershell
node research/stand-up-feedback.mjs --mode record --seed research/stand-up-feedback-seed.json --output .review/stand-up/feedback-witness.trace --seconds 35
node research/stand-up-search.mjs replay --input .review/stand-up/feedback-witness.trace
```

A matched development transfer screen uses the sole body, the four cardinal two-shove recipes,
Warrior/Rogue and empty hands/right-hand club, with a 35 s episode cap including the host tail.
All sixteen cases per controller actually fall. These are development comparisons, not the
64-direction final qualification; zero cases satisfy the six-second deadline.

| Controller on the same sole bodies | Warrior, empty | Warrior, club | Rogue, empty | Rogue, club |
|---|---|---|---|---|
| Unchanged support recovery | 2/4: Front 29.2917 s; 180 degrees 30.925 s | 0/4 | 0/4 | 0/4 |
| 16.2667 s refinement | 1/4: Front 16.2667 s | 0/4 | 0/4 | 0/4 |
| 15.5583 s final seed | 1/4: Front 15.5583 s | 0/4 | 0/4 | 0/4 |

The baseline/earlier-seed screen consumes 142,043 world steps in 348.59 wall-clock seconds;
the separate final-seed screen consumes 70,220 in 179.13 seconds, one worker each while other
experiments share the machine. Records retain all failures and complete physical identities.
The first screen captured the earlier seed while the final seed was being reconstructed; its
candidate is identified by recipe digest and is not mislabeled as the final result. The final
screen uses a fixed copy of the final seed. The club is the existing statically retained item
on the hand's compound rigid body, with its actual collision geometry and mass.

The faster Front result therefore fails the robustness objective and loses a completion the
unchanged controller retains. It is unsuitable for promotion. It shows that the search can
find a faster complete physical route for one state, not that the route is broadly usable.

The native tracker supports a multi-step physical horizon, retaining only the first selected
action and restoring the complete world for each counterfactual. At nominal speed, both a
one-step and six-step horizon reproduce the measured reference. Longer horizons compare the
predicted end state against the corresponding future reference, rather than advancing the live
episode during planning. The directional qualification reader independently rejects late or
non-finite completion times, even when an input row declares success.

Compressing the 16.2667 s feedback demonstration toward 12 s with the one-step native tracker
also fails: no handover in the seventeen-second physical episode, 80,281 world steps and
355.11 wall-clock seconds. This is the same Node/engine/body/actuation/balance configuration.
The native tracker can preserve an exact action prefix before compressing the remainder;
the prefix remains part of the recovery clock, rather than becoming a new episode origin.
The twelve-step horizon without a preserved prefix is stopped at its wall allocation with
550,236 steps charged, including the interrupted evaluation reservation. Its last durable
physical prefix is 9.5083 s with no handover and torso height about 0.246 m. That checkpoint
records 1,219.35 s; manual budget enforcement has an overrun. This is a censored failure to
find a recovery, not a completed seventeen-second trial. Native search now also enforces a
finite wall budget between selected physical steps and retains its elapsed budget on resume.
Preserving the initial 120 physical steps also fails to produce a recovery before its wall
allocation is closed: 476,625 steps charged, including the interrupted reservation. Its last
durable prefix is 9.0083 s, including the preserved second, with no handover and torso height
about 0.204 m; the saved checkpoint records 1,135.89 wall-clock seconds. This trial is likewise
censored rather than a completed twelve-second target rollout. The exact executing native
module is retained alongside the local checkpoint and verified against its recorded digest.

The campaign closes without a qualifying candidate. Neither shortened motion tracking nor
optimization of the existing recipe provides the requested fast, robust recovery in these
experiments. The reusable result is a validated search/replay environment and a faster but
narrow slow witness. A new runtime variant, repeated-fall/disturbance/combat checks, visible
motion review and final qualification remain undone. These failures do not establish that
the body or Rapier makes the requested movement impossible.

Reproduce these experiments with separate output paths:

```powershell
node research/stand-up-search.mjs record --degrees 90 --output .review/stand-up/lab-right.trace
node research/stand-up-search.mjs replay --input .review/stand-up/lab-right.trace
node research/stand-up-search.mjs pilot --input .review/stand-up/lab-right.trace --output .review/stand-up/pilot.trace --workers 3 --generations 12
node research/stand-up-search.mjs record --degrees 0 --seconds 12 --output .review/stand-up/front.trace
node research/stand-up-search.mjs search --input .review/stand-up/front.trace --reference .review/stand-up/lab-right.trace --output .review/stand-up/targets.trace --representation targets --knots 4 --workers 3 --generations 100 --stepBudget 1360000 --wallSeconds 1200
node research/stand-up-sole.mjs
node research/stand-up-native.mjs --input .review/stand-up/lab-right.trace --output .review/stand-up/native.trace --seconds 20 --iterations 1 --stepBudget 225000
```

Search output checkpoints retain full optimizer state; rerunning an identical configuration
resumes it. Native checkpoints retain the selected physical prefix and optimizer action.
Complete action/observation traces are compressed local artifacts, not new runtime policies.
These experiments have not qualified an additional recovery variant.

## Published-controller and assisted-recovery campaign

The campaign qualifies a substantial assisted improvement, with the full four/six-second target
still open. The final qualification and limitations are below. The original case manifest is
`research/stand-up-learning-cases.json`; local resumable artifacts and the campaign ledger live
under ignored `research/runs/get-up-learning/`. The reference checkout is pinned to
`tianxintao/get_up_control` revision `5ad52fbe1b5b7c56522a1aa10ccf17fb81c0d79e`.
It has no license file, so upstream code, assets and pretrained weights remain local and are not
redistributed. `research/stand-up-reference.py` executes that separate checkout.

The reference reproduction exposed a checkpoint-configuration mismatch. The CLI's teacher power
0.4 leaves the supplied teacher crouched under both modern dependencies and the original stack
(Python 3.8.10, PyTorch 1.5.1, MuJoCo 2.1.3, dm_control 1.0.1). The supplied student's metadata
records teacher power **0.663420431**, consistent with the teacher's final curriculum strength.
With that recorded power, the teacher reaches the upstream head-height criterion (>1.4 m) in
4/4 physical fallen starts: 0.625, 1.075, 1.525 and 0.725 seconds after reset. Final head heights
are 1.46-1.475 m; rendered playback was inspected. These are upstream MuJoCo results at 200 Hz
physics and 40 Hz policy, not game qualification or successful retraining.

The supplied student also reaches that upstream criterion in 2/2 starts, at 1.225 and 2.15 seconds.
Its actual physics clock advances 0.025 s per policy call (800 Hz internal physics), despite the
environment's nominal control-timestep field reporting 0.00625 s. The runner measures elapsed
physics time directly. Use `reference-student-clock/`, not the earlier nominal-clock diagnostic.
Raw reports, trajectories, video and checkpoint digests are in `reference-recorded-power/` and
`reference-student-clock/`. The stricter head-height/quiet diagnostic in those reports remains
separate from the upstream criterion; neither substitutes for the game's physical evaluator.

Learner updates change parameters, checkpoint loading restores identical deterministic actions,
and another update succeeds. This is a short train/update/resume smoke test, not reproduction of
the ten-million-transition training schedule. The isolated modern environment uses Python 3.11.11,
PyTorch 2.5.1 CPU, NumPy 1.26.4, MuJoCo 3.1.6 and dm_control 1.0.20; the original stack is retained
as a compatibility control. Upstream code/assets/weights remain outside the committed repository.

The research action port now accepts explicit root force/moment requests, clips them through the
existing Balance mechanism, records delivered assistance in replay tapes and accepts assisted
outcomes only when a positive Balance ceiling was declared. Omitted requests clear the recovery
wrench. Zero-Balance behavior and its original complete action-tape replay remain covered.

Initial game pilots use Node Stance Lab, gameplay Rapier adapter 11, 120 Hz, symmetric actuation,
Warrior, empty hands, original anatomy and Balance 100 throughout (including before the fall).
These are development trials; changed pre-fall assistance prevents a causal comparison with the
previous zero-Balance witness. All use the real two Front shoves of 60 N s, 0.2 s apart.

| Feedback pilot | Result after 12 s or evaluator termination |
|---|---|
| Vertical unloading plus righting torque | Tilted equilibrium, root up normal 0.603 |
| Stronger righting feedback | Tilted equilibrium, root up normal 0.752 |
| Add horizontal feedback toward the feet | Root up normal 0.998, but no quiet-standing handover |
| Release to ordinary host after acquiring an upright stance | Quiet-standing handover in 3.2833 s; fails the walking tail with about 0.0804 m displacement against 0.1 m required |

The last pilot takes actual host strides and remains upright, but it is not a completed recovery
under the frozen evaluator. No timing or displacement gate has been relaxed. The scripts and
full pilot settings are `research/stand-up-assist.mjs` and local `assist-100-*.json` records.
These pilots motivate horizontal assistance and explicit host handover; they do not establish
coverage over other falls, loadouts, bodies or assistance levels.

The Rapier adapter has 151 observations and 41 actions: 35 actual muscle channels plus six
root-wrench components, evaluated at 40 Hz over 120 Hz `World.step`. Observations use local-frame
orientation/velocity, normalized joint positions/rates, extremities, loaded contacts, action
history and declared configuration. Torque signs, legal reference-relative targets and speed-
dependent effort remain in the existing muscle path. The residual-feedback ablation adds four
observations for its remembered heading and release state; its full asymmetric joint corrections
and wrench corrections are explicitly separate from the published direct-torque representation.

The port retains the published SAC implementation in the local checkout. Method deviations are
explicit: 256-sample batches versus the saved reference's 1024, 200,000 replay capacity versus
one million, one learner update per three parallel transitions, 12-second training episodes,
body-scaled height reward, an approximated velocity penalty, and a physical completion bonus.
The 256-hidden-unit network and residual feedback are bounded ablations of the 1024-unit direct
muscle/wrench pilot, not a faithful reproduction claim. Curriculum advancement is not implemented
yet. Ordinary host release and walking still decide completion independently of shaped reward.

The persistent three-worker bridge resumes physical worlds, observations, replay, optimizers,
PRNGs and counters. A 120-transition/30-update smoke run resumed to 240 transitions/70 updates;
physical counts advanced from 1,694 to 2,054 without resetting. The fast regression restores and
compares complete physical transitions, rewards and action history, and rejects invalid actions
atomically. This establishes adapter correctness, not learned recovery.

A 20-case feedback pilot covered Balance 0/10/25/50/100 and four cardinal shove directions.
Five configurations prevented the requested fall; the other fifteen produced no complete
recovery under the then-current evaluator. This exposed a support-measurement defect: selecting
only geometric foot corners within 1 mm of the lowest corner discards loaded corners of slightly
tilted feet. The evaluator now uses actual loaded, penetrating Rapier contact-patch points.
The Balance-100 side trial is consequently recognized as quietly supported at 3.7917 s, but
still fails the walking tail. A regression exercises this real tilted-foot configuration.
Prior results using the old support calculation need re-evaluation before comparative claims.

The walking shortfall also occurs without a fall. Node Stance Lab, original Warrior, empty hands,
120 Hz, after four seconds standing: a 0.3 m/s forward command moves 0.09919 m in one second at
Balance 0 and 0.08844 m at Balance 100. Asking 0.6 m/s gives 0.10022 and 0.08898 m respectively.
This diagnoses a host-startup limitation, not permission to relax the 0.1 m qualification gate.
No complete recovery or qualified new gameplay variant is claimed.

The 15-minute direct-muscle pilot (1024 hidden units, CPU, seed 120) completed 16,062 transitions,
2,021 updates and 78,240 physics steps in 904.06 seconds, with no complete recovery. Warm-up
collection was much faster than learning; the full published ten-million-transition schedule
is not credible at this measured CPU update rate within the campaign allocation.

The five-minute residual-feedback ablation (256 hidden units, CPU, seed 120, residual scale 0.15)
completed 15,693 transitions, 4,232 updates and 92,303 physics steps in 300.89 seconds. It produced
several successful training episodes, but not a qualified policy. That pilot also exposed a reset
bug: some fallback shoves still prevented falling, so the learner received stationary high-reward
samples. Reset now records every attempted shove, follows the declared 90/120 N s fallbacks,
and resamples random training falls instead of training on prevention. Explicit evaluation cases
retain prevention as a separate outcome. The affected pilot is a development seed, not a clean
curriculum comparison.

Frozen deterministic evaluation of that pilot under the corrected contact/release evaluator:
Node Stance Lab, gameplay Rapier, 120 Hz, original Warrior, empty hands, Balance 100 for recovery
and host, four development cardinal directions (not held-out qualification):

| Requested direction | Executed impulse | Quiet handover | Complete standing/walking tail |
|---|---:|---:|---|
| Front | 60 N s twice | 3.3083 s | Pass |
| Right | 60 N s twice | None by 35 s | Fail |
| Back | 90 N s twice, after prevention at 60 | 2.5750 s | Pass |
| Left | 60 N s twice | 3.1750 s | Fails walking displacement |

Both NumPy double-precision inference and the deterministic core ReLU/tanh evaluator reproduce
these outcome records. This passes the Front feasibility target at the declared assistance,
not the substantial-improvement or robustness gates. Requested-versus-executed fall recipes,
physics identities and trapezoidal root-wrench work/magnitude meters are retained in local
`residual-256-core-development.json`. Recovery assistance must release before quiet time counts;
the ordinary host's declared Balance may remain during the verification tail.

Reproduction commands for the implemented learning path (local upstream checkout required):

```powershell
.tools/get-up-venv/Scripts/python.exe research/stand-up-reference.py --output research/runs/get-up-learning/reference-recorded-power
.tools/get-up-venv/Scripts/python.exe research/stand-up-train.py --config research/runs/get-up-learning/residual-config.json --hidden 256 --batch 256 --warmup 3000 --wall-seconds 300 --step-limit 500000 --output research/runs/get-up-learning/residual-256-pilot
.tools/get-up-venv/Scripts/python.exe research/stand-up-evaluate.py --actor research/runs/get-up-learning/residual-256-pilot/actor.json --output research/runs/get-up-learning/residual-256-core-development.json --workers 3
```

The local residual configuration is `{"balance":100,"mode":"residual","residual":0.15,
"seconds":12,"seed":120,"actionRepeat":3}`. Use a fresh output directory with corrected reset
semantics; exact resume rejects changed environment identities. `--warm-start` explicitly carries
network ancestry into a new experiment and restarts replay/optimizers; it is not exact resume.

The right-side deterministic failure is a premature handover, not an unexplained stalled solve.
At about 1.73 s after takeover, root horizontal speed is about 1.98 m/s and only the right foot is
loaded; the old geometric release fires shortly afterward. The host develops large angular motion,
then leaves the finite test floor. `policy-right-release.json` preserves the divergence. A controller
probe requiring actual quiet support before release reaches quiet host standing in 5.18, 5.70 and
5.39 s for Front/Right/Left, respectively; all three still fail the separate walking-distance tail.
Back's 60 N s recipe prevents falling and is not counted. Off-surface motion now terminates as an
explicit failure, rather than consuming the rest of a timeout. No qualification threshold changed.

The terminal reward also needed correction. With unit standing reward and discount 0.97, ending
success with a bonus of 10 undervalues successful termination relative to continued standing.
Success now includes the absorbing standing state's value `1/(1-0.97)`; failures remain terminal.
This is a task adaptation, distinct from the original reference environment's continuation rules.

CUDA installation succeeded in a separate Python 3.11 environment with PyTorch 2.5.1+cu124 on the
RTX 4060 Laptop GPU. The corrected-reset CUDA residual pilot completed 15,069 transitions, 4,024
updates and 98,827 physical steps in 300.98 s. That is similar throughput to the small-network CPU
pilot, not evidence of a large GPU speedup. Its exact source is commit 49d61fab. Subsequent pilots
record separate action, rollout, reset, update and checkpoint wall times, plus source snapshots;
GPU RNG state is included in checkpoints. Older pilot checkpoints retain their separate identities.

The bounded 15-minute comparisons finished on the fixed body. Direct torque with strength 1.5 /
Balance 0 completed 14,391 transitions and 58,362 physics steps; direct torque with strength 1 /
Balance 100 completed 13,735 transitions and 68,649 steps. Supported-release residual control
completed 13,484 transitions and 67,896 steps. None completed a training episode under the strict
host tail. Deterministic evaluation of the supported residual completed one of four development
cardinals; another reached quiet handover but failed walking. These short runs do not demonstrate
that either learning curriculum is impossible. They justify solving the easier terminal task before
allocating the main learning budget.

The required staged-rise and support-recovery screen used the original body, both model/loadout
groups and both stance/SIMBICON hosts, Balance 100, gameplay Rapier at 120 Hz. Staged rise completed
8/16 cardinal cases by 35 seconds and support recovery 7/16, with none within 12 seconds. Staged
rise is the frozen principal comparator; support recovery remains reported. An earlier optional
Dynamic rise probe threw `a supported rise requires its actual supports and trunk clearance` and
is retained as a failed diagnostic, not substituted for staged rise. Final matched comparisons
must use the production release path without the research action override's automatic handover.

The existing SIMBICON host moves the original Warrior 0.11432 m in the one-second, 0.3 m/s
never-fallen walking probe at either Balance 0 or 100. It is explicitly selected in the assisted
configuration; this is not a change to ordinary gameplay's locomotion default. Strict support
release with SIMBICON completed the four Warrior development cardinals in 5.1833, 5.7000, 7.1833
and 5.3917 seconds (Back used the declared 90 N s fallback after prevention at 60).

The first 64-case feedback selection completed 52/64 within 12 seconds, but target-coordinate
inspection exposed a real controller bug: guard angles were already reference-relative, and the
new adapter subtracted bind again. Initial physically built guard angles and live muscle readings
agree without that subtraction. Correcting it removes inward arm pressure and narrowed feet;
those earlier controller results are not evidence for the corrected configuration.

Six collision-aware whole-body IK terminal poses were generated with stagger +/-0.15 or 0 m,
width 0.8 or 1 times the reference spacing, and pelvis 0.02 m lower. All were geometrically feasible.
Physical trials on three diagnosed failures showed why that alone is insufficient: some poses
failed the host walking tail, and one took 14.425 s. The +0.15 m stagger at reference width cleared
all three. A 64-case development selection with that pose completed 61/64 within 12 s; group
failure-inclusive medians were 3.8500, 3.4833, 3.3625 and 3.7083 s for Warrior empty/club and Rogue
empty/club. This passes the substantial **selection partition only**, not final qualification.
`research/stand-up-terminal.mjs` regenerates the six geometric candidates; retained targets execute
through ordinary joint commands, not installed poses or playback.

Runtime parity testing caught a second adapter discrepancy: research used 9.81 m/s² while the
actual world uses 9.80665. Both now derive weight from the world's gravity, as Assist does. Exact
physical observations and delivered commands agree through a full Front recovery. Contact-state
restore, retained club grip, withdrawal clearing and zero-allowance fallback also pass focused
physical tests. New full-episode tests are in the slow tier. No qualification claim uses a tolerant
comparison to conceal divergent physical trajectories.

The first actual runtime selection completed 62/64, but Rogue club Back failed a required cardinal,
so this does not pass the selection gate. Diagnosing the two remaining failures found distinct
conditions. Rogue empty at 247.5 degrees stood nearly motionless with only three penetrating foot
patch points and continued upward help (~66 N); its COM was outside the resulting support triangle.
A slightly lower terminal height cleared it. Rogue club Back handed back to a host whose occupied
hand contacted its chest: the IK seed had also replaced the held-item wrist target with an empty-hand
one. Preserving the ordinary held-item guard cleared that case. Combining a permanently lower
height with the guard correction did not clear Back. A bounded late lowering, after four seconds
without release and blended over one second to 98% height, clears the diagnosed empty case in
5.075 s and preserves Back at 3.725 s. Front/Right development controls pass at 4.2333/4.025 s.
The actual runtime selection passes 64/64 within six seconds, with group medians 3.8500,
3.5750, 3.3583 and 3.4417 s. This is selection evidence, not independent qualification.

Three independent seed-120/121/122 SAC runs compare smoothed small residuals around the staggered
feedback control: 256 hidden units, 0.05 residual, 0.15 s action filter, 40 Hz policy, ordinary 120 Hz
physics, SIMBICON host and Balance 100. Each has a 30-minute/600,000-step cap and exact source
snapshot. These runs retain their original generating controller; later runtime fixes are distinct
experiments. Training successes do not establish added value over the feedback controller.

Before inspecting final outcomes, the validation generation protocol was made explicit: the frozen
128 non-grid shove recipes retain their settle prefix, then add 180 zero-activation, zero-assist
physical steps so that testing includes lying starts. The original takeover clock continues through
that prefix. Actual orientation is classified from the pelvis, and each group must include prone,
supine and both sides; missing coverage fails qualification. Selection uses immediate recovery.
Repeated sequences retain the same body, world, host and assistance history after each complete
standing/walking tail. Disturbance trials add their frozen lateral shove without restarting time.

The Lab exposes live assisted feedback separately from the slow searched witness. The selected
variant uses original rigid feet, unchanged muscle capacity and explicit Balance 100; no anatomy
or ordinary gameplay defaults change. Its instantaneous help and ceiling, recovery control time,
phase and release are visible. Browser review observed an actual Front fall, active help, upright
return and zero delivered help after release, in both skin and collision-shape views. This is a
page demonstration, not a replacement for independent Node qualification or the walking tail.

The first independent 128-case lying-state validation completes 114/128 within 12 seconds,
107/128 within six. It fails the substantial gate (116 total and 28/group required), so the
candidate remains experimental. Observed failures include insufficient host walking displacement,
no quiet supported handover, and one recipe whose stronger fall attempts were all prevented.
The set is retired to development if used to repair the controller; fresh validation is required.

The three 30-minute filtered SAC runs complete 80/82, 78/79 and 78/78 training episodes. Their
exported deterministic four-cardinal development evaluations complete 4/4 each by 35 seconds,
but seed 121 takes 13.3833 s on Front. Seed 120 takes 3.7000, 3.4333, 2.2667 and 3.7750 s.
Core-versus-NumPy inference on 64 replay observations per seed differs by at most 1.2e-15;
full exported closed-loop episodes are evaluated separately. These results do not yet establish
an advantage over the fixed feedback controller on varied bodies or held items.


### Support-transition corrections and confirmation

All figures here use the Node Stance Lab recovery harness, gameplay Rapier coordinate engine,
120 Hz, unchanged Warrior/Rogue anatomy and muscles, and Balance 100 for recovery and SIMBICON
host unless a recovery-only allowance is stated. The late centring correction stops upward help
and moves the whole-body centre toward the feet while retaining righting feedback. It completes
126/128 on the retired lying-state set, versus 114/128 before that correction, and preserves
64/64 directional selection successes. Those repaired cases are development data.

Six Rogue-specific whole-body IK terminal seeds were also executed on four difficult falls.
The +0.15 m stagger at reference width completed all four, whereas straight symmetric legs
completed none. Replacing the primary pose everywhere lost a different selection case (31/32
Rogue selection successes), so the model-specific pose is instead a bounded, smoothly blended
alternate after six seconds without handover. The simple compliant-sole pilot completed three
of four difficult cases, the same count as rigid feet with different failures. It did not justify
changing the body or expanding palm/toe/material branches.

A fresh confirmation manifest, seed 120102026, was frozen before evaluation. Its prefix audit
found a missing Warrior/club side orientation. The predeclared coverage rule replaced one
non-lying case with the first reserved recipe reaching that side, before recovery outcomes were
examined. With the alternate pose, confirmation completed 124/128 lying falls within 12 seconds
(group medians 4.9500, 5.0917, 4.7458 and 5.0125 s, including the 1.5-second passive prefix), and
all 16 same-body three-fall sequences. Fifteen sequences met six seconds on every fall. However,
only 28/32 disturbed cases completed, so this candidate did not qualify. The whole confirmation
set is retired after its failures informed the next correction.

The three actual disturbed failures were mechanically distinct from the nearly quiet Rogue
failures: two Warriors held a roughly one-metre split stance with large hip tracking errors,
and one retained-club Warrior had loaded foot-to-foot contact. A bounded physical search tried
18 combinations of start time (4/6 s), duration (0.5/1/1.5 s) and knee flexion (0.6/1/1.4 rad)
on each of these three states. All 54 completed. The selected conservative correction starts
only after six seconds, folds for half a second with a one-radian knee target, and uses the same
one-body-weight ceiling to unload the feet; it does not reset the recovery clock.

A factorial ablation on the same three generating recipes identifies the useful intervention.
Neither intervention completed any case. Folding alone failed the split stances and took
12.5833 s on the overlapping feet. Unloading alone completed the two split stances in
7.9417/7.9500 s but failed the overlapping feet. Combining them completed all three in
8.0917/8.0750/8.7167 s. The production correction preserves 64/64 selection successes and
completes 31/32 on the retired disturbed set; the remaining recipe never fell. These are still
repair measurements, not independent qualification. An additional 0.1-second release fade is
used when the last recovery wrench is nonzero; an already-zero wrench needs no fade delay.

The two-unit Node Arena check uses Puncher minds with SIMBICON, the new recovery and Balance 100
on both sides, plus two scheduled shove pairs. The Warrior returns to combat after three
recoveries, the Rogue after one, and both take further wounds after returning upright. A save at
step 330 continues with identical per-step pose and control/wound digests across the second
recovery and later contacts. The initial run averaged 2.24 ms/world step for both units with
other research running (p95 4.96 ms, peak JS heap 135 MB). This is a harness/load-specific reading,
not an isolated policy-only benchmark. The strengthened gameplay script also checks complete
saved-state equality and requires actual returns and subsequent combat.

The same-fall assistance pilot holds ordinary-host Balance at 100 and clips only recovery help.
Before the unloading correction, all 16 cardinal body/loadout cases complete within 12 seconds
at recovery allowance 100; none complete at 0, 10, 25 or 50. These are recovery-only causal
comparisons, not zero-Balance gameplay results. The selected controller is re-evaluated after
its final changes before those figures are used as its assistance evidence.

`research/stand-up-holdout-v3.json` reserves another independent set. It preserves the same
bounds and physical coverage audit, and predeclares orthogonal/reversed 120 N s fallback recipes
when the aligned stronger shoves still prevent falling. Prevention is recorded separately and
never counts as a successful get-up. No outcome from that set is used for tuning.


### Release stability and the next independent set

The frozen unloading/fade candidate completes 63/64 directional cases within six seconds,
126/128 V3 lying-state cases within twelve seconds (120 within six), and 32/32 disturbed cases
within twelve seconds (30 within six). It fails the repeated-fall gate at 14/16 whole sequences.
These are Node Stance Lab results at 120 Hz, gameplay Rapier coordinate engine, symmetric muscles,
original bodies, recovery Balance 100 and ordinary SIMBICON host Balance 100. V3 is retired after
its failures inform the next correction; its passing partitions do not qualify the corrected policy.

The failed sequences distinguish two mechanisms. Warrior empty, 189.50688888015847 degrees,
120 N s twice, reaches physically ready support repeatedly, but transient contact loss restarts
its 0.1-second wrench fade. The scheduled six-second foot pulse can also interrupt that release.
A latched fade holds the remaining wrench at zero through transient patch loss, suppresses the
foot pulse during release, and rearms help only after one second with lost upright foot/trunk
orientation. Actual physical support still gates handover, and quiet standing plus the host tail
still gate completion. The exact physical regression now completes within twelve seconds.

Rogue empty, after successful recovery from 318.58400484753724 degrees and its walking tail,
stalls on the next 288.5692672786357-degree fall. It is nearly motionless with upright feet, but
its centre is outside their loaded patch. A saved-state ablation aiming late horizontal feedback
at the actual penetrating patch centroid completes in 5.40 seconds at gain 2, versus no completion
within twelve seconds without that correction. However, enabling it broadly loses other host-tail
successes: contact-centre plus latched release finishes 62/64 selection and 14/16 retired repeated
sequences. It remains an explicit disabled experiment, not the selected runtime setting.

Latched release alone preserves all eight earlier physical regressions and passes the new
transient-contact regression. It completes 63/64 selection within twelve seconds (62 within six)
and 15/16 retired repeated sequences. The remaining selection failure is Warrior club at 22.5
degrees, which reaches quiet handover in 5.1917 seconds but fails the one-second walking-distance
check. The remaining retired repeated failure is retained, not omitted from the count.

The uniform-friction margin probe applies the declared coefficient to all colliders before every
solver step, including recreated hand colliders. At 0.4, 0.5 and 0.6, each of the sixteen cardinal
body/loadout cases completes within twelve seconds with the pre-latched candidate (48/48 total).
An earlier partial probe set friction only at construction and is discarded. This is an explicit
research engine-law perturbation, not a changed gameplay material or arbitrary-surface claim.

The pre-latched candidate also completes two forced recoveries in a thirty-second two-unit Arena
bout. Both fighters return to active wounded combat; 200 contacts are recorded. Restoring the
checkpoint reproduces every physical pose, control/wound trace and the complete final saved state
exactly. Under concurrent research load the Node whole-world mean is 2.70 ms/step and p95 5.39 ms,
with peak sampled heap 106 MB; this is not isolated controller cost. The final selected candidate
receives a separate gameplay run.

`research/stand-up-holdout-v4.json`, seed 1210202604, reserves fresh lying, disturbed and repeated
cases with the same bounds and predeclared coverage procedure. Its recovery outcomes are not
used to choose or tune the frozen release-only candidate. `research/stand-up-diagnose.mjs` captures
complete failing continuations and prior successful falls, with exact-source/configuration checks.


### Qualified assisted result

The selected runtime is `assisted-rise`, with the configuration in
`assets/core/assisted-rise.json`, original Warrior/Rogue anatomy, unchanged symmetric muscles,
gameplay Rapier coordinate engine at 120 Hz, and **Balance 100 for both recovery and the ordinary
SIMBICON host**. It is an additional choice; no normal character, locomotion or recovery preset
is replaced. The selected policy source is commit `58b5e809`. All four final partitions have the
same policy SHA `42090123be733e59d9f49972ced16905b0923f90b59ead49f0cc8379130193c3` and source SHA
`dc3c1ab2d175d9ae95ce480698dccca020122633f0cf2aabaf13018e004ec6fb`.

These are Node Stance Lab results, with real falls, actual loaded foot patches, upright trunk and
soles, 0.5 seconds below 0.1 m/s segment speeds, released recovery help, two seconds of ordinary
host standing and one second walking at least 0.1 m. The handover clock includes preparation,
retries, settling and the quiet check; verification follows without increasing that deadline.

| Final partition | Within 6 s | Within 12 s | Within 35 s | Substantial gate |
|---|---:|---:|---:|---|
| Directional selection | 62/64 | 63/64 | 63/64 | Pass |
| V4 independent lying starts | 116/128 | 126/128 | 127/128 | Pass |
| V4 repeated sequences, three falls each | 10/16 | 16/16 | 16/16 | Pass |
| V4 disturbed recoveries | 29/32 | 30/32 | 31/32 | Pass |

All 48 actual recoveries in the repeated sequences complete within 12 seconds; the slowest is
8.5333 seconds. The V4 prefix audit covers prone, supine and both sides in every model/loadout
group without replacements. Validation group success counts within twelve seconds are
32/32, 32/32, 31/32 and 31/32 (Warrior empty/club, Rogue empty/club). Failure-inclusive group
medians are 5.2083, 5.3333, 4.9750 and 5.0375 seconds, including the 1.5-second passive prefix.
The full target fails: neither the four-second validation median nor all six-second reliability
requirements are met. These finite engineering cases do not establish population-level human
reliability or recovery under arbitrary disturbances.

The frozen principal comparator is staged rise, selected before the final candidate. All rows
below use the same original bodies, gameplay engine, 120 Hz and symmetric muscle path. The first
four also share ordinary-host Balance 100 and SIMBICON; the last is a separate combined-product
comparison with original zero-Balance/stance-host play.

| 64-direction comparison | Within 12 s | Within 35 s |
|---|---:|---:|
| Selected assisted rise | 63 | 63 |
| Staged rise, matched assistance ceiling | 0 | 32 |
| Support recovery, matched assistance ceiling | 0 | 28 |
| Staged rise with experimental root-feedback wrench | 0 | 0 |
| Original staged rise, zero Balance and stance host | 0 | 12 |

The matched principal comparison passes the declared improvement margin: 63 additional cases at
12 seconds, with matched spec, host, balance, engine artifact, actuation, source and rate. Its
failure-inclusive median is censored; the new selection median is 3.8083 seconds. The experimental
staged-plus-feedback control replaces its assist request under the shared ceiling; it does not
stack two allowances or replace staged joint commands. Simply attaching that wrench to the old
stages does not recover successfully. It is not the principal comparator.

The final same-fall causal assistance test keeps host Balance 100 throughout and clips only
recovery requests. Across sixteen cardinals, allowances 0, 10, 25 and 50 produce no complete
recovery within twelve seconds; allowance 100 completes all sixteen. This selects the lowest
successful *tested* allowance, not proof of an exact minimum. The actual lower-Balance runtime
uses existing support recovery; the clipped-policy ablation is a separate experiment.

The final friction probe passes 16/16 cardinals at each uniform coefficient 0.4, 0.5 and 0.6.
These research laws are applied before every solver step, including recreated hand colliders.
Gameplay remains at its original friction law. The final two-unit Arena checkpoint test repeats
the physical/control/wound continuation and complete saved state exactly, returns the Warrior
from two forced recoveries at bout times 5.8 and 17.4 seconds, and resumes wounded combat with
200 recorded contacts. The under-load world-cost reading is kept distinct from the active-policy
callback measurement in `research/stand-up-results.json`.

Browser review uses the owner's existing server without restarting it. The shared entry is
`?play=lab&scenario=recovery&balance=100`. The page visibly runs active assistance, releases it,
returns to the real host and moves on command, in skin and collision-shape views. The final
Rogue club 202.5-degree example reports 5.93 seconds of recovery ownership, zero assistance after
release, and 0.17 m/s while walking; those page readings are distinct from Node quiet-handover
qualification. Repeat two shoves preserves the existing body. A caught shove is prevention, not
get-up success. Lab stress buttons retain both slow examples and the failed walking check.

Remaining counterexamples are explicit. Warrior club 22.5 degrees reaches quiet handover but
fails walking displacement. V4 Rogue empty 138.09744842204964 degrees remains unrecovered by
35 seconds after its supine prefix; another Rogue club validation case finishes after twelve.
The disturbed Rogue empty 266.52743375860155-degree case does not finish by 35 seconds, while
Warrior club 326.8404536973685 degrees finishes in 12.1917 seconds. Exact generated recipes,
all deadline failures, delivered-assistance summaries and raw-report hashes are in the compact
`research/stand-up-results.json`; full local reports and saved worlds remain under the ignored
campaign directory. No held-out outcome is used to change the final candidate.

The learning branch remains a method adaptation, not a learned production-policy success claim.
The reference pretrained teacher/student execute locally and published SAC updates/resume work;
full ten-million-transition retraining is not completed. Three independent thirty-minute adapted
SAC runs produce successful episodes, but the selected seed's 61/64 directional results do not
beat the simpler feedback controller. The browser therefore runs deterministic feedback and
ordinary muscle commands, with no training library or neural weights loaded. Whole-body IK
supplies a useful terminal seed; its geometric feasibility alone never determines success.
The sole pilot gives no net gain, so broader palm/toe/morphology searches are stopped. Automated
strength/assistance curriculum advancement is not implemented; the fixed-stage pilots and
retained assisted result are reported as such.

These results qualify only the separately labeled assisted experiment under its historical
criteria. They do not satisfy the owner's unassisted objective or justify declaring the work
complete. The comparison also omitted the best recorded optimized recipe; its apparent margin
must not be reported as improvement over that recipe. Fast, robust unassisted recovery,
learned added value and broader body/surface experiments remain unfinished.


The active recovery callbacks, including observation/support reads, take a combined mean of
0.270-0.497 ms per physics step across sixteen cardinal body/loadout trials on the i7-13700H.
No other agent physics worker runs during this reading. `wants` and `step` are timed separately;
this is controller cost, not total world-step cost. Instrumented outcomes match the selection
outcomes exactly. Requested and delivered wrench peaks/integrals are recorded separately;
for example, the Warrior Front requests a peak 2,553.5 N while its delivered peak is limited to
774.7 N. This does not increase muscle strength or bypass the Balance ceiling.

At qualification, the ledger charges 9,058,899 physics steps: 6,943,899 explicitly recorded steps
plus 2,115,000 conservative allowances for reference/setup, interrupted probes, tests and browser
work. Conservative charges are not claimed as measured executed steps. The 24-million-step
validation reserve remained unused inside the 160-million cap. Work stopped after about 4.3
active hours. The assisted result did not justify early completion of the owner's goal; neither
the nominal 24 hours nor the full published training schedule ran.

Reproduce the selected physical gates from the committed configuration:

```powershell
node research/stand-up-campaign.mjs --partition selection --workers 3 --output research/runs/selected.json
node research/stand-up-campaign.mjs --partition validation --manifest research/stand-up-holdout-v4.json --workers 3 --output research/runs/validation.json
node research/stand-up-campaign.mjs --partition repeated --manifest research/stand-up-holdout-v4.json --workers 3 --output research/runs/repeated.json
node research/stand-up-campaign.mjs --partition disturbed --manifest research/stand-up-holdout-v4.json --workers 3 --output research/runs/disturbed.json
node research/stand-up-gameplay.mjs research/runs/gameplay.json
node research/stand-up-assistance.mjs research/runs/assistance.json
node research/stand-up-friction.mjs research/runs/friction.json
node research/stand-up-cost.mjs research/runs/cost.json
```

Comparator configurations, their matched identities and all failed case recipes are embedded in
`research/stand-up-results.json`; pass the chosen configuration as `--config` to the campaign
runner. The existing complete raw reports, training checkpoints, optimizer/replay/PRNG state,
source snapshots and three actor exports remain local and resumable at their generating source.
Upstream reference assets/code/weights remain local because no upstream redistribution license
was found. The final repository gate is type checking, the fast suite, browser build, the nine
focused physical regressions, qualification checks and whitespace/line-ending checks. Existing
six-second and other TODOs remain visible.


## Frozen unassisted comparison

`stand-up-acceptance-v1` is the named Git commit for the evaluator, baseline and saved falls.
The owner's acceptance criteria may not be changed without agreement. This is a reproducible
**development comparison**, not a replacement qualification or evidence that recovery is solved.

Run from that checkout, with Node 24.15.0 and the lockfile-installed dependencies:

```powershell
node research/stand-up-acceptance.mjs
```

The command refuses a different HEAD or tracked-file edits. It compares the ordinary support
controller against the best recorded optimized recipe (`stand-up-feedback-seed.json`, the
15.5583 s Front witness), then proves that the shipped floating controller is rejected. The
report is `.tools/stand-up-acceptance/report.json`; exit zero means the comparison ran and its
controls passed, **not that a controller met the recovery goal**. External-actuation violations
by a candidate produce exit code 2. Exceptions, identity mismatches or an incomplete run are
errors, never successful comparisons. Partial reports lack a final summary.

Sixteen committed compressed checkpoints cover Warrior and Rogue, each empty-handed or with a
right-hand club, at four cardinal shove directions. All use the existing compliant soles,
unchanged default muscle/body properties, the stance host, Balance 0, symmetric actuation,
gameplay Rapier coordinate engine at 120 Hz and the same ground. The snapshots contain complete
physics, world, host, skills and recovery state. The original optimized recovery prefix is shared
by every continuation and remains included in elapsed time. These are not independent fresh-fall
candidate trials, repeated falls, disturbances or held-out robustness evidence.

The prefix audit allows exactly the two declared chest impulses at steps 240 and 264, and no
other external actuation. From restoration through standing and walking, the evaluator records
all segment-body force, torque, impulse and angular-impulse calls at the engine interface; it
also rejects pinning and mass changes. Zero in a later step or an opposite force cannot erase
an earlier violation. This catches calls outside the ordinary Assist meter. Solver gravity,
physical contacts and bounded joint motors remain permitted. The actual floating controller is
run from the same first checkpoint with Balance 100 enabled expressly as a negative control;
its external force and moment invalidate it immediately. That is not a performance comparison.

The unchanged physical completion predicate requires upright trunk and soles, actual loaded
foot patches, centre of mass in support, quiet motion for 0.5 seconds, ordinary-host handover,
two seconds standing and one second walking at least 0.1 m. Help is forbidden during that entire
tail as well as recovery. Handover later than 35 seconds fails; the episode allows a further
three seconds to verify it. Counts at 6, 12 and 35 seconds and failure-inclusive medians are
reported without deleting failed cases. No new threshold defining substantial improvement or
human-level robustness is introduced. Full physical trace hashes and results of the frozen
optimized baseline must reproduce on every command run.

Other existing controls can be compared with `--controller dynamic` or `--controller assisted`.
Both run at Balance 0; Assisted therefore exercises its existing fallback. `--controller optimized`
is an identical-continuation reproducibility control. A future experimental action module can
be evaluated without editing the frozen checkout:

```powershell
node research/stand-up-acceptance.mjs --candidate C:\path\to\candidate.mjs
```

The module exports `createPolicy({ channels, configuration })`, returning a function called on
a detached body observation each step. It returns the existing `muscles`, bounded `targets`, or
`host` action accepted by `checkRecoveryAction`. Any requested nonzero assistance is rejected,
even if the ceiling would clip it away. The factory is reconstructed separately for every case.
Place experiments outside tracked evaluator files. Report candidate source and dependency
identities; the command hashes the entry module, not its transitive imports. Changes to the
body, host, engine, baseline or case set require a separately agreed protocol and matched runs.
Do not move the frozen ref. Keep its commit hash outside the experiment when independently
reviewing a result; Git refs and repository instructions are an audit trail, not a security
boundary against someone who can rewrite the evaluator or execute arbitrary candidate code.

To keep working on newer source while running this exact gate, make a detached checkout of
`stand-up-acceptance-v1`, run `npm ci` there, and run the command there with the candidate module's
absolute path. Existing binary checkpoints require the captured Node version; a different
runtime must be separately revalidated, not silently substituted.

### Inspect in the Lab

Use the server for the frozen checkout (or the current checkout while it is that same commit).
If no server is running, `npm run dev` starts it; do not replace another running server.
Open this exact address for the optimized baseline's Front case:

`http://localhost:5180/?play=lab&scenario=recovery&recoveryMode=witness&model=workshop-fighter&right=empty&left=empty&boots=1&armour=1&sole=1&balance=0&hz=120&pushDegrees=0&pushImpulse=60&pushSeparation=0.2`

1. Confirm **Get-up variant: Slow searched witness**, Warrior, compliant soles and Balance 0.
2. Let its automatic two Front shoves run; do not add manual shoves or walking during recovery.
   Watch **Delivered help / ceiling** stay zero. Space pauses; the timeline scrubs recorded motion.
3. After recovery, use **Walk forward for 1 s** to inspect host movement. This manual visual
   check does not replace the Node evaluator's automatic standing/walking tail.
4. Change `pushDegrees` in the address to 90, 180 or 270 to inspect the retained failing cases.
   Change `model` to `workshop-rogue` and/or `right` to `club` for the other frozen configurations.
   Navigate to the full address; **Reset demonstration** resets to the default Warrior Front recipe.
5. To inspect the separate floating variant, choose **Live assisted rise**. This explicitly
   changes to original feet, SIMBICON and Balance 100. Its visible lift and positive help reading
   are assisted behavior and are not unassisted progress.

These existing Lab links generate a fresh fall with the specified recipe; they do not import
the Node binary checkpoint. Node results are the acceptance evidence. Browser and Node physics
are not generally interchangeable, and these instructions do not claim exact cross-runtime replay.
An arbitrary action-module candidate is not automatically exposed as a Lab variant.

## Bounded saved-fall improvement, 2026-10-12

One materially faster **unassisted saved-fall trajectory** is established. This is a narrow
development witness, not completion of the broader fast, robust stand-up goal. The search starts
at 14:14:43 UTC and stops at 14:43:07 UTC, inside the owner's two-hour allocation; verification
and replay packaging follow within that allocation. No body changes are made.

All measurements in this section use **Node Stance Lab, gameplay `rapier-coordinate` adapter 11,
120 Hz, symmetric muscles, Warrior, empty hands, existing compliant soles, ordinary stance host,
and Balance 0 throughout**, including standing and walking. The frozen evaluator is commit
`4ebb4d8ddb9eac1b5c9af9e27c695edf80348a40`, the commit behind `stand-up-acceptance-v1`.
The saved case is `workshop-fighter-empty-0`, checkpoint SHA-256
`3ac4defee135b4c70b707f2299ca13ff5af6c80631b41ea30121f992414c1a1d`.
Its complete physics, body, host and controller state is restored; the original takeover clock
is retained. Neither the frozen checkout nor its criteria, baseline, cases or physical configuration
is changed.

| Same saved fall, Node Stance Lab / game Rapier / 120 Hz | Qualified handover | End of standing/walking verification | Result |
|---|---:|---:|---|
| Frozen optimized baseline | 15.558333 s | 18.558333 s | Pass |
| Selected muscle trajectory and earlier ordinary-host release | 12.408333 s | 15.408333 s | Pass |

The reduction is **3.150 seconds, 20.246%**. The candidate combines bounded recipe changes and
shorter individual pose stages with returning control to the ordinary host at
9.658333 seconds (action index 1158). That release request is **not** counted as recovery completion: the host finishes
the physical rise, and the independent quiet-support predicate first records qualified handover
at 12.408333 seconds. The subsequent two seconds standing and one second walking pass; measured
walking displacement is 0.239100 m against the unchanged 0.1 m requirement.

The engine-seam audit records no external actuation, pinning or mass changes. All preparation,
recovery and host assistance meters remain exactly zero. Commands use ordinary muscle activation
and velocity channels with the original directional strength/speed limits. The maximum numerical
effort-bound excess is 0.0000419384 N m, below the frozen 0.0001 tolerance. No strength, anatomy,
mass, contact law, solver setting or locomotion configuration changes are used.

The selected recipe is in `research/stand-up-saved-seed.json`. Its actions are in
`research/stand-up-saved-actions.json.gz`, consumed by `research/stand-up-saved-candidate.mjs`.
This is an open-loop trajectory for one exact saved state. The module recognizes that initial
observation and returns the ordinary host action on an unfamiliar state; it is not a general
recovery policy or a new gameplay preset. The frozen sixteen-case comparison remains the
development screen, with every failure retained. Both baseline and candidate complete 1/16 by
35 seconds and 0/16 by 6 or 12 seconds; failure-inclusive medians remain infinite. The candidate's
other fifteen cases fail: ten with nonfinite joint actuation under its ordinary-host fallback,
five at the episode deadline. No completion is lost or gained, and no broader reliability gain
is claimed. All sixteen baseline result/trace records reproduce exactly, all initial-state hashes
match, and the actual floating-controller negative control is rejected for external actuation.

### Search evidence and replay

The eight bounded searches evaluate 1,425 trials and 3,493,824 world steps, excluding recording,
materialization and verification. Several searches overlap in wall time, with sequential worlds
inside worker threads. Recipe-generation trials restore the saved state into the same physical
environment with only the immutable controller recipe identity changed. Their results are search
evidence; the selected commands are independently executed through the untouched frozen
`--candidate` action interface before acceptance.

| Search, Node Stance Lab / game Rapier / 120 Hz | Trials | Best verified search-trial time |
|---|---:|---:|
| Feedback CMA | 432 | 15.275000 s |
| Individual pose-duration CMA | 396 | 15.066667 s |
| Individual pose-duration coordinate search | 250 | 14.666667 s |
| Feedback coordinate search | 238 | 14.583333 s |
| Earlier host release on the frozen baseline trajectory | 65 | 13.116667 s |
| Earlier host release on the feedback-coordinate trajectory | 29 | 13.741667 s |
| Narrow release window on the pose-coordinate trajectory | 14 | 12.408333 s |
| Matched transition instant on the feedback-coordinate trajectory | 1 | Failure |

A direct combination of the two independently improved recipes also fails to recover in
24 seconds. Failed trials and host-tail failures are not omitted from the local search ledgers.
Reconstruction also exposes a one-step sensitivity: PowerShell rounds an unquoted decimal release
threshold, causing release one physics step earlier and failure to recover within 22 seconds.
The quoted exact threshold reproduces; the reconstruction command uses integer action index 1158
to avoid that ambiguity. This timing sensitivity is further evidence against a robustness claim.
The selected action continuation independently reproduces all 1,848 physical observations, its
whole result and the trace SHA-256
`65dfe069cc55043b92d57e8beddc1a5e6cf5f5a0ff639dd513f4422ba5bd7e3b`
through `evaluateAcceptanceCase`. `research/stand-up-saved-materialize.mjs` asserts that equality
and records the candidate entry, action-data and generating-trace hashes.

Local artifacts are under `.review/stand-up-two-hour/`: `acceptance.json` is the complete frozen
comparison; `candidate.json` includes the physical audit and dependency identities; the compressed
`baseline.trace.gz` and `candidate.trace.gz` retain full observations. Open **`replay.html`** directly
in a browser. It is standalone, includes both recordings, and offers playback speed, pause, single
steps, scrubbing and an orbit camera. It draws the measured segment transforms and actual collider
shapes, with loaded floor patches marked. It replays Node poses and does not claim browser/Node
physics equivalence. No development server is required for inspection.

To reproduce, use Node 24.15.0 and a clean detached checkout in `.tools/stand-up-frozen`, with
`npm ci` run there. The frozen comparison accepts the committed action module directly:

```powershell
node .tools/stand-up-frozen/research/stand-up-acceptance.mjs --candidate "$PWD/research/stand-up-saved-candidate.mjs" --output .review/saved-fall-acceptance.json
```

To reconstruct the selected trajectory and standalone replay, use fresh output names:

```powershell
node research/stand-up-saved-search.mjs --out .review/saved-baseline --record yes --seconds 38
node research/stand-up-saved-search.mjs --out .review/saved-recipe --mode stages --start research/stand-up-saved-seed.json --record yes --seconds 38
node research/stand-up-saved-release.mjs .review/saved-recipe.trace.gz .review/saved-release --step 1158
node research/stand-up-saved-materialize.mjs .review/saved-release.trace.gz .review/saved-candidate
node research/stand-up-saved-viewer-build.mjs .review/saved-baseline.trace.gz .review/saved-candidate.trace.gz .review/saved-replay.html
```

Materialization writes the action-data file beside the candidate module and checks the full
physical continuation against the frozen evaluator. The replay builder uses the installed game
Rapier's convex-hull geometry and bundles the existing Babylon dependency into the HTML.

Validation: `npm run check`, `npm test` (661 pass, 0 fail, 5 existing TODOs), `npm run build`
(existing large-chunk warning), complete frozen candidate comparison, exact selected-trace replay,
and visual inspection of the standalone replay through its walking tail. The five TODO contracts
remain unresolved; the fast suite exits successfully. `research/stand-up-saved-result.json`
retains the comparison summary, failures, identities and selected physical audit.

## Full-goal implementation: feedback and short-route screen, 2026-10-12

The owner has requested implementation of the full unassisted goal. It remains **not achieved**:
four-second failure-inclusive group medians, six-second qualifying recoveries, and the full
directional, independent-start, repeated-fall and disturbed-recovery gates. The existing
`research/stand-up-qualification.mjs` full thresholds remain the targets: 61/64 directional,
122/128 independent starts, 15/16 three-fall sequences and 31/32 disturbed trials, together with
the per-group, cardinal and pose-coverage requirements. These are future unassisted qualification
requirements; historical assisted results satisfy none of them for this implementation.
The sixteen frozen falls remain a development screen, with their evaluator unchanged.

All results in this section use the **Node Stance Lab, frozen game Rapier coordinate engine,
120 Hz, symmetric original muscle envelopes, Balance 0 and ordinary stance host**, with the
existing compliant-sole bodies. No anatomy, strength, speed, contact law or solver setting changes
are made. `research/stand-up-path-results.json` retains the configurations, results, trace hashes,
search checkpoint, frozen comparison and failed ordinary-host commands.

`research/stand-up-path-policy.mjs` adds observation feedback to the recorded demonstration.
It can match nearby reference poses, correct motor velocities and torque-source activation, and
require minimum phase progress. The compiled reference carries the actual joint-axis signs;
the corrected feedback maps joint-coordinate error through `turningToRef`. All outputs remain
ordinary bounded muscle commands. Reference compilation and comparisons live in
`research/stand-up-path-experiment.mjs`; its worlds come from the unchanged frozen checkout.
Fresh neighboring falls are physically generated by changed shove direction, without editing
body poses or velocities. Their recovery clocks include the actual takeover interval.

| Experiment, Node harness above | Outcome |
|---|---|
| Nominal reference with feedback | Reproduces the 12.408333 s physical continuation exactly |
| Faster reference, velocity-feedback grid: 12 accelerated candidates | No recovery by the 20 s episode cap; one terminates with nonfinite actuation |
| Fresh -1/+1 degree shoves, velocity feedback: six candidates | No recovery by the 20 s cap; one terminates with nonfinite actuation |
| Torque feedback plus phase matching: eighteen candidates | Only the nominal continuation succeeds; requested 1.3x progression matches the original timing, not a faster recovery |
| Torque feedback with forced progression: twelve accelerated and six neighboring-fall candidates | No recovery by the 18 s episode cap |
| Four short postures: nine initial candidates and 576 CMA candidates | No recovery by the 9 s episode cap |
| Roll selected after waiting, followed by short postures: nine candidates | No recovery by the 9 s episode cap |

The phase matcher can stall in a passive reference interval. A minimum progression rate removes
that particular stall but does not make these trajectories recover from the neighboring falls.
The first roll grid sampled orientation before waiting; its nine failures are retained in the
machine record, and the corrected after-wait comparison is the one in the table.

`research/stand-up-compact-policy.mjs` implements the short posture family and orientation-based
roll selection through bounded target commands. The CMA run uses 621,504 continuation world steps
over 581.341 wall seconds, including 576 candidate evaluations. Its best surrogate score is a
failure: the body rests with its head/trunk and feet on the floor. Re-recording the selected
candidate reproduces every physical observation, SHA-256
`49c6660008a143401550a1cf03d3248828e48c6c58bf3a926848597d23f73a38`.
The surrogate does not establish a usable route. Further search on that score is stopped.

The selected feedback policy also runs through the actual frozen
`stand-up-acceptance.mjs --candidate` interface. Both controllers complete 1/16 within 35 s and
0/16 within 6 or 12 s; neither has a finite failure-inclusive median. The candidate has eight
nonfinite-actuation failures and seven episode deadlines. Its sole successful physical trace
is identical to the earlier 12.408333 s witness, including the standing/walking tail. All baseline
results and full traces reproduce, all initial states match, and the floating-controller negative
control is rejected. There are no external-actuation events in candidate runs. This screen
establishes no speed or reliability improvement over the saved witness.

Two separately captured ordinary-host failures locate nonfinite activation in a complete leg
while body poses and velocities are still finite: Warrior empty at 90 degrees, 26.95 s, and Rogue
empty at 90 degrees, 9.508333 s. Their failing steps are rejected. This identifies invalid host
commands, not a proven root cause or a reason to waive muscle-bound checks. Releasing an
unsuccessful recovery into the ordinary host is not a fallback recovery strategy.

The tested replay correction and four-posture search are not sufficient. The contact-feedback
experiments below address support and weight transfer. Runtime integration and every full
qualification partition remain unfinished. No gameplay preset changes in this screen.

The local failed short-route replay is `.review/stand-up-full/short-sequence-failure.html`, with
the frozen optimized baseline for comparison. Its failed physical recording is
`.review/stand-up-full/compact-failure.trace.gz`. The HTML uses the existing standalone viewer;
the new failed motion has not been visually reviewed in a browser.

For the feedback comparison, first reconstruct `.review/saved-candidate.trace.gz` with the
preceding saved-fall reproduction commands. Extract its reference:

```powershell
node research/stand-up-path-experiment.mjs --mode extract --source .review/saved-candidate.trace.gz --out .review/path-reference.json.gz
```

Write a configuration JSON with `reference` set to that output and `parameters` set to
`{"rate":1,"gain":4,"window":0.2,"minRate":0.75,"torqueGain":1,"damping":0.1}`. Set
`STAND_UP_PATH_CONFIG` to its path, then run the frozen evaluator with
`--candidate "$PWD/research/stand-up-path-policy.mjs"`. `--mode record --config <file> --out <stem>`
on the experiment script writes a full physical replay; `--mode grid` reads parameter overrides
from `grid`, and `--mode search` reads bounded fields from `fields`. The machine record retains
the exact tested configurations, including the failed search seed and optimizer state.

Validation: `npm run check` passes; `npm test` reports 661 passes, no failures and five existing
TODOs. The complete frozen comparison and exact selected-failure reconstruction pass their
software/reproducibility checks. The recovery performance tests fail as recorded above.

## Detached contact-feedback components, 2026-10-12

The full recovery goal remains **not achieved**. A new controller demonstrates a standing
weight transfer and foot lift, but all thirteen tested saved-fall transitions fail. This is
component progress, with no improvement in qualifying recovery time or recovery coverage.

These measurements use **Node Stance Lab / frozen game Rapier coordinate / 120 Hz / symmetric
original muscle envelopes / Balance 0**, Warrior with empty hands and the existing compliant
soles. There are no body, muscle, solver, contact-law or host changes. The frozen evaluator and
saved falls remain unchanged. No full qualification partition is run for these failed policies.

`research/stand-up-contact-model.mjs` extracts static anatomy and muscle data into a serializable
descriptor. `research/stand-up-detached-dynamics.mjs` reconstructs read-only prediction bodies
from that descriptor and detached observations; they have no engine handles or actuation methods.
`research/stand-up-tracking-policy.mjs` uses the core's coupled acceleration and bounded tracking
solver, then emits ordinary muscle activation/velocity commands. Its support constraints exist
only in the prediction. The physical game receives no artificial pins or ground forces.

`tests/stand-up-detached.test.mjs` compares the entire generalized acceleration vector and every
segment's point acceleration with the actual body's coupled model, at standing and moving fallen
observations. They match exactly, and prediction leaves the complete observation unchanged.
This verifies the detached model's wiring, not agreement between predicted and realized contact
motion. The frozen observation omits collider IDs on patch points; optional rolling prediction
estimates them using the nearest measured impulse pair, defaulting to collider zero when none
exists. This approximation and unmodelled self contacts remain limitations.

| Component experiment, Node harness above | Outcome |
|---|---|
| Static contact-wrench torques, nine standing starts | Eight fall within two seconds; the ninth sinks/tilts. Replaced by coupled acceleration tracking. |
| Coupled tracking, four standing/shift/crouch starts | All remain up through five seconds; the requested 8 cm crouch reaches about 5 cm. |
| Coupled tracking, four lateral shifts followed by a left-foot lift | One remains up through six seconds; three fall. |
| High-kneel transition after the saved trajectory's seven-second prefix, nine trials | All fail by the eleven- or thirteen-second total episode cap, including joint-stop and rolling-contact variants. |
| Foot placement from hands and knees after the four-second prefix, four trials | All fail by the eight-second total cap, including release of the same-side hand. |

The standing lift's selected parameters are `response: 0.3`, `shiftX: 0.23`, and
`liftFoot: "foot.left"`. At every recorded step from four through six seconds, the root-up cosine
is at least 0.999592, the left foot's centre is at least 0.040750 m above its initial height,
the left foot has zero floor impulse, and the right foot remains loaded. Maximum effort-bound
excess is 0.0000116081 N m, below the unchanged 0.0001 tolerance; assistance and external-actuation
events remain zero. The body starts standing: this is **not** a six-second recovery.
All 720 physical continuation observations reproduce exactly, SHA-256
`d8234f9f99271602e41d0d33cf6d4cdcbe96a068d55ff0c42bd4c5ec896e5461`.

`research/stand-up-path-results.json` retains every configuration/result, source identities,
failure timelines and the selected component's measurements. Local recordings and configuration
files are in `.review/stand-up-contact-feedback/`. Open `weight-transfer.html` directly for the
component replay and standing-hold comparison. Its labels explicitly distinguish standing
components from recovery. Browser visual inspection was not performed: the browser tool rejects
local-file URLs, and no workaround was attempted. The HTML was built successfully.

To reproduce the component, use the reference-extraction command above, write a configuration
with `kind: "tracking"`, `standing: true`, that reference path, and the selected `parameters`,
then run `stand-up-path-experiment.mjs --mode record --config <file> --out <stem> --seconds 6`.
The same runner uses `prefixSteps` only for component isolation on a saved fall: those steps
are physically replayed, audited and included in the original recovery clock. They are never
removed from reported recovery times.

The missing capability remains reliable acquisition and replacement of support while down.
Standing balance is insufficient: the kneeling samples lose their intended support, and a
locally accepted acceleration prediction does not establish a feasible physical transition.
Further work must address that mismatch before another timing or robustness claim.

Validation: `npm run check`, `npm test` (662 passes, zero failures, five existing TODOs),
`npm run build` (existing MuJoCo externalization and large-chunk warnings), the named detached
dynamics test, and exact selected-component reconstruction pass. The recovery performance tests
fail as listed above. No development server was started.

## Contact acquisition and prediction probe, 2026-10-12

The full goal remains **not achieved**. The contact controller now admits a landed foot as support
and can enter a rise attempt, but none of the 62 further trials completes recovery. Six are
identical repeats: the root-priority grid supplied an unused `centreHeightOffset` parameter.
They are retained in the evidence and do not count as independent configurations.

All measurements here use **Node Stance Lab / frozen game Rapier coordinate / 120 Hz / symmetric
original muscle envelopes / Balance 0**, Warrior empty, existing compliant soles and the unchanged
ordinary host. No body, muscle, solver or frozen acceptance changes are made.

`research/stand-up-tracking-probe.mjs` executes sixty physical steps from standing and from the
saved trajectory's four- and seven-second prefixes. It compares requested muscle torque with
whole-step delivered torque, and coupled-model acceleration under predicted support forces with
the following physical velocity change. Median absolute torque differences are respectively
1.99e-8, 3.20e-8 and 9.93e-8 N m. The largest differences are 0.00000274, 0.137833 and 2.509105 N m;
the latter cases include channels near anatomical stops. This is an actuation diagnostic with
contact and controller-switch transients, not a muscle peak-strength measurement.
The requested torques mostly arrive, while predicted root acceleration can differ substantially
from the resulting motion. Fifty-seven of the sixty fours samples and eight kneeling samples
have loaded self contacts, which the controller's floor-support predictor does not model.
These observations do not isolate a single cause of the acceleration mismatch.

Two controller defects are corrected. A placement's default foot-centre height comes from the
body's measured standing height, with a small requested compression, rather than a target above
the sole. A foot that becomes flat and loaded stops being excluded from predicted support.
The optional extension stage transfers toward that foot, raises the centre-of-mass target and
asks the other foot to land. `tests/stand-up-detached.test.mjs` exercises this transition through
the real saved-fall action sequence, checks measured sole orientation/load and the predicted
support force, and confirms that this intermediate event is not reported as recovery.

| Experiment, Node harness above | Trials | Recovery result |
|---|---:|---|
| Immediate centre-of-mass transfer from kneeling | 12 | All fail by 10 s |
| Foot swing without waiting for static balance | 12 | All fail by 10 s |
| Placement at the measured sole height | 6 | All fail by 10 s |
| Admit the landed foot and attempt extension | 6 | All fail by 12 s |
| Increase trunk-orientation priority | 12, six distinct | All fail by 10 s |
| Wider foot paths from hands and knees, with/without same-side hand release | 8 | All fail by 9 s |
| Isolated extension from the saved trajectory's nine-second prefix | 6 | All fail by 15 s |

Every cap includes the original prefix. These are transition experiments, not new qualifying
recoveries or full robustness runs. The selected failed acquisition run admits its left foot at
8.283333 s after takeover, then fails to rise. Re-recording reproduces all 1,439 physical
observations and the complete result, SHA-256
`c917a08cbd3b1612c6bde23b4d6e94f9436ecf03fe709c47ed71705e7761a665`.
Its maximum effort-bound excess is 0.0000346886 N m, below the frozen tolerance, and its assist
and external-actuation audit remains zero. It supplies no speed or coverage improvement.

`research/stand-up-path-results.json` retains all configurations, outcomes, source identities,
the probe summary and the duplicate-run disclosure. The full local probe is
`.review/stand-up-tracking-probe/prediction.json`; `selected-config.json` reproduces the failed
recording with the existing runner's `--mode record --seconds 12` command. The standalone
`failed-acquisition.html` in that directory compares it with the frozen optimized baseline.
The browser's local-file policy still prevents visual inspection; the replay is built, and its
physical trace is verified, but it is not visually reviewed.

Further gain tuning of this local predictor is not supported by these results. A useful next
controller needs a route that is feasible through the actual contacts and anatomical stops,
including the momentum carried into each transition. Qualifying timing, independent-start
robustness, repeated falls, disturbances and runtime integration all remain unfinished.

Validation: the named physical regression test, `npm run check`, `npm test` (663 passes, zero
failures, five existing TODOs) and exact failed-trace reconstruction pass. No browser source
changes are made in this experiment and no server is started.

## Physical rollout search, 2026-10-12

The full goal remains **not achieved**. Actual-physics search reduces the one saved Warrior/empty
fall from 12.408333 s to **7.25 s**, followed by the complete three-second standing/walking tail.
This is 41.6% faster than the previous saved action witness and 53.4% faster than the frozen
15.558333 s optimized baseline. It still misses six seconds and supplies no demonstrated increase
in recovery coverage. The body, original muscle envelopes, solver, contact law and ordinary host
are unchanged. All measurements here use **Node Stance Lab / frozen game Rapier coordinate /
120 Hz / symmetric actuation / Balance 0**, with the existing compliant soles.

`research/stand-up-rollout-search.mjs` branches complete physical snapshots and evaluates short
muscle-action continuations. Candidates replay accelerated portions of a successful trace, ask
for nearby joint targets, or combine reference arm commands with leg targets. The revised score
compares body tilt, motion and actual floor-load shares as well as joint angles and height.
One branch retains the exact reference trajectory. Each worker advances its own world sequentially;
no artificial support, pose installation or force enters the selected physical continuation.
An initial pilot confused a numerical pose error with a failed evaluation and is excluded.

| Search, Node harness above | Branch/tail evaluations | World steps | Best qualifying recovery |
|---|---:|---:|---|
| Pose/height score, six-second prefix | 4,092 | 98,208 | None |
| Motion-aware score with retained reference, six-second prefix | 7,034 | 168,816 | None; ordinary-host continuation also fails |
| Extend search through the rise | 12,183 | 308,981 | 10.808333 s |
| Full tilt and floor-load comparison, using that trace | 9,643 | 250,416 | 8.358333 s |
| Repeat from the faster trace | 6,555 | 170,557 | 7.85 s |
| Lower tracking-error penalty, wider search | 9,714 | 280,070 | 7.441667 s |
| Halve action blocks to 0.1 s | 16,758 | 254,468 | 7.25 s |

Search-prefix duration is not recovery time: every number in the last column includes the
subsequent settling interval. Each success is re-recorded from the unchanged saved fall and its
complete muscle-action trace is independently checked through the frozen `evaluateAcceptanceCase`.
The final search stops on its 300-second limit at 5.4 s of prefix exploration; finishing the
in-flight batch takes the recorded wall time to 300.967 s. These are separate experiments following
the earlier two-hour task, not an extension charged to that completed task.

The final trace contains 1,229 continuation observations, SHA-256
`0a9494b5daa12c8742c4a5c573be28b21e4ed315b249d4079dd6ae7e86460afd`.
Its maximum effort-bound excess is 0.0000364415 N m, below the unchanged 0.0001 tolerance;
assistance and external-actuation events are zero. Exact replay, repeated restoration and
continuation after a discarded alternative branch pass on both the 7.441667 s and final traces.
Full standing/walking verification is part of every reported successful result.

The final action module runs through the complete unchanged frozen `--candidate` comparison.
Both controllers complete 1/16 within 35 s; the candidate completes 1/16 within 12 s and 0/16
within 6 s. Neither has a finite failure-inclusive median. All optimized baseline results and
physical traces reproduce, every initial state matches, and the floating-controller negative
control is rejected. The candidate's other outcomes are ten nonfinite-actuation failures and
five episode deadlines, all retained as failures. The module selects its action tape only on
the exact saved initial observation and returns to the ordinary host otherwise; this screen
does not establish a transferable recovery controller.

Transfer remains unsuccessful. On the 8.358333 s reference, six nominal velocity-feedback/phase
settings reproduce the same successful trace, but all twelve tested -1/+1-degree fresh-fall
continuations fail by 14 s. Another twelve nearby-fall torque-feedback/damping settings also fail.
Eight coupled-tracking settling variants, started after the complete 5.4 s prefix of the
7.441667 s route, all fail by 12 s. Their selected recording matches all 648 prefix observations
exactly. These failures do not establish physical impossibility, but they reject the tested
feedback and settling settings as a general controller.

Reference extraction now retains temporary ordinary-host intervals before recovery actions
resume, and the feedback policy resumes after them. Prefix replay removes descriptive metadata
from a host action, as the frozen action interface requires. Eight adapter-error attempts before
that correction are retained separately and excluded from the recovery comparison. The fast
regression checks the complete muscle/host/muscle/terminal-host action sequence.

`research/stand-up-rollout-plan.json` preserves the five selected action plans. First reconstruct
`.review/saved-candidate.trace.gz` with the saved-fall commands above, then use fresh output names:

```powershell
$source = '.review/saved-candidate.trace.gz'
foreach ($stage in 'ten', 'eight', 'seven', 'fast', 'fine') {
  node research/stand-up-rollout-search.mjs --mode record --source $source --plan research/stand-up-rollout-plan.json --stage $stage --out ".review/rollout-$stage"
  $source = ".review/rollout-$stage.trace.gz"
}
$env:STAND_UP_ROLLOUT_ACTIONS = "$PWD/.review/rollout-fine.actions.json.gz"
node .tools/stand-up-frozen/research/stand-up-acceptance.mjs --candidate "$PWD/research/stand-up-rollout-candidate.mjs" --output .review/rollout-acceptance.json
node research/stand-up-saved-viewer-build.mjs .review/saved-baseline.trace.gz $source .review/rollout-replay.html
```

Each plan checks its reference's physical trace identity. `--mode record` writes an action tape,
full physical recording and report, and checks a successful result and trace against the frozen
evaluator. The local final replay is `.review/stand-up-rollouts/replay.html`, alongside the complete
search ledgers, transfer results and failed settling recording. It was built successfully but has
not been visually inspected; the browser's local-file restriction remains in effect. No server
is started. `research/stand-up-path-results.json` retains the compact machine-readable evidence.

The next missing capability is robust feedback through changing contacts. Exact saved actions
remain a single-start demonstration. Runtime integration, the four-second median, six-second
deadline, independent validation, repeated falls and disturbance qualification are unfinished.

Validation: the named temporary-host regression, exact physical prefix comparison, complete
frozen comparison, selected-trace reconstruction and restore checks pass. The recovery
performance goal fails as recorded above. `npm run check` and `npm test` pass (664 passes,
zero failures, five existing TODOs). Whitespace and line-ending gates pass. No browser source
changes are made and no development server is started.

## Contact-aware phase feedback and transfer, 2026-10-12

The full goal remains **not achieved**. One observation-based parameter set now recovers on
three fresh nearby starts, while a different accelerated setting reaches **6.975 s** on the
original saved fall. Neither meets six seconds. Intermediate and wider angles still fail,
and the frozen sixteen-case comparison gains no additional completion.

All measurements in this section use **Node Stance Lab / frozen game Rapier coordinate / 120 Hz /
symmetric original muscle envelopes / Balance 0**, with unchanged Warrior/empty compliant-sole
anatomy and ordinary host, except the explicitly named full sixteen-case comparison, which also
includes the frozen Rogue and club configurations. No body, muscle, host or acceptance change
is made. Every reported success includes the unchanged standing/walking verification tail.

`research/stand-up-phase-features.mjs` reads gravity in the root's local frame, body height and
normalized actual floor impulses. `stand-up-path-policy.mjs` optionally uses these observations
to match a reference phase and applies stronger joint-error feedback to the reference muscle
commands. This removes world heading from the orientation comparison and distinguishes support
states that similar joint angles alone can confuse. The policy receives detached observations
and emits ordinary muscle actions; it does not receive a physics world or match an initial-state
hash. Reference extraction preserves these additional features.

With the 7.25 s demonstration as reference, the selected settings are `gain: 20`, `window: 0.8`,
`rate: 1`, `minRate: 0.5`, `localGravity: true`, `phaseHeightWeight: 4`, `phaseLoadWeight: 0.2`,
`releaseHeight: 0.85`, and `releaseUp: 0.9`. The fresh comparisons use the same two 60 N s shoves,
0.2 s apart, and a 38 s episode cap. Complete initial-observation hashes match each pair.

| Fresh fall, Node harness above | Optimized baseline | Same selected feedback controller |
|---|---|---|
| -1 degree | No completion by 38 s | 7.725 s |
| 0 degrees | 15.558333 s | 7.25 s |
| +1 degree | No completion by 38 s | 7.125 s |

This is a small development comparison, not robust coverage: the selected controller fails all
eight additional directions -5, -3, -2, -0.5, +0.5, +2, +3 and +5 degrees in twelve-second
episodes. In particular, successes at +/-1 degree do not establish an interval of recoverable
starts. The initial feedback grid has seven successes in eighteen trials: six reproduce the
nominal trace, and one completes the -1-degree fall. The progression grid has five successes
in eighteen nearby-fall trials. Both grids retain all failed configurations.

The selected feedback setting runs through the unchanged frozen `--candidate` interface: 1/16
within 35 s, 1/16 within 12 s, and 0/16 within 6 s; the other fifteen runs reach the episode
deadline. The failure-inclusive median is not reached. Every optimized baseline result and
trace reproduces, all saved initial states match, and the floating-controller negative control
is rejected. No candidate has an external-actuation event.

Of eighteen accelerated nominal/nearby trials, only `gain: 16`, `rate: 1.1`, `minRate: 1.1`
with the other settings above succeeds, on the original saved fall in 6.975 s. Its full result
and physical trace independently match frozen `evaluateAcceptanceCase`, SHA-256
`4316088932c90ec37c9f884bb8d1186a70248bd39c86f99faa8d8f2e83007563`.
That setting fails both tested neighboring starts. The sixteen-case result above belongs to
the selected transfer setting, not this faster single-case setting.

The +1-degree success is independently regenerated and replayed by
`research/stand-up-fresh-replay.mjs`. All 1,214 continuation observations and the complete result
match exactly, SHA-256 `fb874e3cb7205868bfdaf7adae2bdd79de1b84ad576adf5ee18341579aa6a012`.
The maximum effort-bound excess is 0.00003061694 N m, below the frozen 0.0001 tolerance; assistance
and external-actuation events are zero. The candidate and its recorded baseline have identical
complete initial observations and physical configurations.

Transfer search on the actual frozen 90-degree saved fall remains unsuccessful. Direct guidance
from the Front demonstration explores 2,325 continuations and 55,800 world steps without a
completion. Adding the existing roll postures and retaining distinct floor-support/tilt states
explores 17,415 continuations and 417,960 steps, also without a completion. The latter stops on
its 240 s wall limit at a 5.6 s prefix; completing the in-flight batch takes 246.162 s. Its recorded
ordinary-host continuation still fails through 11.608333 s. Transfer mode verifies identical
body/engine/host identities, retains the selected saved checkpoint and records its actual initial
observation; it neither substitutes the reference fall nor changes a frozen case.

The local replays are `.review/stand-up-transfer/replay.html` (the matched fresh +1-degree
comparison) and `faster-replay.html` (the 6.975 s saved-fall witness). Their motion is verified and
the HTML is built, but they are not visually inspected because the browser local-file restriction
remains in effect. No development server is started. The compact results, exact configurations,
initial-state identities and failures are retained in `research/stand-up-path-results.json`.

For reproduction, reconstruct `.review/rollout-fine.trace.gz` with the five plan commands above,
then extract its phase reference:

```powershell
node research/stand-up-path-experiment.mjs --mode extract --source .review/rollout-fine.trace.gz --out .review/transfer-reference.json.gz
```

Write a configuration with `reference` set to the absolute path of that output and `parameters`
set to the selected settings above. Set `STAND_UP_PATH_CONFIG` to its absolute path and run the
frozen evaluator with `--candidate "$PWD/research/stand-up-path-policy.mjs"`. For a fresh record,
add `fall: {"degrees": 1}` to a copy of the configuration and run the experiment's `--mode record
--config <file> --out <stem> --seconds 38`; `kind: "baseline"` selects the optimized baseline
for the matched research trial. Verify the successful fresh record with
`node research/stand-up-fresh-replay.mjs <stem>.trace.gz <verification.json>`.

The next missing capability is recovery across genuinely different contact configurations.
The three isolated successful fresh starts do not meet the robustness objective, and faster
phase progression usually destroys the route. Runtime integration and every full qualification
partition remain unfinished.

Validation: `npm run check`, `npm test` (665 passes, zero failures, five existing TODOs), the
two named phase/reference regressions, matched fresh-start identities, exact fresh replay,
the accelerated saved-case check and the full frozen candidate comparison pass. The whitespace
and line-ending gates pass. The recovery performance goal remains unmet.

## Multiple-reference feedback, 2026-10-12

The full unassisted goal remains **not achieved**. A library controller reproduces six represented
fresh starts but fails every additional start in its fourteen-case development screen. Its complete
frozen comparison still completes only 1/16, none within six seconds. The fastest saved-fall witness
remains the separate 6.975 s setting above. No runtime integration or full qualification is claimed.

All measurements below use **Node Stance Lab / frozen game Rapier coordinate / 120 Hz / symmetric
original muscle envelopes / Balance 0**. Fresh falls retain the Warrior/empty compliant-sole body,
ordinary stance host and physical shove preparation. The full frozen comparison also includes its
unchanged Rogue and club configurations. Anatomy, muscles, host, solver and acceptance criteria
are unchanged. All successes include the existing standing and walking verification tail.

`research/stand-up-library-policy.mjs` maintains a separate measured phase for each reference and
selects commands by joint posture, root-local gravity, height, floor loads and optional velocity
error. Its optional inverse-error blend combines finite muscle velocity and activation requests.
An exact reference selects its own commands; a host or infinite-velocity request retains discrete
selection. The policy receives detached observations and emits only the frozen muscle/host actions.
Reference extraction records physical identity and trace identity. The experiment's `library` mode
refuses to pack references with different physical configurations or joint coordinates; a deliberately
mismatched balance declaration is rejected before any simulation.

The initial library contains the nominal 7.25 s, -1-degree 7.291667 s and +1-degree 7.125 s traces.
Discrete reference selection reproduces those three trajectories but fails both half-degree starts.
Blending finds a -0.5-degree recovery in 7 s and a +0.5-degree recovery in 7.458333 s, with different
blend exponents. A +2-degree start recovers in 7.916667 s. These three are then added as demonstrations;
the expanded-library successes are therefore training results, not independent transfer evidence.

| Development experiment, Node harness above, 12 s episode cap | Successful trials / all trials |
|---|---|
| Three references, discrete selection | 9/15; three reproduced starts across three settings |
| Blend exponent and feedback gain | 9/21 |
| Additional directions and blend exponents | 4/24 |
| Velocity-aware phase matching and finite-command damping | 2/24 |
| Six references, one fixed parameter set | 6/14; all eight additional starts fail |
| Bounded phase progression on four additional starts | 0/24 |

These grids share cases and controls; their counts are not independent trials or a qualification
sample. All results and configurations, including failures, remain in
`research/stand-up-path-results.json` under `libraryFeedback`. One damping trial reaches handover
at 8.908333 s but fails the host walking-displacement check and is counted as a failure. No trial
has external actuation; the largest effort-bound excess is 0.00004334864 N m, below the unchanged
0.0001 tolerance.

The expanded library uses the previous selected parameters plus `blend: 2`, `switchCost: 0` and
`velocityWeight: 0.02`. Its -1, -0.5, 0, +0.5, +1 and +2-degree starts finish in 7.283333, 7,
7.25, 7.458333, 7.125 and 7.916667 s. Its -2, -0.75, -0.25, +0.25, +0.75, +1.5, +2.5 and
+3-degree starts all fail by twelve seconds. Phase-jump limits of 1, 1.5 and 2 times real time,
combined with minimum progression of 0 or 0.5, do not repair the four quarter-degree failures.
The observed failures reject these settings as a robust controller, not physical feasibility.

The complete unchanged frozen `--candidate` comparison takes 214.458 s: both controllers finish
1/16 within 35 s; the library finishes 1/16 within 12 s and 0/16 within 6 s. Its other fifteen
episodes reach the deadline. Failure-inclusive medians are infinite. Every optimized baseline
record exactly matches the preceding frozen comparison, all initial states match, and the
floating-controller negative control is rejected.

The matched fresh -0.5-degree replay is `.review/stand-up-library/replay.html`. The candidate
finishes in 7 s; the optimized baseline fails by 38 s, from identical complete initial observations
and physical identities. Independent regeneration and action replay match all 1,199 observations
and the complete result exactly, physical SHA-256
`458bd0e9fa48a4b9f80be66171cc7d471dd0ad9c99504462920094019f0ad6f3`.
The viewer identifies the fresh angle and includes the verification tail. It is built but not
visually inspected because of the existing browser local-file restriction; no server is started.

For reproduction, reconstruct the three `libraryFeedback.initialReferences` using the preceding
sections, extract each with `--mode extract`, and pack them with
`node research/stand-up-path-experiment.mjs --mode library --config <file> --out <library.json.gz>`.
The config has a `references` array of extracted gzip filenames. Use the recorded `addedReferences`
configurations to record the three additional trajectories against that initial library, extract
them, and pack all six in the recorded order. `libraryFeedback.configuration` contains the final
parameters; point its `reference` at the rebuilt library and set `STAND_UP_LIBRARY_CONFIG` to the
configuration file. The frozen evaluator accepts
`--candidate <absolute-path-to-research/stand-up-library-policy.mjs>`. A fresh record adds
`fall: {"degrees": -0.5}` and uses `--mode record --seconds 38`; changing `kind` to `baseline`
produces its matched comparator. The existing fresh-replay verifier checks the candidate trace.

Validation: `npm run check`, `npm test` (668 passes, zero failures, five existing TODOs), all five
named phase/library regressions, packing rejection, matched physical identities, exact fresh replay
and the full frozen comparison pass. Whitespace and line-ending gates pass. The performance goal
fails. More demonstrations reproduce more trained starts, but do not restore missing support on
the additional falls; recovery across different contact configurations remains the next capability.

## Measured muscle-response feedback, 2026-10-12

The full goal remains **not achieved**. Local actuator responses measured in actual game physics
let one nominal demonstration recover three additional fresh starts with one feedback setting.
Ten other selected starts fail, every accelerated trial fails, and the frozen comparison gains no
completion. The separate 6.975 s saved-fall witness remains the fastest verified result.

All measurements here use **Node Stance Lab / frozen game Rapier coordinate / 120 Hz / symmetric
original muscle envelopes / Balance 0**. Fresh starts retain the Warrior/empty compliant-sole body
and ordinary stance host; the complete frozen comparison retains all its bodies and loadouts.
There are no anatomy, muscle, host, solver, contact-law or acceptance changes. Every success
includes the unchanged standing and walking tail.

`research/stand-up-response-measure.mjs` restores complete physical snapshots along the nominal
7.25 s demonstration. For each sampled phase it perturbs each finite muscle-speed command in
both directions and measures the resulting posture and velocity. The muscle driver still applies
its original activation and force-velocity limits. Every unperturbed branch must reproduce its
reference features exactly; every perturbed branch must pass the external-actuation and effort
audits. The tool checks reference/trace and body identity before measurement. A paired perturbation
on two channels, excluded from the fitted columns, measures local prediction error.

The validated calibrations use 52 samples with a twelve-step horizon and +/-4 rad/s request offsets,
then 104 samples with a six-step horizon and +/-1 rad/s offsets. The latter also reads root-local
angular and linear velocity. A third calibration measures how those disturbances evolve for six
more steps after the perturbation stops. Together these use 179,712 physical continuation steps;
an earlier 44,304-step calibration precedes the explicit held-out perturbation check and is retained
separately. The measurement tool imposes a 240 s wall limit on each run; all three complete.

`research/stand-up-response-policy.mjs` uses regularized measured response inverses to correct
the reference muscle-speed requests, capped at +/-4 rad/s correction. Optional measured disturbance
growth predicts the next local error before correction. Activations and infinite-speed commands
retain the reference requests. At runtime the policy receives only detached observations; snapshots,
physics worlds and branch evaluation belong exclusively to offline measurement.

The local model is approximate. On the common gravity/height/joint-angle/joint-speed features, the
median weighted relative prediction error is 0.455409 for the twelve-step model and 0.355745 for
the six-step model; their 90th percentiles are 1.016100 and 0.963502. These are diagnostic feature
errors on paired command perturbations, not physical recovery rates or validation of accuracy on
different falls. The recorded weights make the two comparisons use the same feature metric.

| Development experiment, Node harness above, 12 s episode cap | Successful trials / all trials |
|---|---|
| Twelve-step local response | 6/36; all six reproduce the nominal start |
| Six-step response including root motion | 7/36; six nominal and one +0.5-degree recovery |
| Predicted disturbance growth, including accelerated trials | 8/36; four nominal and four -0.5-degree recoveries |
| Intermediate prediction gains | 5/16 |
| Selected setting on wider fresh starts | 1/6 |

The grids share controls and directions and are development data. All twelve accelerated trials
at 1.25 times reference progression fail. Handover followed by failed walking displacement occurs
at 7.458333, 7.883333 and 7.758333 s in three separate trials; all count as failures. Across these
130 trials there are no adapter errors or external-actuation events. Maximum effort-bound excess
is 0.00004559813 N m, below the unchanged 0.0001 tolerance.

The selected six-step model uses `pathGain: 16`, `responseGain: 0.1`, `coastGain: 0.35`,
`ridge: 0.0001`, the four-rad/s correction cap and the recorded phase parameters. The same setting
finishes -0.5, 0, +0.5 and +1-degree starts in 7.075, 7.25, 7.775 and 7.766667 s. Only the nominal
demonstration supplies model measurements. The -3, -2, -1, -0.75, -0.25, +0.25, +0.75, +2, +3
and 90-degree starts fail, including the -3-degree walking failure. This does not establish a
continuous interval of recoverable starts or a robust controller.

The complete unchanged frozen `--candidate` comparison takes 175.665 s. The candidate finishes
1/16 within 35 s, 1/16 within 12 s and 0/16 within 6 s; all other episodes reach the deadline.
Failure-inclusive medians remain infinite. Every optimized baseline record exactly reproduces
the preceding comparison, all starting states match, and the floating-controller negative control
is rejected. Runtime integration and every full qualification partition remain unfinished.

The matched -0.5-degree replay is `.review/stand-up-response/replay.html`: candidate 7.075 s,
optimized baseline no recovery by 38 s, with identical complete starting observations and physical
identities. Independent regeneration and action replay match all 1,208 observations and the full
result, physical SHA-256 `ee26651c35ecca8599dd5e48684669a95a89f246f68b14d1827fe669c2f64915`.
The viewer includes the standing/walking tail and labels the fresh fall. It is built but not visually
inspected because of the existing browser local-file restriction. No server is started.

For reproduction, reconstruct and extract the nominal 7.25 s trace with the preceding commands,
then measure the selected model:

```powershell
node research/stand-up-response-measure.mjs --source <nominal.trace.gz> --reference <nominal-reference.json.gz> --out .review/response-model --horizon 6 --stride 6 --delta 1 --root-motion yes --coast yes --wall 240
```

The output `.json.gz` is the reference for `kind: "response"` in the existing path experiment.
`research/stand-up-path-results.json` under `measuredResponseFeedback` retains exact parameters,
measurement provenance, prediction checks, every trial, frozen comparison and replay verification.
Point that configuration at the rebuilt model, set `STAND_UP_RESPONSE_CONFIG` to its file, and
run the frozen evaluator with `--candidate <absolute-path-to-research/stand-up-response-policy.mjs>`.
The existing record, fresh-replay verification and viewer commands apply unchanged.

Validation: `npm run check`, `npm test` (671 passes, zero failures, five existing TODOs), all eight
named phase/feedback regressions, exact sampled baselines, bounded physical branches, paired
perturbation measurements, matched fresh replay and the complete frozen comparison pass.
Whitespace and line-ending gates pass. The four-second median / six-second recovery goal fails;
the measured local models still do not control the different support transitions in the other falls.

## Foot proportions and body weight, 2026-10-12

The full goal remains **not achieved**. The owner permits identified body changes tested with both
controllers. Six foot-proportion variants and two lighter game physiques do not improve the
six-second screen. None is adopted into gameplay. The fastest original-body witness remains
6.975 s; the one lighter-body success takes 7.058333 s and supplies no robustness qualification.

All measurements here use **Node Stance Lab / frozen game Rapier coordinate / 120 Hz / symmetric
original muscle envelopes / Balance 0 / ordinary stance host**. Both controllers retain the existing
compliant sole material, joint coordinates and limits, and every muscle strength/speed parameter.
The baseline is the frozen optimized recipe, rebuilt for each stated body from its same parameters;
the candidate is the selected measured-response controller above, without retraining its model.
Each body receives fresh physical forward, right, backward and left falls from the same two 60 N s
shoves. Each baseline/candidate pair has identical complete initial-observation hashes and body
identities. No original saved checkpoint is loaded into an altered body, and no frozen case,
evaluator or criterion is changed.

`research/stand-up-foot-design.mjs` implements rectangular foot proportions because the unchanged
stance host reads rectangular soles. Each foot's mass stays fixed. Its endpoints, mass centre,
collision box and named points undergo the same affine deformation about the ankle's projection
onto the sole plane; its second mass moments are scaled consistently to derive its new inertia.
The original ground plane is retained. These are declared physical foot changes, not assistance
or solver conditioning. The separate weight variants use the game's existing physique rule,
changing segment masses, breadths, inertias and hand shapes while retaining mass-centre locations
and the original muscle envelopes. The machine record contains before/after tables and parameters.

| Body variant, Node harness above | Body mass | Optimized baseline completed | Candidate completed |
|---|---:|---:|---:|
| Original dimensions | 79 kg | 1/4 | 1/4 |
| Foot width x0.75 | 79 kg | 0/4 | 0/4 |
| Foot width x1.25 | 79 kg | 0/4 | 0/4 |
| Foot length x0.75 | 79 kg | 0/4 | 0/4 |
| Foot length x1.25 | 79 kg | 0/4 | 0/4 |
| Foot height x0.5 | 79 kg | 0/4 | 0/4 |
| Width x1.25, length x0.75, height x0.5 | 79 kg | 0/4 | 0/4 |
| Game weight x0.8 | 63.2 kg | 0/4 | 1/4 |
| Game weight x0.6 | 47.4 kg | 0/4 | 0/4 |

These paired episodes have a 38 s cap, including the existing three-second standing/walking tail.
The unchanged body's forward times are 15.558333 s and 7.25 s. Its eight results, physical traces
and initial observations exactly match the corresponding preceding frozen comparison. On the
63.2 kg body, only the candidate's forward fall completes, in 7.058333 s; its optimized baseline
fails through 38 s. All other altered-body outcomes reach the episode deadline. These are body
and controller development screens, not evidence that other body designs cannot meet the goal.

Sixteen faster-progression trials on the 63.2 kg body all fail by fourteen seconds. A separate
sixteen-trial screen retimes finite speed commands, joint-speed feedback targets and root-motion
targets along with phase progression, using factors 1.05, 1.1, 1.2 and 1.3 on both original and
63.2 kg bodies. All fail. The `motionRate` parameter makes this retiming explicit without changing
activation or the muscle driver's limits; its default preserves existing command speeds.

The first retiming run has eight original-body setup assertion failures: two separately generated
specs have distinct provenance function objects despite equal physical values. Those attempts
never simulate and are excluded from performance counts. The repaired path reuses the original
spec for unit weight and checks physical joint data instead of provenance function identity.
The complete rerun has no setup errors, and both unchanged-body controls independently reproduce
their full frozen traces. The original errors and duplicate lighter-body runs remain in the record.
Across the 104 completed paired-body and accelerated trial settings, no recovery meets six seconds,
no external-actuation event occurs, and maximum effort-bound excess is 0.00004721550 N m, below
the unchanged 0.0001 tolerance. Trial settings share cases and are not independent qualification data.

The replay `.review/stand-up-feet/replay.html` explicitly labels the **63.2 kg altered body** and
compares it with its matched baseline. Independent regeneration and replay match all 1,206
observations and the complete candidate result, physical SHA-256
`30cb456a1911bc324b87fecc89c9db30a713c430234bfbf0a3eaaade2b61859d`.
Both recordings also reproduce their body-screen results and traces. The HTML is built but not
visually inspected because of the existing browser local-file restriction; no server is started.

To reproduce, use the preceding measured-response model and selected configuration. Add
`body: {"weight": 0.8}` and `fall: {"degrees": 0}` for the lighter-body record, or
`body: {"feet": {"width": 1.25, "length": 0.75, "height": 0.5}}` for that foot variant.
The existing path experiment accepts these fields with `--mode record --seconds 38`; `kind:
"baseline"` selects the matched optimized controller. A body override without a fresh-fall
declaration is rejected. The fresh-replay verifier rebuilds the declared body before checking
its identity and every observation. `research/stand-up-path-results.json` under `bodyGeometryScreen`
retains all configurations, paired identities, physical tables, failures and replay verification.

Validation: `npm run check`, `npm test` (673 passes, zero failures, five existing TODOs), ten
named body/phase/feedback/retiming regressions, 36 matched body/state pairs, unchanged frozen
control traces and the exact altered-body replay pass. Whitespace and line-ending gates pass.
Runtime integration and all full four/six-second qualification requirements remain unfinished.

## Side-fall support transitions, 2026-10-12

The full goal remains **not achieved**. The saved 90-degree Warrior/empty fall reaches loaded
support on both hands and both shins at 3.208333 s. A searched continuation raises the trunk over
the knees but never completes recovery. This is intermediate support-transition evidence, not a
second successful fall. The original-body 6.975 s witness and frozen 1/16 completion count remain
unchanged; no full qualification partition is run or passed here.

All measurements use **Node Stance Lab / frozen game Rapier coordinate / 120 Hz / original
symmetric muscle envelopes / Balance 0 / ordinary stance host**. Body, muscles, solver, contact
law, frozen cases, optimized baseline and recovery criteria are unchanged. Search branches restore
complete physical snapshots and issue ordinary muscle actions. No external force or pose edit
prepares an intermediate state.

The preceding side-fall search assigns a late reference phase while the pelvis and thigh remain
on the floor. `research/stand-up-rollout-search.mjs --target 2` instead measures distance to the
successful front-fall demonstration's two-second hands-and-knees state, without a phase reward.
The metric uses joint angles, root-local gravity, height, normalized floor impulses and motion.
This is a development search objective; the recovery evaluator is unchanged.

| Experiment, Node harness above | Physical branch evaluations | Physical steps | Wall seconds | Outcome |
|---|---:|---:|---:|---|
| Fixed support target, five-second prefix limit | 15,471 | 371,304 | 165.715 | Hands/shins support; no recovery |
| Continuation from the selected 3.2-second action prefix, nine-second total limit | 17,582 | 421,968 | 201.617 | Upright kneeling; no recovery |

The continuation counts include replaying the sixteen prefix controls and their 384 steps. Each
search has a 240 s wall cap. The new `--prefix` option checks the saved case, checkpoint and
reference identities, replays every prefix action, and requires the entire final observation hash
to match. Prefix time remains in the episode clock. The second search does not initialize a body
directly in a kneeling pose.

At 3.208333 s the left/right hand impulses are 1.213796/1.184133 N s and the left/right shank
impulses are 1.822361/2.896240 N s. These are individual 120 Hz step readings, not sustained load
measurements. Replaying the original demonstration from there fails through 17.458333 s. The
searched continuation ends its active prefix at 9.008333 s with height 0.531441 m and trunk-up
component 0.928266, supported principally by the right shin. Neither foot carries a floor impulse
at that sample. Six seconds of ordinary-host continuation fail to produce handover: the complete
record ends at 15.008333 s. The next unresolved physical transition is loading a foot and leaving
kneeling support, with the preceding transitions also still too slow for the full target.

All 33,037 worker branches are free of adapter errors and external-actuation events; the sixteen
replayed prefix controls are separately verified. Maximum measured effort-bound excess is
0.00004561914 N m, below the unchanged 0.0001 tolerance. These branches are development search,
not independent recovery trials.

The matched failure replay is `.review/stand-up-support-target/replay.html`. It labels the saved
side fall and both failures: candidate 15.008333 s, baseline 38 s. Both initial observations and
physical identities match; the baseline trace exactly reproduces the preceding frozen comparison.
The candidate's 1,800 observations, final result, full replay and split continuation reproduce
exactly, physical SHA-256 `f390dd73325f5297cc6310eaa170215f561cb14fa1c077d5538af8746e30caea`.
The successful 7.25 s control also passes the expanded verifier. Failure traces are admitted only
for verification; search guidance still requires a complete successful reference. The viewer is
built but not visually inspected because of the existing local-file browser restriction. No
server is started.

`research/stand-up-path-results.json` under `supportTargetSearch` retains both search summaries,
the selected prefix and complete continuation plan, failed direct continuation, matched baseline
identity, physical samples and exact-replay proofs. To reproduce, use the preceding 7.25 s source,
case index 1, `--transfer yes`, width 24, block 24, full orientation, support diversity and roll
controls. The first search uses `--target 2 --seconds 5 --penalty 1 --velocity-weight 0.01
--contact-weight 2`; the second uses the recorded prefix with `--seconds 9 --penalty 12
--velocity-weight 0.02 --contact-weight 0.2`. Both use `--wall 240`. Write the stored prefix or
selected plan object to JSON for the existing `--prefix` or `--mode record --plan` interface.
The failed recording verifies with `--mode verify --source <selected.trace.gz> --case 1`.

Validation: `npm run check`, `npm test` (673 passes, zero failures, five existing TODOs), exact
successful and failed replay/restoration checks, matched frozen baseline, whitespace and
line-ending gates pass. The recovery performance goal fails; no runtime controller is promoted.

## Foot-transition proposals and motion, 2026-10-12

The full goal remains **not achieved**. Six follow-up searches fail to complete the saved side
fall. The original-body 6.975 s witness, frozen 1/16 completion count and zero six-second
completions remain unchanged. No runtime controller is promoted and no qualification partition
is run. Every measurement below uses **Node Stance Lab / frozen game Rapier coordinate / 120 Hz /
original symmetric muscle envelopes / Balance 0 / ordinary stance host**. There are no body,
muscle, host, solver, contact-law or acceptance changes.

The support-target search now proposes the target posture explicitly as well as later reference
postures. Its `--guidance nearest` option separates the destination used to score progress from
the reference phase used to propose actions. The nearest reference posture supplies those
proposals, while the score continues to measure distance to the fixed destination. A history
record retains the best plan at each depth so an earlier intermediate can be replayed.

`--local-motion yes` compares pelvis velocity and spin in body-relative coordinates using the
existing heading-invariant `responseFeatures` implementation. The optional `--feedback yes`
proposals add joint-angle-error feedback to finite reference muscle-speed commands, with gains
4 and 12 per second and a six-rad/s coordinate correction cap before muscle-axis conversion.
They retain reference activations and infinite-speed commands. The actual muscle driver retains
its original effort and force-velocity limits. These are offline search proposals, not a deployed
feedback controller.

| Search, Node harness above | Physical evaluations | Physical steps | Wall seconds | Outcome |
|---|---:|---:|---:|---|
| Foot-support target, six-second total limit | 11,848 | 284,352 | 126.042 | No recovery |
| Upright-kneeling target, 4.8-second total limit | 6,338 | 152,112 | 69.500 | No recovery |
| Same target with nearest-phase proposals | 6,396 | 153,504 | 82.654 | No recovery |
| Foot target from the nine-second kneeling prefix, eleven-second total limit | 5,789 | 138,936 | 63.392 | No recovery |
| Upright target with body-relative motion and higher motion weight | 6,367 | 152,808 | 70.892 | No recovery |
| Same motion-aware target with feedback proposals | 6,805 | 163,320 | 74.068 | No recovery |

The first search has a 240 s wall cap; the others have 180 s caps. All finish their requested
search horizons. Times and step counts include physically replaying each prefix. The 4.8-second
screens are intermediate-transition searches, not assertions that recovery has occurred at that
deadline. The eleven-second test cannot meet the six-second goal even if its component succeeds.

The nine-second upright-kneeling state is a moving transient. Its pelvis speed is 0.811331 m/s,
compared with 0.274636 m/s at the reference's 3.6-second kneeling sample. The attempted foot
continuation loses support rather than producing a stable stand. This corrects any interpretation
of the preceding upright snapshot as a stable platform for the next movement.

The motion-aware attempt's closest state occurs at 4.208333 s. Its support is both hands and the
right thigh, not the intended knees. The left/right hip flexion readings are -0.295457/-0.403433
rad while the reference target is +0.492839/+0.447854 rad; commanded extension continues at about
2.87/2.73 rad/s. Measured hip efforts at that sample are approximately 29/53 N m, below their
instantaneous envelopes of 120/192 N m. These samples identify hip overshoot but do not establish
a strength limit as its cause.

Adding feedback lowers the best objective error from 1.380440 to 1.161566 under the same
motion-aware metric. It still does not restore the required support: the selected 4.408333 s
state rests on hands and thighs. Its six-second ordinary-host tail also fails, with no handover
by the recording's 10.408333 s end. Lower objective error is not a recovery improvement.

Across 43,418 worker branches there are no adapter errors or external-actuation events. The
additional 125 prefix-control evaluations replay complete physical states. Maximum branch
effort-bound excess is 0.00004376299 N m; including the recorded host tail, the maximum is
0.00004379367 N m, below the unchanged 0.0001 tolerance.

The matched failure replay is `.review/stand-up-foot-transition/replay.html`, explicitly labeled
as a failed side-fall feedback attempt. It compares the 10.408333 s failed continuation with the
unchanged baseline's 38 s failure. Initial observations and physical identities match, and the
baseline exactly reproduces the preceding frozen comparison. Recording now checks the searched
endpoint before appending its host tail. All 1,248 candidate observations, the final result and
the split continuation replay exactly, physical SHA-256
`20f16d2818124797c9551202cd3558e7a27aee8046326236e342bc72b4403912`.
The known successful control also replays exactly with the new scoring options. The viewer is
built but not visually inspected because of the existing local-file browser restriction; no
server is started.

`research/stand-up-path-results.json` under `footTransitionSearch` retains all six configurations,
search outcomes and per-depth metrics, the selected complete plan, joint/contact diagnostics,
matched baseline and exact-replay proofs. The preceding source and prefix reconstruction applies.
The selected experiment uses case 1, width 32, block 24, `--seconds 4.8 --wall 180 --target 3.6
--guidance nearest --local-motion yes --feedback yes --penalty 1 --velocity-weight 0.2
--contact-weight 0.5 --orientation full --transfer yes --diversity support --roll yes`, with the
recorded sixteen-control prefix. Its selected plan records through the existing `--mode record`
interface and verifies with `--mode verify --source <feedback.trace.gz> --case 1`.

Validation: `npm run check`, `npm test` (673 passes, zero failures, five existing TODOs), all
nine named phase/feedback regressions, matched baseline, exact searched endpoint and full
successful/failed replay checks pass. Whitespace and line-ending gates pass. The performance
goal remains unmet; stable knee-to-foot support and faster preceding transitions remain open.

## Saved side fall with measured-response continuation, 2026-10-12

The saved 90-degree Warrior/empty fall now completes in **8.633333 s**, against the unchanged
optimized baseline's failure through 38 s. This is a second distinct saved-fall completion, but
the full four-second median / six-second recovery goal remains **not achieved**. The complete
frozen comparison improves from one to two completions out of sixteen; none is within six
seconds, failure-inclusive medians remain infinite and every full qualification partition remains
unfinished. The separate 6.975 s front-fall witness remains the fastest original-body result.

All measurements below use **Node Stance Lab / frozen game Rapier coordinate / 120 Hz /
original symmetric muscle envelopes / Balance 0 / ordinary stance host**, with the unchanged
compliant-sole bodies. There are no anatomy, strength, speed-limit, solver, contact-law, host or
acceptance changes. Every success includes the unchanged quiet supported handover, two seconds
of ordinary-host standing and one second walking at least 0.1 m.

The controller executes the previously verified sixteen-control side-fall prefix as 384 recorded
muscle actions, then continues with the measured-response controller trained on the nominal
7.25 s front-fall demonstration. The prefix reaches hands/shins support at 3.208333 s on the
recovery clock. `startPhase: 240` starts reference tracking at the demonstration's two-second
sample; it does not reset the physical world, episode clock or acceptance state. This composes
the physical transition with observation feedback instead of replaying the remainder of the
front-fall demonstration.

`research/stand-up-path-experiment.mjs` accepts a `prefixTape`, requires its body identity,
channels and complete initial observation to match, and verifies the entire prefix observation
hash and endpoint before feedback starts. A prefix cannot modify the optimized baseline.
`research/stand-up-prefix-response-policy.mjs` supplies the composed candidate through the
frozen detached-action interface. It selects the prefix only on the exact initial observation
hash, verifies every observed prefix step, and otherwise uses the unchanged earlier response
controller. It receives no engine handles. This exact-start selection is a development witness,
not a general side-fall recognizer or a robust gameplay controller.

| Side-fall development screen, Node harness above, fourteen-second episode cap | Completions | Recovery times |
|---|---:|---|
| Eighteen measured-response and three joint-feedback continuations | 1/21 | 8.866667 s |
| Twelve timing/feedback variants around that setting | 2/12 | Reproduced 8.866667 s; new 8.633333 s |

The first success uses path gain 16, response gain 0.2, disturbance-growth gain 0.35, rate 1 and
minimum rate 0.5. The faster setting uses response gain 0.3 and rate/motion-rate 1.1, retaining
the other selected parameters. Motion-rate scales finite reference speed commands and feedback
velocity targets together; it does not raise activation or the muscle driver's limits. Thirty
trials fail at the episode deadline without handover. The repeated successful control has the
same complete physical trace as its first run. These settings share one starting state and are
not independent robustness evidence.

The 33 trials use 54,611 physical steps, including every prefix, with no adapter errors,
nonfinite observations, invalid commands or external-actuation events. Maximum effort-bound
excess is 0.00004331158 N m, below the unchanged 0.0001 tolerance. All prefixes reproduce the
same 384-observation trace, SHA-256
`04f8fb81ab47ac2838c178bd1dcb5bf8c15d00db705cde5a0cfeb36afe965d85`.

Both selected settings run through the complete unchanged frozen `--candidate` comparison.
The first takes 193.616 s wall time and the faster setting 220.503 s; these runs overlap other
work and are not isolated compute-cost measurements. Both complete the original front fall in
7.25 s and the new side fall at their stated times, with fourteen deadline failures. All sixteen
optimized baseline records and all fifteen fallback candidate records exactly match the previous
comparison. Starting states match and the floating-controller negative control is rejected.
Neither comparison changes the criteria, loses a completion or qualifies robustness.

The matched replay is `.review/stand-up-prefix-response/replay.html`: faster candidate 8.633333 s,
baseline no recovery through 38 s. It labels the saved side fall, recorded prefix and verification
tail. All 1,395 observations, the final result and a split continuation replay exactly. The
frozen action-interface run has the same physical SHA-256:
`f42d7619f3295bc47e77bcec048c0aefd89a847c4e73deab774036cefa7f186a`.
The first 8.866667 s recording is also retained and exactly verified. The viewer is built but
not visually inspected because of the existing local-file browser restriction. No server is started.

`research/stand-up-path-results.json` under `prefixResponseContinuation` retains all trial
configurations and outcomes, both complete frozen comparisons with physical identity hashes,
the selected/fallback configurations, replay proofs and prefix provenance. Reconstruct the
preceding side prefix from `supportTargetSearch.prefix` and the 7.25 s reference, record it with
the rollout tool, then export the first 384 steps:

```powershell
node research/stand-up-path-experiment.mjs --mode prefix --source <recorded-prefix.trace.gz> --prefix-steps 384 --out <prefix.json.gz>
```

The exporter checks the source trace hash; exporting from the complete successful recording
regenerates the tested tape byte for byte. Point the stored configuration at that tape and the
preceding measured `coast` response model, set `STAND_UP_PREFIX_RESPONSE_CONFIG` to its JSON
file, and invoke the frozen checkout's `node research/stand-up-acceptance.mjs --candidate
<absolute-path-to-research/stand-up-prefix-response-policy.mjs> --output <report.json>`.
The selected configuration also works with the existing path experiment's `--mode record
--case 1 --seconds 14`. The recorded success verifies with the rollout tool's `--mode verify
--source <recording.trace.gz> --case 1`.

Validation: `npm run check`, `npm test` (675 passes, zero failures, five existing TODOs), the
eleven phase/prefix/feedback regressions, exact prefix export, full replay/restoration checks,
matched baselines and both complete frozen comparisons pass. Prefix tests reject a changed
intermediate observation even when its endpoint matches, and retain the observation clock.
Whitespace and line-ending gates pass. Runtime integration and the full timing/robustness goal
remain unfinished.

## Saved side fall speed and settling, 2026-10-12

The saved 90-degree Warrior/empty fall now has an exactly verified **6.658333 s** recovery,
down from 8.633333 s. The four-second median / six-second recovery goal remains **not achieved**.
This is a faster movement from the same saved state, not another independent success or a
robustness qualification. No body, muscle, host, solver, contact-law or acceptance setting changes.
All measurements in this section use **Node Stance Lab / frozen game Rapier coordinate / 120 Hz /
original symmetric muscle envelopes / Balance 0 / ordinary stance host**.

The offline search can increase its motion and contact penalties as height approaches the
reference handover height. It also measures each sole's orientation from detached segment
rotations and the body's rest frame. Those measurements exactly match the frozen evaluator at
the initial state and every sample of the recorded guidance trajectory. The optional terminal
sole penalty compares orientations; it does not substitute for the evaluator's loaded-patch,
centre-of-mass, quiet-motion or walking checks. Optional slower posture proposals request
lower joint speeds while preserving the actual muscle force-velocity limits.

The early low-motion-penalty branch reaches near-standing height at 3.808333 s but does not
recover. Its host continuation fails through 9.808333 s. A constant stronger motion penalty
finds an 8.258333 s success, but the apparent near-standing posture at 5.808333 s has sole-up
components only 0.32129 and 0.46455. Boot contact and torso height therefore conceal an unstable
transition. Combined terminal motion, contact and sole scoring finds 6.783333 s; a finer search
using that verified trajectory finds 6.658333 s. These are combined search changes, not an
ablation establishing any one penalty as the cause of improvement.

The 6.658333 s recording executes 540 ordinary muscle actions, then returns control to the
ordinary stance host. Its 4.516667 s sample has height 0.881939 and sole-up components 0.411938
and 0.541398. By 5.516667 s both soles are nearly flat, but the fastest segment still moves at
2.122063 m/s. At 6.016667 s that speed is 0.570822 m/s. Quiet support begins around 6.158333 s;
the unchanged half-second quiet interval produces handover at 6.658333 s. The subsequent
two-second standing and one-second walking verification succeeds. This identifies remaining
settling delay; it does not establish a physical lower bound.

The detached candidate factory permits an ordinary-host continuation after a verified prefix,
alongside its existing measured-response continuation. The entire initial observation selects
the exact-case prefix, and every subsequent prefix observation and its endpoint must reproduce
before continuation. Other starting states retain the preceding response controller. This remains
an exact-start development witness, not a general side-fall controller.

All 1,158 recorded observations, the final result, fresh replay and restored split continuation
match exactly. Physical trace SHA-256:
`5d7ba164e4225900e29adb0c068ee433eeee4bd2dc38e01927c5a66d43c32c56`.
The separate frozen action-interface evaluation reproduces the same result and physical trace.
The matched replay is `.review/stand-up-side-speed/replay.html`, containing the 6.658333 s
candidate and the unchanged optimized baseline's failure through 38 s. It labels the saved side
fall and includes the standing/walking tail. It is built but not visually inspected because of
the existing local-file browser restriction. No server is started.

| Side-fall search, Node harness above | Physical evaluations | Physical steps | Wall seconds | Recovery |
|---|---:|---:|---:|---|
| Low motion penalty | 12,009 | 319,536 | 168.379 | None |
| Constant stronger motion penalty | 11,825 | 295,462 | 148.009 | 8.258333 s |
| Ramped motion and contact penalties | 11,898 | 285,552 | 138.707 | None |
| Combined motion, contact and sole penalties | 13,337 | 335,610 | 167.954 | 6.783333 s |
| Finer action windows using that trajectory | 25,197 | 378,354 | 289.354 | 6.658333 s |
| Follow-up using the finer trajectory | 22,520 | 324,370 | 261.475 | 6.633333 s |

Each search has a 300 s wall cap and finishes its requested horizon. Wall times overlap other
work and are not isolated throughput measurements. The final 0.025 s improvement is separately
recorded, exactly replayed, and reproduced through the frozen single-case action interface. The
complete sixteen-case comparison and linked viewer retain the 6.658333 s configuration.
Across 96,561 logged worker branches there are no adapter errors or external-actuation events;
the maximum effort-bound excess is 0.00004768372 N m, below the unchanged 0.0001 tolerance.
The additional 225 reference-anchor evaluations account for the difference from the table total.

The complete unchanged frozen comparison takes 219.208 s wall time and retains two completions
out of sixteen: front 7.25 s and side 6.658333 s. None completes within six seconds; failure-inclusive
medians remain infinite. All sixteen optimized baseline records and all fifteen fallback candidate
records exactly match the preceding comparison. Initial states match and the floating-controller
negative control is rejected. No qualification partition passes or gameplay controller is promoted.

A twelve-trial path-feedback grid tests the extracted side-fall trajectory without exact-start
prefix selection. The unchanged playback and three nominal-rate feedback gains reproduce the
entire 6.658333 s physical trace. Two 1.05-rate feedback variants complete more slowly, in
6.866667 and 7.991667 s. Four trials fail at the twelve-second deadline and two reach handover
but fail the ordinary-host walking displacement. Those walking failures are failures, despite
their finite handover times.

Five physically generated recipes then compare the optimized baseline, unchanged playback and
gain-12 observation feedback: the nominal 90-degree/60 N s fall, angles 88 and 92 degrees, and
impulses 58 and 62 N s. Separation remains 0.2 s. Each recipe supplies the same complete initial
observation to all three controllers; the nominal recipe regenerates the frozen saved start.
The baseline completes 0/5 by twelve seconds, playback 1/5 and feedback 2/5. Feedback's additional
success is the 58 N s fall in 7.875 s. Both angular changes and the stronger shove still fail.
This small development screen shows limited transfer, not robustness or six-second performance.

The 58 N s feedback success is separately recorded and exactly replays every observation and
result after regenerating its physical fall. The nominal control regenerates the saved start
and its complete successful trace. No pose or velocity is injected to create the variations.
`research/stand-up-path-results.json` under `sideFallSpeedSearch` retains the six search
configurations and selected plans, branch audits, full frozen comparison, both feedback grids,
initial-state identities, trajectory diagnostics, prefix provenance and all replay proofs.

Reconstruct the searches in table order using their stored plans and references: the first four
use the preceding 8.633333 s side-fall recording, the finer search uses the 6.783333 s recording,
and the follow-up uses the 6.658333 s recording. Each selected plan records through
`research/stand-up-rollout-search.mjs --mode record --source <reference.trace.gz> --plan
<stored-plan.json> --case 1 --out <destination>`. Verify the recording with that tool's
`--mode verify --source <recording.trace.gz> --case 1` interface. Export its first 540 actions
with the path experiment's `--mode prefix`; the stored composed configuration selects
`continuation: "host"` and retains the preceding measured-response fallback. Set
`STAND_UP_PREFIX_RESPONSE_CONFIG` to that configuration and run the frozen checkout's unchanged
`node research/stand-up-acceptance.mjs --candidate <absolute-prefix-response-policy-path>
--output <report.json>`. The fresh success verifies through `research/stand-up-fresh-replay.mjs`.

Validation: `npm run check`, `npm test` (675 passes, zero failures, five existing TODOs), frozen
comparison, exact successful recordings and restored continuations, fresh-fall replay, whitespace
and line-ending gates pass. The existing recovery TODOs remain unresolved. This work improves
two narrow measurements and establishes one additional fresh-start transfer; it does not satisfy
the four-second median, six-second recovery, runtime integration or robustness requirements.

## Measured side-fall feedback and reference selection, 2026-10-12

An unassisted **5.900000 s** recovery now exactly replays on the physically generated 88-degree,
60 N s Warrior/empty development fall. It includes the unchanged half-second quiet support gate,
two seconds of ordinary-host standing and one second of walking at least 0.1 m. This is a new
sub-six-second development result, not a frozen-case replacement, a four-second median or a
robustness qualification. The full goal remains **not achieved**.

Every measurement in this section uses **Node Stance Lab / frozen game Rapier coordinate /
120 Hz / original symmetric muscle envelopes / Balance 0 / ordinary stance host**. Bodies,
muscle strengths and speeds, contact law, solver, host and acceptance criteria are unchanged.
Fresh recipes are generated by the real shove sequence with 0.2 s separation; no pose or
velocity injection creates their starting states.

The response measurement tool accepts a named case index and can reproduce a reference's
declared fresh-fall preparation. It verifies the complete starting observation and physical
identity before branching. Frozen saved cases still use their original hash-checked snapshots.
At each sample, opposite small muscle-speed changes are simulated for six steps, followed by
six unchanged-command steps. The unchanged branch reproduces both measured endpoints exactly.
The resulting local response model feeds bounded muscle-speed corrections; it does not change
the muscle driver's force-velocity relation or expose physics handles to a candidate policy.

The first measurement covers 90 samples of the 6.658333 s side trajectory, using 77,760 worker
physics steps in 38.637 wall seconds. A thirty-trial grid compares six response/timing settings
on the nominal 90-degree/60 N s fall, 88 and 92 degrees, and 58 and 62 N s. Nine trials complete;
only one completes within six seconds. Path gain 12, response gain 0.3, rate and motion-rate
1.05 produce the 5.9 s 88-degree success. The nominal-rate setting also recovers 88 degrees in
6.858333 s and 58 N s in 6.591667 s. Walking-tail failures remain failures even when handover
has a finite time.

All 1,067 observations and results of the 5.9 s recovery replay exactly after independently
regenerating the fall. Physical SHA-256:
`3566a351ec4170cc6b5830c6986d36a6c7ecff6e61aa39ef800d5b459a74e58a`.
Its matched optimized baseline fails through twelve seconds, exactly reproducing the preceding
development baseline. The standalone replay is `.review/stand-up-side-braking/replay.html`.
It identifies the fresh 88-degree fall, measured-feedback candidate and unchanged baseline;
both recordings have identical complete initial observations and physical identities. The viewer
is built but not visually inspected because of the existing local-file browser restriction.
No server is started.

The faster trajectory supplies a second response measurement, with 85 samples and 73,440 worker
physics steps in 76.349 wall seconds. A twenty-trial transfer grid applies path gain 12 with
response gains 0, 0.1, 0.3 and 0.6 to the same five recipes. With response gain zero, ordinary
joint-error feedback tracks the new trajectory and recovers four of five recipes: 90 degrees in
7.041667 s, 88 degrees in 5.9 s, 92 degrees in 6.3 s and 58 N s in 6.758333 s. The 62 N s fall
fails. Nonzero response correction does not improve this setting's coverage. These recipes
are development data used during selection, not an independent validation set.

The library controller can select a path-feedback or measured-response controller per reference,
with separate immutable parameters. Selection compares posture, root orientation, loaded support
and optionally body-relative motion. It reads detached observations and emits ordinary muscle
commands; it uses no saved-state hash. The selected configuration retains its first reference
choice during recovery. Its front reference retains the previous measured-response settings;
its side reference uses the faster trajectory with path gain 12.

An initial selector with joint-speed and root-motion weights both 0.1 chooses the front reference
for four of the five side recipes and completes only the exact 88-degree recipe. Its complete
frozen comparison retains only the front success, losing the preceding side completion. This
configuration is rejected. Joint-speed differences at takeover dominate its posture comparison.
Setting joint-speed weight to zero and root-motion weight to 0.01 selects the side reference for
all five side recipes and exactly reproduces all five direct side-controller traces, including
the 62 N s failure. The focused regression checks mixed controller selection, actual response
correction, retained selection and input immutability.

The offline search also proposes posture requests with measured motor-axis speed damping and
activation 0.5 or 1. The original symmetric muscle limits remain in force. From the exact
3.2-second physical prefix, this search completes in 6.775 s, slower than the previous witness.
It spends 14,233 evaluations and 195,651 physical steps over 150.258 wall seconds and finishes
its 5.5-second search horizon. A separate search uses the verified 5.9 s fresh trajectory as
guidance for the unchanged frozen 90-degree case. It finds **6.416667 s**, reproduced through
the frozen action interface and by exact full/restored continuation. Its physical SHA-256 is
retained in the result record. It spends 25,761 evaluations and 336,781 physical steps, stopping
after the in-flight batch at 303.385 wall seconds under its 300 s cap. The search reaches only
4.9 s of its requested 5.5 s horizon; it is not restarted or reported as a completed horizon.
Both selected plans contain one damping proposal. These combined searches do not isolate
damping as the cause of the improvement.

The corrected library's complete frozen comparison retains **2/16** completions: front 7.25 s
and side 7.041667 s, with none within six seconds. The front trace exactly matches the previous
response controller; the side trace exactly matches the fresh nominal recipe. Both full library
comparisons reproduce all sixteen optimized baseline records, match initial states and reject
the floating-controller negative control. The initial selector takes 213.841 wall seconds and
the corrected one 280.895 s while sharing the machine with other work. The faster 6.416667 s
recorded-plan witness is separate from this observation-selected controller. Failure-inclusive
frozen medians remain infinite, and no full qualification partition is passed or runtime preset
is changed.

Across 39,993 logged search branches, including 6,390 braking proposals, there are no adapter
errors or external-actuation events. The additional fixed-prefix evaluation accounts for the
remaining search evaluation. Maximum effort-bound excess is 0.00004768372 N m, below the
unchanged 0.0001 tolerance. All sixty grid trials also retain finite observations, valid muscle
commands, bounded effort and zero external actuation. The two measured-response models have
median relative errors 0.406719 and 0.412698 on their two-channel checks. Their local linear
predictions are approximate; the successful whole trajectories, not those model fits, establish
the reported recoveries.

`research/stand-up-path-results.json` under `sideMeasuredFeedback` retains both measurements'
configurations and diagnostics, both search plans and audits, all sixty grid outcomes, both
full comparisons, selected and rejected library configurations, matched baseline, prefix
provenance and exact-replay proofs. Recreate the first model from the preceding 6.658333 s trace
and extracted path with `research/stand-up-response-measure.mjs --case 1 --horizon 6 --stride 6
--delta 4 --coast yes --root-motion yes`; recreate the second from the verified 5.9 s trace and
its extracted path with the same settings. The source trace identifies the exact physical start.
The path experiment's grid/record modes consume the stored configurations. Its library mode
combines the front response reference and faster side reference. Point `STAND_UP_LIBRARY_CONFIG`
at the selected configuration and invoke the frozen checkout's unchanged
`node research/stand-up-acceptance.mjs --candidate <absolute-stand-up-library-policy-path>
--output <report.json>`. Fresh recordings verify through `research/stand-up-fresh-replay.mjs`;
the transferred frozen recording uses the rollout tool's `--mode verify --case 1`.

Validation: `npm run check`, `npm test` (676 passes, zero failures, five existing TODOs), twelve
focused controller tests, both frozen comparisons, matched baseline, exact fresh replay and
frozen replay/restoration checks pass. Whitespace and line-ending gates pass. A verified
sub-six-second unassisted development recovery is established; four-second medians, six-second reliability,
independent qualification and gameplay integration remain unfinished.

## Opposite-side guidance and feedback, 2026-10-12

The fresh 272-degree Warrior/empty fall now has an exactly verified **5.775 s** unassisted
recovery, including the unchanged quiet-support, ordinary standing and walking checks. The
broader-coverage observation-selected library completes **7/10 development recipes**, two within
six seconds. Its failure-inclusive median on those ten recipes is 6.6 s. The full four-second
median / six-second recovery goal remains **not achieved**; these recipes are used during
development and are not independent qualification data.

Every measurement in this section uses **Node Stance Lab / frozen game Rapier coordinate /
120 Hz / original symmetric muscle envelopes / Balance 0 / ordinary stance host**. Body,
muscle limits, contact law, solver, host and acceptance criteria are unchanged. Fresh falls
use the physical two-shove preparation, with 0.2 s separation. No pose or velocity is injected.

`research/stand-up-mirror-reference.mjs` constructs reflected guidance from a recorded path.
It swaps anatomical limb channels and hand requests, reverses trunk lateral-flexion and axial
rotation commands, converts through each channel's anatomical bind angle, and clamps target
angles to the target side's actual ranges. Gravity and linear motion are reflected in the
root's local sagittal plane; angular motion receives the opposite sign appropriate to an axial
vector. Support shares swap sides. Muscle activations are preserved, and finite or infinite
speed requests change only by the indicated channel/sign mapping.

This is a control hypothesis, not a reflected physical recording. The tool explicitly marks
the output as unmeasured guidance and removes the original local response calibration and
physical-trace claim. It retains parent provenance. The 506-frame reference needs 309 target
clamps, the largest 0.017619 rad at lumbar rotation; no joint limit is changed. The regression
checks bind conversion, limits, hand selection, axial versus linear reflection, involution of
unclipped angles, input immutability and removal of calibration claims. Real-body trials, not
the reflection algebra, determine whether recovery occurs.

An eighteen-trial screen applies rates 0.9, 1 and 1.1 with gains 4, 12 and 24 to the unchanged
saved 270-degree fall and a physical 272-degree fall. All nine saved-fall trials fail by twelve
seconds. Five fresh-fall trials complete, including **6.0 s** at rate 1/gain 24. That result
independently regenerates and exactly replays the entire fall recovery and host tail.
A twelve-trial local timing/gain screen then finds **5.825 s** at rate/motion-rate 1.025 and
gain 24; ten trials complete, with two within six seconds. This faster result also independently
replays exactly. Neither screen establishes success on the saved 270-degree case.

Measured-path feedback is then tested separately from synthetic reflection. The extracted
6.0 s trajectory completes the nominal fresh fall at each of gains 4, 12 and 24; gain 24 also
recovers 58 and 62 N s opposite-side variations in 6.441667 and 6.358333 s. Gain 12 recovers
62 N s in 7.308333 s. The other nine of fifteen trials fail. Extracting the 5.825 s trajectory
and tracking it at rate 1 gives **5.775 s** with gain 12;
this is a new feedback trajectory, not a claim that the 5.825 s recording is reproduced.
The same setting recovers 268 degrees in 6.3 s. Gain 24 recovers the nominal fall in 5.991667 s
and the 62 N s variation in 6.183333 s. Four of these ten trials complete, two within six
seconds. A finite handover followed by inadequate walking remains a failure.

All 1,052 observations and results of the selected 5.775 s run replay exactly after regenerating
the physical fall. Its physical SHA-256 is
`e16562b6933b2b69a757a315cd56448ce3c121562b8ed9eb17c50ade69c59951`.
The matched optimized baseline fails through twelve seconds from the identical complete initial
observation and physical identity. `.review/stand-up-side-mirror/replay.html` contains both,
labels the fresh 272-degree recipe and includes the standing/walking tail. It is built but not
visually inspected because of the existing local-file browser restriction. No server is started.

Extracted paths now retain measured body-relative root motion, so the library can score a path
without requiring a response-calibration run merely to obtain those features. The third library
reference is the measured opposite-side path, with gain 12; the front and first-side settings
are unchanged. It chooses the correct side reference on the ten tested side recipes. All five
preceding first-side traces match exactly, including their failure. The added opposite-side
reference recovers 268 and 272 degrees but fails 270 degrees, 58 N s and the 62 N s walking
tail. No exact-start hash selects the controller.

The complete transfer table motivates a broader-coverage library: its opposite-side reference
uses the measured 6.0 s trajectory and gain 24. It completes seven of the same ten recipes,
including 272 degrees and the 58/62 N s opposite-side variations, but loses the 268-degree
completion. Both libraries preserve all five previous first-side traces. Each has two recoveries
within six seconds. The faster 5.775 s witness remains a separate configuration; the selected
broader-coverage library's corresponding recovery takes 6.0 s. Neither library meets the full goal.

Two bounded rollout searches retain their failures. Another attempt to shorten the saved
90-degree witness uses 26,970 evaluations and 373,992 physical steps in 247.188 wall seconds,
finishes its five-second horizon and finds no improvement over 6.416667 s. Transferring the
measured 6.0 s opposite-side trajectory to the unchanged saved 270-degree fall uses 25,902
evaluations and 329,106 physical steps. It stops after the in-flight batch at 311.092 wall
seconds under its 300 s cap, reaching only 3.9 s of the requested 5.5 s search horizon. It is
not restarted or reported as a completed horizon. The selected posture is nearly upright but
does not recover: a separately recorded six-second ordinary-host continuation fails to reach
handover by 9.908333 s. Every observation, result and restored split continuation of that failed
recording replays exactly. Near-standing height is not counted as a success.

A separately bounded continuation search starts from that verified 3.9-second prefix and keeps
the original clock. Its 180 s allocation is separate from the stopped transfer search. It spends
9,828 evaluations and 161,124 physical steps in 138.376 wall seconds, finishes the six-second
total horizon and finds no recovery. The selected plan's further six-second ordinary-host tail
also fails, with no handover through 12.008333 s. Its complete failed trace and restored split
continuation replay exactly. Neither failed search is a physical impossibility claim.

Both complete frozen library comparisons retain **2/16** recoveries, front 7.25 s and side
7.041667 s, with none within six seconds. The front and first-side candidate records exactly
match the preceding library, and all sixteen optimized baseline records match. The faster-side
library takes 243.746 wall seconds and the broader-coverage library 208.840 s, while other work
shares the machine. Both match initial states and reject the floating-controller negative control.
Frozen failure-inclusive medians remain infinite. The opposite-side saved case still fails.

Across 62,611 logged search branches there are no adapter errors or external-actuation events.
The 50 reference-anchor evaluations and 39 prefix-control evaluations account for the remaining
evaluation count. Maximum branch effort-bound excess is 0.00004672307 N m, below the unchanged
0.0001 tolerance. All 75 grid trials retain finite joint observations, valid muscle commands,
bounded efforts and zero external actuation. Repeated nominal runs in those grids are controls,
not independent robustness evidence.

`research/stand-up-path-results.json` under `oppositeSideReflection` retains the reflected
guidance's provenance, channel/sign mapping and target clamps; all three searches, plans and
audits; every grid result; both complete frozen comparisons; both library configurations;
matched baseline; and successful/failed replay proofs. Recreate the synthetic guide with
`node research/stand-up-mirror-reference.mjs <5.9-second-extracted-path.json.gz> <output.json.gz>`.
The path experiment's grid and record modes consume the stored settings with `--case 3`.
Extract the measured 6.0 s or 5.825 s record with its `--mode extract`, then use `--mode library`
to combine that path with the preceding front and first-side references. The selected coverage
configuration uses gain 24 and the 6.0 s opposite reference; the speed configuration uses gain 12
and the 5.825 s reference. Set `STAND_UP_LIBRARY_CONFIG` to the chosen configuration and invoke
the frozen checkout's unchanged `node research/stand-up-acceptance.mjs --candidate
<absolute-stand-up-library-policy-path> --output <report.json>`. Fresh successes verify through
`research/stand-up-fresh-replay.mjs`; failed saved traces verify through the rollout tool's
`--mode verify --case 3` interface.

Validation: `npm run check`, `npm test` (677 passes, zero failures, five existing TODOs), thirteen
focused controller/reflection tests, both frozen comparisons, matched replay, independent fresh
replays and failed-trace restoration checks pass. Whitespace and line-ending gates pass. The
four-second median, six-second reliability across the required bodies and loadouts, independent
qualification and gameplay integration remain unfinished.

## Body-reference transfer and settling, 2026-10-12

**No new recovery is established.** All 150 candidate trials and six matched optimized-baseline
trials fail through twelve seconds. This screen tests the unchanged saved front and 90-degree
falls for Warrior/club, Rogue/empty and Rogue/club. It does not replace any frozen case or run the
independent qualification partitions. The preceding library's frozen result remains 2/16,
with none within six seconds; the full four-second median / six-second goal remains unfinished.

Every figure here uses **Node Stance Lab / frozen game Rapier coordinate / 120 Hz / original
symmetric muscle envelopes / Balance 0 / ordinary stance host**. No body, muscle limit, host,
solver or recovery criterion changes. The 156 trials consume 224,484 world steps, with no adapter
errors, invalid final commands, nonfinite final joint observations or external-actuation events.
Maximum effort-bound excess is 0.00004556412 N m, below the unchanged 0.0001 tolerance.

Reference extraction had assumed the first frozen case's Warrior/empty geometry. It now selects
the recording's actual body and loadout, builds any explicitly recorded body design, and requires
the complete physical identity to match before extracting root axes and joint metadata. It also
stores the body's physical standing height. A real Rogue recording extracts Rogue's axes and
0.9097733 m standing height; a deliberately mislabeled recording is rejected before output.
Re-extracting the previous Warrior opposite-side recording reproduces the entire existing
reference exactly, apart from the added standing-height field. The prior Warrior evidence is
unchanged by this correction.

`research/stand-up-retarget-reference.mjs` constructs explicitly unmeasured guidance for another
existing body. It converts anatomical bind angles, clamps to the target's actual joint limits,
converts finite motor-axis speeds through coordinate rates, rotates root-local features, and
scales linear motion and height features by the target/source physical standing-height ratio.
The Rogue/empty ratio is 0.896776 and Rogue/club 0.900476 relative to Warrior/empty. This does not
change acceptance heights or physical anatomy. The candidate's voluntary host-release height
uses the same ratio; the frozen evaluator independently decides recovery.

Mixed finite/infinite joint commands retain their entire original command and activation:
infinite requests encode saturated muscle torque, so finite-speed coordinate algebra cannot
transform them. This approximation is recorded explicitly. Original response calibration and
measured-trajectory claims are removed. Parent provenance, source/target body metadata, angle
clamps and preserved torque-command joints are recorded. These are control hypotheses whose
physical outcomes must be measured, not demonstrations in the target body.

The side-route screen uses gains 4/12/24 and rates 1/1.05, both raw and adapted guidance, on each
additional body/loadout group: 36 candidate failures plus three baseline failures. The front-route
screen uses gains 8/16/24 and rates 0.9/1/1.1 with both references: 54 candidate failures plus
three baseline failures. Only path feedback is used here; another body's response calibration
is not presented as measured target-body dynamics. These grids do not isolate individual
adaptation components as causes, and their failures do not establish physical impossibility.

Warrior/club can reach loaded two-foot standing without completing recovery. Its selected
adapted side-path trial returns to the ordinary host but never satisfies quiet support. From
seven through twelve seconds, root-up ranges from 0.949579 to 0.961276, while maximum segment
linear speed stays between 0.129998 and 0.163202 m/s, above the required 0.1 m/s. Sampled
middle-trunk and lower-trunk motion persists. The complete trace has zero ready steps. This is
a failure, despite its height, upright soles and foot loading.

A 24-trial full-path velocity-damping screen also produces no recovery. An optional terminal
posture controller then holds the final reference angles through ordinary muscle commands,
with joint-speed damping and bounded activation. It leaves quiet-support detection and host
handover to the unchanged evaluator. All 36 tested terminal settings fail and generally lose
the standing position. Holding this reference endpoint is not a successful settling solution.
The settings remain research options; no gameplay controller or preset adopts them.

Both the selected club failure and a Rogue failure reproduce every physical observation,
final physical result and restored split continuation exactly. The path screen labels an outer
timeout `episode deadline`; the underlying physics result still has no intrinsic failure.
The replay verifier checks that distinction explicitly while preserving the failed screen
outcome. Its prior successful 6.416667 s saved-fall witness also replays exactly.

`.review/stand-up-body-transfer/replay.html` contains the selected Warrior/club failure and its
optimized baseline from the identical complete initial observation and physical identity.
The candidate's physical trace SHA-256 is
`8a2818b18468494f817ab4fcc948242eed95748205c0821b0431f9a7f75ffb59`.
The viewer builder checks matched identities and initial observations and derives its body,
loadout and fall labels from the records. This replay is built and its embedded records checked;
it is not visually inspected because of the existing local-file browser restriction.

`research/stand-up-path-results.json` under `bodyReferenceTransfer` retains body measurements,
reference provenance and transformation diagnostics, every grid configuration and outcome,
the three complete recording reports, speed diagnostics, extraction checks and replay proofs.
Recreate a transferred reference with `node research/stand-up-retarget-reference.mjs
<source-reference.json.gz> <target-case-index> <output.json.gz>`. The path experiment's grid and
record modes consume the stored configurations; grid entries can select a reference explicitly.
Extract recordings with its `--mode extract`. Verify saved recordings through
`research/stand-up-rollout-search.mjs --mode verify --case <index>`, keeping their full clocks.

Validation: `npm run check`, `npm test` (680 passes, zero failures, five existing TODOs), sixteen
focused controller tests, `npm run build`, matched replay and extraction checks pass. The build
retains its MuJoCo browser-externalization and large-chunk warnings. Whitespace and line-ending
gates pass. The next missing evidence is an actual successful target-body movement and a stable
muscle-driven transition into quiet support; geometric transfer alone has not supplied either.

## Warrior/club quiet-support recovery, 2026-10-12

The unchanged saved Warrior/club 90-degree fall now completes unassisted recovery in
**7.191667 s**, including the frozen quiet-support, ordinary standing and walking checks.
The body-aware controller library completes **3/16 frozen cases**, up from 2/16, with **none
within six seconds**. Four nearby perturbed falls still fail. The four-second median / six-second
recovery goal, independent qualification and gameplay integration remain unfinished.

All figures here use **Node Stance Lab / frozen game Rapier coordinate / 120 Hz / original
symmetric muscle envelopes / Balance 0 / ordinary stance host**. Body, host, muscle limits,
contact law, solver and acceptance criteria are unchanged. Only ordinary muscle and host actions
are issued. The successful movement is a new body/loadout witness, not robustness qualification.

Holding the source reference's last pose had failed to establish stable standing in this body.
Four alternative targets come from the actual Warrior/club
failure recording: its joint angles at 5.5, 6 and 7 seconds, and their mean over 7-12 seconds.
The path controller can request these explicit terminal angles, clamped to the actual channel
limits, through motor-axis posture feedback and joint-speed damping. They are pose requests;
the body is never placed in them. All 48 immediate-takeover settings still fail through twelve
seconds. Taking over after an exactly reproduced six-second physical prefix improves support,
but the first 24 settings also fail within twelve seconds. Twelve existing contact-torque
controller settings from the same prefix fail as well.

A 32-trial terminal-gain/damping refinement allows sixteen seconds of observation. Ten trials
complete, the fastest in **7.191667 s**, using the mean target, velocity-error gain 48, damping
0.5 and activation 1. These settings do not increase strength or speed envelopes. A finite
handover with inadequate walking is still a failure; several such outcomes remain in the table.
The successful trace's 1,222 steps include its full six-second prefix and three-second host tail.
Every physical observation, final result and restored split continuation replays exactly.

The prefix is then removed from the controller. Its path feedback yields to the ordinary host
when the original path release condition is met, and takes muscle control again at six seconds
on its observed clock to settle toward the measured target. The evaluator independently requires
half a second of quiet support before permanent handover. This observation-and-clock policy
reproduces **every row of the prefix-based recording exactly**, including actions and results.
It uses no saved-state hash or engine handle. Body/loadout metadata selects this policy for
Warrior/club; other bodies keep the preceding observation-selected library. The selector checks
the target reference's complete muscle-channel metadata.

A 30-trial earlier-transition/gain screen produces four completions but no improvement. A further
48 whole-path timing/gain trials retain only the 7.191667 s setting. The original nominal fresh
fall reproduces the saved-case trace exactly, while 88 degrees, 92 degrees, and 58/62 N s at
90 degrees all fail through fourteen seconds. All use the physical two-shove preparation with
0.2 s separation. The nominal repetition is a control, not an additional independent success.

The full unchanged frozen comparison takes 203.413 wall seconds while other work shares the
machine. Front and first-side Warrior/empty traces remain exactly 7.25 and 7.041667 s. The new
Warrior/club trace is 7.191667 s; thirteen cases fail. Every optimized baseline record matches,
initial states match, and the floating-controller negative control is rejected. Failure-inclusive
frozen medians remain infinite. No qualification partition or gameplay preset changes.

A separately bounded actual-physics search spends 19,003 evaluations and 263,436 steps. It stops
after its in-flight batch at 184.120 wall seconds under a 180 s cap, reaching 4.9 seconds of its
requested 5.5-second search horizon. It finds no recovery and is not restarted or reported as a
finished horizon. Its 18,954 logged branches contain no adapter errors or external actuation;
49 reference-anchor evaluations account for the remaining evaluations. Maximum effort-bound
excess is 0.00004768372 N m, below the unchanged 0.0001 tolerance.

The successful body-specific trajectory also supplies 144 measured local muscle-response samples,
with six-step perturbation and six-step coast windows, stride six and speed-request delta four.
These measurements use 124,416 worker steps and 51.849 wall seconds. Median two-channel prediction
error is 0.352517 across all samples, or 0.473036 across the 113 samples with a nonzero measured
response; ordinary-host intervals can have zero response to recovery-command perturbations.
The approximate model is not itself recovery evidence. A seventeen-trial feedback screen retains
the exact nominal trajectory in its action-replay control and four rate-one feedback settings;
all twelve faster settings fail. The four feedback settings then each recover only the nominal
recipe among the same five fresh recipes. None adds perturbation coverage or speed.

Across all 236 grid trials, 25 complete and none completes within six seconds; repeated controls
are included in those counts. The grids consume 371,602 steps, with no adapter errors, external
actuation, invalid final commands or nonfinite final joint observations. Maximum effort-bound
excess is 0.00004654265 N m. The selected controller's physical trace SHA-256 is
`19aee60da5b947dbc7b2cccc534dbaaee88a5ec38b7533cad74e72b4f8a8948f`.
`.review/stand-up-club-settle/replay.html` compares it with the optimized baseline from the
identical complete initial observation and body. The baseline replay fails through twelve
seconds; the full frozen baseline also fails. The page is built and its embedded recordings
checked, but is not visually inspected because of the existing local-file browser restriction.

`research/stand-up-path-results.json` under `clubSettling` retains the measured targets, every
grid setting/outcome, prefix and clock-based configurations, complete frozen comparison,
successful replay proof, failed bounded search, response diagnostics and replay identity.
The path experiment's `--mode record --case 5` consumes the stored clock configuration.
Set `STAND_UP_LIBRARY_CONFIG` to the stored body-aware library configuration and run the frozen
checkout's unchanged `node research/stand-up-acceptance.mjs --candidate
<absolute-stand-up-library-policy-path> --output <report.json>` for the complete comparison.
Extract the successful recording with the path experiment's `--mode extract`; measure responses
with `research/stand-up-response-measure.mjs --case 5 --horizon 6 --stride 6 --delta 4 --coast yes
--root-motion yes`. Saved-record verification uses the rollout tool's `--mode verify --case 5`.

Validation: `npm run check`, `npm test` (681 passes, zero failures, five existing TODOs), seventeen
focused controller tests, the full frozen comparison, exact replay/restoration and matched
prefix/clock checks pass. Whitespace and line-ending gates pass. The concrete remaining gap is
speed and transfer: the new supported settling movement still needs more than seven seconds,
and its four nearby perturbations fail.

## Settling-aware physical search, 2026-10-12

Warrior/club's unchanged saved 90-degree fall improves from 7.191667 s to **6.033333 s**, a
1.158333 s reduction, including the unchanged standing and walking checks. **It still fails the
six-second deadline.** The selected body-aware library remains **3/16** on the complete frozen
screen, with none within six seconds. Nearby perturbation coverage does not improve. The full
four-second median / six-second recovery goal and gameplay integration remain unfinished.

Every figure here uses **Node Stance Lab / frozen game Rapier coordinate / 120 Hz / original
symmetric muscle envelopes / Balance 0 / ordinary stance host**. Anatomy, muscle limits, host,
solver, saved falls and acceptance criteria are unchanged. No assistance is substituted.

The rollout search can test the measured muscle-settling controller as a terminal continuation,
alongside the ordinary host. Its `settle` action constructs the existing path controller with
the recorded terminal target, gain, damping and activation, and requests immediate settling.
It requires the complete body-identity hash and the controller source hash to match. The action
contains its configuration and reference frame, so recording a plan does not depend on silently
reloading a changed tuning file. An intentionally wrong body identity is rejected before settling
commands are issued.

The search tests up to four eligible beam states plus its retained reference anchor when present;
eligibility is the existing height/up heuristic, not proof of loaded support. Both continuations
run for up to six seconds through the actual world and frozen recovery predicate, with the entire prefix
clock retained. Independent tails run on the existing sequential worker loops in parallel;
their results are consumed in input order. The ordinary-host-only search retains its existing
candidate set when this option is absent.

A preflight reproduces the previous 7.191667 s recovery through the new settling action: all
1,222 rows, actions and results match exactly, as does the independent frozen action-interface
evaluation. Fresh replay and restored split continuation also match. The subsequent bounded
search uses width twelve, twelve-step blocks and the new settling option. It finishes its full
5.5-second horizon in 117.060 wall seconds under a 180 s cap, using 13,497 evaluations and
221,436 physical steps. It finds no completed recovery. Its 42 host tails and 42 settling tails
are failures; near-standing states are not promoted to successes.

The selected searched prefix reaches 0.936865 m height, root-up 0.913012 and sole-up
0.999886/0.976956 at 5.508333 s on the full clock. Its separately recorded ordinary-host
continuation still fails. The failed trajectory and its restored split continuation reproduce
exactly. A further test therefore blends the terminal joint-angle request toward this reached
posture, while preserving every actual prefix action and observation. This changes only the
muscle target; it neither places the body nor removes the prefix from the recovery clock.

Nineteen settings after the 5.2-second prefix all fail. Nineteen after the 5.5-second prefix
produce eight completions, the fastest **6.133333 s**, using a 75% reached-posture blend with
gain 24 and damping 0.25 or 0.5. Fifty-four earlier-takeover/posture settings produce thirteen
completions, the fastest **6.041667 s**. A 36-trial local gain/damping/blend screen produces
thirteen completions and reaches **6.033333 s**. Twenty-four additional timing settings produce
nineteen completions but no further improvement. Later finite handovers that do not finish the
standing/walking tail within the screen remain failures.

The selected result replays the first 648 physical steps, then uses a target blended 60% toward
that reached posture and 40% toward the preceding measured standing target, with gain 28,
damping 0.625 and activation 1. These controller settings leave the original muscle envelopes
in force. All 1,083 observations and the final result reproduce exactly, including restored
continuation. This is a measured 6.033333 s result, not a rounded six-second completion.

Extracting the complete trajectory produces a path controller with no exact-start prefix.
An action-replay control and feedback gains 0/2/4 at rate one reproduce the nominal trajectory;
the selected gain-four controller reproduces every row of the prefix-based recording exactly.
The nine small speed-increase settings fail. The four gains 0/2/4/8 each recover only the nominal
recipe among the five fresh recipes: 88 degrees, 92 degrees and 58/62 N s at 90 degrees all fail.
The nominal fresh preparation reproduces the same initial state and trace, so those repeated
controls are not additional independent robustness evidence.

The complete frozen comparison takes 167.973 wall seconds. Warrior/empty front and first-side
records remain exactly 7.25 and 7.041667 s; Warrior/club is now 6.033333 s. All sixteen optimized
baseline records match, initial states match, and the floating-controller negative control is
rejected. Thirteen cases still fail and failure-inclusive medians remain infinite. No independent
qualification partition passes and no gameplay preset changes.

The 185 grid trials consume 247,975 world steps, with 61 completions, all above six seconds.
These counts include repeated nominal controls. There are no adapter errors, external-actuation
events, invalid final commands or nonfinite final joint observations. Maximum grid effort-bound
excess is 0.00004535394 N m. The search's 13,442 logged branches likewise contain no adapter
errors or external actuation, with maximum excess 0.00004685784 N m. Its 55 reference-anchor
evaluations account for the remaining search evaluation count. Both maxima remain below the
unchanged 0.0001 tolerance.

The faster trace's physical SHA-256 is
`2cc0c1c8426e79c151921dbc8660f658ef9fe6ca589875953c3013b2e7c2ecfa`.
`.review/stand-up-settling-search/replay.html` compares it with the optimized baseline from the
identical complete initial observation and body. Its embedded records and labels are checked;
the page is not visually inspected because of the existing local-file browser restriction.

`research/stand-up-path-results.json` under `settlingAwareSearch` retains the terminal action,
preflight and rejection checks, complete search configuration and audits, failed reached-state
recording, all target blends and grid results, successful replay proofs, prefix-free path
configuration, complete frozen comparison and replay identity. Reproduce the search with the
rollout tool's `--settle-config <measured-path-config.json> --terminal-limit 4`, using its recorded
remaining arguments and budget. Its `--mode record` consumes the stored plan, and `--mode verify
--case 5` checks saved recordings. The path experiment's prefix, record and extract modes consume
the recorded prefix lengths and controller configurations. The unchanged frozen evaluator takes
the stored body-aware library through `STAND_UP_LIBRARY_CONFIG` and the library action module.

Validation: `npm run check`, `npm test` (681 passes, zero failures, five existing TODOs), matched
physical preflight, wrong-body rejection, successful and failed replay/restoration, and the full
frozen comparison pass. Whitespace and line-ending gates pass. The remaining problem includes
both the strict timing miss and the lack of recovery from nearby perturbed falls.
